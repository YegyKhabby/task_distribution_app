import { useState, useEffect } from 'react'
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns'
import { api } from '../api'

function getMonday(d = new Date()) {
  return startOfWeek(d, { weekStartsOn: 1 })
}

function fmtDate(d) {
  return format(d, 'yyyy-MM-dd')
}

function fmtDisplay(d) {
  return format(new Date(d + 'T12:00:00'), 'MMM d, yyyy')
}

export default function Impact() {
  const [weekStart, setWeekStart] = useState(getMonday())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [people, setPeople] = useState([])
  const [tasks, setTasks] = useState([])
  const [redirectForm, setRedirectForm] = useState(null) // { taskId, taskName, absentPersonName, candidates }
  const [makeupForm, setMakeupForm] = useState(null) // { absentPersonId, absentPersonName }
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.getPeople(), api.getTasks()]).then(([p, t]) => {
      setPeople(p.filter((x) => x.active))
      setTasks(t)
    })
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.getImpact(fmtDate(weekStart))
      setData(res)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [weekStart])

  const prevWeek = () => setWeekStart((w) => subWeeks(w, 1))
  const nextWeek = () => setWeekStart((w) => addWeeks(w, 1))

  const totalUnallocated = data?.absent_people?.reduce(
    (s, ap) => s + ap.unallocated_tasks.reduce((ts, t) => ts + t.remaining_unallocated, 0),
    0
  ) ?? 0

  return (
    <div>
      {/* Week selector */}
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Impact</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
            ←
          </button>
          <span className="text-sm font-medium text-gray-800 min-w-48 text-center">
            {format(weekStart, 'MMM d')} – {format(new Date(weekStart.getTime() + 4 * 86400000), 'MMM d, yyyy')}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
            →
          </button>
        </div>
        <button onClick={load} className="text-sm text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {data && !loading && (
        <>
          {data.absent_people.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">✓</p>
              <p className="text-lg font-medium">No absences this week</p>
              <p className="text-sm mt-1">
                Week type: <strong>{data.week_type}</strong>
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-gray-500">Week type: <strong>{data.week_type}</strong></span>
                {totalUnallocated > 0 && (
                  <span className="bg-red-100 text-red-700 text-sm font-semibold px-3 py-1 rounded-full">
                    {totalUnallocated.toFixed(1)} hrs unallocated
                  </span>
                )}
              </div>

              {data.absent_people.map((ap) => (
                <AbsentPersonCard
                  key={ap.person_id}
                  ap={ap}
                  weekStart={fmtDate(weekStart)}
                  tasks={tasks}
                  onRedirect={(taskId, taskName, candidates) =>
                    setRedirectForm({ taskId, taskName, candidates, absentPersonName: ap.person_name })
                  }
                  onMakeup={() => setMakeupForm({ absentPersonId: ap.person_id, absentPersonName: ap.person_name })}
                  onRefresh={load}
                />
              ))}
            </>
          )}

          {/* Confirmed reallocations list */}
          {data.confirmed_reallocations?.length > 0 && (
            <div className="mt-6">
              <h2 className="text-base font-semibold text-gray-700 mb-2">Confirmed Redirects This Week</h2>
              <div className="space-y-1">
                {data.confirmed_reallocations.map((r) => (
                  <div key={r.id} className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm flex items-center gap-3">
                    <span className="text-green-700 font-medium">{r.covering_person?.name}</span>
                    <span className="text-gray-500">covers</span>
                    <span className="font-medium">{r.task?.name}</span>
                    <span className="text-gray-500">— {r.hours} hrs</span>
                    {r.redirected_from?.name && (
                      <span className="text-gray-400 text-xs">(from {r.redirected_from.name})</span>
                    )}
                    <span className="ml-auto text-xs text-gray-400">by {r.confirmed_by}</span>
                    <DeleteReallocationButton id={r.id} onDone={load} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Redirect modal */}
      {redirectForm && (
        <RedirectModal
          {...redirectForm}
          weekStart={fmtDate(weekStart)}
          tasks={tasks}
          onClose={() => setRedirectForm(null)}
          onDone={() => { setRedirectForm(null); load() }}
        />
      )}

      {/* Makeup modal */}
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

function AbsentPersonCard({ ap, weekStart, tasks, onRedirect, onMakeup, onRefresh }) {
  const totalUnallocated = ap.unallocated_tasks.reduce((s, t) => s + t.remaining_unallocated, 0)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <div>
          <span className="font-semibold text-gray-900">{ap.person_name}</span>
          <span className="ml-2 text-sm text-gray-500">
            out {ap.absent_days} day{ap.absent_days !== 1 ? 's' : ''} this week
          </span>
        </div>
        {totalUnallocated > 0 ? (
          <span className="ml-auto text-sm font-semibold text-red-600 bg-red-50 px-3 py-1 rounded-full">
            {totalUnallocated.toFixed(1)} hrs unallocated
          </span>
        ) : (
          <span className="ml-auto text-sm font-semibold text-green-600 bg-green-50 px-3 py-1 rounded-full">
            Fully covered
          </span>
        )}
        <button
          onClick={onMakeup}
          className="text-xs text-indigo-600 border border-indigo-200 px-2 py-1 rounded hover:bg-indigo-50"
        >
          Log Makeup
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {ap.unallocated_tasks.map((t) => (
          <TaskImpactRow
            key={t.task_id}
            task={t}
            onRedirect={() => onRedirect(t.task_id, t.task_name, t.coverage_candidates)}
          />
        ))}
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
