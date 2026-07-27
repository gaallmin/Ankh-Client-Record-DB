'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, ArrowLeft, Edit3, Check, X, AlertCircle, MapPin, Trash2 } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Cookies from 'js-cookie'

interface LocationData {
  id: string
  name: string
  createdAt: string
}

function FieldInput({
  label, value, onChange, placeholder
}: {
  label: string; value: string
  onChange?: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
        <MapPin className="w-3 h-3" />{label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white border-slate-200 text-slate-900 placeholder-slate-400"
      />
    </div>
  )
}

export default function ManageLocationsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations()
  const locale = pathname.split('/')[1] || 'en'
  const inputRef = useRef<HTMLInputElement>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<LocationData[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const token = Cookies.get('jwt-token')
    if (!token) router.push(`/${locale}`)
  }, [])

  const doSearch = async () => {
    setSearching(true); setSearchErr(null); setSearched(true); setResults([])
    try {
      const r = await fetch(`/api/locations?search=${encodeURIComponent(searchTerm)}`)
      if (r.ok) { const d = await r.json(); setResults(d.locations || []) }
      else setSearchErr('Search failed. Please try again.')
    } catch { setSearchErr('Network error. Please try again.') }
    finally { setSearching(false) }
  }

  const openEdit = (loc: LocationData) => {
    setEditId(loc.id)
    setEditName(loc.name)
    setSaveErr(null); setSaveOk(false)
    setDeleteConfirmId(null)
  }

  const cancelEdit = () => { setEditId(null); setSaveErr(null); setSaveOk(false) }

  const saveEdit = async () => {
    if (!editId) return
    if (!editName.trim()) { setSaveErr('Location name is required.'); return }
    setSaving(true); setSaveErr(null); setSaveOk(false)
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch(`/api/locations/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editName.trim() })
      })
      if (r.ok) {
        setResults(p => p.map(loc => loc.id === editId ? { ...loc, name: editName.trim() } : loc))
        setSaveOk(true)
        setTimeout(() => { setEditId(null); setSaveOk(false) }, 1000)
      } else {
        const d = await r.json()
        setSaveErr(d.error || 'Failed to save changes.')
      }
    } catch { setSaveErr('Unexpected error.') }
    finally { setSaving(false) }
  }

  const doDelete = async (id: string) => {
    setDeleting(true)
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch(`/api/locations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (r.ok) {
        setResults(p => p.filter(loc => loc.id !== id))
      }
    } catch { /* no-op — deleteConfirmId reset below regardless */ }
    finally { setDeleting(false); setDeleteConfirmId(null) }
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
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
          <div className="max-w-4xl mx-auto px-5 h-14 flex items-center gap-3">
            <button
              onClick={() => router.push(`/${locale}`)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('Common.back')}
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <h1 className="text-[15px] font-semibold text-slate-900">{t('HomePage.manageLocations')}</h1>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="max-w-4xl mx-auto px-5 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">

            {/* Search header */}
            <div className="px-6 py-5 border-b border-slate-50">
              <h2 className="text-[15px] font-semibold text-slate-900 mb-0.5">{t('HomePage.manageLocations')}</h2>
              <p className="text-xs text-slate-400">Search locations to view, edit, or delete them</p>
              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setSearched(false); setSearchErr(null) }}
                    onKeyDown={e => e.key === 'Enter' && doSearch()}
                    placeholder="Search by location name…"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                    autoFocus
                  />
                </div>
                <button
                  onClick={doSearch}
                  disabled={searching}
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
                <MapPin className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">{t('HomePage.noLocationsFound', { term: searchTerm })}</p>
              </div>
            )}

            {/* Results list */}
            {results.length > 0 && (
              <div className="divide-y divide-slate-50">
                {results.map(loc => (
                  <div key={loc.id} className="fade">

                    {/* View row */}
                    {editId !== loc.id && (
                      <div className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-4 h-4 text-slate-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{loc.name}</p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{new Date(loc.createdAt).toLocaleDateString()}</p>
                        </div>

                        {deleteConfirmId === loc.id ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-red-600 font-medium">{t('HomePage.deleteLocationTitle')}?</span>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              disabled={deleting}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                              {t('Common.cancel')}
                            </button>
                            <button
                              onClick={() => doDelete(loc.id)}
                              disabled={deleting}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                            >
                              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              {t('Common.delete')}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => openEdit(loc)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />{t('ManageUsers.edit')}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(loc.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title={t('HomePage.deleteLocationTitle')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Edit row */}
                    {editId === loc.id && (
                      <div className="px-6 py-5 bg-slate-50/60 fade">
                        <div className="flex items-center gap-3 mb-5">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-4 h-4 text-slate-600" />
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{t('HomePage.editLocationTitle')}</p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 mb-3">
                          <FieldInput
                            label={t('HomePage.locationName')}
                            value={editName}
                            onChange={setEditName}
                            placeholder={t('HomePage.locationNamePlaceholder')}
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
                  <MapPin className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-500">{t('HomePage.locationSearchHintTitle')}</p>
                <p className="text-xs text-slate-400 mt-1">{t('HomePage.locationSearchHintDesc')}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
