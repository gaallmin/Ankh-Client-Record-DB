'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  RefreshCw,
  Repeat2,
  Search,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type CustomerMetric = {
  customerId: string
  firstName: string
  lastName: string
  company: string | null
  attended: number
  cancelled: number
  noShows: number
  finalized: number
  attendanceRate: number
  cancellationRate: number
}

type MonthlyMetric = {
  month: string
  attended: number
  cancelled: number
  noShows: number
  uniqueCustomers: number
  finalized: number
  attendanceRate: number
  cancellationRate: number
}

type RebookingCustomer = {
  customerId: string
  firstName: string
  lastName: string
  lessonCount: number
  firstLessonAt: string
  latestLessonAt: string
}

type InstructorRebooking = {
  instructorId: string
  firstName: string
  lastName: string
  rebookedCustomerCount: number
  completedLessonCount: number
  customers: RebookingCustomer[]
}

type DashboardData = {
  range: { months: number; from: string; to: string; timeZone: string }
  summary: {
    uniqueCustomers: number
    attended: number
    cancelled: number
    noShows: number
    finalized: number
    attendanceRate: number
    cancellationRate: number
    rebookedCustomers: number
  }
  customers: CustomerMetric[]
  customersTruncated: boolean
  monthly: MonthlyMetric[]
  instructorRebookings: InstructorRebooking[]
}

const MONTH_OPTIONS = [3, 6, 12, 24] as const

function rateTone(value: number, inverse = false) {
  const good = inverse ? value <= 10 : value >= 90
  const warning = inverse ? value <= 25 : value >= 70
  return good ? 'text-emerald-700 bg-emerald-50' : warning ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'
}

export default function AnalyticsDashboardPage() {
  const router = useRouter()
  const pathname = usePathname()
  const locale = pathname.split('/')[1] || 'en'
  const t = useTranslations('AnalyticsDashboard')

  const [authorized, setAuthorized] = useState(false)
  const [months, setMonths] = useState(12)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [expandedInstructor, setExpandedInstructor] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Unauthorized')
        return response.json()
      })
      .then(result => {
        if (cancelled) return
        if (result.user?.role !== 'MANAGER') {
          router.replace(`/${locale}`)
          return
        }
        setAuthorized(true)
      })
      .catch(() => { if (!cancelled) router.replace(`/${locale}`) })
    return () => { cancelled = true }
  }, [locale, router])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/analytics/dashboard?months=${months}`, { cache: 'no-store' })
      if (response.status === 401 || response.status === 403) {
        router.replace(`/${locale}`)
        throw new Error(t('sessionExpired'))
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || `${t('loadFailed')} (${response.status})`)
      }
      const nextData = await response.json() as DashboardData
      setData(nextData)
      setExpandedInstructor(current => current || nextData.instructorRebookings[0]?.instructorId || null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [locale, months, router, t])

  useEffect(() => {
    // Loading is the external synchronization performed when auth/range changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authorized) loadDashboard()
  }, [authorized, loadDashboard])

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLocaleLowerCase()
    if (!term) return data?.customers || []
    return (data?.customers || []).filter(customer =>
      `${customer.firstName} ${customer.lastName} ${customer.company || ''}`.toLocaleLowerCase().includes(term)
    )
  }, [customerSearch, data?.customers])

  const formatName = (firstName: string, lastName: string) => locale === 'ko'
    ? `${lastName} ${firstName}`.trim()
    : `${firstName} ${lastName}`.trim()
  const formatDate = (value: string) => new Date(value).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-GB')
  const formatMonth = (month: string) => {
    const [year, monthNumber] = month.split('-').map(Number)
    return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-GB', {
      year: 'numeric', month: 'short', timeZone: 'UTC'
    })
  }

  const exportCustomers = () => {
    if (!data) return
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const rows = [
      [t('customer'), t('company'), t('attended'), t('noShows'), t('cancelled'), t('attendanceRate'), t('cancellationRate')],
      ...filteredCustomers.map(customer => [
        formatName(customer.firstName, customer.lastName), customer.company || '', customer.attended,
        customer.noShows, customer.cancelled, `${customer.attendanceRate}%`, `${customer.cancellationRate}%`
      ])
    ]
    const csv = `\uFEFF${rows.map(row => row.map(quote).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ankh-customer-analytics-${data.range.from.slice(0, 10)}-${data.range.to.slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const maxMonthly = Math.max(1, ...(data?.monthly.map(row => row.finalized) || [1]))

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button onClick={() => router.push(`/${locale}`)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />{t('back')}
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold">{t('title')}</h1>
            <p className="hidden text-xs text-slate-400 sm:block">{t('subtitle')}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={loadDashboard} disabled={loading || !authorized} aria-label={t('refresh')} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7">
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('period')}</p>
            {data && <p className="mt-1 text-sm text-slate-600">{formatMonth(data.monthly[0].month)} – {formatMonth(data.monthly[data.monthly.length - 1].month)}</p>}
          </div>
          <div className="grid grid-cols-4 rounded-xl bg-slate-100 p-1">
            {MONTH_OPTIONS.map(option => (
              <button key={option} onClick={() => setMonths(option)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${months === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {t('months', { count: option })}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t('loadFailed')}</p>
              <p className="mt-1 break-words text-xs">{error}</p>
            </div>
            <button onClick={loadDashboard} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold">{t('retry')}</button>
          </div>
        )}

        {loading && !data ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <div className="text-center text-slate-400"><Loader2 className="mx-auto h-7 w-7 animate-spin" /><p className="mt-3 text-sm">{t('loading')}</p></div>
          </div>
        ) : data && (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                { label: t('activeCustomers'), value: data.summary.uniqueCustomers.toLocaleString(), detail: t('finalizedSessions', { count: data.summary.finalized }), icon: Users, tone: 'bg-blue-50 text-blue-700' },
                { label: t('attended'), value: data.summary.attended.toLocaleString(), detail: t('noShowsCount', { count: data.summary.noShows }), icon: UserCheck, tone: 'bg-emerald-50 text-emerald-700' },
                { label: t('attendanceRate'), value: `${data.summary.attendanceRate}%`, detail: t('attendanceFormula'), icon: BarChart3, tone: rateTone(data.summary.attendanceRate) },
                { label: t('cancellationRate'), value: `${data.summary.cancellationRate}%`, detail: t('cancelledCount', { count: data.summary.cancelled }), icon: UserX, tone: rateTone(data.summary.cancellationRate, true) },
                { label: t('rebookedCustomers'), value: data.summary.rebookedCustomers.toLocaleString(), detail: t('primaryOnly'), icon: Repeat2, tone: 'bg-violet-50 text-violet-700' },
              ].map(card => {
                const Icon = card.icon
                return <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.tone}`}><Icon className="h-4 w-4" /></div>
                  <p className="mt-3 text-2xl font-bold tracking-tight">{card.value}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">{card.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{card.detail}</p>
                </article>
              })}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div><h2 className="text-sm font-bold">{t('monthlyTitle')}</h2><p className="mt-1 text-xs text-slate-400">{t('monthlyDesc')}</p></div>
                <CalendarDays className="h-5 w-5 text-slate-300" />
              </div>
              <div className="overflow-x-auto pb-2">
                <div className="flex min-w-[620px] items-end gap-2" style={{ height: 220 }}>
                  {data.monthly.map(row => (
                    <div key={row.month} className="group flex h-full min-w-[46px] flex-1 flex-col justify-end">
                      <div className="mb-2 hidden rounded-lg border border-slate-200 bg-white p-2 text-[10px] shadow-lg group-hover:block">
                        <p className="font-bold">{formatMonth(row.month)}</p>
                        <p className="text-emerald-600">{t('attended')}: {row.attended}</p>
                        <p className="text-red-500">{t('cancelled')}: {row.cancelled}</p>
                        <p className="text-amber-600">{t('noShows')}: {row.noShows}</p>
                      </div>
                      <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-md bg-slate-100" style={{ height: `${Math.max(3, (row.finalized / maxMonthly) * 150)}px` }} title={`${formatMonth(row.month)}: ${row.finalized}`}>
                        {row.cancelled > 0 && <div className="bg-red-300" style={{ height: `${(row.cancelled / Math.max(1, row.finalized)) * 100}%` }} />}
                        {row.noShows > 0 && <div className="bg-amber-300" style={{ height: `${(row.noShows / Math.max(1, row.finalized)) * 100}%` }} />}
                        {row.attended > 0 && <div className="bg-emerald-400" style={{ height: `${(row.attended / Math.max(1, row.finalized)) * 100}%` }} />}
                      </div>
                      <p className="mt-2 truncate text-center text-[10px] text-slate-500">{formatMonth(row.month)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />{t('attended')}</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-300" />{t('noShows')}</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-red-300" />{t('cancelled')}</span>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div><h2 className="text-sm font-bold">{t('customerRatesTitle')}</h2><p className="mt-1 text-xs text-slate-400">{t('customerRatesDesc')}</p></div>
                  <div className="flex gap-2">
                    <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <Search className="h-3.5 w-3.5 text-slate-400" />
                      <input value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} placeholder={t('searchCustomers')} className="w-full min-w-0 bg-transparent text-xs outline-none sm:w-40" />
                    </label>
                    <button onClick={exportCustomers} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title={t('exportCsv')}><Download className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                      <tr><th className="px-4 py-3">{t('customer')}</th><th className="px-3 py-3 text-right">{t('attended')}</th><th className="px-3 py-3 text-right">{t('noShows')}</th><th className="px-3 py-3 text-right">{t('cancelled')}</th><th className="px-3 py-3 text-right">{t('attendanceRate')}</th><th className="px-4 py-3 text-right">{t('cancellationRate')}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCustomers.map(customer => (
                        <tr key={customer.customerId} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3"><p className="font-semibold text-slate-800">{formatName(customer.firstName, customer.lastName)}</p><p className="mt-0.5 text-[10px] text-slate-400">{customer.company || t('noCompany')}</p></td>
                          <td className="px-3 py-3 text-right font-medium">{customer.attended}</td>
                          <td className="px-3 py-3 text-right">{customer.noShows}</td>
                          <td className="px-3 py-3 text-right">{customer.cancelled}</td>
                          <td className="px-3 py-3 text-right"><span className={`rounded-md px-2 py-1 font-bold ${rateTone(customer.attendanceRate)}`}>{customer.attendanceRate}%</span></td>
                          <td className="px-4 py-3 text-right"><span className={`rounded-md px-2 py-1 font-bold ${rateTone(customer.cancellationRate, true)}`}>{customer.cancellationRate}%</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredCustomers.length === 0 && <p className="px-4 py-12 text-center text-sm text-slate-400">{t('noCustomers')}</p>}
                </div>
                {data.customersTruncated && <p role="note" className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">{t('truncated')}</p>}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4 sm:p-5"><h2 className="text-sm font-bold">{t('rebookingTitle')}</h2><p className="mt-1 text-xs text-slate-400">{t('rebookingDesc')}</p></div>
                <div className="max-h-[640px] divide-y divide-slate-100 overflow-auto">
                  {data.instructorRebookings.map(instructor => {
                    const expanded = expandedInstructor === instructor.instructorId
                    return (
                      <article key={instructor.instructorId}>
                        <button onClick={() => setExpandedInstructor(expanded ? null : instructor.instructorId)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{instructor.firstName[0]}{instructor.lastName[0]}</div>
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{formatName(instructor.firstName, instructor.lastName)}</p><p className="mt-0.5 text-[11px] text-slate-400">{t('completedLessons', { count: instructor.completedLessonCount })}</p></div>
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{t('members', { count: instructor.rebookedCustomerCount })}</span>
                          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </button>
                        {expanded && <div className="space-y-2 bg-slate-50/70 px-4 py-3">
                          {instructor.customers.map(customer => (
                            <div key={customer.customerId} className="rounded-xl border border-slate-100 bg-white p-3">
                              <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{formatName(customer.firstName, customer.lastName)}</p><span className="text-xs font-bold text-violet-700">{t('lessons', { count: customer.lessonCount })}</span></div>
                              <p className="mt-1.5 text-[10px] text-slate-400">{formatDate(customer.firstLessonAt)} → {formatDate(customer.latestLessonAt)}</p>
                            </div>
                          ))}
                        </div>}
                      </article>
                    )
                  })}
                  {data.instructorRebookings.length === 0 && <div className="px-5 py-14 text-center"><Repeat2 className="mx-auto h-7 w-7 text-slate-200" /><p className="mt-3 text-sm text-slate-400">{t('noRebookings')}</p></div>}
                </div>
              </div>
            </section>

            <aside className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-relaxed text-blue-800">
              <p className="font-bold">{t('definitionsTitle')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4"><li>{t('attendanceDefinition')}</li><li>{t('cancellationDefinition')}</li><li>{t('rebookingDefinition')}</li></ul>
            </aside>
          </>
        )}
      </main>
    </div>
  )
}
