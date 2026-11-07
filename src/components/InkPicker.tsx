export const INK_COLORS = [
  { value: '#111827', label: 'Black' },
  { value: '#1e3a8a', label: 'Navy' },
  { value: '#1d4ed8', label: 'Blue' },
  { value: '#7f1d1d', label: 'Dark red' },
]

export function InkPicker({
  value,
  onChange,
  allowOriginal = false,
}: {
  value: string | null
  onChange: (v: string | null) => void
  allowOriginal?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Ink colour">
      {allowOriginal && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            value === null ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
          }`}
        >
          Original
        </button>
      )}
      {INK_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          aria-label={c.label}
          title={c.label}
          onClick={() => onChange(c.value)}
          className={`h-6 w-6 rounded-full border-2 ${value === c.value ? 'border-brand-500 ring-2 ring-brand-200 dark:ring-brand-500/40' : 'border-white shadow dark:border-slate-700'}`}
          style={{ backgroundColor: c.value }}
        />
      ))}
    </div>
  )
}
