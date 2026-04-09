import { useState, useEffect } from 'react'
import XLSX from 'xlsx-js-style'
import { api } from '../api'

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function exportDayExcel(data, dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const label = `${data.day_name} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`

  // Collect unique person names + their location in order of first appearance
  const personNames = []
  const personLocation = {}
  const seen = new Set()
  for (const t of data.tasks) {
    for (const p of t.people) {
      if (!seen.has(p.person_name)) { personNames.push(p.person_name); seen.add(p.person_name) }
      if (!personLocation[p.person_name]) personLocation[p.person_name] = p.location || 'office'
    }
  }

  const HDR_BG = '3730A3'
  const hdrStyle = (bg = HDR_BG) => ({
    fill: { fgColor: { rgb: bg } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  const boldStyle = { font: { bold: true, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const numStyle  = { alignment: { horizontal: 'center', vertical: 'center' }, font: { sz: 10 } }

  const ws = {}
  const ncols = 2 + personNames.length + 1
  let row = 0

  // Header row
  const header = ['Task', 'Responsible', ...personNames, 'Total']
  header.forEach((v, c) => {
    ws[XLSX.utils.encode_cell({ r: row, c })] = { v, t: 's', s: hdrStyle() }
  })
  row++

  // Location sub-row
  const locStyle = (loc) => ({
    fill: { fgColor: { rgb: loc === 'home' ? 'CCFBF1' : 'E0E7FF' } },
    font: { sz: 9, color: { rgb: loc === 'home' ? '0F766E' : '3730A3' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: '', t: 's', s: {} }
  ws[XLSX.utils.encode_cell({ r: row, c: 1 })] = { v: '', t: 's', s: {} }
  personNames.forEach((pname, ci) => {
    const loc = personLocation[pname] || 'office'
    ws[XLSX.utils.encode_cell({ r: row, c: 2 + ci })] = { v: loc === 'home' ? 'Home' : 'Office', t: 's', s: locStyle(loc) }
  })
  ws[XLSX.utils.encode_cell({ r: row, c: 2 + personNames.length })] = { v: '', t: 's', s: {} }
  row++

  // Task rows
  for (const t of data.tasks) {
    const personHours = Object.fromEntries(t.people.map(p => [p.person_name, p.hours]))
    const colorHex = (t.task_color || '').replace('#', '')
    const taskCellStyle = colorHex
      ? { fill: { fgColor: { rgb: colorHex } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { vertical: 'center' } }
      : { font: { sz: 10 }, alignment: { vertical: 'center' } }

    ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: t.task_name, t: 's', s: taskCellStyle }
    ws[XLSX.utils.encode_cell({ r: row, c: 1 })] = { v: t.responsible_person || '—', t: 's', s: numStyle }
    personNames.forEach((pname, ci) => {
      const hrs = personHours[pname]
      if (hrs != null) ws[XLSX.utils.encode_cell({ r: row, c: 2 + ci })] = { v: hrs, t: 'n', s: numStyle }
    })
    ws[XLSX.utils.encode_cell({ r: row, c: 2 + personNames.length })] = { v: t.total_hours, t: 'n', s: boldStyle }
    row++
  }

  // Totals row
  const personTotals = {}
  for (const t of data.tasks) {
    for (const p of t.people) {
      personTotals[p.person_name] = (personTotals[p.person_name] || 0) + p.hours
    }
  }
  const grandTotal = Object.values(personTotals).reduce((s, h) => s + h, 0)
  const totalRowStyle = { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'F1F5F9' } }, alignment: { horizontal: 'center', vertical: 'center' } }
  ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = { v: 'Total', t: 's', s: { ...totalRowStyle, alignment: { vertical: 'center' } } }
  ws[XLSX.utils.encode_cell({ r: row, c: 1 })] = { v: '', t: 's', s: totalRowStyle }
  personNames.forEach((pname, ci) => {
    ws[XLSX.utils.encode_cell({ r: row, c: 2 + ci })] = { v: personTotals[pname] || 0, t: 'n', s: totalRowStyle }
  })
  ws[XLSX.utils.encode_cell({ r: row, c: 2 + personNames.length })] = { v: grandTotal, t: 'n', s: totalRowStyle }
  row++

  // Absent footer
  if (data.absent_people && data.absent_people.length > 0) {
    row++ // blank row
    ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = {
      v: `Absent: ${data.absent_people.join(', ')}`,
      t: 's',
      s: { font: { italic: true, color: { rgb: '991B1B' }, sz: 10 } },
    }
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: ncols - 1 } })
  ws['!cols'] = [{ wch: 26 }, { wch: 15 }, ...personNames.map(() => ({ wch: 10 })), { wch: 8 }]
  ws['!freeze'] = { xSplit: 2, ySplit: 1 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31))
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `daily_${dateStr}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

function stepDay(dateStr, direction) {
  const d = new Date(dateStr + 'T00:00:00')
  do {
    d.setDate(d.getDate() + direction)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return toDateStr(d)
}

function formatLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatShort(dateStr, direction) {
  const d = new Date(dateStr + 'T00:00:00')
  do {
    d.setDate(d.getDate() + direction)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function DailyView() {
  const today = toDateStr(new Date())
  const [date, setDate] = useState(() => isWeekend(today) ? stepDay(today, 1) : today)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [distStale, setDistStale] = useState(() => localStorage.getItem('dist_stale') === 'true')

  useEffect(() => {
    if (isWeekend(date)) {
      setData(null)
      return
    }
    const [y, m] = date.split('-')
    const weekStart = parseInt(localStorage.getItem(`week_start_${y}_${parseInt(m, 10)}`) || '1', 10)
    setLoading(true)
    setError(null)
    api.getDayView(date, weekStart)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [date])

  const prevDate = stepDay(date, -1)
  const nextDate = stepDay(date, 1)
  const [_y, _m] = date.split('-')
  const weekStartForDate = parseInt(localStorage.getItem(`week_start_${_y}_${parseInt(_m, 10)}`) || '1', 10)

  return (
    <div className="max-w-2xl mx-auto">
      {distStale && (
        <div className="flex items-center gap-3 mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2.5 rounded-lg">
          <span>⚠ Task assignments have changed — run <strong>Confirm Distribution</strong> in Manager to see updates here.</span>
          <button onClick={() => { localStorage.removeItem('dist_stale'); setDistStale(false) }} className="ml-auto text-amber-600 hover:text-amber-800 font-medium shrink-0">Dismiss</button>
        </div>
      )}
      {/* Title + download */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Daily View</h1>
        {data && !data.is_weekend && (
          <button
            onClick={() => exportDayExcel(data, date)}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
          >
            Download Excel
          </button>
        )}
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-between mb-5 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <button
          onClick={() => setDate(prevDate)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          ← {formatShort(date, -1)}
        </button>
        <div className="text-center">
          <div className="font-semibold text-gray-900">{formatLabel(date)}</div>
          {data && !data.is_weekend && (
            <div className="text-xs text-gray-500 mt-0.5">
              Week {data.week_number} · {data.total_hours}h scheduled today across team
            </div>
          )}
        </div>
        <button
          onClick={() => setDate(nextDate)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {formatShort(date, 1)} →
        </button>
      </div>

      {/* Date picker */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm text-gray-600">Jump to:</label>
        <input
          type="date"
          value={date}
          onChange={e => {
            const v = e.target.value
            if (!v) return
            setDate(isWeekend(v) ? stepDay(v, 1) : v)
          }}
          className="border border-gray-300 rounded-md text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* Content */}
      {loading && (
        <div className="text-center text-gray-400 py-16 text-sm">Loading…</div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {data.tasks.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">No tasks scheduled for this day.</div>
          ) : (
            <div className="space-y-3">
              {data.tasks.map(task => (
                <div key={task.task_id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    {task.task_color && (
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: task.task_color }}
                      />
                    )}
                    <span className="font-semibold text-gray-900 flex-1">{task.task_name}</span>
                    {task.responsible_person && (
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                        {task.responsible_person}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-gray-700">{task.total_hours}h total</span>
                  </div>
                  <div className="flex flex-wrap gap-2 px-4 py-3">
                    {task.people.map(p => (
                      <span
                        key={p.person_name}
                        className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-sm"
                      >
                        <span className="font-medium text-gray-800">{p.person_name}</span>
                        <span className="text-gray-500">{p.hours}h</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${p.location === 'home' ? 'bg-teal-100 text-teal-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {p.location === 'home' ? 'Home' : 'Office'}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.absent_people && data.absent_people.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
              <span className="font-medium">Absent today:</span> {data.absent_people.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
