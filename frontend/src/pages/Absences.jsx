import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { api } from '../api'

export default function Absences() {
  const [absences, setAbsences] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState(null) // 'sick' | 'vacation'
  const [form, setForm] = useState({
    person_id: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    reported_by: '',
    type: 'sick',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [collapsedMonths, setCollapsedMonths] = useState({})

  const load = async () => {
    setLoading(true)
    const [a, p] = await Promise.all([api.getAbsences(null, null), api.getPeople()])
    setAbsences(a)
    setPeople(p.filter((x) => x.active))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openForm = (type) => {
    setMode(type)
    setForm({
      person_id: people[0]?.id || '',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: format(new Date(), 'yyyy-MM-dd'),
      reported_by: '',
      type,
    })
    setError('')
  }

  const submit = async () => {
    if (!form.person_id) { setError('Select a person'); return }
    if (!form.start_date) { setError('Start date required'); return }
    setSaving(true)
    try {
      if (form.start_date === form.end_date) {
        await api.createAbsence({
          person_id: form.person_id,
          date: form.start_date,
          type: form.type,
          reported_by: form.reported_by || null,
        })
      } else {
        await api.createAbsenceRange({
          person_id: form.person_id,
          start_date: form.start_date,
          end_date: form.end_date,
          type: form.type,
          reported_by: form.reported_by || null,
        })
      }
      setMode(null)
      load()
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  const remove = async (id) => {
    await api.deleteAbsence(id)
    load()
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const upcoming = absences.filter((a) => a.date >= today)
  const past = absences.filter((a) => a.date < today)

  // Group absences by person + contiguous date ranges for display
  const grouped = groupAbsences(upcoming)
  const historyByMonth = groupByMonth(past)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Absences</h1>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => openForm('sick')}
            className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600"
          >
            Mark Sick
          </button>
          <button
            onClick={() => openForm('vacation')}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sky-700"
          >
            Add Vacation
          </button>
        </div>
      </div>

      {mode && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="font-semibold mb-4 text-gray-800">
            {mode === 'sick' ? 'Report Sick Leave' : 'Record Vacation'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Person</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.person_id}
                onChange={(e) => setForm({ ...form, person_id: e.target.value })}
              >
                <option value="">Select…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {mode === 'sick' ? 'Date(s)' : 'Start date'}
              </label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: e.target.value })}
              />
            </div>
            {mode === 'vacation' && (
              <div>
                <label className="block text-xs text-gray-600 mb-1">End date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {mode === 'sick' ? 'Reported by (self or manager)' : 'Entered by (manager)'}
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Your name"
                value={form.reported_by}
                onChange={(e) => setForm({ ...form, reported_by: e.target.value })}
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <div className="flex gap-2 mt-4">
            <button
              onClick={submit}
              disabled={saving}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setMode(null)}
              className="text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <>
          {grouped.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No upcoming absences.</p>
          ) : (
            <div className="space-y-2 mb-8">
              {grouped.map((g) => <AbsenceRow key={g.key} g={g} onRemove={() => removeGroup(g.ids, remove)} />)}
            </div>
          )}

          {historyByMonth.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">History</h2>
              <div className="space-y-3">
                {historyByMonth.map(({ monthKey, label, sick, vacation, rows }) => {
                  const collapsed = collapsedMonths[monthKey] ?? false
                  const toggle = () => setCollapsedMonths((p) => ({ ...p, [monthKey]: !collapsed }))
                  return (
                    <div key={monthKey} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                      <button
                        onClick={toggle}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50"
                      >
                        <span className="font-semibold text-gray-800 flex-1">{label}</span>
                        {sick > 0 && (
                          <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                            {sick} sick day{sick !== 1 ? 's' : ''}
                          </span>
                        )}
                        {vacation > 0 && (
                          <span className="text-xs font-medium bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">
                            {vacation} vacation day{vacation !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span className="text-gray-400 text-xs">{collapsed ? '▶' : '▼'}</span>
                      </button>
                      {!collapsed && (
                        <div className="border-t border-gray-100 divide-y divide-gray-100">
                          {rows.map((g) => (
                            <AbsenceRow key={g.key} g={g} onRemove={() => removeGroup(g.ids, remove)} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AbsenceRow({ g, onRemove }) {
  return (
    <div className="px-5 py-3 flex items-center gap-4">
      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          g.type === 'sick' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
        }`}
      >
        {g.type === 'sick' ? 'Sick' : 'Vacation'}
      </span>
      <div className="flex-1">
        <span className="font-medium text-gray-900">{g.person_name}</span>
        <span className="ml-3 text-sm text-gray-500">{g.dateRange}</span>
        <span className="ml-2 text-xs text-gray-400">({g.days} day{g.days !== 1 ? 's' : ''})</span>
      </div>
      {g.reported_by && <span className="text-xs text-gray-400">by {g.reported_by}</span>}
      <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-600">Remove</button>
    </div>
  )
}

async function removeGroup(ids, removeFn) {
  if (!confirm(`Remove ${ids.length} absence day(s)?`)) return
  for (const id of ids) await removeFn(id)
}

function groupAbsences(absences) {
  // Group consecutive dates for same person+type+reported_by into one row
  const sorted = [...absences].sort((a, b) => {
    if (a.person_id !== b.person_id) return a.person_id.localeCompare(b.person_id)
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    return a.date.localeCompare(b.date)
  })

  const groups = []
  let current = null

  for (const a of sorted) {
    const prevDate = current ? new Date(current.dates[current.dates.length - 1]) : null
    const curDate = new Date(a.date)
    const daysDiff = prevDate ? Math.round((curDate - prevDate) / 86400000) : null

    if (
      current &&
      current.person_id === a.person_id &&
      current.type === a.type &&
      daysDiff !== null && daysDiff <= 3 // allow weekends in range (Fri -> Mon = 3)
    ) {
      current.dates.push(a.date)
      current.ids.push(a.id)
    } else {
      if (current) groups.push(finalize(current))
      current = {
        key: `${a.person_id}-${a.type}-${a.date}`,
        person_id: a.person_id,
        person_name: a.people?.name || '?',
        type: a.type,
        reported_by: a.reported_by,
        dates: [a.date],
        ids: [a.id],
      }
    }
  }
  if (current) groups.push(finalize(current))
  return groups
}

function finalize(g) {
  const first = g.dates[0]
  const last = g.dates[g.dates.length - 1]
  const dateRange = first === last ? formatDate(first) : `${formatDate(first)} – ${formatDate(last)}`
  return { ...g, dateRange, days: g.dates.length }
}

function formatDate(d) {
  return format(new Date(d + 'T12:00:00'), 'MMM d, yyyy')
}

function groupByMonth(absences) {
  // Returns [{monthKey, label, sick, vacation, rows}] newest first
  const byMonth = {}
  for (const a of absences) {
    const key = a.date.slice(0, 7) // "2026-10"
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(a)
  }
  return Object.keys(byMonth)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => {
      const rows = groupAbsences(byMonth[key])
      const all = byMonth[key]
      return {
        monthKey: key,
        label: format(new Date(key + '-15'), 'MMMM yyyy'),
        sick: all.filter((a) => a.type === 'sick').length,
        vacation: all.filter((a) => a.type === 'vacation').length,
        rows,
      }
    })
}
