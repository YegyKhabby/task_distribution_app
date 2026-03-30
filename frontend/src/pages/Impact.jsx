import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { api } from '../api'

function fmtDate(d) {
  return format(new Date(d + 'T12:00:00'), 'MMM d')
}

function fmtWeekRange(weekStart) {
  const start = new Date(weekStart + 'T12:00:00')
  const end = new Date(start.getTime() + 4 * 86400000)
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

export default function Impact() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState([])
  const [selectedPersonId, setSelectedPersonId] = useState(null)
  const [redirectForm, setRedirectForm] = useState(null)
  const [makeupForm, setMakeupForm] = useState(null)

  useEffect(() => {
    api.getTasks().then(setTasks)
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.getImpactUpcoming(today)
      setData(res)
      setSelectedPersonId((prev) => {
        if (prev && res.persons.find((p) => p.person_id === prev)) return prev
        return res.persons[0]?.person_id ?? null
      })
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const selectedPerson = data?.persons.find((p) => p.person_id === selectedPersonId)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Impact</h1>
        <button onClick={load} className="ml-auto text-sm text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {data && !loading && (
        data.persons.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">✓</p>
            <p className="text-lg font-medium">No upcoming absences</p>
          </div>
        ) : (
          <>
            {/* Person tabs */}
            <div className="flex gap-2 flex-wrap mb-6">
              {data.persons.map((p) => (
                <button
                  key={p.person_id}
                  onClick={() => setSelectedPersonId(p.person_id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedPersonId === p.person_id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p.person_name}
                  <span className={`ml-2 text-xs ${selectedPersonId === p.person_id ? 'text-indigo-200' : 'text-gray-400'}`}>
                    {p.total_absent_days} day{p.total_absent_days !== 1 ? 's' : ''}
                  </span>
                </button>
              ))}
            </div>

            {selectedPerson && (
              <PersonView
                person={selectedPerson}
                tasks={tasks}
                onRedirect={(taskId, taskName, candidates, weekStart) =>
                  setRedirectForm({ taskId, taskName, candidates, absentPersonName: selectedPerson.person_name, weekStart })
                }
                onMakeup={() => setMakeupForm({ absentPersonId: selectedPerson.person_id, absentPersonName: selectedPerson.person_name })}
                onRefresh={load}
              />
            )}
          </>
        )
      )}

      {redirectForm && (
        <RedirectModal
          {...redirectForm}
          tasks={tasks}
          onClose={() => setRedirectForm(null)}
          onDone={() => { setRedirectForm(null); load() }}
        />
      )}

      {makeupForm && (
        <MakeupModal
          {...makeupForm}
          tasks={tasks}
          onClose={() => setMakeupForm(null)}
          onDone={() => { setMakeupForm(null); load() }}
        />
      )}
    </div>
  )
}

function PersonView({ person, tasks, onRedirect, onMakeup, onRefresh }) {
  const allDates = person.weeks.flatMap((w) => w.absent_dates).sort()
  const allReallocations = person.weeks.flatMap((w) =>
    w.confirmed_reallocations.map((r) => ({ ...r, week_start: w.week_start }))
  )

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{person.person_name}</h2>
          <p className="text-sm text-gray-500">
            Absent: {allDates.map(fmtDate).join(', ')}
          </p>
        </div>
        <button
          onClick={onMakeup}
          className="ml-auto text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50"
        >
          Log Makeup
        </button>
      </div>

      <div className="space-y-4">
        {person.weeks.map((week) => (
          <WeekSection
            key={week.week_start}
            week={week}
            onRedirect={(taskId, taskName, candidates) =>
              onRedirect(taskId, taskName, candidates, week.week_start)
            }
          />
        ))}
      </div>

      {allReallocations.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Confirmed Redirects</h3>
          <div className="space-y-1">
            {allReallocations.map((r) => (
              <div key={r.id} className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm flex items-center gap-3">
                <span className="text-green-700 font-medium">{r.covering_person?.name}</span>
                <span className="text-gray-500">covers</span>
                <span className="font-medium">{r.task?.name}</span>
                <span className="text-gray-500">— {r.hours} hrs</span>
                {r.redirected_from?.name && (
                  <span className="text-gray-400 text-xs">(from {r.redirected_from.name})</span>
                )}
                <span className="text-xs text-gray-400">week {fmtDate(r.week_start)}</span>
                <span className="ml-auto text-xs text-gray-400">by {r.confirmed_by}</span>
                <DeleteReallocationButton id={r.id} onDone={onRefresh} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WeekSection({ week, onRedirect }) {
  const totalUnallocated = week.unallocated_tasks.reduce((s, t) => s + t.remaining_unallocated, 0)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <span className="font-medium text-gray-800">{fmtWeekRange(week.week_start)}</span>
        <span className="text-xs text-gray-400">Week {week.week_number} of month</span>
        {totalUnallocated > 0 ? (
          <span className="ml-auto text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            {totalUnallocated.toFixed(1)} hrs unallocated
          </span>
        ) : (
          <span className="ml-auto text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            Fully covered
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {week.unallocated_tasks.length === 0 ? (
          <p className="px-5 py-3 text-sm text-gray-400">No task assignments this week.</p>
        ) : (
          week.unallocated_tasks.map((t) => (
            <TaskImpactRow
              key={t.task_id}
              task={t}
              onRedirect={() => onRedirect(t.task_id, t.task_name, t.coverage_candidates)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function TaskImpactRow({ task, onRedirect }) {
  const [expanded, setExpanded] = useState(false)
  const isFullyCovered = task.remaining_unallocated <= 0

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-3">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: task.task_color || '#6366f1' }}
        />
        <div className="flex-1">
          <span className="font-medium text-gray-800">{task.task_name}</span>
          <span className="ml-3 text-sm text-gray-500">
            {task.raw_unallocated_hours} hrs unallocated
          </span>
          {task.makeup_hours > 0 && (
            <span className="ml-2 text-xs text-green-600">−{task.makeup_hours} makeup</span>
          )}
          {task.covered_hours > 0 && (
            <span className="ml-2 text-xs text-blue-600">−{task.covered_hours} covered</span>
          )}
          {task.remaining_unallocated > 0 && (
            <span className="ml-2 text-sm font-semibold text-red-500">
              = {task.remaining_unallocated} remaining
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {!isFullyCovered && (
            <button
              onClick={onRedirect}
              className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700"
            >
              Confirm Redirect →
            </button>
          )}
          {task.coverage_candidates.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gray-500 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50"
            >
              {expanded ? 'Hide' : `${task.coverage_candidates.length} available`}
            </button>
          )}
        </div>
      </div>

      {expanded && task.coverage_candidates.length > 0 && (
        <div className="mt-3 ml-5 space-y-1.5">
          {task.coverage_candidates.map((c) => (
            <div key={c.person_id} className="flex items-center gap-3 text-sm">
              <span className="font-medium text-gray-700 w-28">{c.name}</span>
              <span className="text-gray-500">{c.hours_on_task} hrs/wk on this task</span>
              {c.spare_hours > 0 ? (
                <span className="text-emerald-600 font-medium">{c.spare_hours} spare hrs</span>
              ) : (
                <span className="text-gray-400">0 spare hrs</span>
              )}
              {c.reducible_tasks.length > 0 && (
                <span className="text-xs text-gray-400">
                  could reduce: {c.reducible_tasks.map((rt) => rt.task_name).join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RedirectModal({ taskId, taskName, absentPersonName, candidates, weekStart, tasks, onClose, onDone }) {
  const [form, setForm] = useState({
    covering_person_id: candidates[0]?.person_id || '',
    redirected_from_task_id: '',
    hours: '',
    confirmed_by: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedCandidate = candidates.find((c) => c.person_id === form.covering_person_id)

  const submit = async () => {
    if (!form.covering_person_id) { setError('Select a person'); return }
    if (!form.hours || Number(form.hours) <= 0) { setError('Enter valid hours'); return }
    if (!form.confirmed_by.trim()) { setError('Manager name required'); return }
    setSaving(true)
    try {
      await api.createReallocation({
        week_start_date: weekStart,
        covering_person_id: form.covering_person_id,
        task_id: taskId,
        redirected_from_task_id: form.redirected_from_task_id || null,
        hours: Number(form.hours),
        confirmed_by: form.confirmed_by.trim(),
      })
      onDone()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={`Redirect Coverage — ${taskName}`} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        Covering for <strong>{absentPersonName}</strong>'s absence
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Who covers</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.covering_person_id}
            onChange={(e) => setForm({ ...form, covering_person_id: e.target.value, redirected_from_task_id: '' })}
          >
            {candidates.map((c) => (
              <option key={c.person_id} value={c.person_id}>
                {c.name} ({c.hours_on_task} hrs on task, {c.spare_hours} spare)
              </option>
            ))}
          </select>
        </div>

        {selectedCandidate && selectedCandidate.reducible_tasks.length > 0 && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">Reduce hours from (optional)</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={form.redirected_from_task_id}
              onChange={(e) => setForm({ ...form, redirected_from_task_id: e.target.value })}
            >
              <option value="">— From spare capacity —</option>
              {selectedCandidate.reducible_tasks.map((rt) => (
                <option key={rt.task_id} value={rt.task_id}>
                  {rt.task_name} ({rt.hours_per_week} hrs/wk)
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-600 mb-1">Hours to redirect</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
            placeholder="e.g. 4"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Confirmed by (manager name)</label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.confirmed_by}
            onChange={(e) => setForm({ ...form, confirmed_by: e.target.value })}
            placeholder="Manager name"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={saving}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Confirming…' : 'Confirm Redirect'}
          </button>
          <button onClick={onClose} className="text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

function MakeupModal({ absentPersonId, absentPersonName, tasks, onClose, onDone }) {
  const [form, setForm] = useState({
    task_id: '',
    makeup_week_start_date: '',
    hours: '',
    note: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.task_id) { setError('Select a task'); return }
    if (!form.makeup_week_start_date) { setError('Select makeup week'); return }
    if (!form.hours || Number(form.hours) <= 0) { setError('Enter valid hours'); return }
    setSaving(true)
    try {
      await api.createMakeup({
        absent_person_id: absentPersonId,
        task_id: form.task_id,
        makeup_week_start_date: form.makeup_week_start_date,
        hours: Number(form.hours),
        note: form.note || null,
      })
      onDone()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={`Log Makeup Hours — ${absentPersonName}`} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        Record hours that <strong>{absentPersonName}</strong> will make up in a future week.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Task</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.task_id}
            onChange={(e) => setForm({ ...form, task_id: e.target.value })}
          >
            <option value="">Select task…</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Makeup week (Monday)</label>
          <input
            type="date"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.makeup_week_start_date}
            onChange={(e) => setForm({ ...form, makeup_week_start_date: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Hours</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
            placeholder="e.g. 4"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Note (optional)</label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Any context"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={saving}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DeleteReallocationButton({ id, onDone }) {
  const [del, setDel] = useState(false)
  const handleDelete = async () => {
    if (!confirm('Remove this confirmed redirect?')) return
    setDel(true)
    await api.deleteReallocation(id)
    onDone()
  }
  return (
    <button onClick={handleDelete} disabled={del} className="text-xs text-red-400 hover:text-red-600 ml-2">
      ×
    </button>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
