'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Loader2, X, Check, AlertCircle
} from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Cookies from 'js-cookie'

const DAY_START_HOUR = 9
const DAY_END_HOUR = 20
const DAY_LABELS_KO_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

interface Instructor { id: string; firstName: string; lastName: string; email: string }
interface CustomerLite { id: string; firstName: string; lastName: string; email: string; company?: string }
interface ReservationNotification {
  id: string; channel: string; status: string; type: string; createdAt: string
}
interface Reservation {
  id: string
  customerId: string
  instructorId: string | null
  locationId: string | null
  scheduledAt: string
  durationMinutes: number
  status: 'CONFIRMED' | 'WAITLISTED' | 'PENDING' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'
  source: 'CLIENT' | 'DELEGATE' | 'INSTRUCTOR' | 'MANAGER'
  isInstructorAdded: boolean
  waitlistPosition: number | null
  notes: string | null
  customer: { id: string; firstName: string; lastName: string; company?: string }
  instructor: { id: string; firstName: string; lastName: string } | null
  location: { id: string; name: string } | null
  notifications?: ReservationNotification[]
}
interface UnassignedReservation {
  id: string
  scheduledAt: string
  notes: string | null
  customer: { id: string; firstName: string; lastName: string; company?: string }
}

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  CONFIRMED:  { bg: 'bg-[#14261f]', border: 'border-[#263f33]', text: 'text-[#7dd3ac]' },
  PENDING:    { bg: 'bg-[#2a2114]', border: 'border-[#4a3a22]', text: 'text-[#e0b466]' },
  WAITLISTED: { bg: 'bg-[#1c1f2e]', border: 'border-[#333a52]', text: 'text-[#9ca3c4]' },
  CANCELLED:  { bg: 'bg-transparent', border: 'border-white/10', text: 'text-[#6b7280]' },
  COMPLETED:  { bg: 'bg-[#14261f]/40', border: 'border-[#263f33]/50', text: 'text-[#4d8a6c]' },
  NO_SHOW:    { bg: 'bg-transparent', border: 'border-[#4a3a22]', text: 'text-[#8a6d3d]' }
}

const STATUS_FILTERS = ['all', 'CONFIRMED', 'PENDING', 'WAITLISTED', 'CANCELLED'] as const

function mondayOf(d: Date): Date {
  const day = (d.getDay() + 6) % 7
  const m = new Date(d)
  m.setDate(d.getDate() - day)
  m.setHours(0, 0, 0, 0)
  return m
}
function fmtTime(h: number, m: number): string {
  const hh = h % 12 === 0 ? 12 : h % 12
  const ap = h < 12 ? 'AM' : 'PM'
  return `${hh}:${m.toString().padStart(2, '0')} ${ap}`
}
function toLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function OpsSchedulePage() {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations()
  const locale = pathname.split('/')[1] || 'en'

  const [currentUser, setCurrentUser] = useState<{ id: string; role: 'MANAGER' | 'INSTRUCTOR'; firstName: string; lastName: string } | null>(null)
  const [role, setRole] = useState<'manager' | 'instructor'>('manager')
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [instructorFilter, setInstructorFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedSession, setSelectedSession] = useState<Reservation | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const fetchUnassignedRef = useRef<(() => void) | null>(null)

  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingReservations, setLoadingReservations] = useState(false)
  const [unassignedQueue, setUnassignedQueue] = useState<UnassignedReservation[]>([])
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignPick, setAssignPick] = useState<Record<string, string>>({})

  // Add-a-booking form
  const [bookingClientQuery, setBookingClientQuery] = useState('')
  const [bookingClientResults, setBookingClientResults] = useState<CustomerLite[]>([])
  const [bookingClient, setBookingClient] = useState<CustomerLite | null>(null)
  const [bookingInstructor, setBookingInstructor] = useState('')
  const [bookingDate, setBookingDate] = useState<Date>(new Date())
  const [bookingTime, setBookingTime] = useState('09:00')
  const [bookingSaving, setBookingSaving] = useState(false)
  const [bookingSaved, setBookingSaved] = useState('')
  const [bookingError, setBookingError] = useState('')

  const isManagerRole = currentUser?.role === 'MANAGER'
  const effectiveRole = isManagerRole ? role : 'instructor'
  const isManagerView = effectiveRole === 'manager'

  useEffect(() => {
    const token = Cookies.get('jwt-token')
    if (!token) { router.push(`/${locale}`); return }
    const userData = Cookies.get('current-user-data')
    if (userData) {
      try {
        const parsed = JSON.parse(userData)
        setCurrentUser(parsed)
        setRole(parsed.role === 'MANAGER' ? 'manager' : 'instructor')
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    fetch('/api/users/instructors').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.results) setInstructors(d.results)
    }).catch(() => {})
  }, [])

  const today = useMemo(() => new Date(), [])
  const monday = useMemo(() => {
    const m = mondayOf(today)
    m.setDate(m.getDate() + weekOffset * 7)
    return m
  }, [today, weekOffset])

  const rangeStart = useMemo(() => {
    if (viewMode === 'week') return monday
    const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
    return mondayOf(base)
  }, [viewMode, monday, today, monthOffset])

  const rangeEnd = useMemo(() => {
    const days = viewMode === 'week' ? 7 : 42
    const end = new Date(rangeStart)
    end.setDate(end.getDate() + days)
    return end
  }, [rangeStart, viewMode])

  const fetchReservations = useCallback(async () => {
    const token = Cookies.get('jwt-token')
    setLoadingReservations(true)
    try {
      const params = new URLSearchParams({
        from: rangeStart.toISOString(), to: rangeEnd.toISOString(),
        withNotifications: 'true'
      })
      if (isManagerView && instructorFilter !== 'all') params.set('instructorId', instructorFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const r = await fetch(`/api/reservations?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const d = await r.json(); setReservations(d.reservations || []) }
    } catch { /* keep previous data on transient failure */ }
    finally { setLoadingReservations(false) }
  }, [rangeStart, rangeEnd, isManagerView, instructorFilter, statusFilter])

  const transitionSession = async (reservationId: string, body: Record<string, unknown>) => {
    setActionBusy(true)
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch(`/api/reservations/${reservationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      })
      if (r.ok) { setSelectedSession(null); fetchReservations(); fetchUnassignedRef.current?.() }
    } finally { setActionBusy(false) }
  }

  const retryNotification = async (notificationId: string) => {
    setRetryingId(notificationId)
    const token = Cookies.get('jwt-token')
    try {
      await fetch(`/api/notifications/${notificationId}/retry`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      })
      fetchReservations()
      setSelectedSession(null)
    } finally { setRetryingId(null) }
  }

  useEffect(() => { if (currentUser) fetchReservations() }, [currentUser, fetchReservations])

  const fetchUnassigned = useCallback(async () => {
    if (!isManagerView) return
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch('/api/reservations/unassigned', { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const d = await r.json(); setUnassignedQueue(d.reservations || []) }
    } catch { /* no-op */ }
  }, [isManagerView])

  useEffect(() => { if (currentUser) fetchUnassigned() }, [currentUser, fetchUnassigned])
  useEffect(() => { fetchUnassignedRef.current = fetchUnassigned }, [fetchUnassigned])

  useEffect(() => {
    if (bookingClientQuery.trim().length < 2) { setBookingClientResults([]); return }
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(`/api/customers/search?name=${encodeURIComponent(bookingClientQuery)}&take=8`)
        if (r.ok) { const d = await r.json(); setBookingClientResults(d.customers || []) }
      } catch { /* no-op */ }
    }, 300)
    return () => clearTimeout(handle)
  }, [bookingClientQuery])

  const goPrev = () => viewMode === 'week' ? setWeekOffset(o => o - 1) : setMonthOffset(o => o - 1)
  const goNext = () => viewMode === 'week' ? setWeekOffset(o => o + 1) : setMonthOffset(o => o + 1)
  const goToday = () => { setWeekOffset(0); setMonthOffset(0) }

  const dayLabels = DAY_LABELS_KO_ORDER.map(k => t(`OpsSchedule.day.${k}`))

  const weekDays = useMemo(() => {
    return dayLabels.map((label, di) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + di)
      const isToday = date.toDateString() === today.toDateString()
      const daySessions = reservations.filter(res => {
        if (!res.instructorId) return false
        const d = new Date(res.scheduledAt)
        return d.toDateString() === date.toDateString()
      })
      return { label, date, isToday, sessions: daySessions }
    })
  }, [monday, dayLabels, reservations, today])

  const hourMarks = useMemo(() => {
    const marks: { top: number; label: string }[] = []
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) marks.push({ top: (h - DAY_START_HOUR) * 60, label: fmtTime(h, 0) })
    return marks
  }, [])
  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * 60

  const monthBase = useMemo(() => new Date(today.getFullYear(), today.getMonth() + monthOffset, 1), [today, monthOffset])
  const monthCells = useMemo(() => {
    const start = mondayOf(monthBase)
    const cells: { date: Date; inMonth: boolean; isToday: boolean; counts: { confirmed: number; pending: number; waitlisted: number } }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const daySessions = reservations.filter(res => new Date(res.scheduledAt).toDateString() === d.toDateString())
      cells.push({
        date: d,
        inMonth: d.getMonth() === monthBase.getMonth(),
        isToday: d.toDateString() === today.toDateString(),
        counts: {
          confirmed: daySessions.filter(s => s.status === 'CONFIRMED').length,
          pending: daySessions.filter(s => s.status === 'PENDING').length,
          waitlisted: daySessions.filter(s => s.status === 'WAITLISTED').length
        }
      })
    }
    return cells
  }, [monthBase, reservations, today])

  const rangeLabel = viewMode === 'week'
    ? `${monday.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' })} – ${(() => { const e = new Date(monday); e.setDate(e.getDate() + 6); return e.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) })()}`
    : monthBase.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', { month: 'long', year: 'numeric' })

  const formatName = (f: string, l: string) => locale === 'ko' ? `${l} ${f}` : `${f} ${l}`

  const startAssign = (id: string) => { setAssigningId(id); setAssignPick(p => ({ ...p, [id]: '' })) }
  const cancelAssign = () => setAssigningId(null)
  const confirmAssign = async (id: string) => {
    const instructorId = assignPick[id]
    if (!instructorId) return
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch(`/api/reservations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ instructorId })
      })
      if (r.ok) {
        setAssigningId(null)
        fetchUnassigned()
        fetchReservations()
      }
    } catch { /* no-op */ }
  }

  const saveBooking = async () => {
    setBookingError('')
    if (!bookingClient) { setBookingError(t('OpsSchedule.selectClientFirst')); return }
    if (isManagerView && !bookingInstructor) { setBookingError(t('OpsSchedule.selectInstructorFirst')); return }
    setBookingSaving(true)
    const token = Cookies.get('jwt-token')
    try {
      const [hh, mm] = bookingTime.split(':').map(Number)
      const scheduledAt = new Date(bookingDate)
      scheduledAt.setHours(hh, mm, 0, 0)
      const r = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerId: bookingClient.id,
          instructorId: isManagerView ? bookingInstructor : currentUser?.id,
          scheduledAt: scheduledAt.toISOString()
        })
      })
      if (r.ok) {
        setBookingSaved(isManagerView ? t('OpsSchedule.bookingSavedManager') : t('OpsSchedule.bookingSavedInstructor'))
        setBookingClient(null); setBookingClientQuery(''); setBookingInstructor('')
        fetchReservations()
        setTimeout(() => setBookingSaved(''), 3000)
      } else {
        const d = await r.json()
        setBookingError(d.error || t('OpsSchedule.bookingFailed'))
      }
    } catch { setBookingError(t('OpsSchedule.bookingFailed')) }
    finally { setBookingSaving(false) }
  }

  const timeOptions: { value: string; label: string }[] = []
  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
    timeOptions.push({ value: `${String(h).padStart(2, '0')}:00`, label: fmtTime(h, 0) })
    timeOptions.push({ value: `${String(h).padStart(2, '0')}:30`, label: fmtTime(h, 30) })
  }

  if (!currentUser) return null

  return (
    <div className="min-h-screen bg-[#111827] text-gray-100">
      <header className="bg-[#111827]/90 backdrop-blur-md border-b border-white/10 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push(`/${locale}`)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('Common.back')}
          </button>
          <div className="w-px h-5 bg-white/10" />
          <h1 className="text-[15px] font-semibold text-white">{t('OpsSchedule.title')}</h1>
          <p className="hidden sm:block text-xs text-gray-500">{t('OpsSchedule.subtitle')}</p>

          {isManagerRole && (
            <div className="ml-auto flex items-center gap-0.5 bg-white/5 p-0.5 rounded-lg">
              <button
                onClick={() => setRole('manager')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${role === 'manager' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >{t('OpsSchedule.managerView')}</button>
              <button
                onClick={() => setRole('instructor')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${role === 'instructor' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >{t('OpsSchedule.instructorView')}</button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-5 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">

        {/* Toolbar */}
        <div className="bg-[#161d2c] border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-0.5 bg-white/5 p-0.5 rounded-md">
              <button onClick={() => setViewMode('week')} className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${viewMode === 'week' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>{t('OpsSchedule.week')}</button>
              <button onClick={() => setViewMode('month')} className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${viewMode === 'month' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>{t('OpsSchedule.month')}</button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={goPrev} className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-gray-400 hover:bg-white/5"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <button onClick={goToday} className="px-3 py-1.5 rounded-md border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-medium">{t('OpsSchedule.today')}</button>
              <button onClick={goNext} className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-gray-400 hover:bg-white/5"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
            <span className="text-sm font-semibold text-white">{rangeLabel}</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {isManagerView && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mr-1">{t('OpsSchedule.instructor')}</span>
                <button onClick={() => setInstructorFilter('all')} className={`px-2.5 py-1 text-xs font-medium rounded-full border ${instructorFilter === 'all' ? 'bg-white text-[#111827] border-white' : 'border-white/15 text-gray-400'}`}>{t('OpsSchedule.all')}</button>
                {instructors.map(i => (
                  <button key={i.id} onClick={() => setInstructorFilter(i.id)} className={`px-2.5 py-1 text-xs font-medium rounded-full border ${instructorFilter === i.id ? 'bg-white text-[#111827] border-white' : 'border-white/15 text-gray-400'}`}>{i.firstName}</button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mr-1">{t('OpsSchedule.status')}</span>
              {STATUS_FILTERS.map(sf => {
                const label = sf === 'all' ? t('OpsSchedule.all')
                  : sf === 'CONFIRMED' ? t('OpsSchedule.statusConfirmed')
                  : sf === 'PENDING' ? t('OpsSchedule.statusPending')
                  : sf === 'WAITLISTED' ? t('OpsSchedule.statusWaitlisted')
                  : t('OpsSchedule.statusCancelled')
                return (
                  <button key={sf} onClick={() => setStatusFilter(sf)} className={`px-2.5 py-1 text-xs font-medium rounded-full border ${statusFilter === sf ? 'bg-white text-[#111827] border-white' : 'border-white/15 text-gray-400'}`}>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-4 items-start flex-wrap">

          {/* Week grid */}
          {viewMode === 'week' && (
            <div className="flex-1 min-w-[640px] bg-[#161d2c] border border-white/10 rounded-lg overflow-hidden">
              <div className="grid border-b border-white/10" style={{ gridTemplateColumns: '56px repeat(7,1fr)' }}>
                <div />
                {weekDays.map((d, i) => (
                  <div key={i} className="py-2 px-1 text-center border-l border-white/5">
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{d.label}</div>
                    <div className={`text-sm font-bold mt-0.5 ${d.isToday ? 'text-white' : 'text-gray-400'}`}>{d.date.getDate()}</div>
                  </div>
                ))}
              </div>
              <div className="grid relative max-h-[640px] overflow-y-auto" style={{ gridTemplateColumns: '56px repeat(7,1fr)' }}>
                <div className="relative">
                  {hourMarks.map((h, i) => (
                    <div key={i} className="absolute right-2 text-[10px] text-gray-600" style={{ top: h.top - 6 }}>{h.label}</div>
                  ))}
                  <div style={{ height: gridHeight }} />
                </div>
                {weekDays.map((d, di) => (
                  <div key={di} className="relative border-l border-white/5" style={{ height: gridHeight }}>
                    {hourMarks.map((h, i) => (
                      <div key={i}>
                        <div className="absolute left-0 right-0 border-t border-white/5" style={{ top: h.top }} />
                        {/* 30-minute sub-gridline */}
                        {h.top + 30 < gridHeight && (
                          <div className="absolute left-0 right-0 border-t border-dashed border-white/[0.03]" style={{ top: h.top + 30 }} />
                        )}
                      </div>
                    ))}
                    {d.sessions.map(s => {
                      const dt = new Date(s.scheduledAt)
                      const top = (dt.getHours() - DAY_START_HOUR) * 60 + dt.getMinutes()
                      const height = Math.max(s.durationMinutes - 4, 22)
                      const style = STATUS_STYLES[s.status] || STATUS_STYLES.CONFIRMED
                      const hasFailedNotif = (s.notifications || []).some(n => n.status === 'FAILED')
                      return (
                        <button key={s.id} onClick={() => setSelectedSession(s)}
                          className={`absolute left-1 right-1 ${style.bg} border ${style.border} rounded-md px-1.5 py-1 overflow-hidden text-left`} style={{ top, height }}>
                          <div className={`text-[11px] font-semibold ${style.text} truncate flex items-center gap-1`}>
                            {hasFailedNotif && <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title={t('OpsSchedule.notificationFailed')} />}
                            {formatName(s.customer.firstName, s.customer.lastName)}
                          </div>
                          <div className={`text-[10px] ${style.text} opacity-75 truncate`}>{fmtTime(dt.getHours(), dt.getMinutes())}{s.instructor ? ` · ${s.instructor.firstName[0]}${s.instructor.lastName[0]}` : ''}</div>
                          {s.isInstructorAdded && <div className="text-[9px] font-semibold text-[#c4b5fd] mt-0.5">{t('OpsSchedule.instructorAdded')}</div>}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Month grid */}
          {viewMode === 'month' && (
            <div className="flex-1 min-w-[640px] bg-[#161d2c] border border-white/10 rounded-lg overflow-hidden">
              <div className="grid grid-cols-7 border-b border-white/10">
                {dayLabels.map((lbl, i) => (
                  <div key={i} className="py-2 text-center text-[10px] font-semibold text-gray-500 uppercase">{lbl}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthCells.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => { setViewMode('week'); setWeekOffset(Math.floor((mondayOf(c.date).getTime() - mondayOf(today).getTime()) / (7 * 86400000))) }}
                    className={`min-h-[84px] border-l border-t border-white/5 p-2 text-left ${c.isToday ? 'bg-white/[0.03]' : ''}`}
                  >
                    <div className={`text-xs font-semibold ${c.inMonth ? 'text-gray-200' : 'text-gray-700'}`}>{c.date.getDate()}</div>
                    <div className="flex gap-1 flex-wrap mt-1.5">
                      {Array.from({ length: Math.min(c.counts.confirmed, 3) }).map((_, k) => <span key={`c${k}`} className="w-1.5 h-1.5 rounded-full bg-[#7dd3ac]" />)}
                      {c.counts.pending > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#e0b466]" />}
                      {c.counts.waitlisted > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#9ca3c4]" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sidebar */}
          <div className="w-full lg:w-[320px] flex-shrink-0 flex flex-col gap-4">

            {isManagerView && (
              <div className="bg-[#161d2c] border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[13px] font-semibold text-white">{t('OpsSchedule.unassignedQueue')}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#2a2114] text-[#e0b466]">{unassignedQueue.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {unassignedQueue.map(u => {
                    const dt = new Date(u.scheduledAt)
                    const isAssigning = assigningId === u.id
                    return (
                      <div key={u.id} className="border border-[#4a3a22] bg-[#2a2114]/40 rounded-md p-2.5">
                        <div className="text-[13px] font-semibold text-white">{formatName(u.customer.firstName, u.customer.lastName)}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {u.customer.company ? `${u.customer.company} · ` : ''}
                          {dt.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', { weekday: 'short' })} {fmtTime(dt.getHours(), dt.getMinutes())}
                        </div>
                        {isAssigning ? (
                          <div className="mt-2 flex flex-col gap-1.5">
                            <select
                              value={assignPick[u.id] || ''}
                              onChange={e => setAssignPick(p => ({ ...p, [u.id]: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-md border border-white/10 bg-[#111827] text-xs text-gray-200"
                            >
                              <option value="">{t('OpsSchedule.assignToInstructor')}</option>
                              {instructors.map(i => <option key={i.id} value={i.id}>{formatName(i.firstName, i.lastName)}</option>)}
                            </select>
                            <div className="flex gap-1.5">
                              <button onClick={() => confirmAssign(u.id)} className="flex-1 py-1.5 rounded-md bg-white text-[#111827] text-xs font-semibold">{t('Common.confirm')}</button>
                              <button onClick={cancelAssign} className="px-2.5 py-1.5 rounded-md border border-white/10 text-gray-400 text-xs">{t('Common.cancel')}</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => startAssign(u.id)} className="mt-2 px-2.5 py-1.5 rounded-md border border-[#4a3a22] text-[#e0b466] text-xs font-medium">{t('OpsSchedule.assignInstructor')}</button>
                        )}
                      </div>
                    )
                  })}
                  {unassignedQueue.length === 0 && <p className="text-xs text-gray-600 text-center py-2">{t('OpsSchedule.allAssigned')}</p>}
                </div>
              </div>
            )}

            <div className="bg-[#161d2c] border border-white/10 rounded-lg p-4">
              <span className="text-[13px] font-semibold text-white">{t('OpsSchedule.addBooking')}</span>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-3">{isManagerView ? t('OpsSchedule.addBookingSubtitleManager') : t('OpsSchedule.addBookingSubtitleInstructor')}</p>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={bookingClient ? formatName(bookingClient.firstName, bookingClient.lastName) : bookingClientQuery}
                    onChange={e => { setBookingClient(null); setBookingClientQuery(e.target.value) }}
                    placeholder={t('OpsSchedule.selectClient')}
                    className="w-full px-2.5 py-2 rounded-md border border-white/10 bg-[#111827] text-xs text-gray-200 placeholder-gray-600"
                  />
                  {!bookingClient && bookingClientResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-[#1c2333] border border-white/10 rounded-md overflow-hidden shadow-xl">
                      {bookingClientResults.map(c => (
                        <button key={c.id} onClick={() => { setBookingClient(c); setBookingClientResults([]) }} className="w-full text-left px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/5">
                          {formatName(c.firstName, c.lastName)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {isManagerView && (
                  <select value={bookingInstructor} onChange={e => setBookingInstructor(e.target.value)} className="w-full px-2.5 py-2 rounded-md border border-white/10 bg-[#111827] text-xs text-gray-200">
                    <option value="">{t('OpsSchedule.selectInstructor')}</option>
                    {instructors.map(i => <option key={i.id} value={i.id}>{formatName(i.firstName, i.lastName)}</option>)}
                  </select>
                )}
                <input
                  type="date"
                  value={toLocalYMD(bookingDate)}
                  onChange={e => setBookingDate(new Date(e.target.value + 'T00:00:00'))}
                  className="w-full px-2.5 py-2 rounded-md border border-white/10 bg-[#111827] text-xs text-gray-200"
                />
                <select value={bookingTime} onChange={e => setBookingTime(e.target.value)} className="w-full px-2.5 py-2 rounded-md border border-white/10 bg-[#111827] text-xs text-gray-200">
                  {timeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {bookingError && (
                  <div className="flex items-center gap-1.5 text-[11px] text-red-400"><AlertCircle className="w-3 h-3 flex-shrink-0" />{bookingError}</div>
                )}
                <button onClick={saveBooking} disabled={bookingSaving} className="py-2 rounded-md bg-white text-[#111827] text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {bookingSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {t('OpsSchedule.saveBooking')}
                </button>
                {bookingSaved && <p className="text-[11px] text-[#7dd3ac] text-center">{bookingSaved}</p>}
              </div>
            </div>

            <div className="bg-[#161d2c] border border-white/10 rounded-lg p-4">
              <span className="text-[13px] font-semibold text-white">{t('OpsSchedule.legend')}</span>
              <div className="flex flex-col gap-2 mt-2.5">
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-[#7dd3ac]" /><span className="text-xs text-gray-400">{t('OpsSchedule.statusConfirmed')}</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-[#e0b466]" /><span className="text-xs text-gray-400">{t('OpsSchedule.statusPending')}</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-[#9ca3c4]" /><span className="text-xs text-gray-400">{t('OpsSchedule.statusWaitlisted')}</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border border-[#c4b5fd]" /><span className="text-xs text-gray-400">{t('OpsSchedule.instructorAdded')}</span></div>
              </div>
            </div>

          </div>
        </div>

        {loadingReservations && <p className="text-xs text-gray-600 mt-3">{t('Common.loading')}</p>}

        {/* ── Session action panel ── */}
        {selectedSession && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setSelectedSession(null)} />
            <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-full sm:w-[400px] bg-[#161d2c] border border-white/10 sm:rounded-lg rounded-t-lg p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-[15px] font-bold text-white m-0">{formatName(selectedSession.customer.firstName, selectedSession.customer.lastName)}</p>
                <button onClick={() => setSelectedSession(null)} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-white/5"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                {new Date(selectedSession.scheduledAt).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {' · '}{selectedSession.durationMinutes}min
                {selectedSession.instructor ? ` · ${formatName(selectedSession.instructor.firstName, selectedSession.instructor.lastName)}` : ''}
                {' · '}{selectedSession.status}{selectedSession.waitlistPosition ? ` #${selectedSession.waitlistPosition}` : ''}
              </p>

              {/* Notification history + retry for failures */}
              {(selectedSession.notifications || []).length > 0 && (
                <div className="mb-3 flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide m-0">{t('OpsSchedule.notifications')}</p>
                  {(selectedSession.notifications || []).map(n => (
                    <div key={n.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-gray-400 truncate">{n.type.replace(/_/g, ' ').toLowerCase()} · {n.channel}</span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={n.status === 'SENT' ? 'text-[#7dd3ac]' : n.status === 'FAILED' ? 'text-red-400' : 'text-gray-500'}>{n.status}</span>
                        {n.status === 'FAILED' && (
                          <button onClick={() => retryNotification(n.id)} disabled={retryingId === n.id}
                            className="px-1.5 py-0.5 rounded border border-white/15 text-gray-300 text-[10px] disabled:opacity-50">
                            {retryingId === n.id ? '…' : t('OpsSchedule.retry')}
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                {selectedSession.status === 'WAITLISTED' && (
                  <button onClick={() => transitionSession(selectedSession.id, { status: 'CONFIRMED' })} disabled={actionBusy}
                    className="w-full py-2 rounded-md bg-white text-[#111827] text-xs font-semibold disabled:opacity-50">
                    {t('OpsSchedule.promoteWaitlist')}
                  </button>
                )}
                {selectedSession.status === 'PENDING' && selectedSession.instructorId && (
                  <button onClick={() => transitionSession(selectedSession.id, { status: 'CONFIRMED' })} disabled={actionBusy}
                    className="w-full py-2 rounded-md bg-white text-[#111827] text-xs font-semibold disabled:opacity-50">
                    {t('OpsSchedule.confirmSession')}
                  </button>
                )}
                {['CONFIRMED'].includes(selectedSession.status) && new Date(selectedSession.scheduledAt) < new Date() && (
                  <div className="flex gap-1.5">
                    <button onClick={() => transitionSession(selectedSession.id, { status: 'COMPLETED' })} disabled={actionBusy}
                      className="flex-1 py-2 rounded-md border border-[#263f33] text-[#7dd3ac] text-xs font-medium disabled:opacity-50">
                      {t('OpsSchedule.markCompleted')}
                    </button>
                    <button onClick={() => transitionSession(selectedSession.id, { status: 'NO_SHOW' })} disabled={actionBusy}
                      className="flex-1 py-2 rounded-md border border-[#4a3a22] text-[#e0b466] text-xs font-medium disabled:opacity-50">
                      {t('OpsSchedule.markNoShow')}
                    </button>
                  </div>
                )}
                {['PENDING', 'CONFIRMED', 'WAITLISTED'].includes(selectedSession.status) && (
                  <button onClick={() => transitionSession(selectedSession.id, { status: 'CANCELLED' })} disabled={actionBusy}
                    className="w-full py-2 rounded-md border border-white/10 text-gray-400 text-xs font-medium disabled:opacity-50">
                    {t('OpsSchedule.cancelSession')}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
