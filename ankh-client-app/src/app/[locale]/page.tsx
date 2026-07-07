'use client'

import { useState, useEffect } from 'react'
import {
  Search, Loader2, AlertCircle, Users, Plus, Download,
  Upload, LogIn, UserPlus, MapPin, Trash2, Settings,
  ChevronDown, ChevronUp, X, Eye, Edit3, BookOpen,
  Activity, LogOut, Pencil
} from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import Cookies from 'js-cookie'
import React from 'react'
import { UploadModal } from '@/components/UploadModal'

// Helper: split "Full Name" → { firstName, lastName }
const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

// ─── Debounce hook ───────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// ─── Types ────────────────────────────────────────────────────────────────────
type UserRole = 'MANAGER' | 'INSTRUCTOR'

interface User {
  id: string; username: string; role: UserRole
  firstName: string; lastName: string; email: string; createdAt?: string
}
interface CustomerLessonParticipant {
  id: string
  lesson: {
    id: string; lessonType?: string; lessonContent?: string; createdAt?: string
    instructor: { firstName: string; lastName: string }
    location?: { name: string }
  }
  customerSymptoms?: string; customerImprovements?: string; status?: string
}
interface Customer {
  id: string; firstName: string; lastName: string; email: string
  phone?: string; company?: string; createdAt?: string; deletedAt?: string | null
  lessonParticipants?: CustomerLessonParticipant[]
}

interface InstructorLesson {
  id: string; lessonType: string; lessonContent?: string; createdAt: string
  groupParticipantCount?: number | null; groupCompany?: string | null
  location?: { name: string }
  lessonParticipants: {
    id: string; customerSymptoms?: string; customerImprovements?: string; status?: string
    customer: { id: string; firstName: string; lastName: string; company?: string }
  }[]
}

// ─── Tiny UI primitives ───────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-gray-700" style={{ animation: 'slideUp .25s ease-out' }}>
      <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
    </div>
  )
}

function Overlay({ onClick }: { onClick: () => void }) {
  return <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClick} />
}

function ModalShell({ open, onClose, title, subtitle, wide, children }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; wide?: boolean; children: React.ReactNode
}) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])
  if (!open) return null
  return (
    <>
      <Overlay onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className={`relative bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-2xl`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{title}</h2>
              {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"><X className="w-4 h-4" /></button>
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
        </div>
      </div>
    </>
  )
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void
}) {
  const t = useTranslations()
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">{t('Common.cancel')}</button>
            <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">{t('Common.delete')}</button>
          </div>
        </div>
      </div>
    </>
  )
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <input {...props} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all" />
    </div>
  )
}

function FieldSelect({ label, children, ...props }: { label: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <select {...props} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all">{children}</select>
    </div>
  )
}

function Badge({ children, variant = 'gray' }: { children: React.ReactNode; variant?: 'gray' | 'blue' | 'green' | 'red' | 'amber' }) {
  const v = { gray: 'bg-gray-100 text-gray-600', blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-700' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${v[variant]}`}>{children}</span>
}

function Avatar({ name, color = 'gray' }: { name: string; color?: 'gray' | 'green' | 'violet' }) {
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  const colors = {
    gray: 'from-gray-200 to-gray-300 text-gray-700',
    green: 'from-emerald-100 to-teal-200 text-emerald-800',
    violet: 'from-violet-100 to-purple-200 text-violet-800'
  }
  return <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${colors[color]} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>{initials}</div>
}

function ShimmerRow() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-50">
      <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-36 bg-gray-100 rounded-full animate-pulse" />
        <div className="h-3 w-52 bg-gray-50 rounded-full animate-pulse" />
      </div>
      <div className="h-3 w-24 bg-gray-100 rounded-full animate-pulse" />
      <div className="h-6 w-16 bg-gray-100 rounded-lg animate-pulse" />
    </div>
  )
}

function Btn({ children, variant = 'primary', size = 'md', className = '', ...props }: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'danger'; size?: 'sm' | 'md'; className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-colors disabled:opacity-50'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm' }
  const variants = { primary: 'bg-gray-900 text-white hover:bg-gray-800', secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300', danger: 'bg-red-50 text-red-600 hover:bg-red-100' }
  return <button {...props} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>{children}</button>
}

// ─── Recent Lessons component ─────────────────────────────────────────────────
function RecentLessons({ locale, formatName, onViewCustomer }: {
  locale: string
  formatName: (f: string, l: string) => string
  onViewCustomer: (id: string) => void
}) {
  const t = useTranslations()
  const [lessons, setLessons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/lessons/recent?limit=8')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.lessons) setLessons(d.lessons) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && lessons.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 text-[15px]">{t('HomePage.recentLessonsTitle')}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{t('HomePage.recentLessonsDesc')}</p>
        </div>
        <Activity className="w-4 h-4 text-gray-300" />
      </div>
      {loading ? (
        <div className="divide-y divide-gray-50">{[...Array(4)].map((_, i) => <ShimmerRow key={i} />)}</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {lessons.map((lp: any) => {
            const customer = lp.customer
            const lesson = lp.lesson
            if (!customer || !lesson) return null
            return (
              <button
                key={lp.id}
                onClick={() => onViewCustomer(customer.id)}
                className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
              >
                <Avatar name={`${customer.firstName} ${customer.lastName}`} color="violet" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {formatName(customer.firstName, customer.lastName)}
                    </span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                      {lesson.createdAt ? new Date(lesson.createdAt).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate mb-1.5">
                    {lesson.instructor ? formatName(lesson.instructor.firstName, lesson.instructor.lastName) : ''}
                    {lesson.location ? ` · ${lesson.location.name}` : ''}
                  </p>
                  {lesson.lessonType && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 max-w-full truncate">
                      {lesson.lessonType}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations()
  const locale = pathname.split('/')[1] || 'en'
  const formatName = (f: string, l: string) => locale === 'ko' ? `${l} ${f}` : `${f} ${l}`

  // ── Auth ──
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // ── Search ──
  const [searchTerm, setSearchTerm] = useState('')
  const debounced = useDebounce(searchTerm, 400)
  const [searchPage, setSearchPage] = useState(1)
  const PAGE = 20
  const [sLoading, setSLoading] = useState(false)
  const [sError, setSError] = useState(false)
  const [results, setResults] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const totalPages = Math.ceil(total / PAGE) || 1

  // ── Counts ──
  const [customerCount, setCustomerCount] = useState<number | null>(null)

  // ── App Settings ──
  const [appSettings, setAppSettings] = useState({
    allowInstructorExport: true,
    showInitialSymptoms: true,
    showFeedbackBadge: true,
    showCustomerPhone: true,
  })

  useEffect(() => {
    // Read from cookie first (fast), then hydrate from API
    try {
      const cached = Cookies.get('app-settings')
      if (cached) setAppSettings(prev => ({ ...prev, ...JSON.parse(cached) }))
    } catch { /* ignore */ }
    fetch('/api/settings').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.settings) setAppSettings(prev => ({ ...prev, ...d.settings }))
    }).catch(() => { /* use defaults */ })
  }, [])

  // ── Panels ──
  const [showAllCustomers, setShowAllCustomers] = useState(false)
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [acLoading, setAcLoading] = useState(false)
  const [acPage, setAcPage] = useState(1)
  const [acTotalPages, setAcTotalPages] = useState(1)
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [auLoading, setAuLoading] = useState(false)
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'MANAGER' | 'INSTRUCTOR'>('ALL')

  // ── Modals ──
  const [detailModal, setDetailModal] = useState<Customer | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editModal, setEditModal] = useState<Customer | null>(null)
  // Issue 1 & 5: editForm now uses a single 'name' field
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', company: '' })

  // ── Instructor search ──
  const [instrSearchTerm, setInstrSearchTerm] = useState('')
  const instrDebounced = useDebounce(instrSearchTerm, 400)
  const [instrResults, setInstrResults] = useState<{ id: string; firstName: string; lastName: string; email: string }[]>([])
  const [instrLoading, setInstrLoading] = useState(false)
  const [instrDetailModal, setInstrDetailModal] = useState<{ id: string; firstName: string; lastName: string } | null>(null)
  const [instrLessons, setInstrLessons] = useState<InstructorLesson[]>([])
  const [instrLessonsLoading, setInstrLessonsLoading] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [userModal, setUserModal] = useState<User | null>(null)
  const [addUserModal, setAddUserModal] = useState(false)
  // Issue 1: addUserForm uses 'name' instead of firstName+lastName
  const [addUserForm, setAddUserForm] = useState({ username: '', password: '', role: 'INSTRUCTOR' as UserRole, name: '', email: '' })
  const [addUserLoading, setAddUserLoading] = useState(false)
  const [addUserError, setAddUserError] = useState('')
  const [addLocModal, setAddLocModal] = useState(false)
  const [locName, setLocName] = useState('')
  const [locLoading, setLocLoading] = useState(false)
  const [locError, setLocError] = useState('')

  // ── Upload modal ──
  const [uploadModal, setUploadModal] = useState(false)

  // ── Issue 3: Edit/Delete individual lesson records ──
  const [expandedLpId, setExpandedLpId] = useState<string | null>(null)
  const [editingLpId, setEditingLpId] = useState<string | null>(null)
  const [editLpForm, setEditLpForm] = useState<{ symptoms: string; improvements: string }>({ symptoms: '', improvements: '' })
  const [editLpLoading, setEditLpLoading] = useState(false)

  // ── Confirm / Toast ──
  const [confirm, setConfirm] = useState<{ title: string; message: string; fn: () => void } | null>(null)
  const [toast, setToast] = useState('')
  const flash = (m: string) => setToast(m)

  // ── Init ──
  useEffect(() => {
    const token = Cookies.get('jwt-token')
    if (token) {
      const u = Cookies.get('current-user-data')
      if (u) { setCurrentUser(JSON.parse(u)); setIsLoggedIn(true) }
    }
  }, [])
  useEffect(() => { if (isLoggedIn) fetchCount() }, [isLoggedIn])

  // ── Search effect ──
  useEffect(() => {
    if (debounced.length < 2) { setResults([]); setTotal(0); return }
    setSLoading(true); setSError(false)
    fetch(`/api/customers/search?name=${encodeURIComponent(debounced)}&take=${PAGE}&skip=${(searchPage - 1) * PAGE}`)
      .then(r => r.json())
      .then(d => { setResults(d.customers || []); setTotal(d.total || 0) })
      .catch(() => setSError(true))
      .finally(() => setSLoading(false))
  }, [debounced, searchPage])

  // ── Instructor search effect ──
  useEffect(() => {
    if (instrDebounced.length < 2) { setInstrResults([]); return }
    setInstrLoading(true)
    fetch(`/api/instructors/search?name=${encodeURIComponent(instrDebounced)}`)
      .then(r => r.json())
      .then(d => setInstrResults(d.instructors || []))
      .catch(() => setInstrResults([]))
      .finally(() => setInstrLoading(false))
  }, [instrDebounced])

  const fetchInstructorLessons = async (instructor: { id: string; firstName: string; lastName: string }) => {
    setInstrDetailModal(instructor)
    setInstrLessonsLoading(true)
    setInstrLessons([])
    try {
      const r = await fetch(`/api/instructors/${instructor.id}/lessons`)
      if (r.ok) { const d = await r.json(); setInstrLessons(d.lessons || []) }
    } finally { setInstrLessonsLoading(false) }
  }

  // ── Fetchers ──
  const fetchCount = async () => {
    try { const r = await fetch('/api/customers?limit=1'); if (r.ok) { const d = await r.json(); setCustomerCount(d.total ?? null) } } catch {}
  }
  const fetchAllCustomers = async (p = 1) => {
    setAcLoading(true)
    try {
      const r = await fetch(`/api/customers?page=${p}&limit=50`)
      if (r.ok) { const d = await r.json(); setAllCustomers(d.customers || []); setAcTotalPages(d.totalPages || 1); setAcPage(p); if (d.total != null) setCustomerCount(d.total) }
    } finally { setAcLoading(false) }
  }
  const fetchAllUsers = async () => {
    setAuLoading(true)
    try { const r = await fetch('/api/users'); if (r.ok) { const d = await r.json(); setAllUsers(d.users || []) } } finally { setAuLoading(false) }
  }
  const fetchDetail = async (id: string) => {
    setDetailLoading(true)
    const preview = allCustomers.find(c => c.id === id) || results.find(c => c.id === id) || null
    setDetailModal(preview)
    try { const r = await fetch(`/api/customers/${id}`); if (r.ok) { const d = await r.json(); setDetailModal(d.customer) } } finally { setDetailLoading(false) }
  }

  // ── Handlers ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoginLoading(true); setLoginError('')
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginForm) })
      if (r.ok) {
        const d = await r.json()
        Cookies.set('jwt-token', d.token, { expires: 1 })
        Cookies.set('current-user-data', JSON.stringify({ firstName: d.user.firstName, lastName: d.user.lastName, role: d.user.role }), { expires: 7 })
        setCurrentUser(d.user); setIsLoggedIn(true); setShowLogin(false); setLoginForm({ username: '', password: '' })
      } else { const d = await r.json(); setLoginError(d.error || t('HomePage.loginFailed')) }
    } catch { setLoginError(t('HomePage.loginFailed')) } finally { setLoginLoading(false) }
  }
  const handleLogout = () => {
    Cookies.remove('jwt-token'); Cookies.remove('current-user-data')
    setCurrentUser(null); setIsLoggedIn(false); setResults([]); setAllCustomers([]); setAllUsers([])
  }
  // Issue 1: openEdit now sets a single 'name' field
  const openEdit = (c: Customer) => {
    setEditModal(c)
    setEditForm({ name: formatName(c.firstName, c.lastName), email: c.email, phone: c.phone || '', company: c.company || '' })
    setEditError('')
  }
  const saveEdit = async () => {
    if (!editModal || !editForm.name || !editForm.email) { setEditError('All fields required.'); return }
    const { firstName, lastName } = splitFullName(editForm.name)
    setEditLoading(true); setEditError('')
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch(`/api/customers/${editModal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ firstName, lastName, email: editForm.email, phone: editForm.phone, company: editForm.company || null }) })
      if (r.ok) {
        const { customer: u } = await r.json()
        setAllCustomers(p => p.map(c => c.id === u.id ? { ...c, ...u } : c))
        setResults(p => p.map(c => c.id === u.id ? { ...c, ...u } : c))
        if (detailModal?.id === u.id) setDetailModal(prev => prev ? { ...prev, ...u } : prev)
        setEditModal(null); flash('Customer updated successfully!')
      } else { const d = await r.json(); setEditError(d.error || 'Failed to update.') }
    } catch { setEditError('Unexpected error.') } finally { setEditLoading(false) }
  }
  const deleteCustomer = (id: string, name: string) => {
    setConfirm({ title: t('HomePage.deleteCustomerTitle'), message: t('HomePage.deleteCustomerMessage', { name }), fn: async () => {
      const token = Cookies.get('jwt-token')
      const r = await fetch(`/api/customers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { setResults(p => p.filter(c => c.id !== id)); setAllCustomers(p => p.filter(c => c.id !== id)); if (detailModal?.id === id) setDetailModal(null); fetchCount(); flash('Customer deleted.') }
      else flash('Failed to delete customer.')
      setConfirm(null)
    }})
  }
  // Issue 1: handleAddUser splits name before API call
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault(); setAddUserLoading(true); setAddUserError('')
    const { firstName, lastName } = splitFullName(addUserForm.name)
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...addUserForm, firstName, lastName }) })
      if (r.ok) { setAddUserModal(false); setAddUserForm({ username: '', password: '', role: 'INSTRUCTOR', name: '', email: '' }); flash('User created!'); if (showAllUsers) fetchAllUsers() }
      else { const d = await r.json(); setAddUserError(d.error || 'Failed.') }
    } catch { setAddUserError('Unexpected error.') } finally { setAddUserLoading(false) }
  }
  const deleteUser = (id: string, name: string) => {
    setConfirm({ title: t('HomePage.deleteUserTitle'), message: t('HomePage.deleteUserMessage', { name }), fn: async () => {
      const token = Cookies.get('jwt-token')
      const r = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { setAllUsers(p => p.filter(u => u.id !== id)); flash('User deleted.') }
      setConfirm(null)
    }})
  }
  const addLocation = async (e: React.FormEvent) => {
    e.preventDefault(); setLocLoading(true); setLocError('')
    try {
      const r = await fetch('/api/locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: locName.trim() }) })
      if (r.ok) { setAddLocModal(false); setLocName(''); flash('Location created!') } else { const d = await r.json(); setLocError(d.error || 'Failed.') }
    } catch { setLocError('Unexpected error.') } finally { setLocLoading(false) }
  }

  // ── Issue 3: Lesson record edit/delete handlers ──
  const startEditLp = (lp: CustomerLessonParticipant) => {
    setEditingLpId(lp.id)
    setEditLpForm({ symptoms: lp.customerSymptoms || '', improvements: lp.customerImprovements || '' })
  }
  const cancelEditLp = () => { setEditingLpId(null) }
  const saveLpEdit = async (lp: CustomerLessonParticipant) => {
    setEditLpLoading(true)
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch(`/api/lessons/${lp.lesson.id}/participants/${detailModal?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerSymptoms: editLpForm.symptoms, customerImprovements: editLpForm.improvements })
      })
      if (r.ok) {
        setDetailModal(prev => {
          if (!prev) return prev
          return {
            ...prev,
            lessonParticipants: prev.lessonParticipants?.map(p =>
              p.id === lp.id
                ? { ...p, customerSymptoms: editLpForm.symptoms, customerImprovements: editLpForm.improvements }
                : p
            )
          }
        })
        setEditingLpId(null)
        setExpandedLpId(lp.id)
        flash(t('CustomerSearch.editSaved'))
      } else {
        flash(t('ManageUsers.lessonEditFailed'))
      }
    } catch {
      flash(t('ManageUsers.lessonEditFailed'))
    } finally {
      setEditLpLoading(false)
    }
  }
  const deleteLp = (lp: CustomerLessonParticipant) => {
    setConfirm({
      title: t('ManageUsers.deleteLesson'),
      message: t('ManageUsers.deleteLessonMessage'),
      fn: async () => {
        const token = Cookies.get('jwt-token')
        const r = await fetch(`/api/lessons/${lp.lesson.id}/participants/${detailModal?.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        })
        if (r.ok) {
          setDetailModal(prev => {
            if (!prev) return prev
            return { ...prev, lessonParticipants: prev.lessonParticipants?.filter(p => p.id !== lp.id) }
          })
          flash(t('ManageUsers.deleteLessonRecord'))
        } else {
          flash('Failed to delete lesson record.')
        }
        setConfirm(null)
      }
    })
  }

  const filteredUsers = allUsers.filter(u => roleFilter === 'ALL' || u.role === roleFilter)

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        html, body, * { box-sizing: border-box; }
        @keyframes slideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .fade-in { animation: fadeIn .2s ease-out; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 99px; }
      `}</style>

      <div className="min-h-screen bg-gradient-to-b from-gray-50 via-[#f7f7f5] to-[#f7f7f5]">
        {toast && <Toast message={toast} onClose={() => setToast('')} />}
        <ConfirmDialog open={!!confirm} title={confirm?.title || ''} message={confirm?.message || ''} onConfirm={() => confirm?.fn()} onCancel={() => setConfirm(null)} />

        {/* ━━━━ HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-gray-900 text-[14px] hidden sm:block">{t('Common.appName')}</span>
              {customerCount !== null && isLoggedIn && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">{t('HomePage.customersBadge', { count: customerCount })}</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <LanguageSwitcher />
              {isLoggedIn ? (
                <>
                  <div className="hidden md:flex items-center gap-2 text-sm">
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-semibold text-gray-700">
                      {currentUser?.firstName?.[0]}{currentUser?.lastName?.[0]}
                    </div>
                    <span className="text-gray-600 font-medium text-[13px]">{currentUser && formatName(currentUser.firstName, currentUser.lastName)}</span>
                    <Badge variant={currentUser?.role === 'MANAGER' ? 'blue' : 'green'}>{currentUser?.role}</Badge>
                  </div>
                  <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                    <LogOut className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t('Auth.logout')}</span>
                  </button>
                </>
              ) : (
                <button onClick={() => setShowLogin(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-[13px] font-medium rounded-xl hover:bg-gray-800 transition-colors">
                  <LogIn className="w-3.5 h-3.5" />{t('Auth.login')}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ━━━━ CONTENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <main className="max-w-7xl mx-auto px-5 py-6">

          {/* Not logged in */}
          {!isLoggedIn && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center fade-in">
              <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center mb-5">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('HomePage.welcomeTitle')}</h1>
              <p className="text-gray-400 mb-7 max-w-sm text-sm leading-relaxed">{t('HomePage.welcomeDesc')}</p>
              <button onClick={() => setShowLogin(true)} className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors">
                <LogIn className="w-4 h-4" />{t('Auth.login')}
              </button>
            </div>
          )}

          {/* Logged in */}
          {isLoggedIn && (
            <div className="space-y-6 fade-in">

              {/* Issue 6: Instructor banner */}
              {currentUser?.role === 'INSTRUCTOR' && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900">Instructor View</p>
                    <p className="text-xs text-blue-600 mt-0.5">You can add lesson records and search customers. Admin features are available to managers only.</p>
                  </div>
                  <Btn onClick={() => router.push(`/${locale}/add-record`)} className="flex-shrink-0">
                    <Plus className="w-3.5 h-3.5" />{t('HomePage.addNewRecord')}
                  </Btn>
                </div>
              )}

              {/* ── Toolbar ── */}
              <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-[15px] font-semibold text-gray-900">{t('HomePage.dashboardTitle')}</h1>
                  {currentUser && <Badge variant={currentUser.role === 'MANAGER' ? 'blue' : 'green'}>{currentUser.role}</Badge>}
                  {customerCount !== null && (
                    <span className="text-xs text-gray-400 font-medium">{customerCount.toLocaleString()} {t('HomePage.allCustomersTitle').toLowerCase()}</span>
                  )}
                </div>
                {/* Row 1 — primary actions */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <Btn onClick={() => router.push(`/${locale}/add-record`)}>
                    <Plus className="w-3.5 h-3.5" />{t('HomePage.addNewRecord')}
                  </Btn>
                  {/* Export CSV — restricted to managers if allowInstructorExport is off */}
                  {(currentUser?.role === 'MANAGER' || appSettings.allowInstructorExport) && (
                    <a href="/api/export-csv" download="customer_records.csv">
                      <Btn variant="secondary"><Download className="w-3.5 h-3.5" />{t('HomePage.exportCSV')}</Btn>
                    </a>
                  )}
                  {/* Issue 6: Import CSV only for managers */}
                  {currentUser?.role === 'MANAGER' && (
                    <Btn variant="secondary" onClick={() => setUploadModal(true)}>
                      <Upload className="w-3.5 h-3.5" />{t('HomePage.importCSV')}
                    </Btn>
                  )}
                </div>

                {/* Row 2 — manager-only actions */}
                {currentUser?.role === 'MANAGER' && (
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-50">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1.5">
                      {t('HomePage.adminLabel')}
                    </span>
                    <Btn variant="secondary"
                      className={showAllCustomers ? '!bg-gray-900 !text-white !border-gray-900' : ''}
                      onClick={() => { const n = !showAllCustomers; setShowAllCustomers(n); if (n && !allCustomers.length) fetchAllCustomers(1) }}>
                      <Users className="w-3.5 h-3.5" />{t('HomePage.allCustomersTitle')}
                    </Btn>
                    <Btn variant="secondary"
                      className={showAllUsers ? '!bg-gray-900 !text-white !border-gray-900' : ''}
                      onClick={() => { const n = !showAllUsers; setShowAllUsers(n); if (n && !allUsers.length) fetchAllUsers() }}>
                      <Users className="w-3.5 h-3.5" />{t('HomePage.allUsersTitle')}
                    </Btn>
                    <Btn variant="secondary" onClick={() => setAddUserModal(true)}>
                      <UserPlus className="w-3.5 h-3.5" />{t('QuickActions.addUser')}
                    </Btn>
                    <Btn variant="secondary" onClick={() => setAddLocModal(true)}>
                      <MapPin className="w-3.5 h-3.5" />{t('QuickActions.addLocation')}
                    </Btn>
                    <Btn variant="secondary" onClick={() => router.push(`/${locale}/manage-users`)}>
                      <Settings className="w-3.5 h-3.5" />{t('HomePage.manageUsers')}
                    </Btn>
                    <Btn variant="secondary" onClick={() => router.push(`/${locale}/settings`)}>
                      <Settings className="w-3.5 h-3.5" />{t('HomePage.settings')}
                    </Btn>
                  </div>
                )}
              </div>

              {/* ── All Users panel ── */}
              {currentUser?.role === 'MANAGER' && showAllUsers && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden fade-in">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                    <div>
                      <h2 className="font-semibold text-gray-900 text-[15px]">{t('HomePage.allUsersTitle')}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">{allUsers.length} total</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['ALL', 'MANAGER', 'INSTRUCTOR'] as const).map(r => (
                        <button key={r} onClick={() => setRoleFilter(r)} className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${roleFilter === r ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{r}</button>
                      ))}
                    </div>
                  </div>
                  {auLoading ? [...Array(4)].map((_, i) => <ShimmerRow key={i} />) : (
                    <div className="divide-y divide-gray-50">
                      {filteredUsers.length === 0
                        ? <div className="px-6 py-10 text-center text-sm text-gray-400">{t('HomePage.noUsersFound')}</div>
                        : filteredUsers.map(u => (
                          <div key={u.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors group">
                            <Avatar name={`${u.firstName} ${u.lastName}`} color="gray" />
                            <div className="flex-1 min-w-0">
                              <button onClick={() => setUserModal(u)} className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors truncate block text-left">{formatName(u.firstName, u.lastName)}</button>
                              <p className="text-xs text-gray-400 truncate">{u.email}</p>
                            </div>
                            <span className="text-xs text-gray-400 hidden sm:block font-mono">{u.username}</span>
                            <Badge variant={u.role === 'MANAGER' ? 'blue' : 'green'}>{u.role}</Badge>
                            <span className="text-xs text-gray-400 hidden lg:block">{new Date(u.createdAt || '').toLocaleDateString()}</span>
                            <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => fetchInstructorLessons(u)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View sessions">
                                <BookOpen className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteUser(u.id, formatName(u.firstName, u.lastName))} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete user">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── All Customers panel ── */}
              {currentUser?.role === 'MANAGER' && showAllCustomers && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden fade-in">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                    <div>
                      <h2 className="font-semibold text-gray-900 text-[15px]">{t('HomePage.allCustomersTitle')}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Page {acPage}/{acTotalPages}{customerCount != null ? ` · ${customerCount} total` : ''}</p>
                    </div>
                    {acTotalPages > 1 && (
                      <div className="flex gap-1.5">
                        <button disabled={acPage === 1 || acLoading} onClick={() => fetchAllCustomers(acPage - 1)} className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-40 transition-colors">← Prev</button>
                        <button disabled={acPage === acTotalPages || acLoading} onClick={() => fetchAllCustomers(acPage + 1)} className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-40 transition-colors">Next →</button>
                      </div>
                    )}
                  </div>
                  {acLoading ? [...Array(6)].map((_, i) => <ShimmerRow key={i} />) : (
                    <div className="divide-y divide-gray-50">
                      {allCustomers.length === 0
                        ? <div className="px-6 py-10 text-center text-sm text-gray-400">{t('HomePage.noCustomersFound')}</div>
                        : allCustomers.map(c => (
                          <div key={c.id} className="flex items-center gap-2 sm:gap-4 px-4 sm:px-6 py-3.5 hover:bg-gray-50 transition-colors group">
                            <Avatar name={`${c.firstName} ${c.lastName}`} color="green" />
                            <div className="flex-1 min-w-0">
                              <button onClick={() => fetchDetail(c.id)} className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors truncate block text-left">{formatName(c.firstName, c.lastName)}</button>
                              <p className="text-xs text-gray-400 truncate">{c.email}</p>
                            </div>
                            {appSettings.showCustomerPhone && <span className="text-xs text-gray-400 hidden sm:block">{c.phone || '—'}</span>}
                            <span className="text-xs text-gray-400 hidden lg:block">
                              {c.lessonParticipants?.[0]?.lesson?.createdAt ? new Date(c.lessonParticipants[0].lesson.createdAt).toLocaleDateString() : 'No lessons'}
                            </span>
                            <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(c)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteCustomer(c.id, formatName(c.firstName, c.lastName))} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── MANAGER-only: Customer search + Instructor search + Recent Lessons ── */}
              {currentUser?.role === 'MANAGER' && (<>

              {/* ── Instructor Search ── */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-6 pt-5 pb-4">
                  <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Instructor Search</p>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={instrSearchTerm}
                      onChange={e => setInstrSearchTerm(e.target.value)}
                      placeholder="Search instructor by name…"
                      className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                    {instrSearchTerm && (
                      <button onClick={() => { setInstrSearchTerm(''); setInstrResults([]) }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {instrLoading && <div className="border-t border-gray-50">{[...Array(2)].map((_, i) => <ShimmerRow key={i} />)}</div>}
                {!instrLoading && instrResults.length > 0 && (
                  <div className="border-t border-gray-50 divide-y divide-gray-50">
                    {instrResults.map(instr => (
                      <button
                        key={instr.id}
                        onClick={() => fetchInstructorLessons(instr)}
                        className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors text-left"
                      >
                        <Avatar name={`${instr.firstName} ${instr.lastName}`} color="green" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{formatName(instr.firstName, instr.lastName)}</p>
                          <p className="text-xs text-gray-400 truncate">{instr.email}</p>
                        </div>
                        <span className="text-xs text-blue-600 font-medium flex-shrink-0">View sessions →</span>
                      </button>
                    ))}
                  </div>
                )}
                {!instrLoading && instrDebounced.length >= 2 && instrResults.length === 0 && (
                  <div className="border-t border-gray-50 px-6 py-8 text-center text-sm text-gray-400">No instructors found.</div>
                )}
                {!instrLoading && instrSearchTerm.length > 0 && instrSearchTerm.length < 2 && (
                  <div className="border-t border-gray-50 px-6 py-4 text-center text-xs text-gray-400">{t('HomePage.typeAtLeast2')}</div>
                )}
              </div>

              {/* ── Search box ── */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-6 pt-5 pb-4">
                  <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('CustomerSearch.title')}</p>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => { setSearchTerm(e.target.value); setSearchPage(1) }}
                      placeholder={t('HomePage.searchPlaceholder')}
                      className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                    />
                    {searchTerm && (
                      <button onClick={() => { setSearchTerm(''); setResults([]) }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {sLoading && <div className="border-t border-gray-50">{[...Array(3)].map((_, i) => <ShimmerRow key={i} />)}</div>}

                {sError && !sLoading && (
                  <div className="border-t border-gray-50 px-6 py-5 flex items-center gap-2.5 text-red-500">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{t('HomePage.searchFailedCustomer')}</span>
                  </div>
                )}

                {!sLoading && !sError && results.length > 0 && (
                  <div className="border-t border-gray-50">
                    {results.map(c => (
                      <div key={c.id}>
                        <div className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                          <Avatar name={`${c.firstName} ${c.lastName}`} color="violet" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{formatName(c.firstName, c.lastName)}</p>
                            <p className="text-xs text-gray-400 truncate">{c.email}{appSettings.showCustomerPhone && c.phone ? ` · ${c.phone}` : ''}</p>
                          </div>
                          {/* Issue 5: action buttons always visible on mobile */}
                          <div className="flex items-center gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={e => { e.stopPropagation(); fetchDetail(c.id) }} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                              <Eye className="w-3 h-3" />View
                            </button>
                            {currentUser?.role === 'MANAGER' && (
                              <>
                                <button onClick={e => { e.stopPropagation(); openEdit(c) }} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                                  <Edit3 className="w-3 h-3" />{t('Common.edit')}
                                </button>
                                <button onClick={e => { e.stopPropagation(); deleteCustomer(c.id, formatName(c.firstName, c.lastName)) }} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                                  <Trash2 className="w-3 h-3" />{t('Common.delete')}
                                </button>
                              </>
                            )}
                          </div>
                          <span className="text-gray-300 flex-shrink-0">{expandedId === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
                        </div>

                        {expandedId === c.id && (
                          <div className="border-t border-gray-50 bg-gray-50/70 px-6 py-4 fade-in">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('CustomerSearch.lessonDetails')}</p>
                              <button onClick={() => fetchDetail(c.id)} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">{t('HomePage.viewFullHistory')}</button>
                            </div>
                            {c.lessonParticipants && c.lessonParticipants.length > 0 ? (
                              <div className="space-y-2">
                                {c.lessonParticipants.map(lp => (
                                  <div key={lp.id} className="bg-white rounded-xl border border-gray-100 p-3.5">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                      <span className="text-xs font-semibold text-gray-800">{lp.lesson.createdAt ? new Date(lp.lesson.createdAt).toLocaleDateString() : '—'}</span>
                                      <Badge>{lp.lesson.lessonType}</Badge>
                                      {lp.status && appSettings.showFeedbackBadge && <Badge variant={lp.status === 'attended' ? 'green' : 'amber'}>{lp.status}</Badge>}
                                      <span className="text-xs text-gray-400 ml-auto">{formatName(lp.lesson.instructor.firstName, lp.lesson.instructor.lastName)}</span>
                                    </div>
                                    {lp.customerSymptoms && <p className="text-xs text-gray-600"><span className="font-semibold text-gray-700">{t('CustomerSearch.symptoms')}:</span> {lp.customerSymptoms}</p>}
                                    {lp.customerImprovements && <p className="text-xs text-gray-600 mt-0.5"><span className="font-semibold text-gray-700">{t('CustomerSearch.improvements')}:</span> {lp.customerImprovements}</p>}
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-sm text-gray-400">No lesson records found.</p>}
                          </div>
                        )}
                      </div>
                    ))}

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-50 bg-gray-50/50">
                        <button disabled={searchPage === 1} onClick={() => setSearchPage(p => p - 1)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">{t('HomePage.paginationPrev')}</button>
                        <span className="text-xs text-gray-400">{t('HomePage.pageOf', { page: searchPage, pages: totalPages, total })}</span>
                        <button disabled={searchPage === totalPages} onClick={() => setSearchPage(p => p + 1)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">{t('HomePage.paginationNext')}</button>
                      </div>
                    )}
                  </div>
                )}

                {!sLoading && !sError && debounced.length >= 2 && results.length === 0 && (
                  <div className="border-t border-gray-50 px-6 py-10 text-center">
                    <Search className="w-7 h-7 text-gray-200 mx-auto mb-2.5" />
                    <p className="text-sm text-gray-400">{t('HomePage.noResults')}</p>
                  </div>
                )}
                {!sLoading && searchTerm.length > 0 && searchTerm.length < 2 && (
                  <div className="border-t border-gray-50 px-6 py-4 text-center text-xs text-gray-400">{t('HomePage.typeAtLeast2')}</div>
                )}
              </div>

              {/* ── Recent Lessons quick-view ── */}
              <RecentLessons locale={locale} formatName={formatName} onViewCustomer={fetchDetail} />

              </>)}
            </div>
          )}
        </main>
      </div>

      {/* ━━━━ ALL MODALS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}

      {/* Login */}
      <ModalShell open={showLogin} onClose={() => setShowLogin(false)} title={t('Auth.login')}>
        <form onSubmit={handleLogin} className="space-y-4">
          <Field label={t('Auth.username')} type="text" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} placeholder={t('Auth.usernamePlaceholder')} required autoFocus />
          <Field label={t('Auth.password')} type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="••••••••" required />
          {loginError && <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3.5 py-2.5 rounded-xl"><AlertCircle className="w-4 h-4 flex-shrink-0" />{loginError}</div>}
          <Btn type="submit" disabled={loginLoading} className="w-full mt-2 justify-center !py-3">
            {loginLoading ? <><Loader2 className="w-4 h-4 animate-spin" />{t('Auth.signingIn')}</> : t('Auth.login')}
          </Btn>
        </form>
      </ModalShell>

      {/* Customer detail */}
      <ModalShell open={!!detailModal || detailLoading} onClose={() => { setDetailModal(null); setEditingLpId(null); setExpandedLpId(null) }} wide title={detailModal ? formatName(detailModal.firstName, detailModal.lastName) : ''} subtitle={t('HomePage.customerProfile')}>
        {detailLoading && !detailModal ? (
          <div className="space-y-5 animate-pulse">
            {/* Profile shimmer */}
            <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-2.5 w-10 bg-gray-100 rounded-full flex-shrink-0" />
                  <div className="h-3.5 bg-gray-100 rounded-full" style={{ width: i === 1 ? '55%' : i === 2 ? '30%' : '25%' }} />
                </div>
              ))}
            </div>
            {/* Initial symptoms shimmer */}
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-2">
              <div className="h-2.5 w-28 bg-amber-100 rounded-full" />
              <div className="h-3 w-full bg-amber-100 rounded-full" />
              <div className="h-3 w-3/4 bg-amber-100 rounded-full" />
            </div>
            {/* Lesson cards shimmer */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="h-2.5 w-24 bg-gray-100 rounded-full" />
                <div className="h-5 w-16 bg-gray-100 rounded-full" />
              </div>
              {[1, 2, 3].map(i => (
                <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-20 bg-gray-100 rounded-full" />
                    <div className="h-5 w-16 bg-gray-100 rounded-lg" />
                    <div className="h-5 w-12 bg-gray-100 rounded-lg" />
                    <div className="h-3 w-14 bg-gray-100 rounded-full ml-auto" />
                  </div>
                  <div className="h-3 w-4/5 bg-gray-50 rounded-full" />
                  <div className="h-3 w-3/5 bg-gray-50 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ) : detailModal && (() => {
          const lps = detailModal.lessonParticipants || []
          // Oldest session = last item (list is sorted newest-first)
          const oldest = lps.length > 0 ? lps[lps.length - 1] : null
          const initSx = oldest?.customerSymptoms || ''
          return (
            <div className="space-y-5">
              <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                {[
                  { label: 'Company', value: detailModal.company || '—' },
                  ...(appSettings.showCustomerPhone ? [{ label: t('HomePage.phone'), value: detailModal.phone || '—' }] : []),
                  { label: t('HomePage.since'), value: oldest?.lesson?.createdAt ? new Date(oldest.lesson.createdAt).toLocaleDateString() : '—' }
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-4 px-4 py-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold w-12 flex-shrink-0">{label}</p>
                    <p className="text-sm font-medium text-gray-900 truncate flex-1">{value}</p>
                  </div>
                ))}
              </div>

              {/* Initial symptoms — from the oldest (first) session */}
              {initSx && appSettings.showInitialSymptoms && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                  <p className="text-[11px] text-amber-600 mb-1 uppercase tracking-wide font-semibold">{t('CustomerSearch.initialSymptoms')}</p>
                  <p className="text-sm text-gray-800">{initSx}</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('CustomerSearch.lessonDetails')}</p>
                  {lps.length > 0 && <Badge>{lps.length} sessions</Badge>}
                </div>
                {detailLoading ? (
                  <div className="space-y-2.5 animate-pulse">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-3.5 w-20 bg-gray-100 rounded-full" />
                          <div className="h-5 w-16 bg-gray-100 rounded-lg" />
                          <div className="h-5 w-12 bg-gray-100 rounded-lg" />
                          <div className="h-3 w-14 bg-gray-100 rounded-full ml-auto" />
                        </div>
                        <div className="h-3 w-4/5 bg-gray-50 rounded-full" />
                        <div className="h-3 w-3/5 bg-gray-50 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : lps.length ? (
                  <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
                    {lps.map(lp => {
                      const isExpanded = expandedLpId === lp.id
                      const isEditing = editingLpId === lp.id
                      return (
                        <div
                          key={lp.id}
                          className={`border rounded-xl bg-white transition-colors ${isEditing ? 'border-blue-200' : isExpanded ? 'border-gray-200' : 'border-gray-100 hover:border-gray-200 cursor-pointer'}`}
                          onClick={() => { if (!isEditing) setExpandedLpId(isExpanded ? null : lp.id) }}
                        >
                          {/* ── Collapsed / always-visible header ── */}
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-900">{lp.lesson.createdAt ? new Date(lp.lesson.createdAt).toLocaleDateString() : '—'}</span>
                                <Badge>{lp.lesson.lessonType}</Badge>
                                {lp.lesson.location && <Badge variant="blue">{lp.lesson.location.name}</Badge>}
                                {lp.status && appSettings.showFeedbackBadge && <Badge variant={lp.status === 'attended' ? 'green' : 'amber'}>{lp.status}</Badge>}
                              </div>
                              {!isExpanded && !isEditing && lp.customerSymptoms && (
                                <p className="text-xs text-gray-400 truncate max-w-xs">{lp.customerSymptoms}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                              <span className="text-xs text-gray-400 hidden sm:block">{formatName(lp.lesson.instructor.firstName, lp.lesson.instructor.lastName)}</span>
                              {!isEditing && (
                                <>
                                  <button
                                    onClick={e => { e.stopPropagation(); setExpandedLpId(lp.id); startEditLp(lp) }}
                                    className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    title={t('CustomerSearch.editRecord')}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  {currentUser?.role === 'MANAGER' && (
                                    <button
                                      onClick={e => { e.stopPropagation(); deleteLp(lp) }}
                                      className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                      title={t('CustomerSearch.deleteRecord')}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* ── Expanded: view or edit ── */}
                          {(isExpanded || isEditing) && (
                            <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                              {isEditing ? (
                                <div className="space-y-3">
                                  <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('CustomerSearch.symptoms')}</label>
                                    <textarea
                                      className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                                      rows={2}
                                      value={editLpForm.symptoms}
                                      onChange={e => setEditLpForm(p => ({ ...p, symptoms: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('CustomerSearch.improvements')}</label>
                                    <textarea
                                      className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                                      rows={2}
                                      value={editLpForm.improvements}
                                      onChange={e => setEditLpForm(p => ({ ...p, improvements: e.target.value }))}
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Btn variant="secondary" size="sm" onClick={() => { cancelEditLp(); setExpandedLpId(lp.id) }} disabled={editLpLoading}><X className="w-3 h-3" />{t('Common.cancel')}</Btn>
                                    <Btn size="sm" onClick={() => saveLpEdit(lp)} disabled={editLpLoading}>
                                      {editLpLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                      {t('Common.save')}
                                    </Btn>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {lp.lesson.lessonContent && (
                                    <div>
                                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lesson Content</span>
                                      <p className="text-xs text-gray-700 mt-0.5">{lp.lesson.lessonContent}</p>
                                    </div>
                                  )}
                                  {lp.customerSymptoms && (
                                    <div>
                                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('CustomerSearch.symptoms')}</span>
                                      <p className="text-xs text-gray-700 mt-0.5">{lp.customerSymptoms}</p>
                                    </div>
                                  )}
                                  {lp.customerImprovements && (
                                    <div>
                                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('CustomerSearch.improvements')}</span>
                                      <p className="text-xs text-gray-700 mt-0.5">{lp.customerImprovements}</p>
                                    </div>
                                  )}
                                  {lp.status && lp.status !== 'attended' && (
                                    <div>
                                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('CustomerSearch.feedback')}</span>
                                      <p className="text-xs text-gray-700 mt-0.5">{lp.status}</p>
                                    </div>
                                  )}
                                  {!lp.lesson.lessonContent && !lp.customerSymptoms && !lp.customerImprovements && (
                                    <p className="text-xs text-gray-400">No additional details recorded.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : <p className="text-sm text-gray-400 py-4 text-center">{t('HomePage.noLessonRecordsFound')}</p>}
              </div>
              {currentUser?.role === 'MANAGER' && (
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <Btn variant="secondary" size="sm" onClick={() => { openEdit(detailModal); setDetailModal(null) }}><Edit3 className="w-3 h-3" />{t('Common.edit')}</Btn>
                  <Btn variant="danger" size="sm" onClick={() => { deleteCustomer(detailModal.id, formatName(detailModal.firstName, detailModal.lastName)); setDetailModal(null) }}><Trash2 className="w-3 h-3" />{t('Common.delete')}</Btn>
                </div>
              )}
            </div>
          )
        })()}
      </ModalShell>

      {/* Edit customer — Issue 1 & 5: single name field, grid-cols-1 sm:grid-cols-2 */}
      <ModalShell open={!!editModal} onClose={() => setEditModal(null)} title={t('HomePage.customerEditTitle')}>
        <div className="space-y-4">
          <Field label={t('HomePage.name')} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Full name" required />
          <Field label={t('HomePage.email')} type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required />
          <Field label={t('HomePage.phone')} value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder={t('Common.optional')} />
          <Field label="Company" value={editForm.company} onChange={e => setEditForm({ ...editForm, company: e.target.value })} placeholder={t('Common.optional')} />
          {editError && <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3.5 py-2.5 rounded-xl"><AlertCircle className="w-4 h-4 flex-shrink-0" />{editError}</div>}
          <div className="flex gap-2 pt-1">
            <Btn variant="secondary" className="flex-1 justify-center" onClick={() => setEditModal(null)}>{t('Common.cancel')}</Btn>
            <Btn disabled={editLoading} className="flex-1 justify-center" onClick={saveEdit}>{editLoading ? <><Loader2 className="w-4 h-4 animate-spin" />{t('Common.saving')}</> : t('Common.saveChanges')}</Btn>
          </div>
        </div>
      </ModalShell>

      {/* Instructor sessions */}
      <ModalShell wide open={!!instrDetailModal} onClose={() => { setInstrDetailModal(null); setInstrLessons([]) }} title={instrDetailModal ? `${formatName(instrDetailModal.firstName, instrDetailModal.lastName)} — Sessions` : ''} subtitle="All sessions taught by this instructor">
        {instrLessonsLoading ? (
          <div className="space-y-2.5">{[...Array(4)].map((_, i) => <div key={i} className="border border-gray-100 rounded-xl p-4 animate-pulse"><div className="h-3.5 w-1/3 bg-gray-100 rounded-full mb-2" /><div className="h-3 w-1/2 bg-gray-50 rounded-full" /></div>)}</div>
        ) : instrLessons.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No sessions found.</p>
        ) : (
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {instrLessons.map(lesson => (
              <div key={lesson.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-sm font-semibold text-gray-900">{new Date(lesson.createdAt).toLocaleDateString()}</span>
                  <Badge>{lesson.lessonType}</Badge>
                  {lesson.location && <Badge variant="blue">{lesson.location.name}</Badge>}
                  <span className="text-xs text-gray-400 ml-auto">
                    {lesson.lessonType === 'Group'
                      ? `${lesson.groupParticipantCount ?? 0} participant${(lesson.groupParticipantCount ?? 0) !== 1 ? 's' : ''}`
                      : `${lesson.lessonParticipants.length} participant${lesson.lessonParticipants.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
                {lesson.lessonType === 'Group' ? (
                  lesson.groupCompany && (
                    <div className="mt-2 pt-2 border-t border-gray-50">
                      <span className="text-xs text-gray-600">{lesson.groupCompany}</span>
                    </div>
                  )
                ) : (
                  lesson.lessonParticipants.length > 0 && (
                    <div className="space-y-1 mt-2 pt-2 border-t border-gray-50">
                      {lesson.lessonParticipants.map(lp => (
                        <div key={lp.id} className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="font-medium text-gray-800">{formatName(lp.customer.firstName, lp.customer.lastName)}</span>
                          {lp.customer.company && <span className="text-gray-400">· {lp.customer.company}</span>}
                          {lp.customerSymptoms && <span className="text-gray-400 truncate max-w-xs">· {lp.customerSymptoms}</span>}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </ModalShell>

      {/* User info */}
      <ModalShell open={!!userModal} onClose={() => setUserModal(null)} title={userModal ? formatName(userModal.firstName, userModal.lastName) : ''}>
        {userModal && (
          <div className="divide-y divide-gray-50">
            {[
              { label: t('HomePage.username'), val: <span className="font-mono text-sm">{userModal.username}</span> },
              { label: t('HomePage.email'), val: <span className="text-sm break-all">{userModal.email}</span> },
              { label: t('HomePage.role'), val: <Badge variant={userModal.role === 'MANAGER' ? 'blue' : 'green'}>{userModal.role}</Badge> },
              { label: t('HomePage.created'), val: <span className="text-sm">{new Date(userModal.createdAt || '').toLocaleString()}</span> },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center gap-4 py-3">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20 flex-shrink-0">{label}</span>
                {val}
              </div>
            ))}
          </div>
        )}
      </ModalShell>

      {/* Add user — Issue 1 & 5: single name field, grid-cols-1 sm:grid-cols-2 */}
      <ModalShell open={addUserModal} onClose={() => setAddUserModal(false)} title={t('HomePage.addNewUserTitle')}>
        <form onSubmit={handleAddUser} className="space-y-3.5">
          <Field label={t('Dialogs.name')} value={addUserForm.name} onChange={e => setAddUserForm({ ...addUserForm, name: e.target.value })} placeholder="Full name" required />
          <Field label={t('HomePage.email')} type="email" value={addUserForm.email} onChange={e => setAddUserForm({ ...addUserForm, email: e.target.value })} required />
          <Field label={t('HomePage.username')} value={addUserForm.username} onChange={e => setAddUserForm({ ...addUserForm, username: e.target.value })} required />
          <Field label={t('Dialogs.password')} type="password" value={addUserForm.password} onChange={e => setAddUserForm({ ...addUserForm, password: e.target.value })} required />
          <FieldSelect label={t('HomePage.role')} value={addUserForm.role} onChange={e => setAddUserForm({ ...addUserForm, role: e.target.value as UserRole })}>
            <option value="INSTRUCTOR">{t('Dialogs.instructor')}</option>
            <option value="MANAGER">{t('Dialogs.manager')}</option>
          </FieldSelect>
          {addUserError && <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3.5 py-2.5 rounded-xl"><AlertCircle className="w-4 h-4 flex-shrink-0" />{addUserError}</div>}
          <Btn type="submit" disabled={addUserLoading} className="w-full justify-center !py-3 mt-1">{addUserLoading ? <><Loader2 className="w-4 h-4 animate-spin" />{t('AddRecord.creating')}</> : t('HomePage.createUser')}</Btn>
        </form>
      </ModalShell>

      {/* Add location */}
      <ModalShell open={addLocModal} onClose={() => setAddLocModal(false)} title={t('HomePage.addNewLocationTitle')}>
        <form onSubmit={addLocation} className="space-y-4">
          <Field label={t('HomePage.locationName')} value={locName} onChange={e => setLocName(e.target.value)} placeholder={t('HomePage.locationNamePlaceholder')} required />
          {locError && <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3.5 py-2.5 rounded-xl"><AlertCircle className="w-4 h-4 flex-shrink-0" />{locError}</div>}
          <Btn type="submit" disabled={locLoading} className="w-full justify-center !py-3">{locLoading ? <><Loader2 className="w-4 h-4 animate-spin" />{t('AddRecord.creating')}</> : t('HomePage.createLocation')}</Btn>
        </form>
      </ModalShell>

      {/* ── Upload modal — the Inngest-backed component ── */}
      <UploadModal
        open={uploadModal}
        onClose={() => setUploadModal(false)}
        onSuccess={() => {
          fetchCount()
          if (showAllCustomers) fetchAllCustomers(1)
          flash('Import complete!')
        }}
      />
    </>
  )
}
