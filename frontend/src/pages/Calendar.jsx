import { useState, useEffect } from 'react'
import XLSX from 'xlsx-js-style'
import { api } from '../api'

const DAY_ABBR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function lighten(hex6, factor = 0.82) {
  try {
    const r = parseInt(hex6.slice(0,2), 16), g = parseInt(hex6.slice(2,4), 16), b = parseInt(hex6.slice(4,6), 16)
    const to2 = n => Math.round(n + (255-n)*factor).toString(16).padStart(2,'0').toUpperCase()
    return to2(r)+to2(g)+to2(b)
  } catch { return 'F3F4F6' }
}

function sf(rgb) { return { fill: { fgColor: { rgb } } } }
function fc(rgb, sz=9, bold=false, italic=false) { return { font: { color: { rgb }, sz, bold, italic } } }
function merge(styles) {
  const out = {}
  for (const s of styles) for (const [k,v] of Object.entries(s)) out[k] = (typeof v === 'object' && !Array.isArray(v) && out[k]) ? { ...out[k], ...v } : v
  return out
}

function exportCalendarExcel(data) {
  const { year, month, month_name, cur_first, section_a, section_b, groups, people, allocations, task_colors } = data
  const all_days = [...section_a, ...section_b]
  const ncols = 2 + all_days.length

  const WS = {}
  const merges = []
  let row = 0

  function setCell(r, c, v, t, s) {
    WS[XLSX.utils.encode_cell({ r, c })] = { v: v ?? '', t: t || (typeof v === 'number' ? 'n' : 's'), s: s || {} }
  }

  // Row 0: Title
  setCell(row, 0, `${month_name} ${year}`, 's', {
    fill: { fgColor: { rgb: '312E81' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 },
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: ncols - 1 } })
  for (let c = 1; c < ncols; c++) setCell(row, c, '', 's', sf('312E81'))
  row++

  // Row 1: Week group headers
  const DAY_H_STYLE = { fill: { fgColor: { rgb: '374151' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' } }
  setCell(row, 0, 'Person', 's', DAY_H_STYLE)
  setCell(row, 1, 'Task',   's', DAY_H_STYLE)
  for (const g of groups) {
    const c1 = 2 + g.start_idx, c2 = 2 + g.end_idx
    setCell(row, c1, g.label, 's', {
      fill: { fgColor: { rgb: g.color } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
    })
    if (c1 < c2) merges.push({ s: { r: row, c: c1 }, e: { r: row, c: c2 } })
    for (let c = c1 + 1; c <= c2; c++) setCell(row, c, '', 's', sf(g.color))
  }
  row++

  // Row 2: Day headers
  setCell(row, 0, '', 's', sf('374151'))
  setCell(row, 1, '', 's', sf('374151'))
  for (let i = 0; i < all_days.length; i++) {
    const d = new Date(all_days[i] + 'T00:00:00')
    const g = groups.find(g => i >= g.start_idx && i <= g.end_idx)
    const bgColor = g ? g.color : '374151'
    setCell(row, 2 + i, `${DAY_ABBR[d.getDay() === 0 ? 6 : d.getDay()-1]}  ${d.getDate()}`, 's', {
      fill: { fgColor: { rgb: bgColor } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
    })
  }
  row++

  // Data rows
  for (const person of people) {
    const pid = person.id
    const day_alloc = allocations[pid] || {}

    // Collect task names in order
    const taskNames = [], taskSeen = new Set()
    for (const d of all_days) {
      const td = day_alloc[d]
      if (td && typeof td === 'object') {
        for (const tname of Object.keys(td)) {
          if (!taskSeen.has(tname)) { taskNames.push(tname); taskSeen.add(tname) }
        }
      }
    }

    const pStartRow = row
    const nRows = Math.max(taskNames.length, 1)

    if (taskNames.length === 0) {
      setCell(row, 0, '', 's', sf('EEF2FF'))
      setCell(row, 1, '—', 's', sf('F9FAFB'))
      for (let i = 0; i < all_days.length; i++) setCell(row, 2+i, '', 's', sf('F9FAFB'))
      row++
    } else {
      for (let ti = 0; ti < taskNames.length; ti++) {
        const tname = taskNames[ti]
        const tc = task_colors[tname] || ''
        const taskLight = tc ? lighten(tc, 0.80) : 'F9FAFB'
        const taskVlt   = tc ? lighten(tc, 0.91) : 'FFFFFF'
        const tcFont    = tc || '374151'

        setCell(row, 0, '', 's', sf('EEF2FF'))
        setCell(row, 1, tname, 's', {
          fill: { fgColor: { rgb: taskLight } },
          font: { color: { rgb: tcFont }, sz: 9 },
          alignment: { horizontal: 'left', vertical: 'center' },
        })

        for (let i = 0; i < all_days.length; i++) {
          const d = all_days[i]
          const td = day_alloc[d]
          const isCurrentMonth = d >= cur_first
          let cellStyle

          if (td === 'absent') {
            cellStyle = ti === 0
              ? merge([sf('FEE2E2'), fc('991B1B', 9, true)])
              : sf('FEE2E2')
            setCell(row, 2+i, ti === 0 ? 'ABS' : '', 's', { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } })
          } else if (td && typeof td === 'object' && td[tname] != null) {
            const bg = isCurrentMonth ? taskVlt : lighten(tc || 'A78BFA', 0.88)
            setCell(row, 2+i, td[tname], 'n', {
              fill: { fgColor: { rgb: bg } },
              font: { color: { rgb: tcFont }, sz: 9 },
              alignment: { horizontal: 'center', vertical: 'center' },
            })
          } else {
            setCell(row, 2+i, '', 's', sf(isCurrentMonth ? 'F9FAFB' : 'F5F3FF'))
          }
        }
        row++
      }
    }

    // Merge person name cell vertically
    if (nRows > 1) merges.push({ s: { r: pStartRow, c: 0 }, e: { r: pStartRow + nRows - 1, c: 0 } })
    WS[XLSX.utils.encode_cell({ r: pStartRow, c: 0 })] = {
      v: person.name, t: 's',
      s: { fill: { fgColor: { rgb: 'EEF2FF' } }, font: { bold: true, sz: 10, color: { rgb: '312E81' } }, alignment: { horizontal: 'left', vertical: 'top' } },
    }
  }

  // Totals row
  const totRow = row
  setCell(totRow, 0, 'Total', 's', { fill: { fgColor: { rgb: 'F0FDF4' } }, font: { bold: true, color: { rgb: '166534' } }, alignment: { horizontal: 'left', vertical: 'center' } })
  setCell(totRow, 1, '', 's', sf('F0FDF4'))
  for (let i = 0; i < all_days.length; i++) {
    const d = all_days[i]
    let total = 0
    for (const person of people) {
      const td = (allocations[person.id] || {})[d]
      if (td && typeof td === 'object') total += Object.values(td).reduce((a,b) => a+b, 0)
    }
    setCell(totRow, 2+i, total > 0 ? total : '', total > 0 ? 'n' : 's', {
      fill: { fgColor: { rgb: 'F0FDF4' } },
      font: { bold: true, sz: 9, color: { rgb: '166534' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    })
  }

  WS['!ref'] = XLSX.utils.encode_range({ s: { r:0, c:0 }, e: { r: totRow, c: ncols-1 } })
  WS['!merges'] = merges
  WS['!cols'] = [{ wch: 14 }, { wch: 22 }, ...all_days.map(() => ({ wch: 7 }))]
  WS['!freeze'] = { xSplit: 2, ySplit: 3 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, WS, `${month_name} ${year}`.slice(0, 31))
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `calendar_${year}_${String(month).padStart(2,'0')}_${month_name}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function DayCell({ day }) {
  const otherMonth = day.is_other_month
  const base = `flex-1 min-w-0 p-2 min-h-[110px]`

  if (!day.is_work_day) {
    return (
      <div className={`${base} bg-gray-50`}>
        <div className="text-xs text-gray-400 font-medium">{day.day_name}</div>
        <div className="text-xs text-gray-300">{formatDate(day.date)}</div>
      </div>
    )
  }

  if (day.is_absent) {
    return (
      <div className={base}>
        <div className="text-xs font-medium text-gray-600">{day.day_name}</div>
        <div className="text-xs text-gray-400 mb-2">{formatDate(day.date)}</div>
        <span className="inline-block text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
          Absent
        </span>
      </div>
    )
  }

  return (
    <div className={base}>
      <div className="text-xs font-medium text-gray-700">{day.day_name}</div>
      <div className="text-xs text-gray-400 mb-1.5">{formatDate(day.date)} · {day.scheduled_hours}h</div>
      <div className="space-y-0.5">
        {day.tasks.map(t => (
          <div
            key={t.task_id}
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
            style={{
              backgroundColor: t.task_color + '22',
              color: t.task_color,
              borderLeft: `3px solid ${t.task_color}`,
            }}
            title={`${t.task_name}: ${t.hours}h`}
          >
            <span className="truncate flex-1 min-w-0">{t.task_name}</span>
            <span className="shrink-0 font-bold">{t.hours}h</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WeekRow({ week }) {
  const isOverflow = week.week_index > 4
  return (
    <div className={`border rounded-lg overflow-hidden ${isOverflow ? 'border-amber-200' : 'border-gray-200'}`}>
      <div className={`px-4 py-2 flex items-center justify-between border-b ${isOverflow ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
        <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
          Week {week.week_index}
          {isOverflow && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              W{week.week_number} schedule
            </span>
          )}
          {week.rules_applied
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">rules</span>
            : <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">proportional</span>
          }
        </span>
        <span className="text-sm text-gray-500">{week.total_hours}h</span>
      </div>
      <div className="flex divide-x divide-gray-100">
        {week.days.map(day => (
          <DayCell key={day.date} day={day} />
        ))}
        <div className="w-14 shrink-0 flex items-center justify-center bg-gray-50 text-sm font-semibold text-gray-600">
          {week.total_hours}h
        </div>
      </div>
    </div>
  )
}

export default function Calendar() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [people, setPeople] = useState([])
  const [personId, setPersonId] = useState('')
  const [calData, setCalData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fromWeek, setFromWeek] = useState(1)
  const [showRedistribute, setShowRedistribute] = useState(false)
  const [pendingFromWeek, setPendingFromWeek] = useState(1)
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date()
    const key = `week_start_${now.getFullYear()}_${now.getMonth() + 1}`
    return parseInt(localStorage.getItem(key) || '1', 10)
  })
  const [includeOverflow, setIncludeOverflow] = useState(() => {
    const now = new Date()
    return localStorage.getItem(`cal_overflow_${now.getFullYear()}_${now.getMonth() + 1}`) === 'true'
  })
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api.getPeople().then(all => {
      const active = all.filter(p => p.active !== false)
      setPeople(active)
      if (active.length > 0) setPersonId(active[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setWeekStart(parseInt(localStorage.getItem(`week_start_${year}_${month}`) || '1', 10))
    setIncludeOverflow(localStorage.getItem(`cal_overflow_${year}_${month}`) === 'true')
  }, [year, month])

  useEffect(() => {
    if (!personId) return
    setLoading(true)
    setError(null)
    setCalData(null)
    api.getCalendar(year, month, personId, fromWeek, weekStart, includeOverflow)
      .then(setCalData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [year, month, personId, fromWeek, weekStart, includeOverflow])

  function changeWeekStart(w) {
    localStorage.setItem(`week_start_${year}_${month}`, String(w))
    setWeekStart(w)
  }

  function toggleOverflow() {
    const next = !includeOverflow
    localStorage.setItem(`cal_overflow_${year}_${month}`, String(next))
    setIncludeOverflow(next)
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">Monthly Calendar</h1>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Month navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600 text-lg leading-none"
          >
            ‹
          </button>
          <span className="font-semibold w-40 text-center text-gray-800">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600 text-lg leading-none"
          >
            ›
          </button>
        </div>

        {/* Person selector */}
        <select
          value={personId}
          onChange={e => setPersonId(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          {people.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {calData && (
          <span className="text-sm text-gray-500">
            {calData.weekly_total}h/week
          </span>
        )}

        {/* W starts at */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 whitespace-nowrap">W starts at:</span>
          {[1, 2, 3, 4].map(w => (
            <button
              key={w}
              onClick={() => changeWeekStart(w)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                weekStart === w
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
              }`}
            >
              W{w}
            </button>
          ))}
        </div>

        {/* Include prev overflow week as W1 */}
        <button
          onClick={toggleOverflow}
          title="Include the last week of the previous month as W1 of this month"
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap ${
            includeOverflow
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'
          }`}
        >
          {includeOverflow ? '← W1 from prev' : '+ prev week as W1'}
        </button>

        <button
          onClick={async () => {
            setExporting(true)
            try {
              const data = await api.getCalendarExportData(year, month, weekStart)
              exportCalendarExcel(data)
            } finally {
              setExporting(false)
            }
          }}
          disabled={exporting}
          className="ml-auto px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60"
        >
          {exporting ? 'Preparing…' : 'Download Excel'}
        </button>
        <button
          onClick={() => { setPendingFromWeek(fromWeek); setShowRedistribute(true) }}
          className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Redistribute
        </button>
      </div>

      {showRedistribute && (
        <div className="mb-5 p-4 border border-indigo-200 bg-indigo-50 rounded-lg flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-indigo-800">Apply rules from week:</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(w => (
              <button
                key={w}
                onClick={() => setPendingFromWeek(w)}
                className={`w-9 h-9 rounded-md text-sm font-semibold border transition-colors ${
                  pendingFromWeek === w
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <span className="text-xs text-indigo-600">
            Weeks 1–{pendingFromWeek - 1} keep proportional distribution
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setShowRedistribute(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={() => { setFromWeek(pendingFromWeek); setShowRedistribute(false) }}
              className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">Loading...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {calData && !loading && (
        <div className="space-y-3">
          {calData.weeks.length === 0 ? (
            <p className="text-gray-400 text-sm">No schedule data found for this person.</p>
          ) : (
            calData.weeks.map(week => (
              <WeekRow key={week.week_start} week={week} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
