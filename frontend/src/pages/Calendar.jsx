import { useState, useEffect } from 'react'
import XLSX from 'xlsx-js-style'
import { api } from '../api'
import { formatLocalDate, nextMondayDateString } from '../utils/dates'

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
  const weekColumns = groups.flatMap((g, groupIndex) => {
    const dayCols = all_days
      .slice(g.start_idx, g.end_idx + 1)
      .map((day) => ({ type: 'day', date: day, groupIndex, color: g.color }))
    return [...dayCols, { type: 'week_total', label: `${g.label} Total`, groupIndex, color: g.color }]
  })
  const ncols = 2 + weekColumns.length + 1

  const WS = {}
  const merges = []
  let row = 0
  const addr = (r, c) => XLSX.utils.encode_cell({ r, c })
  const col = (c) => XLSX.utils.encode_col(c)

  function setCell(r, c, v, t, s) {
    WS[addr(r, c)] = { v: v ?? '', t: t || (typeof v === 'number' ? 'n' : 's'), s: s || {} }
  }

  function setFormula(r, c, formula, s) {
    WS[addr(r, c)] = { t: 'n', f: formula, s: s || {} }
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
  let cursorCol = 2
  for (const g of groups) {
    const width = (g.end_idx - g.start_idx + 1) + 1
    const c1 = cursorCol
    const c2 = cursorCol + width - 1
    setCell(row, c1, g.label, 's', {
      fill: { fgColor: { rgb: g.color } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
    })
    if (c1 < c2) merges.push({ s: { r: row, c: c1 }, e: { r: row, c: c2 } })
    for (let c = c1 + 1; c <= c2; c++) setCell(row, c, '', 's', sf(g.color))
    cursorCol = c2 + 1
  }
  setCell(row, ncols - 1, 'Total', 's', DAY_H_STYLE)
  row++

  // Row 2: Day / week total headers
  setCell(row, 0, '', 's', sf('374151'))
  setCell(row, 1, '', 's', sf('374151'))
  weekColumns.forEach((entry, idx) => {
    if (entry.type === 'day') {
      const d = new Date(entry.date + 'T00:00:00')
      setCell(row, 2 + idx, `${DAY_ABBR[d.getDay() === 0 ? 6 : d.getDay()-1]}  ${d.getDate()}`, 's', {
        fill: { fgColor: { rgb: entry.color } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
        alignment: { horizontal: 'center', vertical: 'center' },
      })
      return
    }
    setCell(row, 2 + idx, 'Week Total', 's', {
      fill: { fgColor: { rgb: entry.color } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
    })
  })
  setCell(row, ncols - 1, 'Total', 's', { fill: { fgColor: { rgb: '374151' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, alignment: { horizontal: 'center', vertical: 'center' } })
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
    const hasTasks = taskNames.length > 0
    const taskRowsCount = Math.max(taskNames.length, 1)

    if (!hasTasks) {
      setCell(row, 0, '', 's', sf('EEF2FF'))
      setCell(row, 1, '—', 's', sf('F9FAFB'))
      weekColumns.forEach((_, i) => setCell(row, 2 + i, '', 's', sf('F9FAFB')))
      setCell(row, ncols - 1, '', 's', sf('F9FAFB'))
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

        const weekTotalCols = []
        const countedWeekTotalCols = []
        let dayColCursor = 2
        groups.forEach((g) => {
          const dayColsForWeek = []
          for (let i = g.start_idx; i <= g.end_idx; i++) {
            const d = all_days[i]
            const td = day_alloc[d]
            const isCurrentMonth = d >= cur_first
            if (td === 'absent') {
              const cellStyle = ti === 0
                ? merge([sf('FEE2E2'), fc('991B1B', 9, true)])
                : sf('FEE2E2')
              setCell(row, dayColCursor, ti === 0 ? 'ABS' : '', 's', { ...cellStyle, alignment: { horizontal: 'center', vertical: 'center' } })
            } else if (td && typeof td === 'object' && td[tname] != null) {
              const bg = isCurrentMonth ? taskVlt : lighten(tc || 'A78BFA', 0.88)
              setCell(row, dayColCursor, td[tname], 'n', {
                fill: { fgColor: { rgb: bg } },
                font: { color: { rgb: tcFont }, sz: 9 },
                alignment: { horizontal: 'center', vertical: 'center' },
              })
              dayColsForWeek.push(dayColCursor)
            } else {
              setCell(row, dayColCursor, '', 's', sf(isCurrentMonth ? 'F9FAFB' : 'F5F3FF'))
            }
            dayColCursor++
          }
          if (dayColsForWeek.length > 0) {
            setFormula(row, dayColCursor, `SUM(${col(dayColsForWeek[0])}${row + 1}:${col(dayColsForWeek[dayColsForWeek.length - 1])}${row + 1})`, {
              fill: { fgColor: { rgb: taskVlt } },
              font: { bold: true, color: { rgb: tcFont }, sz: 9 },
              alignment: { horizontal: 'center', vertical: 'center' },
            })
          } else {
            setCell(row, dayColCursor, '', 's', sf('FFFFFF'))
          }
          weekTotalCols.push(dayColCursor)
          if (g.label !== 'Prev Month') countedWeekTotalCols.push(dayColCursor)
          dayColCursor++
        })
        if (countedWeekTotalCols.length > 0) {
          setFormula(row, ncols - 1, `SUM(${countedWeekTotalCols.map((c) => `${col(c)}${row + 1}`).join(',')})`, {
            fill: { fgColor: { rgb: taskVlt } },
            font: { bold: true, color: { rgb: tcFont }, sz: 9 },
            alignment: { horizontal: 'center', vertical: 'center' },
          })
        } else {
          setCell(row, ncols - 1, '', 's', sf('FFFFFF'))
        }
        row++
      }
    }

    const pTotalRow = row
    setCell(pTotalRow, 0, '', 's', sf('EEF2FF'))
    setCell(pTotalRow, 1, 'Person Total', 's', {
      fill: { fgColor: { rgb: 'F0FDF4' } },
      font: { bold: true, color: { rgb: '166534' }, sz: 9 },
      alignment: { horizontal: 'left', vertical: 'center' },
    })
    let weekColCursor = 2
    const personWeekTotalCols = []
    const countedPersonWeekTotalCols = []
    groups.forEach((g) => {
      const groupDayCols = []
      for (let i = g.start_idx; i <= g.end_idx; i++) {
        setFormula(pTotalRow, weekColCursor, `SUM(${col(weekColCursor)}${pStartRow + 1}:${col(weekColCursor)}${pTotalRow})`, {
          fill: { fgColor: { rgb: 'F0FDF4' } },
          font: { bold: true, color: { rgb: '166534' }, sz: 9 },
          alignment: { horizontal: 'center', vertical: 'center' },
        })
        groupDayCols.push(weekColCursor)
        weekColCursor++
      }
      setFormula(pTotalRow, weekColCursor, `SUM(${col(groupDayCols[0])}${pTotalRow + 1}:${col(groupDayCols[groupDayCols.length - 1])}${pTotalRow + 1})`, {
        fill: { fgColor: { rgb: 'DCFCE7' } },
        font: { bold: true, color: { rgb: '166534' }, sz: 9 },
        alignment: { horizontal: 'center', vertical: 'center' },
      })
      personWeekTotalCols.push(weekColCursor)
      if (g.label !== 'Prev Month') countedPersonWeekTotalCols.push(weekColCursor)
      weekColCursor++
    })
    if (countedPersonWeekTotalCols.length > 0) {
      setFormula(pTotalRow, ncols - 1, `SUM(${countedPersonWeekTotalCols.map((c) => `${col(c)}${pTotalRow + 1}`).join(',')})`, {
        fill: { fgColor: { rgb: 'DCFCE7' } },
        font: { bold: true, color: { rgb: '166534' }, sz: 9 },
        alignment: { horizontal: 'center', vertical: 'center' },
      })
    } else {
      setCell(pTotalRow, ncols - 1, '', 's', sf('DCFCE7'))
    }
    row++

    // Merge person name cell vertically including total row
    merges.push({ s: { r: pStartRow, c: 0 }, e: { r: pTotalRow, c: 0 } })
    WS[addr(pStartRow, 0)] = {
      v: person.name, t: 's',
      s: { fill: { fgColor: { rgb: 'EEF2FF' } }, font: { bold: true, sz: 10, color: { rgb: '312E81' } }, alignment: { horizontal: 'left', vertical: 'top' } },
    }
  }

  // Totals row
  const totRow = row
  setCell(totRow, 0, 'Total', 's', { fill: { fgColor: { rgb: 'F0FDF4' } }, font: { bold: true, color: { rgb: '166534' } }, alignment: { horizontal: 'left', vertical: 'center' } })
  setCell(totRow, 1, '', 's', sf('F0FDF4'))
  const grandWeekCols = []
  weekColumns.forEach((entry, idx) => {
    setFormula(totRow, 2 + idx, `SUM(${col(2 + idx)}4:${col(2 + idx)}${totRow})`, {
      fill: { fgColor: { rgb: entry.type === 'week_total' ? 'DCFCE7' : 'F0FDF4' } },
      font: { bold: true, sz: 9, color: { rgb: '166534' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    })
    if (entry.type === 'week_total' && groups[entry.groupIndex]?.label !== 'Prev Month') grandWeekCols.push(2 + idx)
  })
  if (grandWeekCols.length > 0) {
    setFormula(totRow, ncols - 1, `SUM(${grandWeekCols.map((c) => `${col(c)}${totRow + 1}`).join(',')})`, {
      fill: { fgColor: { rgb: 'F0FDF4' } },
      font: { bold: true, sz: 9, color: { rgb: '166534' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    })
  } else {
    setCell(totRow, ncols - 1, '', 's', sf('F0FDF4'))
  }

  WS['!ref'] = XLSX.utils.encode_range({ s: { r:0, c:0 }, e: { r: totRow, c: ncols-1 } })
  WS['!merges'] = merges
  WS['!cols'] = [{ wch: 14 }, { wch: 22 }, ...weekColumns.map((entry) => ({ wch: entry.type === 'week_total' ? 10 : 7 })), { wch: 10 }]
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
  const [effectiveFrom, setEffectiveFrom] = useState(nextMondayDateString())
  const [confirmingDistribution, setConfirmingDistribution] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
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
  const [distStale, setDistStale] = useState(() => localStorage.getItem('dist_stale') === 'true')

  useEffect(() => {
    api.getPeople(formatLocalDate(new Date(year, month - 1, 1))).then(all => {
      const active = all.filter(p => p.active !== false)
      setPeople(active)
      setPersonId((current) => (
        current && active.some((p) => p.id === current)
          ? current
          : (active[0]?.id || '')
      ))
    }).catch(() => {})
  }, [year, month])

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
      {distStale && (
        <div className="flex items-center gap-3 mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2.5 rounded-lg">
          <span>⚠ Task assignments have changed — run <strong>Confirm Distribution</strong> in Manager to see updates here.</span>
          <button onClick={() => { localStorage.removeItem('dist_stale'); setDistStale(false) }} className="ml-auto text-amber-600 hover:text-amber-800 font-medium shrink-0">Dismiss</button>
        </div>
      )}
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

        {/* First visible week cycle */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 whitespace-nowrap">First week uses:</span>
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
        <span className="text-xs text-gray-400 whitespace-nowrap">
          Later weeks continue in order.
        </span>

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
          onClick={() => {
            setEffectiveFrom(nextMondayDateString())
            setSaveMessage('')
            setShowRedistribute(true)
          }}
          className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Redistribute & Save
        </button>
      </div>

      {showRedistribute && (
        <div className="mb-5 p-4 border border-indigo-200 bg-indigo-50 rounded-lg flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-indigo-800">Apply this new calendar from Monday:</span>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <span className="text-xs text-indigo-600">
            Earlier weeks stay unchanged. The new distribution starts on this Monday and continues into later months until another version replaces it.
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => { setShowRedistribute(false); setSaveMessage('') }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setConfirmingDistribution(true)
                setError(null)
                setSaveMessage('')
                try {
                  const result = await api.confirmDistribution(1, effectiveFrom, null, false)
                  localStorage.removeItem('dist_stale')
                  setDistStale(false)
                  setFromWeek(1)
                  const data = await api.getCalendar(year, month, personId, 1, weekStart, includeOverflow)
                  setCalData(data)
                  setSaveMessage(`${result.saved} rows saved from ${result.effective_from}.`)
                } catch (e) {
                  setError(e.message)
                } finally {
                  setConfirmingDistribution(false)
                }
              }}
              disabled={confirmingDistribution || !effectiveFrom}
              className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {confirmingDistribution ? 'Saving…' : 'Save all weeks'}
            </button>
          </div>
          {saveMessage && (
            <span className="w-full text-sm font-medium text-emerald-700">{saveMessage}</span>
          )}
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
