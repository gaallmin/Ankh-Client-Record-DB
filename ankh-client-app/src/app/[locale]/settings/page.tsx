'use client'

import { useState, useEffect } from 'react'
import {
  ArrowLeft, Loader2, AlertCircle, Check, User, Shield,
  Settings, Eye, EyeOff, Lock, Unlock, LayoutGrid, AlignLeft,
  FileDown, ClipboardList, BookOpen
} from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import Cookies from 'js-cookie'

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'visibility' | 'experience' | 'features'

interface AppSettings {
  defaultLessonType: string
  nameDisplayOrder: string
  recordsPerPage: number
  allowInstructorExport: boolean
  showInitialSymptoms: boolean
  requireLessonContent: boolean
  showFeedbackBadge: boolean
  showCustomerPhone: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultLessonType: 'Group',
  nameDisplayOrder: 'lastFirst',
  recordsPerPage: 20,
  allowInstructorExport: true,
  showInitialSymptoms: true,
  requireLessonContent: false,
  showFeedbackBadge: true,
  showCustomerPhone: true,
}

interface Instructor {
  id: string
  firstName: string
  lastName: string
  email: string
  role: 'INSTRUCTOR' | 'MANAGER'
  isActive: boolean
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-40 ${on ? 'bg-gray-900' : 'bg-gray-200'}`}
      aria-checked={on}
      role="switch"
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function SettingRow({
  icon, title, desc, children
}: {
  icon: React.ReactNode; title: string; desc: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-gray-50 last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
      <div className="flex-shrink-0 mt-1">{children}</div>
    </div>
  )
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
      <div className="px-5 sm:px-6 py-4 border-b border-gray-50">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="px-5 sm:px-6">{children}</div>
    </div>
  )
}

function InstructorCheckbox({
  instructor, checked, disabled, onChange
}: {
  instructor: Instructor; checked: boolean; disabled: boolean; onChange: (c: boolean) => void
}) {
  const isKorean = /[\uAC00-\uD7AF]/.test(instructor.firstName + instructor.lastName)
  const initials = isKorean
    ? `${instructor.lastName?.[0] ?? ''}${instructor.firstName?.[0] ?? ''}`
    : `${instructor.firstName?.[0] ?? ''}${instructor.lastName?.[0] ?? ''}`
  const displayName = instructor.lastName ? `${instructor.lastName} ${instructor.firstName}` : instructor.firstName

  return (
    <label
      onClick={e => { e.preventDefault(); if (!disabled) onChange(!checked) }}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all select-none ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer ' + (checked ? 'border-gray-300 bg-gray-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50/50')}`}
    >
      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${disabled ? 'border-gray-200 bg-gray-100' : checked ? 'border-gray-900 bg-gray-900' : 'border-gray-300 bg-white'}`}>
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold ${instructor.role === 'MANAGER' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
        {initials.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {instructor.role === 'MANAGER'
            ? <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600"><Shield className="w-2.5 h-2.5" />Manager</span>
            : <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600"><User className="w-2.5 h-2.5" />Instructor</span>}
        </div>
      </div>
    </label>
  )
}

function SaveBar({
  dirty, saving, saveOk, saveErr, onSave
}: {
  dirty: boolean; saving: boolean; saveOk: boolean; saveErr: string | null; onSave: () => void
}) {
  return (
    <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4 rounded-b-2xl">
      <div>
        {saveOk && <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600"><Check className="w-3.5 h-3.5" />Saved successfully</span>}
        {saveErr && <span className="flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="w-3.5 h-3.5" />{saveErr}</span>}
        {!saveOk && !saveErr && dirty && <span className="text-xs text-amber-600 font-medium">You have unsaved changes</span>}
        {!saveOk && !saveErr && !dirty && <span className="text-xs text-gray-400">All changes saved</span>}
      </div>
      <button
        onClick={onSave}
        disabled={saving || !dirty}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors"
      >
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Save Changes'}
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const locale = pathname.split('/')[1] || 'en'

  const [activeTab, setActiveTab] = useState<Tab>('visibility')

  // App settings state
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaveOk, setSettingsSaveOk] = useState(false)
  const [settingsSaveErr, setSettingsSaveErr] = useState<string | null>(null)

  // Instructor visibility state
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [instrLoading, setInstrLoading] = useState(true)
  const [instrLoadError, setInstrLoadError] = useState<string | null>(null)
  const [filterEnabled, setFilterEnabled] = useState(false)
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const [instrSaving, setInstrSaving] = useState(false)
  const [instrSaveOk, setInstrSaveOk] = useState(false)
  const [instrSaveErr, setInstrSaveErr] = useState<string | null>(null)
  const [instrDirty, setInstrDirty] = useState(false)

  useEffect(() => {
    const token = Cookies.get('jwt-token')
    if (!token) { router.push(`/${locale}`); return }
    loadAll(token)
  }, [])

  const loadAll = async (token: string) => {
    await Promise.all([loadSettings(), loadInstructors(token)])
  }

  const loadSettings = async () => {
    setSettingsLoading(true)
    try {
      const r = await fetch('/api/settings')
      if (r.ok) {
        const data = await r.json()
        setAppSettings({ ...DEFAULT_SETTINGS, ...data.settings })
      }
    } finally {
      setSettingsLoading(false)
    }
  }

  const loadInstructors = async (token: string) => {
    setInstrLoading(true); setInstrLoadError(null)
    try {
      const r = await fetch('/api/users/instructor-visibility', { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) { setInstrLoadError('Failed to load instructors.'); return }
      const data = await r.json()
      const list: Instructor[] = data.instructors || []
      setInstructors(list)
      const anyInactive = list.some(i => !i.isActive)
      setFilterEnabled(anyInactive)
      setActiveIds(new Set(list.filter(i => i.isActive).map(i => i.id)))
    } catch {
      setInstrLoadError('Network error. Please try again.')
    } finally {
      setInstrLoading(false)
    }
  }

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setAppSettings(prev => ({ ...prev, [key]: value }))
    setSettingsDirty(true); setSettingsSaveOk(false); setSettingsSaveErr(null)
  }

  const saveSettings = async () => {
    setSettingsSaving(true); setSettingsSaveOk(false); setSettingsSaveErr(null)
    const token = Cookies.get('jwt-token')
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings: appSettings })
      })
      if (!r.ok) { const d = await r.json(); setSettingsSaveErr(d.error || 'Failed to save.'); return }
      // Persist to cookie so other pages can read without an extra fetch
      Cookies.set('app-settings', JSON.stringify(appSettings), { expires: 7 })
      setSettingsSaveOk(true); setSettingsDirty(false)
      setTimeout(() => setSettingsSaveOk(false), 3000)
    } catch {
      setSettingsSaveErr('Network error. Please try again.')
    } finally {
      setSettingsSaving(false)
    }
  }

  const toggleInstructor = (id: string, checked: boolean) => {
    setActiveIds(prev => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n })
    setInstrDirty(true); setInstrSaveOk(false); setInstrSaveErr(null)
  }

  const handleMasterToggle = (on: boolean) => {
    setFilterEnabled(on)
    if (!on) setActiveIds(new Set(instructors.map(i => i.id)))
    setInstrDirty(true); setInstrSaveOk(false); setInstrSaveErr(null)
  }

  const saveInstructors = async () => {
    setInstrSaving(true); setInstrSaveOk(false); setInstrSaveErr(null)
    const token = Cookies.get('jwt-token')
    try {
      const updates = instructors.map(i => ({ id: i.id, isActive: filterEnabled ? activeIds.has(i.id) : true }))
      const r = await fetch('/api/users/instructor-visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ updates })
      })
      if (!r.ok) { const d = await r.json(); setInstrSaveErr(d.error || 'Failed to save.'); return }
      setInstrSaveOk(true); setInstrDirty(false)
      setTimeout(() => setInstrSaveOk(false), 3000)
    } catch {
      setInstrSaveErr('Network error. Please try again.')
    } finally {
      setInstrSaving(false)
    }
  }

  const tabs: { id: Tab; label: string; sublabel: string }[] = [
    { id: 'visibility', label: 'Instructor Access', sublabel: 'Control who appears in dropdowns' },
    { id: 'experience', label: 'Display & Defaults', sublabel: 'Format and pre-fill preferences' },
    { id: 'features', label: 'Permissions & Rules', sublabel: 'Access control and validation' },
  ]

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
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
            <button onClick={() => router.push(`/${locale}`)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Back</span>
            </button>
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-500" />
              <h1 className="text-[15px] font-semibold text-gray-900">Settings</h1>
              <span className="hidden sm:inline text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-2 py-0.5 bg-gray-100 rounded-full">Manager only</span>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Settings</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">ADMIN / MANAGER ONLY — Configure app visibility and preferences</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={tab.sublabel}
                className={`flex-shrink-0 flex flex-col items-start px-4 py-2.5 rounded-xl text-left transition-colors ${activeTab === tab.id ? 'bg-gray-900 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300'}`}
              >
                <span className="text-sm font-semibold">{tab.label}</span>
                <span className={`text-[10px] mt-0.5 hidden sm:block ${activeTab === tab.id ? 'text-gray-400' : 'text-gray-400'}`}>{tab.sublabel}</span>
              </button>
            ))}
          </div>

          {/* ── App Visibility Tab ──────────────────────────────────────── */}
          {activeTab === 'visibility' && (
            <div className="fade">
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-start sm:items-center justify-between gap-4 px-5 sm:px-6 py-5 border-b border-gray-50">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Instructor Visibility</h3>
                    <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                      {instrLoading ? 'Loading…' : `Control which instructors appear in the Add Record dropdown (${instructors.length} total)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-semibold ${filterEnabled ? 'text-gray-900' : 'text-gray-400'}`}>{filterEnabled ? 'On' : 'Off'}</span>
                    <Toggle on={filterEnabled} onChange={handleMasterToggle} />
                  </div>
                </div>

                {!filterEnabled && !instrLoading && (
                  <div className="px-5 sm:px-6 py-3 bg-amber-50 border-b border-amber-100">
                    <p className="text-xs text-amber-700 font-medium">Filter is Off — all instructors are shown in the dropdown. Turn On to select specific instructors.</p>
                  </div>
                )}

                <div className="px-5 sm:px-6 py-5">
                  {instrLoading && (
                    <div className="space-y-2.5 animate-pulse">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100">
                          <div className="w-5 h-5 rounded-md bg-gray-100 flex-shrink-0" />
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-28 bg-gray-100 rounded-full" />
                            <div className="h-2.5 w-16 bg-gray-50 rounded-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {instrLoadError && <div className="flex items-center gap-2.5 text-red-600 bg-red-50 px-4 py-3 rounded-xl text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" />{instrLoadError}</div>}
                  {!instrLoading && !instrLoadError && instructors.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">No instructors found. Add users with the Instructor role first.</p>
                  )}
                  {!instrLoading && !instrLoadError && instructors.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {instructors.map(i => (
                        <InstructorCheckbox key={i.id} instructor={i} checked={activeIds.has(i.id)} disabled={!filterEnabled} onChange={c => toggleInstructor(i.id, c)} />
                      ))}
                    </div>
                  )}
                </div>

                {!instrLoading && !instrLoadError && instructors.length > 0 && (
                  <SaveBar dirty={instrDirty} saving={instrSaving} saveOk={instrSaveOk} saveErr={instrSaveErr} onSave={saveInstructors} />
                )}
              </div>
            </div>
          )}

          {/* ── User Experience Tab ─────────────────────────────────────── */}
          {activeTab === 'experience' && (
            <div className="fade">
              {settingsLoading ? (
                <div className="space-y-4 animate-pulse">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                      <div className="h-4 w-40 bg-gray-100 rounded-full" />
                      {[...Array(2)].map((_, j) => (
                        <div key={j} className="flex justify-between items-center py-3 border-b border-gray-50">
                          <div className="space-y-1.5">
                            <div className="h-3.5 w-36 bg-gray-100 rounded-full" />
                            <div className="h-3 w-52 bg-gray-50 rounded-full" />
                          </div>
                          <div className="h-8 w-28 bg-gray-100 rounded-xl flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Section 1: Record Defaults */}
                  <SectionCard
                    title="Record Defaults"
                    subtitle="Pre-filled values when creating a new lesson record"
                  >
                    <SettingRow
                      icon={<BookOpen className="w-4 h-4 text-gray-500" />}
                      title="Default Lesson Type"
                      desc="The lesson type pre-selected when opening the Add Record form"
                    >
                      <select
                        value={appSettings.defaultLessonType}
                        onChange={e => updateSetting('defaultLessonType', e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                      >
                        <option value="Group">Group</option>
                        <option value="Individual">Individual</option>
                      </select>
                    </SettingRow>
                  </SectionCard>

                  {/* Section 2: Name & Display */}
                  <SectionCard
                    title="Name & Display Format"
                    subtitle="How names and data are presented throughout the app"
                  >
                    <SettingRow
                      icon={<AlignLeft className="w-4 h-4 text-gray-500" />}
                      title="Name Display Order"
                      desc="How customer and instructor names are shown across the app"
                    >
                      <select
                        value={appSettings.nameDisplayOrder}
                        onChange={e => updateSetting('nameDisplayOrder', e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                      >
                        <option value="lastFirst">Last · First (Korean style)</option>
                        <option value="firstLast">First · Last (English style)</option>
                      </select>
                    </SettingRow>
                  </SectionCard>

                  {/* Section 3: Pagination */}
                  <SectionCard
                    title="Pagination & Lists"
                    subtitle="Control how many records are shown per page in lists"
                  >
                    <SettingRow
                      icon={<LayoutGrid className="w-4 h-4 text-gray-500" />}
                      title="Customers Per Page"
                      desc="Number of customers shown per page in the All Customers list"
                    >
                      <select
                        value={appSettings.recordsPerPage}
                        onChange={e => updateSetting('recordsPerPage', Number(e.target.value))}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                      >
                        {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n} per page</option>)}
                      </select>
                    </SettingRow>
                  </SectionCard>

                  <SaveBar dirty={settingsDirty} saving={settingsSaving} saveOk={settingsSaveOk} saveErr={settingsSaveErr} onSave={saveSettings} />
                </>
              )}
            </div>
          )}

          {/* ── Feature Management Tab ──────────────────────────────────── */}
          {activeTab === 'features' && (
            <div className="fade">
              {settingsLoading ? (
                <div className="space-y-4 animate-pulse">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                      <div className="h-4 w-40 bg-gray-100 rounded-full" />
                      {[...Array(2)].map((_, j) => (
                        <div key={j} className="flex justify-between items-center py-3 border-b border-gray-50">
                          <div className="space-y-1.5">
                            <div className="h-3.5 w-36 bg-gray-100 rounded-full" />
                            <div className="h-3 w-52 bg-gray-50 rounded-full" />
                          </div>
                          <div className="h-6 w-11 bg-gray-100 rounded-full flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Section 1: Data Visibility */}
                  <SectionCard
                    title="Data Visibility"
                    subtitle="Show or hide specific data fields across the entire app"
                  >
                    <SettingRow
                      icon={<Eye className="w-4 h-4 text-gray-500" />}
                      title="Show Initial Symptoms Block"
                      desc="Display the amber Initial Symptoms card in customer profiles"
                    >
                      <Toggle on={appSettings.showInitialSymptoms} onChange={v => updateSetting('showInitialSymptoms', v)} />
                    </SettingRow>
                    <SettingRow
                      icon={appSettings.showFeedbackBadge ? <Eye className="w-4 h-4 text-gray-500" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                      title="Show Customer Feedback Badge"
                      desc='Display the status badge on lesson cards (e.g. "attended", "cancelled")'
                    >
                      <Toggle on={appSettings.showFeedbackBadge} onChange={v => updateSetting('showFeedbackBadge', v)} />
                    </SettingRow>
                    <SettingRow
                      icon={appSettings.showCustomerPhone ? <Eye className="w-4 h-4 text-gray-500" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                      title="Show Customer Phone Number"
                      desc="Display phone number in customer profiles and search results"
                    >
                      <Toggle on={appSettings.showCustomerPhone} onChange={v => updateSetting('showCustomerPhone', v)} />
                    </SettingRow>
                  </SectionCard>

                  {/* Section 2: Access Control */}
                  <SectionCard
                    title="Access & Permissions"
                    subtitle="Control what instructors are allowed to do in the app"
                  >
                    <SettingRow
                      icon={appSettings.allowInstructorExport ? <Unlock className="w-4 h-4 text-gray-500" /> : <Lock className="w-4 h-4 text-gray-400" />}
                      title="Allow Instructors to Export CSV"
                      desc="When off, only managers can download the full customer export"
                    >
                      <Toggle on={appSettings.allowInstructorExport} onChange={v => updateSetting('allowInstructorExport', v)} />
                    </SettingRow>
                  </SectionCard>

                  {/* Section 3: Validation */}
                  <SectionCard
                    title="Form Validation"
                    subtitle="Control which fields are required when creating lesson records"
                  >
                    <SettingRow
                      icon={<ClipboardList className="w-4 h-4 text-gray-500" />}
                      title="Require Lesson Content"
                      desc="Make the Lesson Content field mandatory when adding a new record"
                    >
                      <Toggle on={appSettings.requireLessonContent} onChange={v => updateSetting('requireLessonContent', v)} />
                    </SettingRow>
                  </SectionCard>

                  <SaveBar dirty={settingsDirty} saving={settingsSaving} saveOk={settingsSaveOk} saveErr={settingsSaveErr} onSave={saveSettings} />
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
