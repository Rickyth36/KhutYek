#!/usr/bin/env python3
"""
Independent check of an exported KhutYek PDF.

Rasterises the original and the signed PDF with poppler (a different renderer from the app),
then for every placement compares *where the signature ink actually landed* against the geometry
the editor reported (x, y, width, height, rotation in view-space points).

Input (JSON on stdin):
  { "original": path, "signed": path, "signature_png": path, "dpi": 100,
    "pages": [ {"page": 0, "placements": [ {"x","y","w","h","rot","opacity"} ]} ] }
Output (JSON on stdout): per-placement metrics + content-integrity metrics.
"""
import glob
import json
import math
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image


def raster(pdf, dpi, outdir, tag):
    prefix = os.path.join(outdir, tag)
    subprocess.run(['pdftoppm', '-r', str(dpi), '-cropbox', '-png', pdf, prefix], check=True)
    files = sorted(glob.glob(prefix + '-*.png'), key=lambda p: int(p.rsplit('-', 1)[1].split('.')[0]))
    return [np.asarray(Image.open(f).convert('RGB')).astype(np.int16) for f in files]


def text_of(pdf):
    return subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout


def dilate(mask, r):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def expected_masks(shape, dpi, plc, sig_rgba):
    """Rasterise a placement's expected ink / red-marker footprint at page resolution."""
    h, w = shape
    sh, sw = sig_rgba.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    px = (xs + 0.5) * 72.0 / dpi  # page points (view space, y down)
    py = (ys + 0.5) * 72.0 / dpi
    cx, cy = plc['x'] + plc['w'] / 2, plc['y'] + plc['h'] / 2
    th = math.radians(plc['rot'])
    c, s = math.cos(th), math.sin(th)
    dx, dy = px - cx, py - cy
    lx = dx * c + dy * s  # inverse rotation (clockwise on screen)
    ly = -dx * s + dy * c
    u = (lx + plc['w'] / 2) / plc['w']
    v = (ly + plc['h'] / 2) / plc['h']
    inside = (u >= 0) & (u < 1) & (v >= 0) & (v < 1)
    iu = np.clip((u * sw).astype(int), 0, sw - 1)
    iv = np.clip((v * sh).astype(int), 0, sh - 1)
    px_rgba = sig_rgba[iv, iu]
    ink = inside & (px_rgba[..., 3] > 128)
    red = ink & (px_rgba[..., 0].astype(int) - px_rgba[..., 2].astype(int) > 60)
    return ink, red


def centroid(mask, dpi):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return ((xs.mean() + 0.5) * 72.0 / dpi, (ys.mean() + 0.5) * 72.0 / dpi)


def main():
    spec = json.load(sys.stdin)
    dpi = spec['dpi']
    sig = np.asarray(Image.open(spec['signature_png']).convert('RGBA'))
    result = {'placements': [], 'integrity': {}}
    with tempfile.TemporaryDirectory() as tmp:
        orig = raster(spec['original'], dpi, tmp, 'o')
        signed = raster(spec['signed'], dpi, tmp, 's')
        result['integrity']['pages_original'] = len(orig)
        result['integrity']['pages_signed'] = len(signed)
        result['integrity']['text_equal'] = text_of(spec['original']) == text_of(spec['signed'])
        outside_total = 0
        for entry in spec['pages']:
            i = entry['page']
            o, s = orig[i], signed[i]
            if o.shape != s.shape:
                result['placements'].append({'page': i, 'error': f'page raster size differs {o.shape} vs {s.shape}'})
                continue
            diff = np.abs(o - s).max(axis=2) > 24
            union_ink = np.zeros(diff.shape, bool)
            exp = []
            for plc in entry['placements']:
                ink, red = expected_masks(diff.shape, dpi, plc, sig)
                exp.append((plc, ink, red))
                union_ink |= ink
            for plc, ink, red in exp:
                # Compare per-placement inside its own footprint neighbourhood so overlapping/adjacent
                # placements do not distort each other.
                region = dilate(ink, 3)
                det = diff & region
                inter = (det & ink).sum()
                union = (det | ink).sum()
                iou = float(inter / union) if union else 0.0
                c_exp = centroid(ink, dpi)
                c_det = centroid(det, dpi)
                cerr = None if c_exp is None or c_det is None else math.hypot(c_exp[0] - c_det[0], c_exp[1] - c_det[1])
                # Red marker: pixels that changed and are red-dominant in the signed render.
                sred = s[..., 0] - s[..., 2] > 40
                det_red = diff & sred & region
                r_exp = centroid(red, dpi)
                r_det = centroid(det_red, dpi)
                rerr = None if r_exp is None or r_det is None else math.hypot(r_exp[0] - r_det[0], r_exp[1] - r_det[1])
                result['placements'].append(
                    {'page': i, 'iou': round(iou, 4), 'centroid_err_pt': None if cerr is None else round(cerr, 3),
                     'marker_err_pt': None if rerr is None else round(rerr, 3), 'expected_px': int(ink.sum()), 'detected_px': int(det.sum())}
                )
            outside = int((diff & ~dilate(union_ink, 4)).sum())
            outside_total += outside
        # Pages with no placements must be pixel-identical.
        placed = {e['page'] for e in spec['pages']}
        untouched = 0
        for i in range(len(orig)):
            if i in placed:
                continue
            untouched += int((np.abs(orig[i] - signed[i]).max(axis=2) > 8).sum())
        result['integrity']['changed_px_outside_signatures'] = outside_total
        result['integrity']['changed_px_on_untouched_pages'] = untouched
    json.dump(result, sys.stdout)


if __name__ == '__main__':
    main()
