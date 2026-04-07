import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
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

function pastWeeks(n = 9) {
  const today = new Date()
  const dow = today.getDay()
  const daysToThisMon = dow === 0 ? -6 : 1 - dow
  let mon = new Date(today)
  mon.setDate(today.getDate() + daysToThisMon)

  const weeks = []
  while (weeks.length < n) {
    const monStr = format(mon, 'yyyy-MM-dd')
    const weekIdx = weekIndexInMonth(mon)
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
    weeks.push({
      value: monStr,
      label: `Week ${weekIdx}  ·  ${format(mon, 'MMM d')} – ${format(fri, 'MMM d, yyyy')}`,
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

// ── Cell: inline-editable hours ───────────────────────────────────────────────

function EditableCell({ entryId, hours, personId, taskId, taskLabel, dateStr, onSave }) {
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
      } else if (num !== hours) {
        await api.updateActual(entryId, { hours: num })
      } else {
        return
      }
    } else {
      if (num > 0) {
        await api.createActual({ person_id: personId, task_id: taskId, task_label: taskLabel, date: dateStr, hours: num })
      } else {
        return
      }
    }
    onSave()
  }

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
      className={`w-full text-center text-xs px-1 py-1 rounded hover:bg-indigo-50 transition-colors ${hours > 0 ? 'font-semibold text-gray-800' : 'text-gray-300'}`}
    >
      {hours > 0 ? hours : '—'}
    </button>
  )
}

// ── Add-task form (per person) ────────────────────────────────────────────────

function AddTaskForm({ personId, weekStart, weekDates, tasks, onDone, onCancel }) {
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
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mt-1 ml-4 text-xs">
      <select
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
        className="border border-gray-200 rounded px-2 py-1 text-xs"
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
          className="border border-gray-200 rounded px-2 py-1 text-xs w-28"
          required
        />
      )}
      <select
        value={dayIdx}
        onChange={(e) => setDayIdx(Number(e.target.value))}
        className="border border-gray-200 rounded px-2 py-1 text-xs"
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
        className="border border-gray-200 rounded px-2 py-1 text-xs w-16"
        required
      />
      <button type="submit" disabled={saving} className="bg-indigo-600 text-white px-2 py-1 rounded text-xs hover:bg-indigo-700 disabled:opacity-50">
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
  const WEEKS = pastWeeks(9)
  const [selectedWeek, setSelectedWeek] = useState(WEEKS[0].value)
  const [entries, setEntries] = useState([])
  const [people, setPeople] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingFor, setAddingFor] = useState(null) // person_id
  const [copyState, setCopyState] = useState('idle') // 'idle' | 'confirm' | 'copying'

  const weekDates = [0, 1, 2, 3, 4].map((i) => addDaysToDate(selectedWeek, i))

  useEffect(() => {
    Promise.all([api.getPeople(), api.getTasks()]).then(([p, t]) => {
      setPeople(p.filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name)))
      setTasks(t)
    })
  }, [])

  const reload = useCallback(() => {
    setLoading(true)
    api.getActual(selectedWeek).then((d) => {
      setEntries(d)
      setLoading(false)
    })
  }, [selectedWeek])

  useEffect(() => {
    setCopyState('idle')
    setAddingFor(null)
    reload()
  }, [reload])

  const grid = buildGrid(entries)
  const hasData = entries.length > 0

  async function handleCopy() {
    if (hasData && copyState === 'idle') {
      setCopyState('confirm')
      return
    }
    setCopyState('copying')
    await api.copyActualWeek(selectedWeek, false)
    reload()
    setCopyState('idle')
  }

  async function handleCopyForce() {
    setCopyState('copying')
    await api.copyActualWeek(selectedWeek, true)
    reload()
    setCopyState('idle')
  }

  // Team totals per day
  const teamTotals = weekDates.map((d) =>
    entries.filter((e) => e.date === d).reduce((s, e) => s + e.hours, 0)
  )
  const teamGrandTotal = teamTotals.reduce((s, h) => s + h, 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Actual</h1>
        <select
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm ml-2"
        >
          {WEEKS.map((w) => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>

        {/* Copy from planned */}
        {copyState === 'idle' && (
          <button
            onClick={handleCopy}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Copy from planned
          </button>
        )}
        {copyState === 'confirm' && (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Entries from the plan will be added. Existing entries won't be overwritten.
            </span>
            <button onClick={handleCopyForce} className="bg-amber-600 text-white px-3 py-1 rounded text-sm hover:bg-amber-700">
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
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 font-semibold text-gray-700 w-48">Person / Task</th>
                {weekDates.map((d, i) => (
                  <th key={d} className="px-3 py-2 font-semibold text-gray-700 text-center whitespace-nowrap w-20">
                    {DAY_LABELS[i]}<br />
                    <span className="font-normal text-xs text-gray-400">{d.slice(5)}</span>
                  </th>
                ))}
                <th className="px-3 py-2 font-semibold text-gray-700 text-center w-16">Total</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person, pi) => {
                const personGrid = grid[person.id] || {}
                const taskKeys = Object.keys(personGrid)

                // Per-person totals
                const personDayTotals = weekDates.map((d) =>
                  Object.values(personGrid).reduce(
                    (s, tk) => s + (tk.cells[d]?.hours || 0),
                    0
                  )
                )
                const personGrandTotal = personDayTotals.reduce((s, h) => s + h, 0)

                const rowBg = pi % 2 === 0 ? 'bg-white' : 'bg-gray-50'

                return (
                  <>
                    {/* Person name row */}
                    <tr key={`${person.id}-name`} className={`${rowBg} border-t border-gray-100`}>
                      <td colSpan={7} className="px-4 py-1.5 font-semibold text-gray-800 text-xs uppercase tracking-wide">
                        {person.name}
                      </td>
                    </tr>

                    {/* Task rows */}
                    {taskKeys.map((key) => {
                      const tk = personGrid[key]
                      return (
                        <tr key={`${person.id}-${key}`} className={rowBg}>
                          <td className="px-4 py-1 pl-7 text-gray-700">{tk.task_label}</td>
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
                                  onSave={reload}
                                />
                              </td>
                            )
                          })}
                          <td className="px-3 py-1 text-center text-xs font-semibold text-gray-600">
                            {Object.values(tk.cells).reduce((s, c) => s + c.hours, 0) || ''}
                          </td>
                        </tr>
                      )
                    })}

                    {/* Add task row */}
                    <tr key={`${person.id}-add`} className={rowBg}>
                      <td colSpan={7} className="px-4 py-0.5">
                        {addingFor === person.id ? (
                          <AddTaskForm
                            personId={person.id}
                            weekStart={selectedWeek}
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
                    <tr key={`${person.id}-sub`} className={`${rowBg} border-b border-gray-200`}>
                      <td className="px-4 py-1 pl-7 text-xs text-gray-500 font-medium">Sub-total</td>
                      {personDayTotals.map((h, i) => (
                        <td key={i} className="px-3 py-1 text-center text-xs font-semibold text-gray-700">
                          {h > 0 ? h : <span className="text-gray-300">0</span>}
                        </td>
                      ))}
                      <td className="px-3 py-1 text-center text-xs font-bold text-gray-800">
                        {personGrandTotal > 0 ? personGrandTotal : ''}
                      </td>
                    </tr>
                  </>
                )
              })}

              {/* Team total */}
              <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                <td className="px-4 py-2 font-bold text-indigo-900 text-sm">Team total</td>
                {teamTotals.map((h, i) => (
                  <td key={i} className="px-3 py-2 text-center font-bold text-indigo-800 text-sm">
                    {h > 0 ? h : <span className="text-indigo-300">0</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-bold text-indigo-900 text-sm">{teamGrandTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
