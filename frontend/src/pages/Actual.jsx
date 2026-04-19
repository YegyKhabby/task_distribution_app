import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import XLSX from 'xlsx-js-style'
import { api } from '../api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekIndexInMonth(mondayDate) {
  const firstDay = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), 1)
  const dow = firstDay.getDay()
  const daysToMon = dow === 1 ? 0 : (8 - dow) % 7
  const firstMonday = new Date(firstDay)
  firstMonday.setDate(firstDay.getDate() + daysToMon)
  const diffDays = Math.round((mondayDate - firstMonday) / 86400000)
  return Math.floor(diffDays / 7) + 1
}

function weekRange(pastN = 8, futureN = 4) {
  const today = new Date()
  const dow = today.getDay()
  const daysToThisMon = dow === 0 ? -6 : 1 - dow
  const thisMon = new Date(today)
  thisMon.setDate(today.getDate() + daysToThisMon)

  const weeks = []
  // future weeks first (descending so current week ends up at top)
  for (let i = futureN; i >= 1; i--) {
    const mon = new Date(thisMon); mon.setDate(thisMon.getDate() + i * 7)
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
    weeks.push({
      value: format(mon, 'yyyy-MM-dd'),
      label: `Week ${weekIndexInMonth(mon)}  ·  ${format(mon, 'MMM d')} – ${format(fri, 'MMM d, yyyy')}`,
      isFuture: true,
    })
  }
  // current + past weeks
  let mon = new Date(thisMon)
  for (let i = 0; i <= pastN; i++) {
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
    weeks.push({
      value: format(mon, 'yyyy-MM-dd'),
      label: `Week ${weekIndexInMonth(mon)}  ·  ${format(mon, 'MMM d')} – ${format(fri, 'MMM d, yyyy')}`,
      isFuture: false,
    })
    mon = new Date(mon); mon.setDate(mon.getDate() - 7)
  }
  return weeks
}

function addDaysToDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return format(d, 'yyyy-MM-dd')
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** Group entries into { personId -> { taskKey -> { dateStr -> {id, hours} } } } */
function buildGrid(entries) {
  const grid = {}
  for (const e of entries) {
    const pid = e.person_id
    const key = `${e.task_id || ''}__${e.task_label}`
    if (!grid[pid]) grid[pid] = {}
    if (!grid[pid][key]) {
      grid[pid][key] = {
        task_id: e.task_id || null,
        task_label: e.task_label,
        cells: {},
      }
    }
    grid[pid][key].cells[e.date] = { id: e.id, hours: e.hours }
  }
  return grid
}

/** Lighten a hex color toward white. factor=0 → original, factor=1 → white */
function lightenHex(hex, factor = 0.88) {
  const h = (hex || '6366F1').replace('#', '')
  if (h.length !== 6) return null
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const r2 = Math.round(r + (255 - r) * factor)
  const g2 = Math.round(g + (255 - g) * factor)
  const b2 = Math.round(b + (255 - b) * factor)
  return `rgb(${r2},${g2},${b2})`
}

function sheetHex(hex, factor = 0.88) {
  const h = (hex || '6366F1').replace('#', '')
  if (h.length !== 6) return 'EEF2FF'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const to2 = (n) => Math.round(n + (255 - n) * factor).toString(16).padStart(2, '0').toUpperCase()
  return `${to2(r)}${to2(g)}${to2(b)}`
}

function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return format(d, 'yyyy-MM-dd')
}

function workdaysInMonth(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  const dates = []
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month - 1, day, 12, 0, 0)
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) dates.push(format(d, 'yyyy-MM-dd'))
  }
  return dates
}

function exportActualWorkbook({ dates, entries, people, tasks, locations, filename, sheetName }) {
  const sortedDates = [...dates].sort()
  if (!sortedDates.length) return

  const taskColorMap = Object.fromEntries(tasks.map((t) => [t.id, t.color]))
  const personNameMap = Object.fromEntries(people.map((p) => [p.id, p.name]))
  for (const e of entries) {
    if (e.person_id && e.people?.name && !personNameMap[e.person_id]) personNameMap[e.person_id] = e.people.name
  }

  const personIds = Array.from(new Set([
    ...people.map((p) => p.id),
    ...entries.map((e) => e.person_id),
  ])).sort((a, b) => (personNameMap[a] || '').localeCompare(personNameMap[b] || ''))

  const weekGroups = []
  for (const dateStr of sortedDates) {
    const weekStart = mondayOf(dateStr)
    let group = weekGroups[weekGroups.length - 1]
    if (!group || group.weekStart !== weekStart) {
      const d = new Date(`${dateStr}T12:00:00`)
      group = {
        weekStart,
        label: `Week of ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`,
        dates: [],
      }
      weekGroups.push(group)
    }
    group.dates.push(dateStr)
  }

  const columns = []
  weekGroups.forEach((group, groupIndex) => {
    group.dates.forEach((dateStr) => columns.push({ type: 'day', date: dateStr, groupIndex }))
    columns.push({ type: 'week_total', groupIndex })
  })

  const ws = {}
  const merges = []
  const addr = (r, c) => XLSX.utils.encode_cell({ r, c })
  const col = (c) => XLSX.utils.encode_col(c)
  const setCell = (r, c, v, t, s) => {
    ws[addr(r, c)] = { v: v ?? '', t: t || (typeof v === 'number' ? 'n' : 's'), s: s || {} }
  }
  const setFormula = (r, c, formula, s) => {
    ws[addr(r, c)] = { t: 'n', f: formula, s: s || {} }
  }

  const titleStyle = {
    fill: { fgColor: { rgb: '312E81' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13 },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
  const darkHeader = {
    fill: { fgColor: { rgb: '374151' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
  const personHeader = {
    fill: { fgColor: { rgb: 'EEF2FF' } },
    font: { bold: true, color: { rgb: '3730A3' }, sz: 10 },
    alignment: { horizontal: 'left', vertical: 'center' },
  }
  const totalStyle = {
    fill: { fgColor: { rgb: 'F0FDF4' } },
    font: { bold: true, color: { rgb: '166534' }, sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
  const cellStyle = { alignment: { horizontal: 'center', vertical: 'center' }, font: { sz: 9 } }

  const ncols = 1 + columns.length + 1
  let row = 0

  setCell(row, 0, sheetName, 's', titleStyle)
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: ncols - 1 } })
  for (let c = 1; c < ncols; c++) setCell(row, c, '', 's', { fill: { fgColor: { rgb: '312E81' } } })
  row++

  setCell(row, 0, 'Person / Task', 's', darkHeader)
  let cursorCol = 1
  weekGroups.forEach((group, idx) => {
    const width = group.dates.length + 1
    const c1 = cursorCol
    const c2 = cursorCol + width - 1
    const groupColor = ['3730A3', '1E40AF', '0369A1', '0F766E', '0E7490'][idx % 5]
    setCell(row, c1, group.label, 's', {
      fill: { fgColor: { rgb: groupColor } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
    })
    if (c1 < c2) merges.push({ s: { r: row, c: c1 }, e: { r: row, c: c2 } })
    for (let c = c1 + 1; c <= c2; c++) setCell(row, c, '', 's', { fill: { fgColor: { rgb: groupColor } } })
    cursorCol = c2 + 1
  })
  setCell(row, ncols - 1, 'Total', 's', darkHeader)
  row++

  setCell(row, 0, '', 's', { fill: { fgColor: { rgb: '374151' } } })
  columns.forEach((entry, idx) => {
    if (entry.type === 'day') {
      const d = new Date(`${entry.date}T12:00:00`)
      setCell(row, 1 + idx, `${DAY_LABELS[d.getDay() - 1]} ${String(d.getDate()).padStart(2, '0')}`, 's', darkHeader)
    } else {
      setCell(row, 1 + idx, 'Week Total', 's', darkHeader)
    }
  })
  setCell(row, ncols - 1, 'Total', 's', darkHeader)
  row++

  const subtotalRows = []

  for (const personId of personIds) {
    const personEntries = entries.filter((e) => e.person_id === personId && sortedDates.includes(e.date))
    const personName = personNameMap[personId]
    if (!personName) continue

    setCell(row, 0, personName, 's', personHeader)
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: ncols - 1 } })
    for (let c = 1; c < ncols; c++) setCell(row, c, '', 's', { fill: { fgColor: { rgb: 'EEF2FF' } } })
    row++

    setCell(row, 0, 'Location', 's', { font: { sz: 9, color: { rgb: '6B7280' } } })
    columns.forEach((entry, idx) => {
      if (entry.type === 'day') {
        const loc = locations[personId]?.[entry.date] ?? null
        const isHome = loc === 'home'
        const isOff = loc == null
        setCell(row, 1 + idx, isOff ? 'Off' : (isHome ? 'Home' : 'Office'), 's', {
          fill: { fgColor: { rgb: isOff ? 'F3F4F6' : (isHome ? 'CCFBF1' : 'E0E7FF') } },
          font: { sz: 9, color: { rgb: isOff ? '6B7280' : (isHome ? '0F766E' : '3730A3') } },
          alignment: { horizontal: 'center', vertical: 'center' },
        })
      } else {
        setCell(row, 1 + idx, '', 's', {})
      }
    })
    setCell(row, ncols - 1, '', 's', {})
    row++

    const taskMap = new Map()
    for (const e of personEntries) {
      const key = `${e.task_id || ''}__${e.task_label}`
      if (!taskMap.has(key)) {
        taskMap.set(key, { task_id: e.task_id || null, task_label: e.task_label, cells: {} })
      }
      taskMap.get(key).cells[e.date] = (taskMap.get(key).cells[e.date] || 0) + e.hours
    }
    const taskRows = [...taskMap.values()].sort((a, b) => a.task_label.localeCompare(b.task_label))
    const personTaskStartRow = row

    if (!taskRows.length) {
      setCell(row, 0, '—', 's', { fill: { fgColor: { rgb: 'F9FAFB' } }, font: { sz: 9 } })
      columns.forEach((_, idx) => setCell(row, 1 + idx, '', 's', { fill: { fgColor: { rgb: 'F9FAFB' } } }))
      setCell(row, ncols - 1, '', 's', { fill: { fgColor: { rgb: 'F9FAFB' } } })
      row++
    } else {
      for (const taskRow of taskRows) {
        const taskColor = (taskColorMap[taskRow.task_id] || '').replace('#', '')
        const taskBg = taskColor ? sheetHex(taskColor, 0.88) : 'F9FAFB'
        setCell(row, 0, taskRow.task_label, 's', {
          fill: { fgColor: { rgb: taskBg } },
          font: { sz: 9, color: { rgb: taskColor || '374151' } },
          alignment: { horizontal: 'left', vertical: 'center' },
        })

        const countedWeekCols = []
        let colCursor = 1
        weekGroups.forEach(() => {
          const dayCols = []
          for (const entry of columns.slice(colCursor - 1)) {
            if (entry.type === 'week_total') break
          }
          const groupDayCols = []
          while (columns[colCursor - 1]?.type === 'day') {
            const dateStr = columns[colCursor - 1].date
            const hours = taskRow.cells[dateStr]
            if (hours > 0) {
              setCell(row, colCursor, hours, 'n', { ...cellStyle, fill: { fgColor: { rgb: taskBg } } })
              groupDayCols.push(colCursor)
            } else {
              setCell(row, colCursor, '', 's', { fill: { fgColor: { rgb: 'FFFFFF' } } })
            }
            colCursor++
          }
          if (groupDayCols.length > 0) {
            setFormula(row, colCursor, `SUM(${col(groupDayCols[0])}${row + 1}:${col(groupDayCols[groupDayCols.length - 1])}${row + 1})`, {
              ...cellStyle,
              font: { bold: true, sz: 9, color: { rgb: taskColor || '374151' } },
              fill: { fgColor: { rgb: taskBg } },
            })
          } else {
            setCell(row, colCursor, '', 's', { fill: { fgColor: { rgb: 'FFFFFF' } } })
          }
          countedWeekCols.push(colCursor)
          colCursor++
        })
        setFormula(row, ncols - 1, `SUM(${countedWeekCols.map((c) => `${col(c)}${row + 1}`).join(',')})`, {
          ...cellStyle,
          font: { bold: true, sz: 9 },
        })
        row++
      }
    }

    const subtotalRow = row
    subtotalRows.push(subtotalRow)
    setCell(subtotalRow, 0, 'Sub-total', 's', { ...totalStyle, alignment: { horizontal: 'left', vertical: 'center' } })
    let colCursor = 1
    while (colCursor < ncols - 1) {
      const startCol = colCursor
      while (columns[colCursor - 1]?.type === 'day') {
        setFormula(subtotalRow, colCursor, `SUM(${col(colCursor)}${personTaskStartRow + 1}:${col(colCursor)}${subtotalRow})`, totalStyle)
        colCursor++
      }
      setFormula(subtotalRow, colCursor, `SUM(${col(startCol)}${subtotalRow + 1}:${col(colCursor - 1)}${subtotalRow + 1})`, totalStyle)
      colCursor++
    }
    const weekTotalCols = columns
      .map((entry, idx) => (entry.type === 'week_total' ? idx + 1 : null))
      .filter(Boolean)
    setFormula(subtotalRow, ncols - 1, `SUM(${weekTotalCols.map((c) => `${col(c)}${subtotalRow + 1}`).join(',')})`, totalStyle)
    row++
  }

  setCell(row, 0, 'Team total', 's', {
    fill: { fgColor: { rgb: '3730A3' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    alignment: { horizontal: 'left', vertical: 'center' },
  })
  for (let c = 1; c < ncols; c++) {
    setCell(row, c, '', 's', {
      fill: { fgColor: { rgb: '3730A3' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
    })
  }
  for (let c = 1; c < ncols; c++) {
    if (subtotalRows.length > 0) {
      setFormula(row, c, `SUM(${subtotalRows.map((r) => `${col(c)}${r + 1}`).join(',')})`, {
        fill: { fgColor: { rgb: '3730A3' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center' },
      })
    }
  }

  ws['!merges'] = merges
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: ncols - 1 } })
  ws['!cols'] = [{ wch: 28 }, ...columns.map((entry) => ({ wch: entry.type === 'week_total' ? 11 : 10 })), { wch: 10 }]
  ws['!freeze'] = { xSplit: 1, ySplit: 3 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Cell: inline-editable hours ───────────────────────────────────────────────

function EditableCell({ entryId, hours, personId, taskId, taskLabel, dateStr, taskColor, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  function startEdit() {
    setVal(hours > 0 ? String(hours) : '')
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    const num = parseFloat(val)
    if (isNaN(num) || num < 0) return

    if (entryId) {
      if (num === 0) {
        await api.deleteActual(entryId)
        onSave({ type: 'delete', entryId })
      } else if (num !== hours) {
        const updated = await api.updateActual(entryId, { hours: num })
        onSave({ type: 'update', entry: updated })
      } else {
        return
      }
    } else {
      if (num > 0) {
        const created = await api.createActual({ person_id: personId, task_id: taskId, task_label: taskLabel, date: dateStr, hours: num })
        onSave({ type: 'create', entry: created })
      } else {
        return
      }
    }
  }

  const lightBg = hours > 0 && taskColor ? lightenHex(taskColor, 0.88) : null

  if (editing) {
    return (
      <input
        type="number"
        min="0"
        step="0.5"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-14 text-center border border-indigo-400 rounded px-1 py-0.5 text-xs focus:outline-none"
      />
    )
  }

  return (
    <button
      onClick={startEdit}
      style={lightBg ? { backgroundColor: lightBg } : {}}
      className={`w-full text-center text-xs px-1 py-1.5 rounded hover:opacity-80 transition-opacity ${
        hours > 0 ? 'font-semibold text-gray-800' : 'text-gray-300 hover:bg-indigo-50'
      }`}
    >
      {hours > 0 ? hours : '—'}
    </button>
  )
}

// ── Add-task form (per person) ────────────────────────────────────────────────

function AddTaskForm({ personId, weekDates, tasks, onDone, onCancel }) {
  const [taskId, setTaskId] = useState('')
  const [label, setLabel] = useState('')
  const [dayIdx, setDayIdx] = useState(0)
  const [hours, setHours] = useState('')
  const [saving, setSaving] = useState(false)

  const isAdHoc = taskId === '__adhoc__'
  const selectedTask = tasks.find((t) => t.id === taskId)

  async function submit(e) {
    e.preventDefault()
    const h = parseFloat(hours)
    if (!h || h <= 0) return
    const finalLabel = isAdHoc ? label.trim() : (selectedTask?.name || '')
    if (!finalLabel) return
    setSaving(true)
    await api.createActual({
      person_id: personId,
      task_id: isAdHoc ? null : taskId,
      task_label: finalLabel,
      date: weekDates[dayIdx],
      hours: h,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 py-1.5 px-2 text-xs bg-indigo-50 rounded-lg">
      <select
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
        className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
        required
      >
        <option value="">— pick task —</option>
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
        <option value="__adhoc__">Other (ad-hoc)</option>
      </select>
      {isAdHoc && (
        <input
          type="text"
          placeholder="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1 text-xs w-28 bg-white"
          required
        />
      )}
      <select
        value={dayIdx}
        onChange={(e) => setDayIdx(Number(e.target.value))}
        className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
      >
        {weekDates.map((d, i) => (
          <option key={d} value={i}>{DAY_LABELS[i]} {d.slice(5)}</option>
        ))}
      </select>
      <input
        type="number"
        min="0.5"
        step="0.5"
        placeholder="hrs"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        className="border border-gray-200 rounded px-2 py-1 text-xs w-16 bg-white"
        required
      />
      <button type="submit" disabled={saving} className="bg-indigo-600 text-white px-3 py-1 rounded text-xs hover:bg-indigo-700 disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 px-1 py-1 text-xs">
        Cancel
      </button>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Actual() {
  const WEEKS = weekRange(8, 4)
  const thisMonday = WEEKS.find(w => !w.isFuture)?.value ?? WEEKS[0].value
  const [selectedWeek, setSelectedWeek] = useState(thisMonday)
  const [entries, setEntries] = useState([])
  const [people, setPeople] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingFor, setAddingFor] = useState(null)
  const [copyState, setCopyState] = useState('idle')
  const [exportDays, setExportDays] = useState([0, 1, 2, 3, 4])
  const [locations, setLocations] = useState({}) // { person_id: { date: 'office'|'home' } }

  const weekDates = [0, 1, 2, 3, 4].map((i) => addDaysToDate(selectedWeek, i))

  // task color lookup by id
  const taskColorMap = Object.fromEntries(tasks.map((t) => [t.id, t.color]))

  useEffect(() => {
    Promise.all([api.getPeople(selectedWeek), api.getTasks()]).then(([p, t]) => {
      setPeople(p.filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name)))
      setTasks(t)
    })
  }, [selectedWeek])

  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.getActual(selectedWeek),
      api.getActualLocation(selectedWeek),
    ]).then(([d, loc]) => {
      setEntries(d)
      setLocations(loc)
      setLoading(false)
    })
  }, [selectedWeek])

  const applyEntryChange = useCallback((change) => {
    if (!change) return
    if (change.type === 'create' && change.entry) {
      setEntries((prev) => [...prev, change.entry])
      return
    }
    if (change.type === 'update' && change.entry) {
      setEntries((prev) => prev.map((e) => (e.id === change.entry.id ? { ...e, ...change.entry } : e)))
      return
    }
    if (change.type === 'delete' && change.entryId) {
      setEntries((prev) => prev.filter((e) => e.id !== change.entryId))
    }
  }, [])

  useEffect(() => {
    setCopyState('idle')
    setAddingFor(null)
    reload()
  }, [reload])

  const grid = buildGrid(entries)
  const hasData = entries.length > 0

  function getWeekStartOffset() {
    const d = new Date(selectedWeek + 'T00:00:00')
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    return parseInt(localStorage.getItem(`week_start_${year}_${month}`) || '1', 10)
  }

  async function handleCopy() {
    if (hasData && copyState === 'idle') {
      setCopyState('confirm')
      return
    }
    setCopyState('copying')
    await api.copyActualWeek(selectedWeek, false, getWeekStartOffset())
    reload()
    setCopyState('idle')
  }

  async function handleCopyForce() {
    setCopyState('copying')
    await api.copyActualWeek(selectedWeek, true, getWeekStartOffset())
    reload()
    setCopyState('idle')
  }

  async function handleToggleLocation(personId, dateStr) {
    const current = locations[personId]?.[dateStr] ?? null
    if (current == null) return
    const next = current === 'office' ? 'home' : 'office'
    setLocations((prev) => ({
      ...prev,
      [personId]: { ...prev[personId], [dateStr]: next },
    }))
    await api.upsertActualLocation(personId, dateStr, next)
  }

  function handleExport() {
    const dates = exportDays.map((i) => weekDates[i])
    if (!dates.length) return
    exportActualWorkbook({
      dates,
      entries,
      people,
      tasks,
      locations,
      filename: dates.length === 1 ? `actual_${dates[0]}.xlsx` : `actual_${dates[0]}_to_${dates[dates.length - 1]}.xlsx`,
      sheetName: dates.length === 1 ? `Actual ${dates[0]}` : `Actual Week`,
    })
  }

  async function handleMonthExport() {
    const d = new Date(selectedWeek + 'T12:00:00')
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const dates = workdaysInMonth(year, month)
    const weekStarts = [...new Set(dates.map(mondayOf))]
    const [entrySets, locationSets] = await Promise.all([
      Promise.all(weekStarts.map((weekStart) => api.getActual(weekStart))),
      Promise.all(weekStarts.map((weekStart) => api.getActualLocation(weekStart))),
    ])
    const monthEntries = entrySets.flat().filter((e) => dates.includes(e.date))
    const monthLocations = {}
    locationSets.forEach((weekLoc) => {
      Object.entries(weekLoc || {}).forEach(([personId, dayMap]) => {
        if (!monthLocations[personId]) monthLocations[personId] = {}
        Object.entries(dayMap || {}).forEach(([dateStr, loc]) => {
          if (dates.includes(dateStr)) monthLocations[personId][dateStr] = loc
        })
      })
    })
    exportActualWorkbook({
      dates,
      entries: monthEntries,
      people,
      tasks,
      locations: monthLocations,
      filename: `actual_${year}_${String(month).padStart(2, '0')}.xlsx`,
      sheetName: `Actual ${MONTH_SHORT[month - 1]} ${year}`,
    })
  }

  function toggleExportDay(i) {
    setExportDays((prev) =>
      prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()
    )
  }

  // Team totals per day
  const teamTotals = weekDates.map((d) =>
    entries.filter((e) => e.date === d).reduce((s, e) => s + e.hours, 0)
  )
  const teamGrandTotal = teamTotals.reduce((s, h) => s + h, 0)

  return (
    <div className="max-w-6xl">
      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-5 py-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Actual Hours</h1>

          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm ml-1"
          >
            {WEEKS.map((w) => (
              <option key={w.value} value={w.value}>{w.isFuture ? `▶ ${w.label}` : w.label}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Copy from planned */}
            {copyState === 'idle' && (
              <button
                onClick={handleCopy}
                className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-700"
              >
                Copy from planned
              </button>
            )}
            {copyState === 'confirm' && (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs">
                  This will delete existing entries and re-copy from the calendar.
                </span>
                <button onClick={handleCopyForce} className="bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-amber-700">
                  Proceed
                </button>
                <button onClick={() => setCopyState('idle')} className="text-gray-500 hover:text-gray-700 px-2 py-1 text-sm">
                  Cancel
                </button>
              </span>
            )}
            {copyState === 'copying' && (
              <span className="text-sm text-gray-400">Copying…</span>
            )}

            {/* Download Excel */}
            <button
              onClick={handleExport}
              disabled={exportDays.length === 0}
              className="flex items-center gap-1.5 text-sm bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Excel
            </button>
            <button
              onClick={handleMonthExport}
              className="text-sm border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50"
            >
              Month Excel
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 px-1">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm border-collapse bg-white">
            <thead>
              <tr style={{ backgroundColor: '#3730A3' }}>
                <th className="text-left px-4 py-2.5 font-semibold text-white w-48 text-sm">Person / Task</th>
                {weekDates.map((d, i) => (
                  <th key={d} className="px-2 py-2 text-center w-24">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-semibold text-white text-sm">{DAY_LABELS[i]}</span>
                      <span className="text-indigo-200 text-xs">{d.slice(5)}</span>
                      <label className="flex items-center gap-1 mt-0.5 cursor-pointer" title="Include in Excel export">
                        <input
                          type="checkbox"
                          checked={exportDays.includes(i)}
                          onChange={() => toggleExportDay(i)}
                          className="w-3 h-3 rounded accent-emerald-400 cursor-pointer"
                        />
                        <span className="text-indigo-200 text-xs">xlsx</span>
                      </label>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2.5 font-semibold text-white text-center w-16 text-sm">Total</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person, pi) => {
                const personGrid = grid[person.id] || {}
                const taskKeys = Object.keys(personGrid)

                const personDayTotals = weekDates.map((d) =>
                  Object.values(personGrid).reduce((s, tk) => s + (tk.cells[d]?.hours || 0), 0)
                )
                const personGrandTotal = personDayTotals.reduce((s, h) => s + h, 0)

                return (
                  <>
                    {/* Person name row */}
                    <tr key={`${person.id}-name`} style={{ backgroundColor: '#EEF2FF' }} className="border-t-2 border-indigo-100">
                      <td colSpan={7} className="px-4 py-2 font-bold text-indigo-800 text-xs uppercase tracking-wider">
                        {person.name}
                      </td>
                    </tr>

                    {/* Location row */}
                    <tr key={`${person.id}-loc`} className="border-t border-indigo-100">
                      <td className="px-4 py-0.5 text-xs text-gray-400">Location</td>
                      {weekDates.map((d) => {
                        const loc = locations[person.id]?.[d] ?? null
                        const isHome = loc === 'home'
                        const isOff = loc == null
                        return (
                          <td key={d} className="px-1 py-0.5 text-center">
                            {isOff ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                Off
                              </span>
                            ) : (
                              <button
                                onClick={() => handleToggleLocation(person.id, d)}
                                title={isHome ? 'Home — click to switch to office' : 'Office — click to switch to home'}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                                  isHome
                                    ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                }`}
                              >
                                {isHome ? '🏠' : '🏢'}
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td />
                    </tr>

                    {/* Task rows */}
                    {taskKeys.map((key) => {
                      const tk = personGrid[key]
                      const tcolor = taskColorMap[tk.task_id] || null
                      return (
                        <tr key={`${person.id}-${key}`} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-0.5 text-gray-700 text-xs">
                            <div className="flex items-center gap-2">
                              {tcolor && (
                                <span
                                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: tcolor }}
                                />
                              )}
                              {tk.task_label}
                            </div>
                          </td>
                          {weekDates.map((d) => {
                            const cell = tk.cells[d]
                            return (
                              <td key={d} className="px-1 py-0.5 text-center">
                                <EditableCell
                                  entryId={cell?.id}
                                  hours={cell?.hours || 0}
                                  personId={person.id}
                                  taskId={tk.task_id}
                                  taskLabel={tk.task_label}
                                  dateStr={d}
                                  taskColor={tcolor}
                                  onSave={applyEntryChange}
                                />
                              </td>
                            )
                          })}
                          <td className="px-3 py-1 text-center text-xs font-semibold text-gray-500">
                            {Object.values(tk.cells).reduce((s, c) => s + c.hours, 0) || ''}
                          </td>
                        </tr>
                      )
                    })}

                    {/* Add task row */}
                    <tr key={`${person.id}-add`} className="border-t border-gray-100">
                      <td colSpan={7} className="px-4 py-1">
                        {addingFor === person.id ? (
                          <AddTaskForm
                            personId={person.id}
                            weekDates={weekDates}
                            tasks={tasks}
                            onDone={() => { setAddingFor(null); reload() }}
                            onCancel={() => setAddingFor(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setAddingFor(person.id)}
                            className="text-xs text-indigo-500 hover:text-indigo-700 pl-3 py-0.5"
                          >
                            + Add task
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Sub-total row */}
                    <tr key={`${person.id}-sub`} style={{ backgroundColor: '#F0FDF4' }} className="border-t border-green-100">
                      <td className="px-4 py-1.5 pl-7 text-xs text-green-700 font-semibold">Sub-total</td>
                      {personDayTotals.map((h, i) => (
                        <td key={i} className="px-3 py-1.5 text-center text-xs font-bold text-green-700">
                          {h > 0 ? h : <span className="text-green-200">0</span>}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-center text-xs font-bold text-green-800">
                        {personGrandTotal > 0 ? personGrandTotal : ''}
                      </td>
                    </tr>
                  </>
                )
              })}

              {/* Team total */}
              <tr style={{ backgroundColor: '#3730A3' }} className="border-t-2 border-indigo-400">
                <td className="px-4 py-2.5 font-bold text-white text-sm">Team total</td>
                {teamTotals.map((h, i) => (
                  <td key={i} className="px-3 py-2.5 text-center font-bold text-indigo-100 text-sm">
                    {h > 0 ? h : <span className="text-indigo-400">0</span>}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center font-bold text-white text-sm">{teamGrandTotal || ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
