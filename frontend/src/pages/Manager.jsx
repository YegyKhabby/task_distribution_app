import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

const TABS = ['Tasks', 'Assignments', 'Distribute']
const COLORS = ['#6366f1', '#f97316', '#10b981', '#0ea5e9', '#ec4899', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#a78bfa']

export default function Manager() {
  const [tab, setTab] = useState('Tasks')
  const [tasks, setTasks] = useState([])
  const [people, setPeople] = useState([])
  const [assignments, setAssignments] = useState([]) // flat list of {task_id, person_id, people, tasks}
  const [fixedHours, setFixedHours] = useState([])   // flat list of {task_id, person_id, hours}

  const reload = useCallback(async () => {
    const [t, p, a, f] = await Promise.all([
      api.getTasks(),
      api.getPeople(),
      api.getAssignments(),
      api.getFixedHours(),
    ])
    setTasks(t)
    setPeople(p.filter((x) => x.active))
    setAssignments(a)
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
        <AssignmentsTab tasks={tasks} people={people} assignments={assignments} fixedHours={fixedHours} onReload={reload} />
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
  const [form, setForm] = useState({ name: '', weekly_hours_target: '', color: COLORS[0], priority: '' })
  const [error, setError] = useState('')

  const startAdd = () => {
    setForm({ name: '', weekly_hours_target: '', color: COLORS[tasks.length % COLORS.length], priority: tasks.length + 1, week_scope: 'both', is_fill: false })
    setEditing('new')
    setError('')
  }

  const startEdit = (t) => {
    setForm({ name: t.name, weekly_hours_target: t.weekly_hours_target, color: t.color || COLORS[0], priority: t.priority || '', week_scope: t.week_scope || 'both', is_fill: t.is_fill || false })
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

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{tasks.length} tasks defined</p>
        <button onClick={startAdd} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          + Add Task
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {tasks.map((t) => (
          <div key={t.id} className="px-5 py-3 flex items-center gap-4">
            {editing === t.id ? (
              <TaskForm form={form} setForm={setForm} error={error} onSave={save} onCancel={() => setEditing(null)} />
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
                </div>
                <button onClick={() => startEdit(t)} className="text-xs px-2 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50">Edit</button>
                <button onClick={() => remove(t.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">Remove</button>
              </>
            )}
          </div>
        ))}

        {editing === 'new' && (
          <div className="px-5 py-3">
            <TaskForm form={form} setForm={setForm} error={error} onSave={save} onCancel={() => setEditing(null)} isNew />
          </div>
        )}

        {tasks.length === 0 && editing !== 'new' && (
          <p className="px-5 py-8 text-center text-gray-400">No tasks yet. Add one above.</p>
        )}
      </div>
    </div>
  )
}

function TaskForm({ form, setForm, error, onSave, onCancel, isNew }) {
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

// ── Assignments Tab ────────────────────────────────────────────────────────

function AssignmentsTab({ tasks, people, assignments, fixedHours, onReload }) {
  const [expanded, setExpanded] = useState(null)
  const [saving, setSaving] = useState({})

  // Index: task_id -> set of person_ids
  const assignedMap = {}
  for (const a of assignments) {
    if (!assignedMap[a.task_id]) assignedMap[a.task_id] = new Set()
    assignedMap[a.task_id].add(a.person_id)
  }

  // Index: (task_id, person_id) -> hours
  const fixedMap = {}
  for (const f of fixedHours) {
    fixedMap[`${f.task_id}:${f.person_id}`] = f.hours
  }

  const toggleAssign = async (taskId, personId, currently_assigned) => {
    const key = `${taskId}:${personId}`
    setSaving((s) => ({ ...s, [key]: true }))
    if (currently_assigned) {
      await api.unassignPerson(taskId, personId)
    } else {
      await api.assignPerson({ task_id: taskId, person_id: personId })
    }
    await onReload()
    setSaving((s) => ({ ...s, [key]: false }))
  }

  const updateFixed = async (taskId, personId, hours) => {
    await api.setFixedHours({ task_id: taskId, person_id: personId, hours: Number(hours) })
    await onReload()
  }

  if (tasks.length === 0) {
    return <p className="text-gray-400 text-center py-12">No tasks yet. Go to the Tasks tab to add some.</p>
  }

  return (
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
                <span className="ml-3 text-xs text-gray-400">{assigned.size} people assigned</span>
              </div>
              <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-4">
                <p className="text-xs text-gray-500 mb-3">
                  Check people assigned to this task. For anyone with a fixed commitment, enter their hours.
                </p>
                <div className="space-y-3">
                  {people.map((p) => {
                    const isAssigned = assigned.has(p.id)
                    const key = `${t.id}:${p.id}`
                    const fixed = fixedMap[key]
                    const isSaving = saving[key]

                    return (
                      <div key={p.id} className="flex items-center gap-4">
                        <label className="flex items-center gap-3 cursor-pointer flex-1">
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
  )
}

// ── Distribute Tab ─────────────────────────────────────────────────────────

function DistributeTab({ tasks, people }) {
  const [weekType, setWeekType] = useState('W1')
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
      const data = await api.previewDistribution(weekType)
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
      await api.confirmDistribution({ week_type: weekType, overrides: overrideList.length ? overrideList : null })
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
          {['W1', 'W234'].map((wt) => (
            <button
              key={wt}
              onClick={() => { setWeekType(wt); setPreview(null); setConfirmed(false) }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                weekType === wt ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {wt === 'W1' ? 'Week 1' : 'Week 2–3–4'}
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
            {preview.tasks.map((t) => (
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
              {confirming ? 'Saving…' : confirmed ? 'Saved!' : `Confirm & Save ${weekType}`}
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
