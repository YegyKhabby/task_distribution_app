import { useState, useEffect } from 'react'
import XLSX from 'xlsx-js-style'
import { api } from '../api'
import { nextMondayDateString } from '../utils/dates'

function exportMatrixExcel(people, tasks, distMap, actualMap, weekNumber, hasAnyActual) {
  const activeTasks = tasks.filter(t => people.some(p => (distMap[p.id] || {})[t.id] > 0))
  const HDR = { fill: { fgColor: { rgb: '312E81' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const TOT_P = { fill: { fgColor: { rgb: 'F0FDF4' } }, font: { bold: true, color: { rgb: '166534' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const TOT_A = { fill: { fgColor: { rgb: 'FEF2F2' } }, font: { bold: true, color: { rgb: 'DC2626' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const NUM = { alignment: { horizontal: 'center', vertical: 'center' }, font: { sz: 10 } }
  const ws = {}
  const ncols = 2 + activeTasks.length
  const rowsPerPerson = hasAnyActual ? 2 : 1
  const setCell = (r, c, v, t, s) => { ws[XLSX.utils.encode_cell({ r, c })] = { v: v ?? '', t: t || (typeof v === 'number' ? 'n' : 's'), s: s || {} } }

  // Header row
  setCell(0, 0, 'Person', 's', { ...HDR, alignment: { horizontal: 'left', vertical: 'center' } })
  activeTasks.forEach((t, i) => setCell(0, 1 + i, t.name, 's', HDR))
  setCell(0, ncols - 1, 'Total', 's', HDR)

  // Person rows (two rows per person when actual data exists)
  for (let pi = 0; pi < people.length; pi++) {
    const p = people[pi]
    const pDist = distMap[p.id] || {}
    const pActual = (actualMap || {})[p.id] || {}
    const pTotal = activeTasks.reduce((s, t) => s + (pDist[t.id] || 0), 0)
    const pActualTotal = activeTasks.reduce((s, t) => s + (pActual[t.id] || 0), 0)
    const bg = pi % 2 === 0 ? 'FFFFFF' : 'F9FAFB'
    const plannedRow = 1 + pi * rowsPerPerson
    const actualRow = plannedRow + 1

    // Planned row
    setCell(plannedRow, 0, p.name, 's', { fill: { fgColor: { rgb: bg } }, font: { bold: true, sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' } })
    activeTasks.forEach((t, i) => {
      const hrs = pDist[t.id] || 0
      const colorHex = (t.color || '').replace('#', '')
      const cellStyle = hrs > 0 && colorHex
        ? { fill: { fgColor: { rgb: colorHex } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
        : { ...NUM, fill: { fgColor: { rgb: bg } } }
      setCell(plannedRow, 1 + i, hrs > 0 ? hrs : '', hrs > 0 ? 'n' : 's', cellStyle)
    })
    setCell(plannedRow, ncols - 1, pTotal > 0 ? pTotal : '', pTotal > 0 ? 'n' : 's', { ...NUM, font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: bg } } })

    // Actual row
    if (hasAnyActual) {
      setCell(actualRow, 0, 'actual', 's', { fill: { fgColor: { rgb: bg } }, font: { sz: 9, italic: true, color: { rgb: '9CA3AF' } }, alignment: { horizontal: 'left', vertical: 'center' } })
      activeTasks.forEach((t, i) => {
        const hrs = pDist[t.id] || 0
        const act = pActual[t.id] || 0
        const differs = Math.abs(hrs - act) >= 0.01 && (hrs > 0 || act > 0)
        const actStyle = differs
          ? { fill: { fgColor: { rgb: bg } }, font: { bold: true, color: { rgb: 'DC2626' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
          : { fill: { fgColor: { rgb: bg } }, font: { color: { rgb: '9CA3AF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
        const showVal = act > 0 || differs
        setCell(actualRow, 1 + i, showVal ? act : '', showVal ? 'n' : 's', actStyle)
      })
      const totDiffers = Math.abs(pTotal - pActualTotal) >= 0.01
      setCell(actualRow, ncols - 1, pActualTotal > 0 ? pActualTotal : '', pActualTotal > 0 ? 'n' : 's', {
        fill: { fgColor: { rgb: bg } },
        font: { bold: totDiffers, color: { rgb: totDiffers ? 'DC2626' : '9CA3AF' }, sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center' },
      })
    }
  }

  // Totals rows
  const totRow = 1 + people.length * rowsPerPerson
  setCell(totRow, 0, 'Total Planned', 's', { ...TOT_P, alignment: { horizontal: 'left', vertical: 'center' } })
  activeTasks.forEach((t, i) => {
    const total = people.reduce((s, p) => s + ((distMap[p.id] || {})[t.id] || 0), 0)
    setCell(totRow, 1 + i, total > 0 ? total : '', total > 0 ? 'n' : 's', TOT_P)
  })
  setCell(totRow, ncols - 1, people.reduce((s, p) => s + activeTasks.reduce((ts, t) => ts + ((distMap[p.id] || {})[t.id] || 0), 0), 0), 'n', TOT_P)

  if (hasAnyActual) {
    const actTotRow = totRow + 1
    setCell(actTotRow, 0, 'Total Actual', 's', { ...TOT_A, alignment: { horizontal: 'left', vertical: 'center' } })
    activeTasks.forEach((t, i) => {
      const total = people.reduce((s, p) => s + (((actualMap || {})[p.id] || {})[t.id] || 0), 0)
      setCell(actTotRow, 1 + i, total > 0 ? total : '', total > 0 ? 'n' : 's', TOT_A)
    })
    setCell(actTotRow, ncols - 1, people.reduce((s, p) => s + activeTasks.reduce((ts, t) => ts + (((actualMap || {})[p.id] || {})[t.id] || 0), 0), 0), 'n', TOT_A)
  }

  const lastRow = totRow + (hasAnyActual ? 1 : 0)
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: ncols - 1 } })
  ws['!cols'] = [{ wch: 16 }, ...activeTasks.map(t => ({ wch: Math.max(10, Math.min(20, t.name.length)) })), { wch: 8 }]
  ws['!freeze'] = { xSplit: 1, ySplit: 1 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `Week ${weekNumber}`)
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `matrix_week${weekNumber}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().split('T')[0]
}

export default function Matrix() {
  const [weekNumber, setWeekNumber] = useState(1)
  const [weekStartDate, setWeekStartDate] = useState(nextMondayDateString)
  const [view, setView] = useState('cards') // 'cards' | 'grid'
  const [dist, setDist] = useState([])
  const [actual, setActual] = useState([])
  const [people, setPeople] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getPeople(weekStartDate),
      api.getTasks(),
    ]).then(([p, t]) => {
      setPeople(p.filter((x) => x.active))
      setTasks(t)
    })
  }, [weekStartDate])

  useEffect(() => {
    setLoading(true)
    const actualWeekStart = addDays(weekStartDate, (weekNumber - 1) * 7)
    Promise.all([
      api.getDistribution(weekNumber, weekStartDate),
      api.getActual(actualWeekStart),
    ]).then(([d, a]) => {
      setDist(d)
      setActual(a || [])
      setLoading(false)
    })
  }, [weekNumber, weekStartDate])

  // Build lookup: person_id -> task_id -> hours
  const distMap = {}
  for (const d of dist) {
    if (!distMap[d.person_id]) distMap[d.person_id] = {}
    distMap[d.person_id][d.task_id] = d.hours_per_week
  }

  // Build actual lookup: person_id -> task_id -> total actual hours
  const actualMap = {}
  for (const a of actual) {
    if (!actualMap[a.person_id]) actualMap[a.person_id] = {}
    actualMap[a.person_id][a.task_id] = (actualMap[a.person_id][a.task_id] || 0) + (a.hours || 0)
  }

  // Sum of task hours per person
  const personTotalHours = (pid) =>
    Object.values(distMap[pid] || {}).reduce((s, h) => s + h, 0)

  const hasAnyActual = actual.length > 0

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Task Matrix</h1>
        <div className="flex gap-1 ml-auto">
          {[1, 2, 3, 4].map((wn) => (
            <button
              key={wn}
              onClick={() => setWeekNumber(wn)}
              className={`px-3 py-1 rounded-md text-sm font-medium border ${
                weekNumber === wn
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Week {wn}
            </button>
          ))}
        </div>
        <button
          onClick={() => exportMatrixExcel(people, tasks, distMap, actualMap, weekNumber, hasAnyActual)}
          className="text-sm text-gray-600 border border-gray-200 px-3 py-1 rounded-lg hover:bg-gray-50"
        >
          Download Excel
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Week of</span>
          <input
            type="date"
            value={weekStartDate}
            onChange={(e) => setWeekStartDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex gap-1">
          {[['cards', 'By Person'], ['task', 'By Task'], ['grid', 'Grid']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-sm font-medium border ${
                view === v
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : view === 'cards' ? (
        <CardsView people={people} tasks={tasks} distMap={distMap} actualMap={actualMap} hasAnyActual={hasAnyActual} personTotalHours={personTotalHours} />
      ) : view === 'task' ? (
        <TaskView people={people} tasks={tasks} distMap={distMap} actualMap={actualMap} hasAnyActual={hasAnyActual} />
      ) : (
        <GridView people={people} tasks={tasks} distMap={distMap} />
      )}
    </div>
  )
}

function CardsView({ people, tasks, distMap, actualMap, hasAnyActual, personTotalHours }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {people.map((p) => {
        const totalHrs = personTotalHours(p.id)
        const cap = p.weekly_hours
        const spare = Math.max(0, cap - totalHrs)
        const personDist = distMap[p.id] || {}
        const personActual = actualMap[p.id] || {}
        const totalActual = Object.values(personActual).reduce((s, h) => s + h, 0)

        return (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-semibold text-gray-900">{p.name}</h2>
              <div className="flex items-baseline gap-2">
                {hasAnyActual && (
                  <span className="text-xs text-gray-400">
                    actual: <span className={`font-medium ${totalActual > cap ? 'text-amber-600' : 'text-gray-600'}`}>{totalActual}h</span>
                  </span>
                )}
                <span className="text-sm text-gray-500">{cap} hrs/wk</span>
              </div>
            </div>
            <div className="space-y-2">
              {tasks.map((t) => {
                const hrs = personDist[t.id] || 0
                const act = personActual[t.id] || 0
                if (hrs === 0 && act === 0) return null
                const pct = Math.min(100, (hrs / cap) * 100)
                const actPct = Math.min(100, (act / cap) * 100)
                const actColor = act === 0 ? 'text-red-500' : act < hrs ? 'text-amber-600' : 'text-emerald-600'
                return (
                  <div key={t.id}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span className="truncate max-w-[60%]">{t.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasAnyActual && (
                          <span className={`text-xs ${actColor}`}>{act}h actual</span>
                        )}
                        <span className="font-medium text-gray-500">{hrs}h planned</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: t.color || '#6366f1' }}
                      />
                    </div>
                    {hasAnyActual && act > 0 && (
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-0.5">
                        <div
                          className="h-full rounded-full opacity-60"
                          style={{ width: `${actPct}%`, backgroundColor: act < hrs ? '#d97706' : '#10b981' }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
              {spare > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
                  <span>Spare capacity</span>
                  <span className="font-medium text-emerald-600">{spare} hrs</span>
                </div>
              )}
              {Object.keys(personDist).length === 0 && Object.keys(personActual).length === 0 && (
                <p className="text-xs text-gray-400 italic">No tasks assigned</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TaskView({ people, tasks, distMap, actualMap, hasAnyActual }) {
  const activeTasks = tasks.filter((t) =>
    people.some((p) => (distMap[p.id] || {})[t.id] > 0)
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {activeTasks.map((t) => {
        const assignees = people.filter((p) => (distMap[p.id] || {})[t.id] > 0)
        const total = assignees.reduce((s, p) => s + (distMap[p.id][t.id] || 0), 0)
        const totalActual = assignees.reduce((s, p) => s + ((actualMap[p.id] || {})[t.id] || 0), 0)
        const color = t.color || '#6366f1'

        return (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <h2 className="font-semibold text-gray-900 truncate">{t.name}</h2>
              <div className="ml-auto flex items-baseline gap-2 shrink-0">
                {hasAnyActual && (
                  <span className={`text-xs ${totalActual < total ? 'text-amber-600' : 'text-emerald-600'}`}>{totalActual}h actual</span>
                )}
                <span className="text-sm text-gray-500">{total}h planned</span>
              </div>
            </div>
            <div className="space-y-2">
              {assignees.map((p) => {
                const hrs = distMap[p.id][t.id]
                const act = (actualMap[p.id] || {})[t.id] || 0
                const pct = Math.min(100, (hrs / total) * 100)
                const actColor = act === 0 ? 'text-red-500' : act < hrs ? 'text-amber-600' : 'text-emerald-600'
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span>{p.name}</span>
                      <div className="flex items-center gap-2">
                        {hasAnyActual && <span className={`text-xs ${actColor}`}>{act}h actual</span>}
                        <span className="font-medium text-gray-500">{hrs}h planned</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GridView({ people, tasks, distMap }) {
  // Only show tasks that have at least one assignment
  const activeTasks = tasks.filter((t) =>
    people.some((p) => (distMap[p.id] || {})[t.id] > 0)
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-4 py-2 font-semibold text-gray-700 border-b border-gray-200 whitespace-nowrap">
              Person
            </th>
            {activeTasks.map((t) => (
              <th
                key={t.id}
                className="px-3 py-2 font-semibold text-gray-700 border-b border-gray-200 whitespace-nowrap"
                style={{ borderTop: `3px solid ${t.color || '#6366f1'}` }}
              >
                {t.name}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-gray-700 border-b border-gray-200">Total</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => {
            const personDist = distMap[p.id] || {}
            const total = Object.values(personDist).reduce((s, h) => s + h, 0)
            return (
              <tr
                key={p.id}
                className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
              >
                <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{p.name}</td>
                {activeTasks.map((t) => {
                  const hrs = personDist[t.id] || 0
                  return (
                    <td
                      key={t.id}
                      className="px-3 py-2 text-center text-gray-700"
                    >
                      {hrs > 0 ? (
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white"
                          style={{ backgroundColor: t.color || '#6366f1' }}
                        >
                          {hrs}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-center font-semibold text-gray-800">{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
