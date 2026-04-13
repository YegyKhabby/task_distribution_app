import { useState, useEffect } from 'react'
import { format, addDays, parseISO, subDays } from 'date-fns'
import XLSX from 'xlsx-js-style'
import { api } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'

const SCHED_DAY_LABELS = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' }

function exportScheduleExcel(personName, schedule, futureVersion) {
  const HDR = { fill: { fgColor: { rgb: '312E81' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const TOT = { fill: { fgColor: { rgb: 'F0FDF4' } }, font: { bold: true, color: { rgb: '166534' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }

  function buildSheet(sched, sheetLabel) {
    const ws = {}
    const setCell = (r, c, v, t, s) => { ws[XLSX.utils.encode_cell({ r, c })] = { v: v ?? '', t: t || (typeof v === 'number' ? 'n' : 's'), s: s || {} } }
    setCell(0, 0, `${personName} — ${sheetLabel}`, 's', { fill: { fgColor: { rgb: '312E81' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 }, alignment: { horizontal: 'left', vertical: 'center' } })
    setCell(0, 1, '', 's', { fill: { fgColor: { rgb: '312E81' } } })
    setCell(0, 2, '', 's', { fill: { fgColor: { rgb: '312E81' } } })
    setCell(1, 0, 'Day', 's', { ...HDR, alignment: { horizontal: 'left', vertical: 'center' } })
    setCell(1, 1, 'Hours', 's', HDR)
    setCell(1, 2, 'Location', 's', HDR)
    let totalHrs = 0
    let row = 2
    for (const entry of sched.filter(d => d.checked && Number(d.hours) > 0)) {
      const hrs = Number(entry.hours)
      totalHrs += hrs
      setCell(row, 0, SCHED_DAY_LABELS[entry.day] || '', 's', { alignment: { horizontal: 'left', vertical: 'center' }, font: { sz: 10 } })
      setCell(row, 1, hrs, 'n', {
        fill: { fgColor: { rgb: entry.location === 'home' ? 'CCFBF1' : 'E0E7FF' } },
        font: { color: { rgb: entry.location === 'home' ? '0F766E' : '312E81' }, sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center' },
      })
      setCell(row, 2, entry.location === 'home' ? 'Home' : 'Office', 's', { alignment: { horizontal: 'center', vertical: 'center' }, font: { sz: 10 } })
      row++
    }
    setCell(row, 0, 'Total', 's', { ...TOT, alignment: { horizontal: 'left', vertical: 'center' } })
    setCell(row, 1, totalHrs, 'n', TOT)
    setCell(row, 2, 'hrs/week', 's', TOT)
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 2 } })
    ws['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 10 }]
    return ws
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildSheet(schedule, 'Current Schedule'), 'Current')
  if (futureVersion) {
    XLSX.utils.book_append_sheet(wb, buildSheet(scheduleFromRows(futureVersion.rows), `From ${futureVersion.validFrom}`), 'Future')
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `schedule_${(personName || 'person').replace(/\s+/g, '_').toLowerCase()}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

const DAYS = [
  { num: 1, label: 'Monday' },
  { num: 2, label: 'Tuesday' },
  { num: 3, label: 'Wednesday' },
  { num: 4, label: 'Thursday' },
  { num: 5, label: 'Friday' },
]

function emptySchedule() {
  return [
    { day: 1, checked: false, hours: 4, location: 'office' },
    { day: 2, checked: false, hours: 4, location: 'office' },
    { day: 3, checked: false, hours: 4, location: 'office' },
    { day: 4, checked: false, hours: 4, location: 'office' },
    { day: 5, checked: false, hours: 4, location: 'office' },
  ]
}

function scheduleFromRows(rows) {
  const s = emptySchedule()
  for (const r of rows) {
    const d = s.find((x) => x.day === r.day_of_week)
    if (d) {
      d.checked = r.hours > 0
      d.hours = r.hours > 0 ? r.hours : (d.hours || 4)
      d.location = r.location || 'office'
    }
  }
  return s
}

// Pick the latest active schedule version; missing days stay off.
function activeScheduleFromRows(rows, today) {
  const activeRows = rows.filter((r) => {
    const vf = r.valid_from || '2000-01-01'
    const vu = r.valid_until
    return vf <= today && (vu == null || vu >= today)
  })
  if (activeRows.length === 0) return emptySchedule()

  const latestVersion = activeRows.reduce((latest, row) => {
    const vf = row.valid_from || '2000-01-01'
    return vf > latest ? vf : latest
  }, '2000-01-01')

  return scheduleFromRows(
    activeRows.filter((r) => (r.valid_from || '2000-01-01') === latestVersion)
  )
}

function nextMonday() {
  const today = new Date()
  const day = today.getDay()
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7
  return format(addDays(today, daysUntilMonday), 'yyyy-MM-dd')
}

function isMonday(dateStr) {
  return parseISO(dateStr).getDay() === 1
}

function snapToNextMonday(dateStr) {
  const date = parseISO(dateStr)
  const day = date.getDay()
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7 || 7
  return format(addDays(date, daysUntilMonday), 'yyyy-MM-dd')
}

function formatLabelDate(dateStr) {
  return format(parseISO(dateStr), 'EEEE, d MMM yyyy')
}

function currentScheduleEndsOn(validFrom) {
  return format(subDays(parseISO(validFrom), 1), 'EEEE, d MMM yyyy')
}

function DayGrid({ schedule, onToggle, onHours, onLocation }) {
  return (
    <div className="space-y-3">
      {DAYS.map((d) => {
        const entry = schedule.find((s) => s.day === d.num)
        return (
          <div key={d.num} className="flex items-center gap-4">
            <label className="flex items-center gap-3 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={entry.checked}
                onChange={() => onToggle(d.num)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-400"
              />
              <span className={`text-sm font-medium w-24 ${entry.checked ? 'text-gray-800' : 'text-gray-400'}`}>
                {d.label}
              </span>
            </label>
            {entry.checked ? (
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0.5} max={12} step={0.5}
                  value={entry.hours}
                  onChange={(e) => onHours(d.num, e.target.value)}
                  className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <span className="text-sm text-gray-400">hrs</span>
                <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs font-medium">
                  <button
                    onClick={() => onLocation(d.num, 'office')}
                    className={`px-2.5 py-1 transition-colors ${entry.location === 'office' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >Office</button>
                  <button
                    onClick={() => onLocation(d.num, 'home')}
                    className={`px-2.5 py-1 transition-colors border-l border-gray-200 ${entry.location === 'home' ? 'bg-teal-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >Home</button>
                </div>
              </div>
            ) : (
              <span className="text-sm text-gray-300">day off</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function Setup() {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [people, setPeople] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [schedule, setSchedule] = useState(emptySchedule())
  const [activeVersionDate, setActiveVersionDate] = useState('2000-01-01')
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Future schedule
  const [futureVersion, setFutureVersion] = useState(null)  // { validFrom, rows }
  const [futureForm, setFutureForm] = useState(null)         // null = closed; { validFrom, schedule }
  const [savingFuture, setSavingFuture] = useState(false)
  const [savedFuture, setSavedFuture] = useState(false)
  const [errorFuture, setErrorFuture] = useState('')
  const [futureDateHint, setFutureDateHint] = useState('')
  const [showRemoveFutureConfirm, setShowRemoveFutureConfirm] = useState(false)

  // Add new person
  const [newName, setNewName] = useState('')
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => { api.getPeople().then(setPeople) }, [])

  const selectPerson = async (id) => {
    setSelectedId(id)
    setSaved(false)
    setSavedFuture(false)
    setFutureForm(null)
    setFutureVersion(null)
    setFutureDateHint('')
    if (!id) { setSchedule(emptySchedule()); return }
    setLoadingSchedule(true)
    const rows = await api.getSchedule(id)

    // Split: future = valid_from >= today (includes today so it stays visible as "upcoming")
    const futureRows = rows.filter(r => r.valid_from >= today)
    const baseRows = rows.filter(r => r.valid_from < today)

    // Determine the active version date (latest valid_from < today, or 2000-01-01 fallback)
    const latestBase = baseRows.length > 0
      ? baseRows.reduce((a, b) => a.valid_from > b.valid_from ? a : b).valid_from
      : '2000-01-01'
    setActiveVersionDate(latestBase)

    // Editor always shows the currently active version
    setSchedule(activeScheduleFromRows(rows, today === latestBase ? today : latestBase))

    // Future: group by valid_from, pick the earliest future date
    if (futureRows.length > 0) {
      const earliestFutureFrom = futureRows.reduce((a, b) => a.valid_from < b.valid_from ? a : b).valid_from
      const futureGroup = futureRows.filter(r => r.valid_from === earliestFutureFrom)
      setFutureVersion({ validFrom: earliestFutureFrom, rows: futureGroup })
    }

    setLoadingSchedule(false)
  }

  const addPerson = async () => {
    if (!newName.trim()) return
    try {
      const p = await api.createPerson({ name: newName.trim() })
      const updated = await api.getPeople()
      setPeople(updated)
      setNewName('')
      setAddingNew(false)
      selectPerson(p.id)
    } catch (e) {
      alert('Could not add person: ' + e.message)
    }
  }

  const toggleDay = (day) => setSchedule(s => s.map(d => d.day === day ? { ...d, checked: !d.checked, hours: d.checked ? 0 : d.hours || 4 } : d))
  const setHours = (day, val) => setSchedule(s => s.map(d => d.day === day ? { ...d, hours: val } : d))
  const setLocation = (day, loc) => setSchedule(s => s.map(d => d.day === day ? { ...d, location: loc } : d))

  const save = async () => {
    if (!selectedId) { setError('Select a person first'); return }
    setSaving(true)
    setError('')
    try {
      const isBaseline = activeVersionDate === '2000-01-01'
      const entries = isBaseline
        ? schedule.filter(d => d.checked && d.hours > 0).map(d => ({ day_of_week: d.day, hours: Number(d.hours), location: d.location, valid_from: activeVersionDate }))
        : schedule.map(d => ({ day_of_week: d.day, hours: d.checked ? Number(d.hours) : 0, location: d.location, valid_from: activeVersionDate }))
      await api.saveSchedule(selectedId, entries)
      setSaved(true)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  const openFutureForm = () => {
    const base = futureVersion
      ? scheduleFromRows(futureVersion.rows)
      : emptySchedule()
    setFutureForm({
      validFrom: futureVersion?.validFrom ?? nextMonday(),
      schedule: base,
    })
    setSavedFuture(false)
    setErrorFuture('')
    setFutureDateHint('')
  }

  const saveFuture = async () => {
    if (!futureForm.validFrom || futureForm.validFrom <= today) {
      setErrorFuture('Starting date must be in the future')
      return
    }
    if (!isMonday(futureForm.validFrom)) {
      setErrorFuture('Starting date must be a Monday')
      return
    }
    setSavingFuture(true)
    setErrorFuture('')
    try {
      const entries = futureForm.schedule
        .map(d => ({ day_of_week: d.day, hours: d.checked ? Number(d.hours) : 0, location: d.location, valid_from: futureForm.validFrom }))
      if (entries.every(e => e.hours === 0)) { setErrorFuture('Set at least one working day'); setSavingFuture(false); return }
      await api.saveSchedule(selectedId, entries)
      setSavedFuture(true)
      setFutureVersion({ validFrom: futureForm.validFrom, rows: entries.map(e => ({ ...e, day_of_week: e.day_of_week })) })
      setFutureForm(null)
    } catch (e) {
      setErrorFuture(e.message)
    }
    setSavingFuture(false)
  }

  const removeFuture = async () => {
    if (!futureVersion) return
    try {
      await api.deleteScheduleVersion(selectedId, futureVersion.validFrom)
      setFutureVersion(null)
      setFutureForm(null)
      setShowRemoveFutureConfirm(false)
    } catch (e) {
      alert('Could not remove future schedule: ' + e.message)
    }
  }

  const selectedPerson = people.find(p => p.id === selectedId)
  const totalHours = schedule.filter(d => d.checked).reduce((s, d) => s + Number(d.hours || 0), 0)
  const futureHours = futureVersion ? scheduleFromRows(futureVersion.rows).filter(d => d.checked).reduce((s, d) => s + Number(d.hours || 0), 0) : 0
  const currentEndLabel = futureVersion ? currentScheduleEndsOn(futureVersion.validFrom) : null

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your current weekly pattern and one upcoming Monday-based schedule change.
        </p>
      </div>

      {/* Person picker */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4 shadow-sm">
        <div className="flex gap-2">
          <select
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={selectedId}
            onChange={(e) => selectPerson(e.target.value)}
          >
            <option value="">Select your name…</option>
            {people.filter(p => p.active).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => setAddingNew(true)}
            className="text-sm px-3 py-2 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
          >+ New</button>
        </div>

        {addingNew && (
          <div className="flex gap-2 mt-3">
            <input
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Your full name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPerson()}
              autoFocus
            />
            <button onClick={addPerson} className="bg-indigo-600 text-white px-3 py-2 rounded-md text-sm hover:bg-indigo-700">Add</button>
            <button onClick={() => setAddingNew(false)} className="text-gray-500 px-3 py-2 rounded-md text-sm hover:bg-gray-100">Cancel</button>
          </div>
        )}
      </div>

      {selectedId && !loadingSchedule && (
        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white px-5 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Current Plan</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">{selectedPerson?.name}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {currentEndLabel ? `Valid until ${currentEndLabel}` : 'Active now with no scheduled replacement'}
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
                {totalHours} hrs/week
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white px-5 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Next Plan</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  {futureVersion ? formatLabelDate(futureVersion.validFrom) : 'No future schedule'}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {futureVersion ? 'This schedule takes over automatically on that Monday.' : 'Add one future schedule version if your weekly pattern is changing.'}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${futureVersion ? 'bg-white text-amber-700 ring-amber-200' : 'bg-white text-gray-500 ring-gray-200'}`}>
                {futureVersion ? `${futureHours} hrs/week` : 'Not set'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Current schedule editor */}
      {selectedId && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-800">Current schedule</h2>
              <p className="mt-1 text-xs text-gray-500">
                {currentEndLabel ? `Applies through ${currentEndLabel}` : 'This is the active default weekly schedule'}
              </p>
            </div>
            {totalHours > 0 && (
              <span className="text-sm font-medium text-gray-500">{totalHours} hrs/week</span>
            )}
          </div>

          {loadingSchedule ? (
            <p className="text-gray-400 text-sm">Loading schedule…</p>
          ) : (
            <DayGrid
              schedule={schedule}
              onToggle={toggleDay}
              onHours={setHours}
              onLocation={setLocation}
            />
          )}

          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || totalHours === 0}
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save schedule'}
            </button>
            {saved && <span className="text-green-600 text-sm font-medium">Saved!</span>}
          </div>
        </div>
      )}

      {/* Future schedule */}
      {selectedId && !loadingSchedule && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-gray-800">Upcoming schedule</h2>
            <p className="mt-1 text-sm text-gray-500">
              Schedule changes start on a Monday and switch over automatically when that date arrives.
            </p>
          </div>

          {/* Existing future version summary */}
          {futureVersion && !futureForm && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-4 mb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 mb-1">Valid from</p>
                  <p className="text-sm font-semibold text-gray-900">{formatLabelDate(futureVersion.validFrom)}</p>
                  <p className="mt-1 text-xs text-gray-600">Current schedule will apply through {currentScheduleEndsOn(futureVersion.validFrom)}.</p>
                  <p className="text-xs text-gray-600 mt-2">
                    {DAYS
                      .map(d => {
                        const row = futureVersion.rows.find(r => r.day_of_week === d.num)
                        return row && row.hours > 0 ? `${d.label.slice(0,3)} ${row.hours}h` : null
                      })
                      .filter(Boolean)
                      .join('  ·  ')}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={openFutureForm} className="text-xs text-amber-700 border border-amber-200 rounded px-2 py-1 hover:bg-amber-100">Edit</button>
                  <button onClick={() => setShowRemoveFutureConfirm(true)} className="text-xs text-red-500 border border-red-200 rounded px-2 py-1 hover:bg-red-50">Remove</button>
                </div>
              </div>
            </div>
          )}

          {/* Future form */}
          {futureForm ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Valid from</span>
                  <span className="text-sm text-gray-600">Choose the Monday when this new weekly pattern should start.</span>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    type="date"
                    value={futureForm.validFrom}
                    min={nextMonday()}
                    onChange={e => {
                      const rawValue = e.target.value
                      const mondayValue = snapToNextMonday(rawValue)
                      setFutureForm(f => ({ ...f, validFrom: mondayValue }))
                      setFutureDateHint(mondayValue !== rawValue ? `Adjusted to Monday: ${formatLabelDate(mondayValue)}` : '')
                    }}
                    className="w-56 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <p className="text-xs text-gray-500">
                    Current schedule remains active through {currentScheduleEndsOn(futureForm.validFrom)}.
                  </p>
                  {futureDateHint && <p className="text-xs font-medium text-amber-700">{futureDateHint}</p>}
                </div>
              </div>
              <DayGrid
                schedule={futureForm.schedule}
                onToggle={day => setFutureForm(f => ({ ...f, schedule: f.schedule.map(d => d.day === day ? { ...d, checked: !d.checked, hours: d.checked ? 0 : d.hours || 4 } : d) }))}
                onHours={(day, val) => setFutureForm(f => ({ ...f, schedule: f.schedule.map(d => d.day === day ? { ...d, hours: val } : d) }))}
                onLocation={(day, loc) => setFutureForm(f => ({ ...f, schedule: f.schedule.map(d => d.day === day ? { ...d, location: loc } : d) }))}
              />
              {errorFuture && <p className="text-red-500 text-sm">{errorFuture}</p>}
              <div className="flex items-center gap-3">
                <button
                  onClick={saveFuture}
                  disabled={savingFuture}
                  className="bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-40"
                >
                  {savingFuture ? 'Saving…' : 'Save upcoming schedule'}
                </button>
                <button onClick={() => setFutureForm(null)} className="text-gray-500 text-sm hover:underline">Cancel</button>
                {savedFuture && <span className="text-green-600 text-sm font-medium">Saved!</span>}
              </div>
            </div>
          ) : (
            !futureVersion && (
              <button
                onClick={openFutureForm}
                className="text-sm text-amber-700 border border-amber-200 rounded-lg px-4 py-2 hover:bg-amber-50"
              >
                + Add upcoming schedule
              </button>
            )
          )}
        </div>
      )}

      <ConfirmDialog
        open={showRemoveFutureConfirm}
        title="Remove upcoming schedule?"
        message={futureVersion ? `This will delete the schedule starting on ${formatLabelDate(futureVersion.validFrom)}.` : ''}
        confirmLabel="Remove"
        tone="danger"
        onConfirm={removeFuture}
        onCancel={() => setShowRemoveFutureConfirm(false)}
      />
    </div>
  )
}
