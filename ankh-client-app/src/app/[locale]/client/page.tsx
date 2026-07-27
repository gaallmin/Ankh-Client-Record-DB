'use client'

// Client Reservation App — separate client-facing surface at /[locale]/client.
// Mirrors the state machine and visual language of the reference mockup
// (Client Reservation App.dc.html): Home → Book / Manage / Unavailable /
// Request-now, plus auth + notification history. Uses ONLY /api/client/*
// endpoints (client JWT, aud:'client') — no staff data is reachable.

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Loader2, Bell, X, Check, AlertCircle, LogOut } from 'lucide-react'
import { usePathname } from 'next/navigation'
import ClientPushBridge from '@/components/ClientPushBridge'

interface Slot { startsAt: string; durationMinutes: number; state: 'open' | 'waitlist' }
interface MyReservation {
  id: string; scheduledAt: string; status: string; waitlistPosition: number | null
  instructor: { firstName: string; lastName: string } | null
  location: { name: string } | null
}
interface NotificationItem {
  id: string; type: string; channel: string; status: string; title: string; body: string; createdAt: string
}
interface Me {
  id: string; username: string; customerId: string | null
  notifyByPush: boolean
  customer: {
    firstName: string; lastName: string
    lessonParticipants: { id: string; lesson: { lessonType: string; createdAt: string; instructor: { firstName: string; lastName: string }; location?: { name: string } | null } }[]
  } | null
}

export default function ClientAppPage() {
  const pathname = usePathname()
  const locale = pathname.split('/')[1] || 'en'
  const ko = locale === 'ko'

  const [authed, setAuthed] = useState<boolean | null>(null)
  const [screen, setScreen] = useState<'home' | 'book' | 'manage' | 'notifications'>('home')
  const [me, setMe] = useState<Me | null>(null)
  const [reservations, setReservations] = useState<MyReservation[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [bookConfirm, setBookConfirm] = useState<{ slot: Slot; result?: { status: string; waitlistPosition: number | null } } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<MyReservation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // ── Auth form ──
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ username: '', password: '', phone: '' })
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')

  const loadAll = useCallback(async () => {
    try {
      const [meRes, resvRes] = await Promise.all([
        fetch('/api/client/me', { credentials: 'include' }),
        fetch('/api/client/reservations', { credentials: 'include' })
      ])
      if (meRes.status === 401) { setAuthed(false); return }
      if (meRes.ok) { const d = await meRes.json(); setMe(d.account) }
      if (resvRes.ok) { const d = await resvRes.json(); setReservations(d.reservations || []) }
      setAuthed(true)
    } catch { setError(ko ? '네트워크 오류' : 'Network error') }
  }, [ko])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const doAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthBusy(true); setAuthError('')
    try {
      const r = await fetch(`/api/client/auth/${mode}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'register'
          ? { username: form.username, password: form.password, phone: form.phone || undefined }
          : { username: form.username, password: form.password })
      })
      const d = await r.json()
      if (r.ok) { await loadAll() }
      else setAuthError(d.error || (ko ? '실패했습니다' : 'Failed'))
    } catch { setAuthError(ko ? '네트워크 오류' : 'Network error') }
    finally { setAuthBusy(false) }
  }

  const logout = async () => {
    await fetch('/api/client/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    setAuthed(false); setMe(null); setReservations([])
  }

  const openBook = async () => {
    setScreen('book'); setBookConfirm(null); setSlotsLoading(true)
    try {
      const r = await fetch('/api/client/slots', { credentials: 'include' })
      if (r.ok) { const d = await r.json(); setSlots(d.slots || []) }
    } finally { setSlotsLoading(false) }
  }

  const book = async (slot: Slot) => {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/client/reservations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: slot.startsAt, waitlistOk: slot.state === 'waitlist' })
      })
      const d = await r.json()
      if (r.ok) {
        setBookConfirm({ slot, result: d.reservation })
        fetch('/api/client/reservations', { credentials: 'include' }).then(res => res.ok ? res.json() : null).then(dd => { if (dd) setReservations(dd.reservations || []) })
      } else setError(d.error || (ko ? '예약 실패' : 'Booking failed'))
    } catch { setError(ko ? '네트워크 오류' : 'Network error') }
    finally { setBusy(false) }
  }

  const cancelReservation = async (resv: MyReservation) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/client/reservations/${resv.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' })
      })
      if (r.ok) {
        setReservations(p => p.map(x => x.id === resv.id ? { ...x, status: 'CANCELLED' } : x))
        setCancelTarget(null)
      }
    } finally { setBusy(false) }
  }

  const openNotifications = async () => {
    setScreen('notifications')
    const r = await fetch('/api/client/notifications', { credentials: 'include' })
    if (r.ok) { const d = await r.json(); setNotifications(d.notifications || []) }
  }

  const fmtDT = (iso: string) => new Date(iso).toLocaleString(ko ? 'ko-KR' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const upcoming = reservations.filter(r => ['PENDING', 'CONFIRMED', 'WAITLISTED'].includes(r.status) && new Date(r.scheduledAt) > new Date())
  const next = upcoming.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]

  if (authed === null) {
    return <div className="min-h-screen bg-[#fbfbfa] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
  }

  // ── AUTH SCREEN ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-[#f7f7f5] flex flex-col items-center justify-center px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="w-full max-w-[390px]">
          <div className="w-12 h-12 rounded-2xl bg-[#111827] flex items-center justify-center mb-5 mx-auto">
            <div className="w-5 h-5 rounded bg-white" />
          </div>
          <h1 className="text-xl font-bold text-[#111827] text-center mb-1">{ko ? '앙크 예약' : 'Ankh Reservations'}</h1>
          <p className="text-[13px] text-gray-400 text-center mb-6">{ko ? '회원 예약 앱 (Client app)' : 'Client reservation app'}</p>

          <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-[10px] mb-4">
            <button onClick={() => setMode('login')} className={`flex-1 py-2 text-[13px] font-medium rounded-lg ${mode === 'login' ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-400'}`}>{ko ? '로그인 (Login)' : 'Login'}</button>
            <button onClick={() => setMode('register')} className={`flex-1 py-2 text-[13px] font-medium rounded-lg ${mode === 'register' ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-400'}`}>{ko ? '가입 (Register)' : 'Register'}</button>
          </div>

          <form onSubmit={doAuth} className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder={ko ? '아이디 (Username)' : 'Username'} required minLength={3}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#111827]" />
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={ko ? '비밀번호 (Password)' : 'Password'} required minLength={mode === 'register' ? 8 : 1}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#111827]" />
            {mode === 'register' && (
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder={ko ? '전화번호 (Phone, 선택)' : 'Phone (optional)'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#111827]" />
            )}
            {authError && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 px-3 py-2 rounded-xl"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{authError}</div>}
            <button type="submit" disabled={authBusy} className="w-full py-2.5 rounded-xl bg-[#111827] text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {authBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? (ko ? '로그인' : 'Log in') : (ko ? '계정 만들기' : 'Create account')}
            </button>
            {mode === 'register' && (
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {ko
                  ? '가입 후 스튜디오에서 기존 고객 기록과 계정을 연결해 드립니다. (Staff will link your account to your customer record after verification.)'
                  : 'After you register, the studio will verify and link your account to your existing customer record.'}
              </p>
            )}
          </form>
        </div>
      </div>
    )
  }

  const displayName = me?.customer ? (ko ? `${me.customer.lastName} ${me.customer.firstName}` : `${me.customer.firstName} ${me.customer.lastName}`) : me?.username

  // ── MAIN APP ──
  return (
    <div className="min-h-screen bg-[#fbfbfa] text-[#111827] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <ClientPushBridge />
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col">

        {/* ── HOME ── */}
        {screen === 'home' && (
          <div className="px-[18px] py-5 flex flex-col gap-3.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] text-gray-400 m-0">{ko ? '안녕하세요' : 'Welcome back'}</p>
                <h1 className="text-[21px] font-bold mt-0.5">{displayName}</h1>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={openNotifications} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-500"><Bell className="w-4 h-4" /></button>
                <button onClick={logout} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-400" title="Log out"><LogOut className="w-4 h-4" /></button>
              </div>
            </div>

            {!me?.customerId && (
              <div className="bg-[#eff6ff] border border-[#dbeafe] rounded-xl px-3 py-2.5 flex items-center gap-2">
                <span className="w-[7px] h-[7px] rounded-full bg-[#2563eb] flex-shrink-0" />
                <span className="text-[12.5px] text-[#1d4ed8] font-medium">
                  {ko ? '계정 연결 대기 중 — 스튜디오 확인 후 예약할 수 있습니다.' : 'Awaiting account link — booking opens once the studio verifies you.'}
                </span>
              </div>
            )}

            {/* Upcoming or waitlist card */}
            {next ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide m-0 mb-2">
                  {next.status === 'WAITLISTED' ? (ko ? '대기자 명단 (Waitlist)' : 'Waitlist') : (ko ? '예정된 수업 (Upcoming)' : 'Upcoming')}
                </p>
                {next.status === 'WAITLISTED' ? (
                  <>
                    <p className="text-[15px] font-semibold m-0">{ko ? `대기 순번 #${next.waitlistPosition ?? '—'}` : `You're #${next.waitlistPosition ?? '—'} in line`}</p>
                    <p className="text-[12.5px] text-gray-400 mt-1 mb-3.5">{fmtDT(next.scheduledAt)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-bold m-0">{fmtDT(next.scheduledAt)}</p>
                    <p className="text-[13px] text-gray-500 mt-1 mb-3.5">
                      {next.instructor ? `${ko ? '강사' : 'with'} ${next.instructor.firstName} ${next.instructor.lastName}` : (ko ? '강사 배정 대기 (awaiting instructor)' : 'Instructor to be assigned')}
                      {next.status === 'PENDING' && ` · ${ko ? '확정 대기' : 'pending confirmation'}`}
                    </p>
                  </>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setScreen('manage')} className="flex-1 py-2.5 rounded-[10px] bg-[#111827] text-white text-[13px] font-semibold">{ko ? '예약 관리' : 'Manage'}</button>
                  <button onClick={() => setCancelTarget(next)} className="px-3.5 py-2.5 rounded-[10px] border border-gray-200 bg-white text-gray-400 text-[13px] font-medium">{ko ? '취소' : 'Cancel'}</button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-[13px] text-gray-500 m-0">{ko ? '예정된 예약이 없습니다.' : 'No upcoming reservation.'}</p>
              </div>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-1 gap-2.5">
              <button onClick={openBook} disabled={!me?.customerId} className="p-3.5 rounded-[14px] border border-gray-100 bg-white text-left disabled:opacity-50">
                <p className="text-[13px] font-semibold m-0">{ko ? '수업 예약 (Book a session)' : 'Book a session'}</p>
                <p className="text-[11px] text-gray-400 mt-1 m-0">{ko ? '30분 단위 예약 가능 시간 보기' : 'Pick an open 30-minute slot'}</p>
              </button>
              <button onClick={() => setScreen('manage')} className="p-3.5 rounded-[14px] border border-gray-100 bg-white text-left">
                <p className="text-[13px] font-semibold m-0">{ko ? '내 예약 (My reservations)' : 'My reservations'}</p>
                <p className="text-[11px] text-gray-400 mt-1 m-0">{ko ? '예약 확인 · 변경 · 취소' : 'View, change, or cancel'}</p>
              </button>
            </div>

            {/* Recent lessons from linked record */}
            {me?.customer && me.customer.lessonParticipants.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide m-0 mb-2.5">{ko ? '최근 수업 (Recent lessons)' : 'Recent lessons'}</p>
                <div className="flex flex-col gap-2">
                  {me.customer.lessonParticipants.slice(0, 5).map(lp => (
                    <div key={lp.id} className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] text-gray-700">{new Date(lp.lesson.createdAt).toLocaleDateString(ko ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' })} · {lp.lesson.lessonType}</span>
                      <span className="text-[11px] text-gray-400">{lp.lesson.instructor.firstName} {lp.lesson.instructor.lastName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BOOK ── */}
        {screen === 'book' && (
          <div className="px-[18px] py-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <button onClick={() => setScreen('home')} className="w-[30px] h-[30px] rounded-[9px] border border-gray-200 bg-white text-gray-500 flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
              <h2 className="text-base font-bold m-0">{ko ? '수업 예약' : 'Book a session'}</h2>
            </div>

            {bookConfirm?.result ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-[18px] text-center">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-3 ${bookConfirm.result.status === 'WAITLISTED' ? 'bg-[#fffbeb]' : 'bg-[#ecfdf5]'}`}>
                  <span className={`text-lg font-bold ${bookConfirm.result.status === 'WAITLISTED' ? 'text-[#b45309]' : 'text-[#047857]'}`}>
                    {bookConfirm.result.status === 'WAITLISTED' ? `#${bookConfirm.result.waitlistPosition}` : '✓'}
                  </span>
                </div>
                <p className="text-[15px] font-bold m-0">
                  {bookConfirm.result.status === 'WAITLISTED'
                    ? (ko ? '대기자 명단에 등록되었습니다' : "You're on the waitlist")
                    : (ko ? '예약 요청이 접수되었습니다' : 'Request received')}
                </p>
                <p className="text-[12.5px] text-gray-400 mt-1.5 mb-4">
                  {bookConfirm.result.status === 'WAITLISTED'
                    ? (ko ? '자리가 나면 알림을 보내드립니다.' : "We'll notify you if a spot opens up.")
                    : (ko ? '확정되면 알림을 보내드립니다.' : "We'll notify you once it's confirmed.")}
                </p>
                <button onClick={() => setScreen('home')} className="w-full py-2.5 rounded-[10px] bg-[#111827] text-white text-[13px] font-semibold">{ko ? '완료' : 'Done'}</button>
              </div>
            ) : (
              <>
                {error && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 px-3 py-2 rounded-xl"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}</div>}
                {slotsLoading ? (
                  <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" /></div>
                ) : slots.length === 0 ? (
                  <p className="text-[13px] text-gray-400 text-center py-8">{ko ? '예약 가능한 시간이 없습니다.' : 'No bookable times right now.'}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {slots.slice(0, 40).map(slot => (
                      <button key={slot.startsAt} onClick={() => book(slot)} disabled={busy}
                        className="text-left px-3.5 py-3 rounded-[13px] border border-gray-100 bg-white flex items-center justify-between gap-2 disabled:opacity-60">
                        <div>
                          <p className="text-[13.5px] font-semibold m-0">{fmtDT(slot.startsAt)}</p>
                          <p className="text-[11.5px] text-gray-400 mt-0.5 m-0">{slot.durationMinutes}{ko ? '분' : ' min'}</p>
                        </div>
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${slot.state === 'open' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#fffbeb] text-[#b45309]'}`}>
                          {slot.state === 'open' ? (ko ? '예약 (Book)' : 'Book') : (ko ? '대기 (Waitlist)' : 'Waitlist')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── MANAGE ── */}
        {screen === 'manage' && (
          <div className="px-[18px] py-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <button onClick={() => setScreen('home')} className="w-[30px] h-[30px] rounded-[9px] border border-gray-200 bg-white text-gray-500 flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
              <h2 className="text-base font-bold m-0">{ko ? '내 예약' : 'My reservations'}</h2>
            </div>
            {reservations.length === 0 ? (
              <p className="text-[13px] text-gray-400 text-center py-8">{ko ? '예약 내역이 없습니다.' : 'No reservations yet.'}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {reservations.map(r => (
                  <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[13.5px] font-semibold m-0">{fmtDT(r.scheduledAt)}</p>
                        <p className="text-[11.5px] text-gray-400 mt-0.5 m-0">
                          {r.instructor ? `${r.instructor.firstName} ${r.instructor.lastName}` : (ko ? '강사 미배정' : 'Unassigned')}
                          {r.location ? ` · ${r.location.name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${
                          r.status === 'CONFIRMED' ? 'bg-[#ecfdf5] text-[#047857]'
                          : r.status === 'WAITLISTED' ? 'bg-[#fffbeb] text-[#b45309]'
                          : r.status === 'PENDING' ? 'bg-gray-100 text-gray-500'
                          : 'bg-gray-50 text-gray-400'
                        }`}>
                          {r.status === 'CONFIRMED' ? (ko ? '확정' : 'Confirmed')
                            : r.status === 'WAITLISTED' ? (ko ? `대기 #${r.waitlistPosition ?? ''}` : `Waitlist #${r.waitlistPosition ?? ''}`)
                            : r.status === 'PENDING' ? (ko ? '접수됨' : 'Requested')
                            : r.status === 'CANCELLED' ? (ko ? '취소됨' : 'Cancelled')
                            : r.status}
                        </span>
                        {['PENDING', 'CONFIRMED', 'WAITLISTED'].includes(r.status) && new Date(r.scheduledAt) > new Date() && (
                          <button onClick={() => setCancelTarget(r)} className="w-6 h-6 rounded-lg bg-gray-50 text-gray-400 flex items-center justify-center"><X className="w-3 h-3" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {screen === 'notifications' && (
          <div className="px-[18px] py-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <button onClick={() => setScreen('home')} className="w-[30px] h-[30px] rounded-[9px] border border-gray-200 bg-white text-gray-500 flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
              <h2 className="text-base font-bold m-0">{ko ? '알림 (Notifications)' : 'Notifications'}</h2>
            </div>
            {me && (
              <div className="bg-white border border-gray-100 rounded-2xl p-3.5 flex flex-col gap-2.5">
                {([['notifyByPush', ko ? '앱 푸시 알림 (Push)' : 'Push notifications']] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between cursor-pointer">
                    <span className="text-[13px] text-gray-700">{label}</span>
                    <input
                      type="checkbox"
                      checked={me[key]}
                      onChange={async e => {
                        const value = e.target.checked
                        setMe(m => m ? { ...m, [key]: value } : m)
                        await fetch('/api/client/me', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) })
                      }}
                      className="w-4 h-4 accent-[#111827]"
                    />
                  </label>
                ))}
              </div>
            )}
            {notifications.length === 0 ? (
              <p className="text-[13px] text-gray-400 text-center py-8">{ko ? '알림이 없습니다.' : 'No notifications yet.'}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {notifications.map(n => (
                  <div key={n.id} className="bg-white border border-gray-100 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[13px] font-semibold m-0">{n.title}</p>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{n.channel} · {n.status}</span>
                    </div>
                    <p className="text-[12px] text-gray-500 m-0">{n.body}</p>
                    <p className="text-[10.5px] text-gray-300 mt-1.5 m-0">{fmtDT(n.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Cancel confirm sheet ── */}
        {cancelTarget && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setCancelTarget(null)} />
            <div className="fixed inset-x-0 bottom-0 z-50 max-w-[430px] mx-auto bg-white rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <p className="text-[13.5px] font-bold text-[#991b1b] m-0">{ko ? '이 예약을 취소할까요?' : 'Cancel this session?'}</p>
              <p className="text-[12px] text-gray-500 mt-1.5 mb-4">{fmtDT(cancelTarget.scheduledAt)}</p>
              <div className="flex gap-2">
                <button onClick={() => cancelReservation(cancelTarget)} disabled={busy} className="flex-1 py-2.5 rounded-[10px] bg-[#dc2626] text-white text-[12.5px] font-semibold flex items-center justify-center gap-1.5">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {ko ? '예, 취소합니다' : 'Yes, cancel'}
                </button>
                <button onClick={() => setCancelTarget(null)} className="flex-1 py-2.5 rounded-[10px] border border-gray-200 bg-white text-gray-700 text-[12.5px] font-medium">{ko ? '유지' : 'Keep session'}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
