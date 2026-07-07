'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, ArrowLeft, Edit3, Check, X, AlertCircle, Shield, User, KeyRound, Mail, Tag } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Cookies from 'js-cookie'

// Helper: split "Full Name" → { firstName, lastName }
const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

interface UserData {
  id: string
  username?: string
  firstName: string
  lastName: string
  email: string
  role: string
  createdAt: string
}

function Avatar({ firstName, lastName, locale }: { 
  firstName: string; lastName: string; locale?: string 
}) {
  // Korean characters are wider — detect if either name contains Korean
  const isKorean = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(firstName + lastName)
  
  // In Korean locale: Last[0] + First[0] (e.g. 김준)
  // In English locale: First[0] + Last[0] (e.g. JD)
  const initials = locale === 'ko'
    ? `${lastName?.[0] ?? ''}${firstName?.[0] ?? ''}`
    : `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`

  return (
    <div className={`
      h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300
      flex items-center justify-center font-semibold
      text-slate-700 flex-shrink-0 select-none
      ${isKorean ? 'w-11 text-sm' : 'w-9 text-xs'}
    `}>
      {initials.toUpperCase() || '?'}
    </div>
  )
}

function Badge({ role }: { role: string }) {
  const isManager = role === 'MANAGER'
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      isManager ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
    }`}>
      {isManager ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
      {role}
    </span>
  )
}

function FieldInput({
  label, icon, value, onChange, type = 'text', placeholder, readOnly
}: {
  label: string; icon?: React.ReactNode; value: string
  onChange?: (v: string) => void; type?: string; placeholder?: string; readOnly?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
        {icon}{label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent ${
          readOnly
            ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
        }`}
      />
    </div>
  )
}

export default function ManageUsersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations()
  const locale = pathname.split('/')[1] || 'en'
  const inputRef = useRef<HTMLInputElement>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<UserData[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  useEffect(() => {
    const token = Cookies.get('jwt-token')
    if (!token) router.push(`/${locale}`)
  }, [])

  const doSearch = async () => {
    if (!searchTerm.trim()) return
    setSearching(true); setSearchErr(null); setSearched(true); setResults([])
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch(`/api/users/search?name=${encodeURIComponent(searchTerm)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (r.ok) { const d = await r.json(); setResults(d.users || []) }
      else setSearchErr('Search failed. Please try again.')
    } catch { setSearchErr('Network error. Please try again.') }
    finally { setSearching(false) }
  }

  const openEdit = (u: UserData) => {
    setEditId(u.id)
    setEditForm({ name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, role: u.role, password: '' })
    setSaveErr(null); setSaveOk(false)
  }

  const cancelEdit = () => { setEditId(null); setSaveErr(null); setSaveOk(false) }

  const saveEdit = async () => {
    if (!editId) return
    if (!editForm.name.trim() || !editForm.email.trim()) { setSaveErr('Full name and email are required.'); return }
    const { firstName, lastName } = splitFullName(editForm.name)
    setSaving(true); setSaveErr(null); setSaveOk(false)
    const token = Cookies.get('jwt-token')
    try {
      const body: Record<string, string> = {
        firstName,
        lastName,
        email: editForm.email,
        role: editForm.role,
      }
      if (editForm.password.trim()) body.password = editForm.password
      const r = await fetch(`/api/users/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      })
      if (r.ok) {
        setResults(p => p.map(u => u.id === editId ? { ...u, ...body } : u))
        setSaveOk(true)
        setTimeout(() => { setEditId(null); setSaveOk(false) }, 1000)
      } else {
        const d = await r.json()
        setSaveErr(d.error || 'Failed to save changes.')
      }
    } catch { setSaveErr('Unexpected error.') }
    finally { setSaving(false) }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        html, body, * { font-family: 'DM Sans', system-ui, sans-serif; box-sizing: border-box; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
        .fade { animation: fadeIn .2s ease-out; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
      `}</style>

      <div className="min-h-screen bg-[#f7f7f5]">

        {/* ── Header ── */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-5 h-14 flex items-center gap-3">
            <button
              onClick={() => router.push(`/${locale}`)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('Common.back')}
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <h1 className="text-[15px] font-semibold text-slate-900">Manage Users</h1>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="max-w-4xl mx-auto px-5 py-8">
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">

            {/* Search header */}
            <div className="px-6 py-5 border-b border-slate-50">
              <h2 className="text-[15px] font-semibold text-slate-900 mb-0.5">Search Users</h2>
              <p className="text-xs text-slate-400">Find users by name or email to view and edit their information</p>
              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setSearched(false); setSearchErr(null) }}
                    onKeyDown={e => e.key === 'Enter' && doSearch()}
                    placeholder="Search by name or email…"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                    autoFocus
                  />
                </div>
                <button
                  onClick={doSearch}
                  disabled={searching || !searchTerm.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {t('Common.search')}
                </button>
              </div>
            </div>

            {/* Error state */}
            {searchErr && (
              <div className="mx-6 mt-5 flex items-center gap-2.5 text-red-600 bg-red-50 px-4 py-3 rounded-xl text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{searchErr}
              </div>
            )}

            {/* No results */}
            {searched && !searching && !searchErr && results.length === 0 && (
              <div className="px-6 py-12 text-center">
                <Search className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No users found for "{searchTerm}"</p>
              </div>
            )}

            {/* Results list */}
            {results.length > 0 && (
              <div className="divide-y divide-slate-50">
                {results.map(user => (
                  <div key={user.id} className="fade">

                    {/* View row */}
                    {editId !== user.id && (
                      <div className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group">
                        <Avatar firstName={user.firstName} lastName={user.lastName} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900 truncate">{user.firstName} {user.lastName}</p>
                            <Badge role={user.role} />
                          </div>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{user.email}</p>
                        </div>
                        {user.username && (
                          <span className="text-xs text-slate-400 hidden sm:block font-mono bg-slate-50 px-2 py-1 rounded-lg">{user.username}</span>
                        )}
                        <span className="text-xs text-slate-400 hidden md:block">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => openEdit(user)}
                          className="sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                        >
                          <Edit3 className="w-3.5 h-3.5" />{t('ManageUsers.edit')}
                        </button>
                      </div>
                    )}

                    {/* Edit row */}
                    {editId === user.id && (
                      <div className="px-6 py-5 bg-slate-50/60 fade">
                        <div className="flex items-center gap-3 mb-5">
                          <Avatar firstName={splitFullName(editForm.name).firstName || user.firstName} lastName={splitFullName(editForm.name).lastName || user.lastName} />
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{t('ManageUsers.editingUser', { name: `${user.firstName} ${user.lastName}` })}</p>
                            <p className="text-xs text-slate-400">{t('ManageUsers.leavePasswordBlank')}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          <FieldInput
                            label={t('ManageUsers.name')}
                            value={editForm.name}
                            onChange={v => setEditForm(p => ({ ...p, name: v }))}
                            placeholder="Full name"
                          />
                          <FieldInput
                            label={t('HomePage.email')}
                            icon={<Mail className="w-3 h-3" />}
                            type="email"
                            value={editForm.email}
                            onChange={v => setEditForm(p => ({ ...p, email: v }))}
                            placeholder="email@example.com"
                          />
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                              <Tag className="w-3 h-3" />{t('HomePage.role')}
                            </label>
                            <select
                              value={editForm.role}
                              onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                            >
                              <option value="INSTRUCTOR">{t('Dialogs.instructor')}</option>
                              <option value="MANAGER">{t('Dialogs.manager')}</option>
                            </select>
                          </div>
                          <FieldInput
                            label={t('ManageUsers.newPassword')}
                            icon={<KeyRound className="w-3 h-3" />}
                            type="password"
                            value={editForm.password}
                            onChange={v => setEditForm(p => ({ ...p, password: v }))}
                            placeholder={t('ManageUsers.leaveBlankToKeepCurrent')}
                          />
                        </div>

                        {saveErr && (
                          <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 px-3.5 py-2.5 rounded-xl mb-3">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{saveErr}
                          </div>
                        )}

                        {saveOk && (
                          <div className="flex items-center gap-2 text-emerald-700 text-xs bg-emerald-50 px-3.5 py-2.5 rounded-xl mb-3">
                            <Check className="w-3.5 h-3.5" />{t('ManageUsers.savedSuccessfully')}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors"
                          >
                            <X className="w-4 h-4" />{t('Common.cancel')}
                          </button>
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-xl transition-colors"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {saving ? t('Common.saving') : t('Common.saveChanges')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Empty placeholder before search */}
            {!searched && !searching && results.length === 0 && (
              <div className="px-6 py-14 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Search className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-500">{t('ManageUsers.searchHintTitle')}</p>
                <p className="text-xs text-slate-400 mt-1">{t('ManageUsers.searchHintDesc')}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}