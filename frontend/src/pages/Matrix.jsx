import { useState, useEffect } from 'react'
import XLSX from 'xlsx-js-style'
import { api } from '../api'

function exportMatrixExcel(people, tasks, distMap, weekNumber) {
  const activeTasks = tasks.filter(t => people.some(p => (distMap[p.id] || {})[t.id] > 0))
  const HDR = { fill: { fgColor: { rgb: '312E81' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const TOT = { fill: { fgColor: { rgb: 'F0FDF4' } }, font: { bold: true, color: { rgb: '166534' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const NUM = { alignment: { horizontal: 'center', vertical: 'center' }, font: { sz: 10 } }
  const ws = {}
  const ncols = 2 + activeTasks.length  // Person, tasks..., Total
  const setCell = (r, c, v, t, s) => { ws[XLSX.utils.encode_cell({ r, c })] = { v: v ?? '', t: t || (typeof v === 'number' ? 'n' : 's'), s: s || {} } }

  // Header row
  setCell(0, 0, 'Person', 's', { ...HDR, alignment: { horizontal: 'left', vertical: 'center' } })
  activeTasks.forEach((t, i) => setCell(0, 1 + i, t.name, 's', HDR))
  setCell(0, ncols - 1, 'Total', 's', HDR)

  // Person rows
  const taskColTotals = new Array(activeTasks.length).fill(0)
  let grandTotal = 0
  for (let ri = 0; ri < people.length; ri++) {
    const p = people[ri]
    const pDist = distMap[p.id] || {}
    const pTotal = Object.values(pDist).reduce((s, h) => s + h, 0)
    const bg = ri % 2 === 0 ? 'FFFFFF' : 'F9FAFB'
    setCell(ri + 1, 0, p.name, 's', { fill: { fgColor: { rgb: bg } }, font: { bold: true, sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' } })
    activeTasks.forEach((t, i) => {
      const hrs = pDist[t.id] || 0
      taskColTotals[i] += hrs
      const colorHex = (t.color || '').replace('#', '')
      const cellStyle = hrs > 0 && colorHex
        ? { fill: { fgColor: { rgb: colorHex } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
        : { ...NUM, fill: { fgColor: { rgb: bg } } }
      setCell(ri + 1, 1 + i, hrs > 0 ? hrs : '', hrs > 0 ? 'n' : 's', cellStyle)
    })
    setCell(ri + 1, ncols - 1, pTotal > 0 ? pTotal : '', pTotal > 0 ? 'n' : 's', { ...NUM, font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: bg } } })
    grandTotal += pTotal
  }

  // Totals row
  const totRow = people.length + 1
  setCell(totRow, 0, 'Total', 's', { ...TOT, alignment: { horizontal: 'left', vertical: 'center' } })
  activeTasks.forEach((t, i) => setCell(totRow, 1 + i, taskColTotals[i] > 0 ? taskColTotals[i] : '', taskColTotals[i] > 0 ? 'n' : 's', TOT))
  setCell(totRow, ncols - 1, grandTotal, 'n', TOT)

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totRow, c: ncols - 1 } })
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

export default function Matrix() {
  const [weekNumber, setWeekNumber] = useState(1)
  const [view, setView] = useState('cards') // 'cards' | 'grid'
  const [dist, setDist] = useState([])
  const [people, setPeople] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getPeople(),
      api.getTasks(),
    ]).then(([p, t]) => {
      setPeople(p.filter((x) => x.active))
      setTasks(t)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    api.getDistribution(weekNumber).then((d) => {
      setDist(d)
      setLoading(false)
    })
  }, [weekNumber])

  // Build lookup: person_id -> task_id -> hours
  const distMap = {}
  for (const d of dist) {
    if (!distMap[d.person_id]) distMap[d.person_id] = {}
    distMap[d.person_id][d.task_id] = d.hours_per_week
  }

  // Sum of task hours per person
  const personTotalHours = (pid) =>
    Object.values(distMap[pid] || {}).reduce((s, h) => s + h, 0)

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
          onClick={() => exportMatrixExcel(people, tasks, distMap, weekNumber)}
          className="text-sm text-gray-600 border border-gray-200 px-3 py-1 rounded-lg hover:bg-gray-50"
        >
          Download Excel
        </button>
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
        <CardsView people={people} tasks={tasks} distMap={distMap} personTotalHours={personTotalHours} />
      ) : view === 'task' ? (
        <TaskView people={people} tasks={tasks} distMap={distMap} />
      ) : (
        <GridView people={people} tasks={tasks} distMap={distMap} />
      )}
    </div>
  )
}

function CardsView({ people, tasks, distMap, personTotalHours }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {people.map((p) => {
        const totalHrs = personTotalHours(p.id)
        const cap = p.weekly_hours
        const spare = Math.max(0, cap - totalHrs)
        const personDist = distMap[p.id] || {}

        return (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-semibold text-gray-900">{p.name}</h2>
              <span className="text-sm text-gray-500">{cap} hrs/wk</span>
            </div>
            <div className="space-y-2">
              {tasks.map((t) => {
                const hrs = personDist[t.id] || 0
                if (hrs === 0) return null
                const pct = Math.min(100, (hrs / cap) * 100)
                return (
                  <div key={t.id}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span className="truncate max-w-[70%]">{t.name}</span>
                      <span className="font-medium">{hrs} hrs</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: t.color || '#6366f1',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
              {spare > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
                  <span>Freshdesk spare</span>
                  <span className="font-medium text-emerald-600">{spare} hrs</span>
                </div>
              )}
              {Object.keys(personDist).length === 0 && (
                <p className="text-xs text-gray-400 italic">No tasks assigned</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TaskView({ people, tasks, distMap }) {
  const activeTasks = tasks.filter((t) =>
    people.some((p) => (distMap[p.id] || {})[t.id] > 0)
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {activeTasks.map((t) => {
        const assignees = people.filter((p) => (distMap[p.id] || {})[t.id] > 0)
        const total = assignees.reduce((s, p) => s + (distMap[p.id][t.id] || 0), 0)
        const color = t.color || '#6366f1'

        return (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <h2 className="font-semibold text-gray-900 truncate">{t.name}</h2>
              <span className="ml-auto text-sm text-gray-500 shrink-0">{total}h total</span>
            </div>
            <div className="space-y-2">
              {assignees.map((p) => {
                const hrs = distMap[p.id][t.id]
                const pct = Math.min(100, (hrs / total) * 100)
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span>{p.name}</span>
                      <span className="font-medium">{hrs}h</span>
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
