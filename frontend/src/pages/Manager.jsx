import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

const TABS = ['Tasks', 'Assignments', 'Distribute']
const COLORS = ['#6366f1', '#f97316', '#10b981', '#0ea5e9', '#ec4899', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#a78bfa']
const DEFAULT_RESPONSIBLE_PERSONS = ['Anastasia', 'Albana', 'Metuge', 'Moinul', 'Yash', 'Sidrit']
const RP_STORAGE_KEY = 'responsible_persons'

function loadResponsiblePersons() {
  try {
    const stored = localStorage.getItem(RP_STORAGE_KEY)
    return stored ? JSON.parse(stored) : DEFAULT_RESPONSIBLE_PERSONS
  } catch {
    return DEFAULT_RESPONSIBLE_PERSONS
  }
}

function saveResponsiblePersons(list) {
  localStorage.setItem(RP_STORAGE_KEY, JSON.stringify(list))
}

export default function Manager() {
  const [tab, setTab] = useState('Tasks')
  const [tasks, setTasks] = useState([])
  const [people, setPeople] = useState([])
  const [fixedHours, setFixedHours] = useState([])

  const reload = useCallback(async () => {
    const [t, p, f] = await Promise.all([
      api.getTasks(),
      api.getPeople(),
      api.getFixedHours(),
    ])
    setTasks([...t].sort((a, b) => a.name.localeCompare(b.name)))
    setPeople(p.filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name)))
    setFixedHours(f)
  }, [])

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
        <TasksTab tasks={tasks} onReload={reload} />
      )}
      {tab === 'Assignments' && (
        <AssignmentsTab tasks={tasks} people={people} fixedHours={fixedHours} onReload={reload} />
      )}
      {tab === 'Distribute' && (
        <DistributeTab tasks={tasks} people={people} />
      )}
    </div>
  )
}

// ── Tasks Tab ──────────────────────────────────────────────────────────────

function TasksTab({ tasks, onReload }) {
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', weekly_hours_target: '', color: COLORS[0], priority: '', responsible_person: '' })
  const [error, setError] = useState('')
  const [responsiblePersons, setResponsiblePersons] = useState(loadResponsiblePersons)
  const [showRpEditor, setShowRpEditor] = useState(false)
  const [newRpName, setNewRpName] = useState('')
  const [distAvg, setDistAvg] = useState(null) // { total, freshdesk } — avg across distributed weeks

  useEffect(() => {
    if (!tasks.length) return
    const freshdeskFillIds = new Set(
      tasks.filter(t => t.is_fill && t.name.toLowerCase().includes('freshdesk')).map(t => t.id)
    )
    api.getDistribution().then(rows => {
      // Sum per week: total and freshdesk-only
      const weekTotal = {}, weekFreshdesk = {}
      for (const row of rows) {
        weekTotal[row.week_number] = (weekTotal[row.week_number] || 0) + row.hours_per_week
        if (freshdeskFillIds.has(row.task_id)) {
          weekFreshdesk[row.week_number] = (weekFreshdesk[row.week_number] || 0) + row.hours_per_week
        }
      }
      const avg = (obj) => {
        const vals = Object.values(obj)
        return vals.length ? Math.round(vals.reduce((s, h) => s + h, 0) / vals.length * 2) / 2 : null
      }
      setDistAvg({ total: avg(weekTotal), freshdesk: avg(weekFreshdesk) })
    }).catch(() => {})
  }, [tasks])

  const addRp = () => {
    const name = newRpName.trim()
    if (!name || responsiblePersons.includes(name)) return
    const updated = [...responsiblePersons, name]
    setResponsiblePersons(updated)
    saveResponsiblePersons(updated)
    setNewRpName('')
  }

  const removeRp = (name) => {
    const updated = responsiblePersons.filter((n) => n !== name)
    setResponsiblePersons(updated)
    saveResponsiblePersons(updated)
  }

  const startAdd = () => {
    setForm({ name: '', weekly_hours_target: '', color: COLORS[tasks.length % COLORS.length], priority: tasks.length + 1, week_scope: 'both', is_fill: false, responsible_person: '' })
    setEditing('new')
    setError('')
  }

  const startEdit = (t) => {
    setForm({ name: t.name, weekly_hours_target: t.weekly_hours_target, color: t.color || COLORS[0], priority: t.priority || '', week_scope: t.week_scope || 'both', is_fill: t.is_fill || false, responsible_person: t.responsible_person || '' })
    setEditing(t.id)
    setError('')
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Name required'); return }
    if (!form.is_fill && (!form.weekly_hours_target || Number(form.weekly_hours_target) < 0)) { setError('Hours required (or check Fill spare hours)'); return }
    const data = {
      name: form.name.trim(),
      weekly_hours_target: form.is_fill ? 0 : Number(form.weekly_hours_target),
      color: form.color,
      priority: form.priority ? Number(form.priority) : null,
      week_scope: form.week_scope,
      is_fill: form.is_fill,
      responsible_person: form.responsible_person || null,
    }
    try {
      if (editing === 'new') await api.createTask(data)
      else await api.updateTask(editing, data)
      setEditing(null)
      onReload()
    } catch (e) { setError(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this task? All assignments will be removed.')) return
    await api.deleteTask(id)
    onReload()
  }

  // Both from actual distribution data so week-scoped tasks and fill are handled correctly
  const totalInclFreshdesk = distAvg?.total ?? null        // avg total distributed/week (~200h)
  const totalExclFreshdesk = distAvg != null && distAvg.total != null && distAvg.freshdesk != null
    ? Math.round((distAvg.total - distAvg.freshdesk) * 2) / 2
    : null

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm">
        <span className="text-indigo-700 font-medium">Total hrs/week:</span>
        <span className="text-indigo-900 font-semibold">
          {totalInclFreshdesk != null ? `${totalInclFreshdesk}h` : '—'}
          <span className="font-normal text-indigo-500"> (incl. Freshdesk)</span>
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-indigo-900 font-semibold">
          {totalExclFreshdesk != null ? `${totalExclFreshdesk}h` : '—'}
          <span className="font-normal text-indigo-500"> (excl. Freshdesk)</span>
        </span>
      </div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{tasks.length} tasks defined</p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRpEditor((v) => !v)}
            className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Manage people
          </button>
          <button onClick={startAdd} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            + Add Task
          </button>
        </div>
      </div>

      {showRpEditor && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">Full-time responsible person options</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {responsiblePersons.map((name) => (
              <span key={name} className="flex items-center gap-1.5 bg-white border border-gray-200 text-sm px-3 py-1 rounded-full">
                {name}
                <button
                  onClick={() => removeRp(name)}
                  className="text-gray-400 hover:text-red-500 leading-none"
                >
                  ×
                </button>
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
            <button
              onClick={addRp}
              className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700"
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {tasks.map((t) => (
          <div key={t.id} className="px-5 py-3 flex items-center gap-4">
            {editing === t.id ? (
              <TaskForm form={form} setForm={setForm} error={error} onSave={save} onCancel={() => setEditing(null)} responsiblePersons={responsiblePersons} />
            ) : (
              <>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || '#6366f1' }} />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{t.name}</span>
                  {t.is_fill
                    ? <span className="ml-3 text-sm text-emerald-600 font-medium">fills spare hours</span>
                    : <span className="ml-3 text-sm text-gray-500">{t.weekly_hours_target} hrs/week</span>
                  }
                  {t.priority && <span className="ml-2 text-xs text-gray-400">P{t.priority}</span>}
                  <span className="ml-2 text-xs text-gray-400">
                    {t.week_scope === 'W1' ? 'Week 1 only' : t.week_scope === 'W234' ? 'Week 2–3–4 only' : 'Every week'}
                  </span>
                  {t.responsible_person && (
                    <span className="ml-3 text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                      {t.responsible_person}
                    </span>
                  )}
                </div>
                <button onClick={() => startEdit(t)} className="text-xs px-2 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50">Edit</button>
                <button onClick={() => remove(t.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">Remove</button>
              </>
            )}
          </div>
        ))}

        {editing === 'new' && (
          <div className="px-5 py-3">
            <TaskForm form={form} setForm={setForm} error={error} onSave={save} onCancel={() => setEditing(null)} isNew responsiblePersons={responsiblePersons} />
          </div>
        )}

        {tasks.length === 0 && editing !== 'new' && (
          <p className="px-5 py-8 text-center text-gray-400">No tasks yet. Add one above.</p>
        )}
      </div>
    </div>
  )
}

function TaskForm({ form, setForm, error, onSave, onCancel, isNew, responsiblePersons }) {
  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <input
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1 min-w-36 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        placeholder="Task name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        autoFocus
      />
      <input
        type="number" min={0} step={0.5}
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        placeholder="Hrs/week"
        value={form.weekly_hours_target}
        onChange={(e) => setForm({ ...form, weekly_hours_target: e.target.value })}
      />
      <input
        type="number" min={1}
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        placeholder="Priority"
        value={form.priority}
        onChange={(e) => setForm({ ...form, priority: e.target.value })}
      />
      <select
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={form.week_scope}
        onChange={(e) => setForm({ ...form, week_scope: e.target.value })}
      >
        <option value="both">Every week</option>
        <option value="W1">Week 1 only</option>
        <option value="W234">Week 2–3–4 only</option>
      </select>
      <select
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={form.responsible_person}
        onChange={(e) => setForm({ ...form, responsible_person: e.target.value })}
      >
        <option value="">Full-time responsible…</option>
        {responsiblePersons.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
        <input
          type="checkbox"
          checked={form.is_fill}
          onChange={(e) => setForm({ ...form, is_fill: e.target.checked, weekly_hours_target: e.target.checked ? 0 : form.weekly_hours_target })}
          className="w-4 h-4 rounded text-emerald-600"
        />
        Fill spare hours
      </label>
      <div className="flex gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setForm({ ...form, color: c })}
            className={`w-5 h-5 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      {error && <span className="text-red-500 text-xs w-full">{error}</span>}
      <button onClick={onSave} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700">
        {isNew ? 'Add' : 'Save'}
      </button>
      <button onClick={onCancel} className="text-gray-500 px-3 py-1.5 rounded-md text-sm hover:bg-gray-100">Cancel</button>
    </div>
  )
}

const DAY_OPTIONS = [
  { value: '', label: 'Any day' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
]

// ── Assignments Tab ────────────────────────────────────────────────────────

function AssignmentsTab({ tasks, people, fixedHours, onReload }) {
  const [expanded, setExpanded] = useState(null)
  const [saving, setSaving] = useState({})
  const [weekNumber, setWeekNumber] = useState(1)
  const [weekAssignments, setWeekAssignments] = useState([])
  const [distribution, setDistribution] = useState([])
  // Per-task: set of task IDs where changes apply to THIS week only (default: all weeks)
  const [thisWeekOnly, setThisWeekOnly] = useState(new Set())

  const loadWeekData = useCallback(async (wn) => {
    const [a, d] = await Promise.all([
      api.getAssignments(wn),
      api.getDistribution(wn),
    ])
    setWeekAssignments(a)
    setDistribution(d)
  }, [])

  useEffect(() => { loadWeekData(weekNumber) }, [weekNumber, loadWeekData])

  const switchWeek = (wn) => {
    setWeekNumber(wn)
    setWeekAssignments([])
    setDistribution([])
  }

  // Index: task_id -> set of person_ids (for this week)
  const assignedMap = {}
  for (const a of weekAssignments) {
    if (!assignedMap[a.task_id]) assignedMap[a.task_id] = new Set()
    assignedMap[a.task_id].add(a.person_id)
  }

  // Index: (task_id, person_id) -> fixed hours (global)
  const fixedMap = {}
  for (const f of fixedHours) {
    fixedMap[`${f.task_id}:${f.person_id}`] = f.hours
  }

  // Index: (task_id, person_id) -> preferred_days array for current week (from task_people)
  const preferredDayMap = {}
  for (const a of weekAssignments) {
    if (a.preferred_days?.length) {
      preferredDayMap[`${a.task_id}:${a.person_id}`] = a.preferred_days
    }
  }

  const weeksFor = (taskId) => thisWeekOnly.has(taskId) ? [weekNumber] : [1, 2, 3, 4]

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
    await api.setFixedHours({ task_id: taskId, person_id: personId, hours: Number(hours) })
    await onReload()
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

  if (tasks.length === 0) {
    return <p className="text-gray-400 text-center py-12">No tasks yet. Go to the Tasks tab to add some.</p>
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
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
      </div>

      <div className="space-y-3">
        {tasks.map((t) => {
          const assigned = assignedMap[t.id] || new Set()
          const isOpen = expanded === t.id
          return (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : t.id)}
                className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 text-left"
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || '#6366f1' }} />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{t.name}</span>
                  <span className="ml-3 text-sm text-gray-500">{t.weekly_hours_target} hrs/week</span>
                  <span className="ml-3 text-xs text-gray-400">{assigned.size} assigned in Week {weekNumber}</span>
                </div>
                <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-500">
                      Who works on this task? Optionally pin a preferred day or set fixed hours.
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer select-none ml-4 shrink-0">
                      <span className="text-xs text-gray-500">
                        {thisWeekOnly.has(t.id) ? `Week ${weekNumber} only` : 'All weeks'}
                      </span>
                      <div
                        onClick={() => toggleThisWeekOnly(t.id)}
                        className={`relative w-8 h-4 rounded-full transition-colors ${thisWeekOnly.has(t.id) ? 'bg-amber-400' : 'bg-indigo-500'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${thisWeekOnly.has(t.id) ? 'translate-x-4' : ''}`} />
                      </div>
                    </label>
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
                                {DAY_OPTIONS.filter(o => o.value !== '').map((o) => {
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
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Distribute Tab ─────────────────────────────────────────────────────────

function DistributeTab({ tasks, people }) {
  const [weekNumber, setWeekNumber] = useState(1)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  // overrides: {`person_id:task_id`: hours}
  const [overrides, setOverrides] = useState({})

  const loadPreview = async () => {
    setLoading(true)
    setError('')
    setConfirmed(false)
    setOverrides({})
    try {
      const data = await api.previewDistribution(weekNumber)
      setPreview(data)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const confirm = async () => {
    setConfirming(true)
    setError('')
    try {
      const overrideList = Object.entries(overrides).map(([key, hours]) => {
        const [person_id, task_id] = key.split(':')
        return { person_id, task_id, hours: Number(hours) }
      })
      await api.confirmDistribution({ week_number: weekNumber, overrides: overrideList.length ? overrideList : null })
      setConfirmed(true)
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
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((wn) => (
            <button
              key={wn}
              onClick={() => { setWeekNumber(wn); setPreview(null); setConfirmed(false) }}
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
          disabled={loading}
          className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
        >
          {loading ? 'Computing…' : 'Preview Distribution'}
        </button>
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

          {/* Per-task distribution */}
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

          {/* Per-person summary */}
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

          {/* Confirm */}
          <div className="flex items-center gap-3">
            <button
              onClick={confirm}
              disabled={confirming || confirmed}
              className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {confirming ? 'Saving…' : confirmed ? 'Saved!' : `Confirm & Save Week ${weekNumber}`}
            </button>
            {confirmed && (
              <span className="text-green-600 text-sm font-medium">
                Distribution saved. Go to the Matrix page to view it.
              </span>
            )}
            <p className="text-xs text-gray-400 ml-auto">
              You can adjust hours above before confirming.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
