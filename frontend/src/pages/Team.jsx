import { useState, useEffect } from 'react'
import XLSX from 'xlsx-js-style'
import { api } from '../api'

const SCHED_DAYS = [
  { num: 1, label: 'Mon' },
  { num: 2, label: 'Tue' },
  { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' },
  { num: 5, label: 'Fri' },
]

function exportTeamExcel(people, allSchedules) {
  const today = new Date().toISOString().slice(0, 10)
  const active = people.filter(p => p.active)
  const scheduleMap = {}
  for (const p of active) {
    const rows = allSchedules.filter(r => r.person_id === p.id)
    scheduleMap[p.id] = activeSchedForDate(rows, today)
  }

  const HDR = { fill: { fgColor: { rgb: '312E81' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const TOT = { fill: { fgColor: { rgb: 'F0FDF4' } }, font: { bold: true, color: { rgb: '166534' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const ws = {}
  const setCell = (r, c, v, t, s) => { ws[XLSX.utils.encode_cell({ r, c })] = { v: v ?? '', t: t || (typeof v === 'number' ? 'n' : 's'), s: s || {} } }

  // Header: Person | Mon | Tue | Wed | Thu | Fri | Total
  setCell(0, 0, 'Person', 's', { ...HDR, alignment: { horizontal: 'left', vertical: 'center' } })
  SCHED_DAYS.forEach((d, i) => setCell(0, 1 + i, d.label, 's', HDR))
  setCell(0, 6, 'Total', 's', HDR)

  const dayColTotals = [0, 0, 0, 0, 0]
  let grandTotal = 0

  for (let ri = 0; ri < active.length; ri++) {
    const p = active[ri]
    const sched = scheduleMap[p.id] || {}
    const weeklyTotal = SCHED_DAYS.reduce((s, d) => s + (sched[d.num]?.hours || 0), 0)
    const bg = ri % 2 === 0 ? 'FFFFFF' : 'F9FAFB'
    setCell(ri + 1, 0, p.name, 's', { fill: { fgColor: { rgb: bg } }, font: { bold: true, sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' } })
    SCHED_DAYS.forEach((d, i) => {
      const entry = sched[d.num]
      if (entry && entry.hours > 0) {
        const isHome = entry.location === 'home'
        dayColTotals[i] += entry.hours
        setCell(ri + 1, 1 + i, entry.hours, 'n', {
          fill: { fgColor: { rgb: isHome ? 'CCFBF1' : 'E0E7FF' } },
          font: { color: { rgb: isHome ? '0F766E' : '312E81' }, sz: 10 },
          alignment: { horizontal: 'center', vertical: 'center' },
        })
      } else {
        setCell(ri + 1, 1 + i, '', 's', { fill: { fgColor: { rgb: bg } }, alignment: { horizontal: 'center', vertical: 'center' }, font: { color: { rgb: 'D1D5DB' }, sz: 10 } })
      }
    })
    setCell(ri + 1, 6, weeklyTotal > 0 ? weeklyTotal : '', weeklyTotal > 0 ? 'n' : 's', { ...TOT, fill: { fgColor: { rgb: bg } } })
    grandTotal += weeklyTotal
  }

  // Totals row
  const totRow = active.length + 1
  setCell(totRow, 0, 'Total', 's', { ...TOT, alignment: { horizontal: 'left', vertical: 'center' } })
  SCHED_DAYS.forEach((d, i) => setCell(totRow, 1 + i, dayColTotals[i] > 0 ? dayColTotals[i] : '', dayColTotals[i] > 0 ? 'n' : 's', TOT))
  setCell(totRow, 6, grandTotal, 'n', TOT)

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totRow, c: 6 } })
  ws['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Schedules')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'team_schedules.xlsx'; a.click()
  URL.revokeObjectURL(url)
}

const DAYS = [
  { num: 1, label: 'Mon' },
  { num: 2, label: 'Tue' },
  { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' },
  { num: 5, label: 'Fri' },
]

/** From all versioned rows for one person, pick the active version per day for a given date. */
function activeSchedForDate(rows, dateStr) {
  const byDay = {}
  // rows are sorted valid_from ASC; iterate and overwrite to get latest ≤ dateStr
  for (const r of rows) {
    const vf = r.valid_from || '2000-01-01'
    const vu = r.valid_until
    if (vf <= dateStr && (vu == null || vu >= dateStr)) {
      byDay[r.day_of_week] = r
    }
  }
  return byDay
}

function WeeklyTable({ people, allSchedules }) {
  const today = new Date().toISOString().slice(0, 10)
  const active = people.filter(p => p.active)
  if (active.length === 0) return null

  const scheduleMap = {}
  for (const p of active) {
    const rows = allSchedules.filter(r => r.person_id === p.id)
    scheduleMap[p.id] = activeSchedForDate(rows, today)
  }

  const dayTotals = DAYS.map(d =>
    active.reduce((sum, p) => sum + (scheduleMap[p.id]?.[d.num]?.hours || 0), 0)
  )
  const teamWeeklyTotal = active.reduce((sum, p) =>
    sum + DAYS.reduce((s, d) => s + (scheduleMap[p.id]?.[d.num]?.hours || 0), 0), 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8 shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Weekly Schedule (current)</h2>
        <span className="text-sm font-semibold text-indigo-700">{teamWeeklyTotal}h team total / week</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2 font-medium text-gray-500 w-32">Person</th>
              {DAYS.map(d => (
                <th key={d.num} className="text-center px-2 py-2 font-medium text-gray-500 w-20">{d.label}</th>
              ))}
              <th className="text-center px-2 py-2 font-medium text-gray-500 w-16">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {active.map((p, idx) => {
              const sched = scheduleMap[p.id] || {}
              const weeklyTotal = DAYS.reduce((s, d) => s + (sched[d.num]?.hours || 0), 0)
              return (
                <tr key={p.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-1.5 font-medium text-gray-800 whitespace-nowrap">{p.name}</td>
                  {DAYS.map(d => {
                    const entry = sched[d.num]
                    if (!entry) return <td key={d.num} className="px-2 py-1.5 text-center text-gray-300 text-xs">—</td>
                    const isHome = entry.location === 'home'
                    return (
                      <td key={d.num} className="px-2 py-1.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          isHome ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                        }`}>
                          <span>{isHome ? 'Home' : 'Office'}</span>
                          <span className="font-normal opacity-60">{entry.hours}h</span>
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-2 py-1.5 text-center font-semibold text-gray-700">{weeklyTotal}h</td>
                </tr>
              )
            })}
            <tr className="bg-gray-100 border-t border-gray-200">
              <td className="px-4 py-1.5 font-semibold text-gray-700">Total</td>
              {dayTotals.map((total, i) => (
                <td key={i} className="px-2 py-1.5 text-center font-semibold text-gray-700">{total > 0 ? `${total}h` : '—'}</td>
              ))}
              <td className="px-2 py-1.5 text-center font-bold text-indigo-700">{teamWeeklyTotal}h</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Team() {
  const [people, setPeople] = useState([])
  const [allSchedules, setAllSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const [all, scheds] = await Promise.all([api.getPeople(), api.getAllSchedules()])
    setPeople(all)
    setAllSchedules(scheds)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const startEdit = (p) => { setEditing(p.id); setName(p.name); setError('') }

  const save = async () => {
    if (!name.trim()) { setError('Name required'); return }
    try {
      await api.updatePerson(editing, { name: name.trim() })
      setEditing(null)
      load()
    } catch (e) { setError(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Remove this person? Their schedule and assignments will also be deleted.')) return
    await api.deletePerson(id)
    load()
  }

  const toggle = async (p) => {
    await api.updatePerson(p.id, { active: !p.active })
    load()
  }

  return (
    <div>
      <div className="flex items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <button
          onClick={() => exportTeamExcel(people, allSchedules)}
          className="ml-auto text-sm text-gray-600 border border-gray-200 px-3 py-1 rounded-lg hover:bg-gray-50"
        >
          Download Excel
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <>
          <WeeklyTable people={people} allSchedules={allSchedules} />

          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {people.map((p) => (
              <div key={p.id} className="px-5 py-3">
                <div className="flex items-center gap-4">
                  {editing === p.id ? (
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <input
                        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                      />
                      {error && <span className="text-red-500 text-xs">{error}</span>}
                      <button onClick={save} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700">Save</button>
                      <button onClick={() => setEditing(null)} className="text-gray-500 px-3 py-1.5 rounded-md text-sm hover:bg-gray-100">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <div className="flex-1">
                        <span className={`font-medium ${p.active ? '' : 'text-gray-400 line-through'}`}>{p.name}</span>
                        {p.weekly_hours > 0 && (
                          <span className="ml-3 text-sm text-gray-400">{p.weekly_hours} hrs/week</span>
                        )}
                      </div>
                      <button onClick={() => toggle(p)} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
                        {p.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => startEdit(p)} className="text-xs px-2 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50">Edit</button>
                      <button onClick={() => remove(p.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">Remove</button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {people.length === 0 && (
              <p className="px-5 py-8 text-center text-gray-400">No team members yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
