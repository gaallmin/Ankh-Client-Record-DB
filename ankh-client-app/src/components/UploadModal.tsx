'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, ChevronDown } from 'lucide-react'
import Cookies from 'js-cookie'

// ── Types ─────────────────────────────────────────────────────────────────────
type JobStatus = 'idle' | 'uploading' | 'queued' | 'processing' | 'complete' | 'failed'

interface JobState {
  jobId: string | null
  status: JobStatus
  progress: number
  message: string
  totalRows: number
  rowErrors: string[]
}

// ── Progress bar with smooth spring animation ─────────────────────────────────
function ProgressBar({ value, status }: { value: number; status: JobStatus }) {
  const isComplete = status === 'complete'
  const isFailed = status === 'failed'

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-gray-500">
          {isComplete ? 'Complete' : isFailed ? 'Failed' : 'Processing…'}
        </span>
        <span className="text-xs font-semibold text-gray-700 tabular-nums">{value}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isComplete ? 'bg-emerald-500' : isFailed ? 'bg-red-400' : 'bg-gray-900'
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Upload', threshold: 5 },
  { label: 'Validate', threshold: 20 },
  { label: 'Locations', threshold: 35 },
  { label: 'Instructors', threshold: 50 },
  { label: 'Customers', threshold: 65 },
  { label: 'Lessons', threshold: 80 },
  { label: 'Done', threshold: 100 },
]

function StepRow({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {STEPS.map((step, i) => {
        const done = progress >= step.threshold
        const active = progress >= (STEPS[i - 1]?.threshold ?? 0) && progress < step.threshold
        return (
          <div key={step.label} className="flex items-center gap-1 flex-shrink-0">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors duration-300 ${
              done
                ? 'bg-emerald-100 text-emerald-700'
                : active
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-400'
            }`}>
              {done ? '✓' : i + 1}
            </div>
            <span className={`text-[11px] transition-colors duration-300 ${
              done ? 'text-emerald-600 font-medium' : active ? 'text-gray-900 font-medium' : 'text-gray-400'
            }`}>
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`w-4 h-px mx-0.5 transition-colors duration-300 ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface UploadModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function UploadModal({ open, onClose, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [fileError, setFileError] = useState('')
  const [showGuide, setShowGuide] = useState(false)
  const [job, setJob] = useState<JobState>({
    jobId: null, status: 'idle', progress: 0, message: '', totalRows: 0, rowErrors: [],
  })

  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const canClose = job.status === 'idle' || job.status === 'complete' || job.status === 'failed'

  // ── Poll for progress ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!job.jobId || job.status === 'complete' || job.status === 'failed') return

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/import/status/${job.jobId}`)
        if (!res.ok) return
        const data = await res.json()

        setJob(prev => ({
          ...prev,
          status: data.status as JobStatus,
          progress: data.progress,
          message: data.message,
          rowErrors: data.rowErrors || [],
        }))

        if (data.status === 'complete') {
          clearInterval(pollingRef.current!)
          onSuccess()
        }
        if (data.status === 'failed') {
          clearInterval(pollingRef.current!)
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 2000) // poll every 2 seconds

    return () => clearInterval(pollingRef.current!)
  }, [job.jobId, job.status])

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => () => clearInterval(pollingRef.current!), [])

  // ── Reset when re-opened ────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setFile(null); setFileError('')
      setJob({ jobId: null, status: 'idle', progress: 0, message: '', totalRows: 0, rowErrors: [] })
    }
  }, [open])

  const handleFile = (f: File | null) => {
    setFileError('')
    if (!f) return
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      setFileError('Please select a CSV, XLSX, or XLS file.')
      return
    }
    setFile(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setJob(prev => ({ ...prev, status: 'uploading', progress: 2, message: 'Uploading your file…' }))

    try {
      const formData = new FormData()
      formData.append('file', file)

      const token = Cookies.get('jwt-token')
      const res = await fetch('/api/import/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setJob(prev => ({ ...prev, status: 'failed', progress: 0, message: data.error || 'Upload failed' }))
        return
      }

      // ✅ File accepted. Inngest is now running the job server-side.
      // We just store the jobId and start polling.
      setJob(prev => ({
        ...prev,
        jobId: data.jobId,
        status: 'queued',
        progress: 3,
        totalRows: data.totalRows,
        message: `File received — ${data.totalRows} rows queued for processing`,
      }))
    } catch {
      setJob(prev => ({ ...prev, status: 'failed', progress: 0, message: 'Network error — please try again' }))
    }
  }

  const handleClose = () => {
    if (!canClose) return
    clearInterval(pollingRef.current!)
    onClose()
  }

  if (!open) return null

  const isActive = job.status === 'uploading' || job.status === 'queued' || job.status === 'processing'
  const isComplete = job.status === 'complete'
  const isFailed = job.status === 'failed'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900">Import Records</h2>
                <p className="text-xs text-gray-400 mt-0.5">CSV, XLSX, or XLS supported</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={!canClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">

            {/* ── Idle: file picker ──────────────────────────────────────────── */}
            {job.status === 'idle' && (
              <label
                className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  isDragging
                    ? 'border-gray-900 bg-gray-50'
                    : file
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'
                }`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0] || null) }}
              >
                {file ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mb-2" />
                    <span className="text-sm font-semibold text-emerald-700 px-4 text-center truncate max-w-full">{file.name}</span>
                    <span className="text-xs text-emerald-500 mt-1">{(file.size / 1024).toFixed(1)} KB · click to change</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-gray-400 mb-2" />
                    <span className="text-sm font-medium text-gray-600">Drop your file here or click to browse</span>
                    <span className="text-xs text-gray-400 mt-1">Excel or CSV</span>
                  </>
                )}
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={e => handleFile(e.target.files?.[0] || null)} />
              </label>
            )}

            {/* ── Column guide ──────────────────────────────────────────────── */}
            {job.status === 'idle' && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowGuide(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <span>Column reference</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showGuide ? 'rotate-180' : ''}`} />
                </button>
                {showGuide && (
                  <div className="px-4 pb-3 space-y-2">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Required</p>
                      <div className="space-y-0.5">
                        {[
                          { col: 'Customer Name', note: 'Full name of the customer' },
                        ].map(r => (
                          <div key={r.col} className="flex items-baseline gap-2">
                            <code className="text-[11px] font-mono bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded">{r.col}</code>
                            <span className="text-[11px] text-gray-400">{r.note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Optional (auto-filled if missing)</p>
                      <div className="space-y-0.5">
                        {[
                          { col: 'Customer ID',   note: 'Auto-generated from name' },
                          { col: 'Lesson ID',     note: 'Auto-generated from date + instructor' },
                          { col: 'Lesson Date',   note: 'Date of the session' },
                          { col: 'Instructor Name', note: 'Instructor full name' },
                          { col: 'Lesson Type',   note: 'Defaults to "Group"' },
                          { col: 'Location Name', note: 'Defaults to "Default Location"' },
                          { col: 'Lesson Content', note: 'Session notes' },
                          { col: 'Customer Symptoms', note: 'Reported symptoms' },
                          { col: 'Customer Improvements', note: 'Progress notes' },
                          { col: 'Course Completion Status', note: 'Feedback / completion' },
                        ].map(r => (
                          <div key={r.col} className="flex items-baseline gap-2">
                            <code className="text-[11px] font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{r.col}</code>
                            <span className="text-[11px] text-gray-400">{r.note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {fileError && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3.5 py-2.5 rounded-xl">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{fileError}
              </div>
            )}

            {/* ── Active: progress UI ───────────────────────────────────────── */}
            {isActive && (
              <div className="space-y-4 py-1">
                {/* Big friendly message */}
                <div className="text-center space-y-1 pt-1">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-sm font-semibold text-gray-900">
                      {job.status === 'uploading' ? 'Uploading your file…'
                       : job.status === 'queued' ? 'File received — starting analysis…'
                       : 'Analysing and importing your data'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {job.totalRows > 0 ? `${job.totalRows} rows` : 'Reading file…'} ·{' '}
                    You can safely close this window
                  </p>
                </div>

                <ProgressBar value={job.progress} status={job.status} />
                <StepRow progress={job.progress} />

                {job.message && (
                  <p className="text-xs text-gray-500 text-center px-2">{job.message}</p>
                )}
              </div>
            )}

            {/* ── Complete ──────────────────────────────────────────────────── */}
            {isComplete && (
              <div className="space-y-3 py-1">
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Import complete</p>
                    <p className="text-sm text-emerald-700 mt-0.5">{job.message}</p>
                  </div>
                </div>
                <ProgressBar value={100} status="complete" />

                {job.rowErrors.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5">
                    <p className="text-xs font-semibold text-amber-800">{job.rowErrors.length} row{job.rowErrors.length > 1 ? 's' : ''} skipped</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {job.rowErrors.slice(0, 6).map((e, i) => (
                        <p key={i} className="text-xs text-amber-700">{e}</p>
                      ))}
                      {job.rowErrors.length > 6 && (
                        <p className="text-xs text-amber-500 italic">…and {job.rowErrors.length - 6} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Failed ───────────────────────────────────────────────────── */}
            {isFailed && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-4">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Import failed</p>
                  <p className="text-sm text-red-700 mt-0.5">{job.message}</p>
                </div>
              </div>
            )}

            {/* ── Action buttons ────────────────────────────────────────────── */}
            <div className="flex gap-2 pt-1">
              {isComplete || isFailed ? (
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors"
                >
                  {isComplete ? 'Done' : 'Close'}
                </button>
              ) : isActive ? (
                <div className="flex-1 py-3 text-sm font-medium text-gray-400 bg-gray-50 rounded-xl text-center cursor-not-allowed">
                  Processing in background…
                </div>
              ) : (
                <>
                  <button
                    onClick={handleClose}
                    className="flex-1 py-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={!file}
                    className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload &amp; Import
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}