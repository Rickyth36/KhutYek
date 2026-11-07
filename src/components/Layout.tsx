import { NavLink, Outlet } from 'react-router-dom'
import { AlertTriangle, FileText, LayoutDashboard, Monitor, Moon, PenLine, Settings, ShieldCheck, Sun } from 'lucide-react'
import { useApp, type Theme } from '../context/AppContext'
import { Spinner } from './ui'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/signatures', label: 'Signatures', icon: PenLine },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const themeOrder: Theme[] = ['light', 'dark', 'system']

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useApp()
  const next = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length]
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  return (
    <button className={`btn-icon ${className}`} onClick={() => setTheme(next)} aria-label={`Theme: ${theme}. Switch to ${next}`} title={`Theme: ${theme}`} data-testid="theme-toggle">
      <Icon className="h-4 w-4" />
    </button>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <PenLine className="h-4 w-4" />
      </div>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">KhutYek</span>}
    </div>
  )
}

export default function Layout() {
  const { ready, storageWarning, persistent } = useApp()
  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar (icon rail on tablet, full on desktop); top bar on narrow screens */}
      <aside className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900 md:w-16 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-2 md:py-4 lg:w-60 lg:px-3">
        <div className="md:mb-4 md:px-1.5 lg:px-2">
          <Logo compact={false} />
        </div>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto md:flex-col md:items-stretch md:overflow-visible" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:justify-center lg:justify-start ${
                  isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="hidden sm:inline md:hidden lg:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 md:flex-col lg:flex-row lg:justify-between lg:px-2">
          <span className="hidden items-center gap-1.5 text-xs text-slate-400 lg:flex">
            <ShieldCheck className="h-3.5 w-3.5" /> Local-only
          </span>
          <ThemeToggle />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {!persistent && storageWarning && (
          <div role="alert" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Your browser is blocking local storage, so signatures will be lost when you close this tab. {storageWarning}</span>
          </div>
        )}
        {ready ? (
          <Outlet />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Spinner className="h-6 w-6" />
          </div>
        )}
      </main>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
