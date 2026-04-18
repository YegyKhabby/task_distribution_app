import { useState, useEffect, useCallback } from 'react'
import XLSX from 'xlsx-js-style'
import { api } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import { nextMondayDateString } from '../utils/dates'

function exportTasksExcel(tasks, people, distribution, weekNumber) {
  const distMap = {}
  for (const d of distribution) {
    if (!distMap[d.person_id]) distMap[d.person_id] = {}
    distMap[d.person_id][d.task_id] = d.hours_per_week
  }
  const sorted = [...tasks].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  const HDR = { fill: { fgColor: { rgb: '312E81' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const TOT = { fill: { fgColor: { rgb: 'F0FDF4' } }, font: { bold: true, color: { rgb: '166534' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } }
  const NUM = { alignment: { horizontal: 'center', vertical: 'center' }, font: { sz: 10 } }
  const LEFT = { alignment: { horizontal: 'left', vertical: 'center' }, font: { sz: 10 } }
  const FIXED = 6  // Name, Priority, Hrs/week, Week scope, Responsible, Rule
  const ncols = FIXED + people.length + 1
  const ws = {}
  const setCell = (r, c, v, t, s) => { ws[XLSX.utils.encode_cell({ r, c })] = { v: v ?? '', t: t || (typeof v === 'number' ? 'n' : 's'), s: s || {} } }

  // Title row
  setCell(0, 0, `Task Distribution — Week ${weekNumber}`, 's', { fill: { fgColor: { rgb: '312E81' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 }, alignment: { horizontal: 'left', vertical: 'center' } })
  for (let c = 1; c < ncols; c++) setCell(0, c, '', 's', { fill: { fgColor: { rgb: '312E81' } } })

  // Header row
  const headers = ['Task', 'Priority', 'Hrs/week', 'Week scope', 'Responsible', 'Rule', ...people.map(p => p.name), 'Total']
  headers.forEach((h, c) => setCell(1, c, h, 's', HDR))

  // Task rows
  const personColTotals = new Array(people.length).fill(0)
  let grandTotal = 0
  for (let ri = 0; ri < sorted.length; ri++) {
    const t = sorted[ri]
    const colorHex = (t.color || '').replace('#', '')
    const taskStyle = colorHex
      ? { fill: { fgColor: { rgb: colorHex } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' } }
      : { ...LEFT, font: { bold: true, sz: 10 } }
    setCell(ri + 2, 0, t.name, 's', taskStyle)
    setCell(ri + 2, 1, t.priority ?? '', t.priority != null ? 'n' : 's', NUM)
    setCell(ri + 2, 2, t.is_fill ? '—' : (t.weekly_hours_target || 0), t.is_fill ? 's' : 'n', NUM)
    setCell(ri + 2, 3, t.responsible_person || '', 's', LEFT)
    setCell(ri + 2, 4, t.schedule_rule || '', 's', LEFT)
    let taskRowTotal = 0
    people.forEach((p, i) => {
      const hrs = (distMap[p.id] || {})[t.id] || 0
      personColTotals[i] += hrs
      taskRowTotal += hrs
      setCell(ri + 2, FIXED + i, hrs > 0 ? hrs : '', hrs > 0 ? 'n' : 's', NUM)
    })
    setCell(ri + 2, ncols - 1, taskRowTotal > 0 ? taskRowTotal : '', taskRowTotal > 0 ? 'n' : 's', { ...NUM, font: { bold: true, sz: 10 } })
    grandTotal += taskRowTotal
  }

  // Totals row
  const totRow = sorted.length + 2
  setCell(totRow, 0, 'Total', 's', { ...TOT, alignment: { horizontal: 'left', vertical: 'center' } })
  for (let c = 1; c < FIXED; c++) setCell(totRow, c, '', 's', TOT)
  people.forEach((p, i) => setCell(totRow, FIXED + i, personColTotals[i] > 0 ? personColTotals[i] : '', personColTotals[i] > 0 ? 'n' : 's', TOT))
  setCell(totRow, ncols - 1, grandTotal, 'n', TOT)

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totRow, c: ncols - 1 } })
  ws['!cols'] = [{ wch: 26 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, ...people.map(() => ({ wch: 10 })), { wch: 8 }]
  ws['!freeze'] = { xSplit: 1, ySplit: 2 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `Week ${weekNumber}`)
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `tasks_week${weekNumber}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

const TABS = ['Tasks', 'Distribute']
const COLORS = ['#6366f1', '#f97316', '#10b981', '#0ea5e9', '#ec4899', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#a78bfa']

const SCHEDULE_RULES = [
  { value: '', label: 'No rule (default)', hint: 'System decides based on available capacity' },
  { value: 'proportional', label: 'Proportional', hint: 'Hours split based on how long each work day is' },
  { value: 'equal_per_day', label: 'Equal per day', hint: 'Same amount of hours on every work day' },
  { value: 'one_day', label: 'One day', hint: 'All hours on the best available day. Splits if needed' },
  { value: 'do_not_split', label: 'Do not split', hint: 'All hours on one day — warns if capacity does not allow it' },
  { value: 'two_days', label: 'Two days', hint: 'Split across the 2 best-capacity days' },
  { value: 'flexible_days', label: 'Flexible days', hint: '2 days if capacity fits, expands to 3 if needed' },
  { value: 'first_work_day', label: 'First work day', hint: "All hours on the first working day of the person's week" },
]

export default function Manager() {
  const [tab, setTab] = useState('Tasks')
  const [tasks, setTasks] = useState([])
  const [people, setPeople] = useState([])
  const [planningDate, setPlanningDate] = useState(nextMondayDateString)

  const reload = useCallback(async () => {
    const [t, p] = await Promise.all([
      api.getTasks(),
      api.getPeople(planningDate),
    ])
    setTasks([...t].sort((a, b) => a.name.localeCompare(b.name)))
    setPeople(p.filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name)))
  }, [planningDate])

  useEffect(() => { reload() }, [reload])

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Manager</h1>
        <div className="flex gap-1 ml-auto bg-gray-100 p-1 rounded-lg">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Tasks' && (
        <TasksTab tasks={tasks} people={people} onReload={reload} planningDate={planningDate} setPlanningDate={setPlanningDate} />
      )}
      {tab === 'Distribute' && (
        <DistributeTab tasks={tasks} people={people} effectiveFrom={planningDate} setEffectiveFrom={setPlanningDate} />
      )}
    </div>
  )
}

// ── Tasks Tab (merged Tasks + Assignments) ─────────────────────────────────

const DAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
]

function TasksTab({ tasks, people, onReload, planningDate, setPlanningDate }) {
  // ── Task editing state ──
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', weekly_hours_target: '', color: COLORS[0], priority: '', is_fill: false, responsible_person: '', schedule_rule: '', split_equally: false })
  const [formError, setFormError] = useState('')
  const [pendingTaskDelete, setPendingTaskDelete] = useState(null)
  const [responsiblePersons, setResponsiblePersons] = useState([])
  const [showRpEditor, setShowRpEditor] = useState(false)
  const [newRpName, setNewRpName] = useState('')

  useEffect(() => {
    api.getResponsiblePersons().then(setResponsiblePersons)
  }, [])

  // ── Assignment state ──
  const [expanded, setExpanded] = useState(null)
  const [saving, setSaving] = useState({})
  const [weekNumber, setWeekNumber] = useState(1)
  const [weekAssignments, setWeekAssignments] = useState([])
  const [distribution, setDistribution] = useState([])
  const [weekFixedHours, setWeekFixedHours] = useState([])
  const [weekSettings, setWeekSettings] = useState([])
  const [thisWeekOnly, setThisWeekOnly] = useState(new Set())

  // ── Hours summary state ──
  const [distAvg, setDistAvg] = useState(null)

  // ── Load week assignments + distribution ──
  const loadWeekData = useCallback(async (wn) => {
    const [a, d, f, s] = await Promise.all([
      api.getAssignments(wn),
      api.getDistribution(wn),
      api.getFixedHours(null, wn),
      api.getTaskWeekSettings(wn),
    ])
    setWeekAssignments(a)
    setDistribution(d)
    setWeekFixedHours(f)
    setWeekSettings(s)
  }, [])

  useEffect(() => { loadWeekData(weekNumber) }, [weekNumber, loadWeekData])

  const switchWeek = (wn) => {
    setWeekNumber(wn)
    setWeekAssignments([])
    setDistribution([])
    setWeekFixedHours([])
    setWeekSettings([])
    setThisWeekOnly(new Set()) // reset per-task scope toggles on week change
  }

  // ── Load per-week distribution totals + under-distribution warnings ──
  useEffect(() => {
    if (!tasks.length) return
    const freshdeskFillIds = new Set(
      tasks.filter(t => t.is_fill && t.name.toLowerCase().includes('freshdesk')).map(t => t.id)
    )
    const fillIds = new Set(tasks.filter(t => t.is_fill).map(t => t.id))
    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]))

    Promise.all([api.getDistribution(null, planningDate), api.getAllTaskWeekSettings()]).then(([rows, weekSettings]) => {
      // Per-week target overrides: { task_id: { week_number: target } }
      const weekTargetOverrides = {}
      for (const s of weekSettings) {
        if (!weekTargetOverrides[s.task_id]) weekTargetOverrides[s.task_id] = {}
        weekTargetOverrides[s.task_id][s.week_number] = s.weekly_hours_target
      }

      const weekTotal = {}, weekFreshdesk = {}
      // task distributed hours per week: { week_number: { task_id: hours } }
      const weekTaskDist = {}
      for (const row of rows) {
        const wn = row.week_number
        weekTotal[wn] = (weekTotal[wn] || 0) + row.hours_per_week
        if (freshdeskFillIds.has(row.task_id)) {
          weekFreshdesk[wn] = (weekFreshdesk[wn] || 0) + row.hours_per_week
        }
        if (!weekTaskDist[wn]) weekTaskDist[wn] = {}
        weekTaskDist[wn][row.task_id] = (weekTaskDist[wn][row.task_id] || 0) + row.hours_per_week
      }

      // Build per-week warnings: tasks where distributed < target by > 0.1h
      const weekWarnings = {}
      for (const wn of [1, 2, 3, 4]) {
        const dist = weekTaskDist[wn] || {}
        const warns = []
        for (const t of tasks) {
          if (fillIds.has(t.id)) continue // fill tasks have no fixed target
          const target = weekTargetOverrides[t.id]?.[wn] ?? t.weekly_hours_target
          if (!target || target <= 0) continue
          const distributed = dist[t.id] || 0
          if (target - distributed > 0.1) {
            warns.push({ task_id: t.id, name: t.name, color: t.color, target, distributed: Math.round(distributed * 2) / 2 })
          }
        }
        weekWarnings[wn] = warns
      }

      const round = (v) => Math.round(v * 2) / 2
      const byWeek = {}
      for (const wn of [1, 2, 3, 4]) {
        const total = weekTotal[wn] ?? null
        const fd = weekFreshdesk[wn] || 0
        byWeek[wn] = total != null
          ? { total: round(total), excl: round(total - fd), fd: round(fd), warnings: weekWarnings[wn] }
          : { total: null, excl: null, fd: null, warnings: weekWarnings[wn] }
      }
      setDistAvg(byWeek)
    }).catch(() => {})
  }, [tasks, planningDate])

  // ── Computed indexes ──
  const assignedMap = {}
  for (const a of weekAssignments) {
    if (!assignedMap[a.task_id]) assignedMap[a.task_id] = new Set()
    assignedMap[a.task_id].add(a.person_id)
  }

  const fixedMap = {}
  for (const f of weekFixedHours) {
    fixedMap[`${f.task_id}:${f.person_id}`] = f.hours
  }

  const weekTargetMap = {}
  for (const row of weekSettings) {
    weekTargetMap[row.task_id] = row.weekly_hours_target
  }

  const displayedTasks = tasks.map((t) => ({
    ...t,
    weekly_hours_target: weekTargetMap[t.id] ?? t.weekly_hours_target,
  }))

  const preferredDayMap = {}
  for (const a of weekAssignments) {
    if (a.preferred_days?.length) {
      preferredDayMap[`${a.task_id}:${a.person_id}`] = a.preferred_days
    }
  }

  // ── Hours summary — per-week breakdown ──
  const weekHours = distAvg // { 1: {total, excl} | null, 2: ..., 3: ..., 4: ... }

  // ── Responsible persons ──
  const addRp = async () => {
    const name = newRpName.trim()
    if (!name) return
    try {
      const created = await api.createResponsiblePerson(name)
      setResponsiblePersons(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewRpName('')
    } catch (e) { alert(e.message) }
  }

  const removeRp = async (id) => {
    await api.deleteResponsiblePerson(id)
    setResponsiblePersons(prev => prev.filter(p => p.id !== id))
  }

  // ── Task CRUD ──
  const startAdd = () => {
    setForm({ name: '', weekly_hours_target: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], priority: tasks.length + 1, is_fill: false, responsible_person: '', schedule_rule: '', split_equally: false })
    setEditing('new')
    setFormError('')
  }

  const startEdit = (t) => {
    setForm({ name: t.name, weekly_hours_target: t.weekly_hours_target, color: t.color || COLORS[0], priority: t.priority || '', is_fill: t.is_fill || false, responsible_person: t.responsible_person || '', schedule_rule: t.schedule_rule || '', split_equally: t.split_equally || false })
    setEditing(t.id)
    setFormError('')
  }

  // save() accepts an optional formData so auto-save can pass the new value
  // immediately without waiting for React state to flush
  const save = async (formData = null) => {
    const f = formData || form
    if (!f.name.trim()) { setFormError('Name required'); return }
    if (!f.is_fill && (f.weekly_hours_target === '' || Number(f.weekly_hours_target) < 0)) { setFormError('Hours must be 0 or more'); return }
    setFormError('')
    const targetValue = f.is_fill ? 0 : Number(f.weekly_hours_target)
    const globalData = {
      name: f.name.trim(),
      color: f.color,
      priority: f.priority ? Number(f.priority) : null,
      is_fill: f.is_fill,
      responsible_person: f.responsible_person || null,
      schedule_rule: f.is_fill ? null : (f.schedule_rule || null),
      split_equally: f.is_fill ? false : f.split_equally,
      weekly_hours_target: targetValue,
    }
    try {
      if (editing === 'new') {
        await api.createTask(globalData)
        setEditing(null)
        setExpanded(null)
      } else {
        await api.updateTask(editing, globalData)
        await Promise.all(weeksFor(editing).map((wn) =>
          api.updateTaskWeekSettings(editing, wn, targetValue)
        ))
      }
      await onReload()
      await loadWeekData(weekNumber)
    } catch (e) { setFormError(e.message) }
  }

  // auto-save a single field change for existing tasks
  const autoSave = (updatedFields) => {
    if (editing === 'new') return
    const newForm = { ...form, ...updatedFields }
    setForm(newForm)
    save(newForm)
  }

  const remove = async (id) => {
    await api.deleteTask(id)
    setPendingTaskDelete(null)
    await onReload()
    await loadWeekData(weekNumber)
  }

  // ── Assignment actions ──
  const weeksFor = (taskId) => thisWeekOnly.has(taskId) ? [1, 2, 3, 4] : [weekNumber]

  const toggleAssign = async (taskId, personId, currently_assigned) => {
    const key = `${taskId}:${personId}`
    setSaving((s) => ({ ...s, [key]: true }))
    await Promise.all(weeksFor(taskId).map(wn =>
      currently_assigned
        ? api.unassignPerson(taskId, personId, wn)
        : api.assignPerson({ task_id: taskId, person_id: personId, week_number: wn })
    ))
    await loadWeekData(weekNumber)
    setSaving((s) => ({ ...s, [key]: false }))
  }

  const updateFixed = async (taskId, personId, hours) => {
    await Promise.all(weeksFor(taskId).map((wn) =>
      api.setFixedHours({ task_id: taskId, person_id: personId, week_number: wn, hours: Number(hours) })
    ))
    await loadWeekData(weekNumber)
  }

  const updatePreferredDays = async (taskId, personId, days) => {
    await Promise.all(weeksFor(taskId).map(wn =>
      api.setPreferredDays(taskId, personId, wn, days.length ? days : null)
    ))
    await loadWeekData(weekNumber)
  }

  const toggleThisWeekOnly = (taskId) => {
    setThisWeekOnly(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  return (
    <div>
      {/* ── Hours summary bar — per week ── */}
      {weekHours && (
        <div className="mb-4">
          <div className="flex items-center gap-1 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm overflow-x-auto">
            <span className="text-indigo-700 font-medium shrink-0 mr-2">Total hrs:</span>
            {[1, 2, 3, 4].map((wn) => {
              const w = weekHours[wn]
              const isActive = wn === weekNumber
              const warnCount = w?.warnings?.length || 0
              return (
                <div
                  key={wn}
                  onClick={() => switchWeek(wn)}
                  className={`relative flex flex-col items-center px-3 py-1 rounded-lg cursor-pointer transition-colors shrink-0 ${
                    isActive ? 'bg-indigo-600 text-white' : 'bg-white border border-indigo-100 text-indigo-900 hover:bg-indigo-100'
                  }`}
                >
                  {warnCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                      {warnCount}
                    </span>
                  )}
                  <span className={`text-[10px] font-medium mb-0.5 ${isActive ? 'text-indigo-200' : 'text-indigo-400'}`}>W{wn}</span>
                  {w?.total != null ? (
                    <>
                      <span className="font-semibold text-sm leading-tight">{w.total}h</span>
                      <span className={`text-[10px] leading-tight ${isActive ? 'text-indigo-200' : 'text-indigo-400'}`}>{w.excl}h excl FD</span>
                      <span className={`text-[10px] leading-tight ${isActive ? 'text-emerald-300' : 'text-emerald-500'}`}>FD {w.fd}h</span>
                    </>
                  ) : (
                    <span className={`text-xs ${isActive ? 'text-indigo-300' : 'text-gray-400'}`}>not confirmed</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Warnings for the active week */}
          {weekHours[weekNumber]?.warnings?.length > 0 && (
            <div className="mt-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs font-semibold text-amber-700 mb-1.5">Under-distributed in Week {weekNumber}:</p>
              <div className="flex flex-wrap gap-2">
                {weekHours[weekNumber].warnings.map(w => (
                  <span key={w.task_id} className="flex items-center gap-1.5 text-xs bg-white border border-amber-200 rounded-lg px-2 py-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color || '#6366f1' }} />
                    <span className="font-medium text-gray-800">{w.name}</span>
                    <span className="text-amber-600">{w.distributed}h / {w.target}h</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Top controls: week selector + manage people + add task ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-sm text-gray-500">Week:</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((wn) => (
            <button
              key={wn}
              onClick={() => switchWeek(wn)}
              className={`px-3 py-1 rounded-md text-sm font-medium border ${
                weekNumber === wn ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Week {wn}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <input
            type="date"
            value={planningDate}
            onChange={(e) => setPlanningDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={() => exportTasksExcel(displayedTasks, people, distribution, weekNumber)}
            className="text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Download Excel
          </button>
          <button
            onClick={() => setShowRpEditor((v) => !v)}
            className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Full-timers
          </button>
          <button onClick={startAdd} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
            + Add Task
          </button>
        </div>
      </div>

      {/* ── Responsible persons editor ── */}
      {showRpEditor && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">Full-time responsible person options</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {responsiblePersons.map((rp) => (
              <span key={rp.id} className="flex items-center gap-1.5 bg-white border border-gray-200 text-sm px-3 py-1 rounded-full">
                {rp.name}
                <button onClick={() => removeRp(rp.id)} className="text-gray-400 hover:text-red-500 leading-none">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Add name…"
              value={newRpName}
              onChange={(e) => setNewRpName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRp()}
            />
            <button onClick={addRp} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700">Add</button>
          </div>
        </div>
      )}

      {/* ── Task list ── */}
      <div className="space-y-3">
        {displayedTasks.map((t) => {
          const assigned = assignedMap[t.id] || new Set()
          const isOpen = expanded === t.id
          const isEditing = editing === t.id

          return (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-3 px-5 py-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || '#6366f1' }} />
                <button
                  onClick={() => {
                    if (isOpen) { setExpanded(null); setEditing(null) }
                    else { setExpanded(t.id); startEdit(t) }
                  }}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  <span className="font-medium text-gray-900 truncate">{t.name}</span>
                  {t.is_fill
                    ? <span className="text-xs text-emerald-600 font-medium shrink-0">fills spare</span>
                    : t.weekly_hours_target > 0
                      ? <span className="text-sm text-gray-500 shrink-0">{t.weekly_hours_target}h/wk</span>
                      : <span className="text-xs text-amber-600 font-medium shrink-0" title="No hours set — task will be skipped in distribution">⚠ no hours set</span>
                  }
                  {t.schedule_rule && !t.is_fill && (
                    <span className="text-xs text-indigo-400 shrink-0" title={SCHEDULE_RULES.find(r => r.value === t.schedule_rule)?.hint}>
                      {SCHEDULE_RULES.find(r => r.value === t.schedule_rule)?.label}
                    </span>
                  )}
                  {t.priority && <span className="text-xs text-gray-400 shrink-0">P{t.priority}</span>}
                  {t.responsible_person && (
                    <span className="text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full shrink-0">
                      {t.responsible_person}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 shrink-0">{assigned.size} assigned</span>
                </button>
                <button
                  onClick={() => setPendingTaskDelete(t)}
                  className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 shrink-0"
                >
                  Remove
                </button>
                <span className="text-gray-400 text-xs shrink-0">{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Expanded: edit form + people & assignments */}
              {isOpen && (
                <div className="border-t border-gray-100">
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                  <TaskForm
                    form={form}
                    setForm={setForm}
                    error={formError}
                    onSave={save}
                    onAutoSave={autoSave}
                    weekNumber={weekNumber}
                    responsiblePersons={responsiblePersons.map(rp => rp.name)}
                  />
                </div>
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-500">
                      Assign people, set fixed hours, or pin preferred days.
                    </p>
                    <div className="flex items-center gap-4 ml-4 shrink-0">
                      {!t.is_fill && (
                        <label className="flex items-center gap-1.5 cursor-pointer select-none"
                          title="Divide target hours equally among all assigned people, ignoring their capacity">
                          <input
                            type="checkbox"
                            checked={form.split_equally}
                            onChange={(e) => autoSave({ split_equally: e.target.checked })}
                            className="w-3.5 h-3.5 rounded text-indigo-600"
                          />
                          <span className="text-xs text-gray-500">Split equally between people</span>
                        </label>
                      )}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <span className="text-xs text-gray-500">
                          {thisWeekOnly.has(t.id) ? 'All weeks' : `Week ${weekNumber} only`}
                        </span>
                        <div
                          onClick={() => toggleThisWeekOnly(t.id)}
                          className={`relative w-8 h-4 rounded-full transition-colors ${thisWeekOnly.has(t.id) ? 'bg-indigo-500' : 'bg-amber-400'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${thisWeekOnly.has(t.id) ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {people.map((p) => {
                      const isAssigned = assigned.has(p.id)
                      const key = `${t.id}:${p.id}`
                      const fixed = fixedMap[key]
                      const preferredDays = preferredDayMap[key] ?? []
                      const isSaving = saving[key]

                      return (
                        <div key={p.id} className="flex items-center gap-4 flex-wrap">
                          <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-32">
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              disabled={isSaving}
                              onChange={() => toggleAssign(t.id, p.id, isAssigned)}
                              className="w-4 h-4 rounded text-indigo-600"
                            />
                            <span className={`text-sm font-medium ${isAssigned ? 'text-gray-800' : 'text-gray-400'}`}>
                              {p.name}
                              {p.weekly_hours > 0 && (
                                <span className="ml-2 font-normal text-gray-400">{p.weekly_hours} hrs/wk</span>
                              )}
                            </span>
                          </label>

                          {isAssigned && (
                            <>
                              <div className="flex items-center gap-2">
                                <input
                                  key={`${key}:${weekNumber}:${fixed ?? ''}`}
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  placeholder="auto"
                                  defaultValue={fixed || ''}
                                  onBlur={(e) => updateFixed(t.id, p.id, e.target.value || 0)}
                                  className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-300"
                                />
                                <span className="text-xs text-gray-400">{fixed ? 'fixed hrs' : 'auto'}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {DAY_OPTIONS.map((o) => {
                                  const active = preferredDays.includes(o.value)
                                  return (
                                    <button
                                      key={o.value}
                                      type="button"
                                      onClick={() => {
                                        const next = active
                                          ? preferredDays.filter(d => d !== o.value)
                                          : [...preferredDays, o.value]
                                        updatePreferredDays(t.id, p.id, next)
                                      }}
                                      className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                                        active
                                          ? 'bg-indigo-600 text-white border-indigo-600'
                                          : 'text-gray-400 border-gray-200 hover:border-indigo-300 hover:text-indigo-500'
                                      }`}
                                    >
                                      {o.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                </div>
              )}
            </div>
          )
        })}

        {/* New task form */}
        {editing === 'new' && (
          <div className="bg-white border border-indigo-200 rounded-xl shadow-sm px-5 py-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">New task</p>
            <TaskForm
              form={form}
              setForm={setForm}
              error={formError}
              onSave={save}
              onCancel={() => setEditing(null)}
              isNew
              weekNumber={weekNumber}
              responsiblePersons={responsiblePersons.map(rp => rp.name)}
            />
          </div>
        )}

        {displayedTasks.length === 0 && editing !== 'new' && (
          <p className="text-center text-gray-400 py-12">No tasks yet. Click + Add Task to get started.</p>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingTaskDelete)}
        title="Delete task?"
        message={pendingTaskDelete ? `${pendingTaskDelete.name} will be deleted and all of its assignments will be removed.` : ''}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => pendingTaskDelete && remove(pendingTaskDelete.id)}
        onCancel={() => setPendingTaskDelete(null)}
      />
    </div>
  )
}

function TaskForm({ form, setForm, error, onSave, onCancel, onAutoSave, isNew, weekNumber = 1, responsiblePersons }) {
  // For existing tasks: call onAutoSave with changed fields immediately.
  // For new tasks: fields are collected and saved all at once on "Add".
  const auto = (fields) => { if (!isNew && onAutoSave) onAutoSave(fields) }

  return (
    <div className="flex flex-wrap items-end gap-2 w-full">
      {/* Color swatch */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-400">Color</span>
        <input
          type="color"
          value={form.color || '#6366f1'}
          onChange={(e) => { setForm({ ...form, color: e.target.value }) }}
          onBlur={(e) => auto({ color: e.target.value })}
          className="w-9 h-[34px] rounded-md border border-gray-300 cursor-pointer p-0.5"
          title="Task colour"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <span className="text-xs text-gray-400">Task name</span>
        <input
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="Task name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onBlur={(e) => auto({ name: e.target.value })}
          autoFocus={isNew}
        />
      </div>
      <div className="flex flex-col gap-1 w-28">
        <span className="text-xs text-gray-400">Hrs / week{!isNew ? ` W${weekNumber}` : ''}</span>
        <input
          type="number" min={0} step={0.5}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="0"
          value={form.weekly_hours_target}
          onChange={(e) => setForm({ ...form, weekly_hours_target: e.target.value })}
          onBlur={(e) => auto({ weekly_hours_target: e.target.value })}
          disabled={form.is_fill}
        />
      </div>
      <div className="flex flex-col gap-1 w-20">
        <span className="text-xs text-gray-400">Priority</span>
        <input
          type="number" min={1}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="—"
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value })}
          onBlur={(e) => auto({ priority: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-400">Full-time responsible</span>
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={form.responsible_person}
          onChange={(e) => { setForm({ ...form, responsible_person: e.target.value }); auto({ responsible_person: e.target.value }) }}
        >
          <option value="">None</option>
          {responsiblePersons.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      {!form.is_fill && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Dist. rule per person</span>
          <select
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.schedule_rule}
            onChange={(e) => { setForm({ ...form, schedule_rule: e.target.value }); auto({ schedule_rule: e.target.value }) }}
            title={SCHEDULE_RULES.find(r => r.value === form.schedule_rule)?.hint || ''}
          >
            {SCHEDULE_RULES.map(r => (
              <option key={r.value} value={r.value} title={r.hint}>{r.label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-400">Fill spare hrs</span>
        <label className="flex items-center gap-2 h-[34px] cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_fill}
            onChange={(e) => {
              const fields = { is_fill: e.target.checked, weekly_hours_target: e.target.checked ? 0 : form.weekly_hours_target, schedule_rule: e.target.checked ? '' : form.schedule_rule }
              setForm({ ...form, ...fields })
              auto(fields)
            }}
            className="w-4 h-4 rounded text-emerald-600"
          />
        </label>
      </div>
      {error && <span className="text-red-500 text-xs w-full">{error}</span>}
      {isNew && (
        <>
          <button onClick={onSave} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700 self-end">Add</button>
          <button onClick={onCancel} className="text-gray-500 px-3 py-1.5 rounded-md text-sm hover:bg-gray-100 self-end">Cancel</button>
        </>
      )}
    </div>
  )
}

// ── Distribute Tab ─────────────────────────────────────────────────────────

function DistributeTab({ tasks, people, effectiveFrom, setEffectiveFrom }) {
  const [weekNumber, setWeekNumber] = useState(1)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(null) // stores {saved, effective_from}
  const [error, setError] = useState('')
  const [overrides, setOverrides] = useState({})

  const loadPreview = async () => {
    setLoading(true)
    setError('')
    setConfirmed(null)
    setOverrides({})
    try {
      const data = await api.previewDistribution(weekNumber, effectiveFrom)
      setPreview(data)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const confirm = async (weekOnly) => {
    setConfirming(true)
    setError('')
    try {
      const overrideList = Object.entries(overrides).map(([key, hours]) => {
        const [person_id, task_id] = key.split(':')
        return { person_id, task_id, hours: Number(hours) }
      })
      const result = await api.confirmDistribution(weekNumber, effectiveFrom, overrideList.length ? overrideList : null, weekOnly)
      setConfirmed(result)
    } catch (e) {
      setError(e.message)
    }
    setConfirming(false)
  }

  const distributeAllWeeks = async () => {
    setConfirming(true)
    setError('')
    setConfirmed(null)
    setPreview(null)
    try {
      // week_number doesn't matter when week_only=false — backend iterates all 4
      const result = await api.confirmDistribution(1, effectiveFrom, null, false)
      setConfirmed(result)
    } catch (e) {
      setError(e.message)
    }
    setConfirming(false)
  }

  const setOverride = (personId, taskId, val) => {
    setOverrides((o) => ({ ...o, [`${personId}:${taskId}`]: val }))
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((wn) => (
            <button
              key={wn}
              onClick={() => { setWeekNumber(wn); setPreview(null); setConfirmed(null) }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                weekNumber === wn ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Week {wn}
            </button>
          ))}
        </div>
        <button
          onClick={loadPreview}
          disabled={loading || confirming}
          className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
        >
          {loading ? 'Computing…' : 'Preview Distribution'}
        </button>
        <button
          onClick={distributeAllWeeks}
          disabled={confirming || loading}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {confirming ? 'Saving…' : confirmed ? '✓ All weeks saved!' : 'Distribute & Save All Weeks'}
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-400">Effective from</span>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <span className="text-xs text-gray-400 mt-4">(snapped to Monday)</span>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {preview && (
        <>
          {preview.warnings?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">Warnings</p>
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-sm text-amber-700">• {w}</p>
              ))}
            </div>
          )}

          <div className="space-y-3 mb-6">
            {[...preview.tasks].sort((a, b) => a.task_name.localeCompare(b.task_name)).map((t) => (
              <div key={t.task_id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.task_color || '#6366f1' }} />
                  <span className="font-medium text-gray-900">{t.task_name}</span>
                  {t.is_fill
                    ? <span className="text-sm text-emerald-600 ml-1">fills spare hours</span>
                    : <span className="text-sm text-gray-500 ml-1">target: {t.target_hours} hrs</span>
                  }
                  <span className={`ml-auto text-sm font-semibold ${t.is_fill || Math.abs(t.total_distributed - t.target_hours) < 0.1 ? 'text-green-600' : 'text-amber-600'}`}>
                    {t.total_distributed} hrs distributed
                  </span>
                </div>

                {t.distributions.length === 0 ? (
                  <p className="px-5 py-3 text-sm text-gray-400 italic">No people assigned</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {t.distributions.map((d) => {
                      const key = `${d.person_id}:${t.task_id}`
                      const override = overrides[key]
                      return (
                        <div key={d.person_id} className="flex items-center gap-4 px-5 py-2.5">
                          <span className="text-sm font-medium text-gray-800 w-32">{d.person_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${d.type === 'fixed' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                            {d.type}
                          </span>
                          <div className="flex items-center gap-2 ml-auto">
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              value={override !== undefined ? override : d.hours}
                              onChange={(e) => setOverride(d.person_id, t.task_id, e.target.value)}
                              className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                            <span className="text-sm text-gray-400">hrs</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Person Summary</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {preview.person_summary.map((p) => (
                <div key={p.person_id} className="flex items-center gap-4 px-5 py-2.5">
                  <span className="text-sm font-medium text-gray-800 flex-1">{p.name}</span>
                  <div className="flex items-center gap-1 w-48">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${p.over_allocated ? 'bg-red-400' : 'bg-indigo-400'}`}
                        style={{ width: `${Math.min(100, p.weekly_hours > 0 ? (p.allocated_hours / p.weekly_hours) * 100 : 0)}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-sm font-medium w-24 text-right ${p.over_allocated ? 'text-red-600' : 'text-gray-700'}`}>
                    {p.allocated_hours} / {p.weekly_hours} hrs
                  </span>
                  {p.spare_hours > 0 && (
                    <span className="text-xs text-emerald-600 w-20 text-right">{p.spare_hours} spare</span>
                  )}
                  {p.over_allocated && (
                    <span className="text-xs text-red-500 w-20 text-right">over limit</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => confirm(true)}
              disabled={confirming || !!confirmed}
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {confirming ? 'Saving…' : confirmed ? 'Saved!' : `Confirm Week ${weekNumber} only`}
            </button>
            <button
              onClick={() => confirm(false)}
              disabled={confirming || !!confirmed}
              className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {confirming ? 'Saving…' : confirmed ? 'Saved!' : 'Confirm all 4 weeks'}
            </button>
            {confirmed && (
              <span className="text-green-600 text-sm font-medium">
                {confirmed.saved} rows saved — effective from {confirmed.effective_from}.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
