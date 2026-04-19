import { useState, useEffect } from 'react'
import { format, addDays } from 'date-fns'
import { api } from '../api'
import XLSX from 'xlsx-js-style'

function fmtDate(d) {
  return format(new Date(d + 'T12:00:00'), 'MMM d')
}

function fmtWeekRange(weekStart) {
  const start = new Date(weekStart + 'T12:00:00')
  const end = new Date(start.getTime() + 4 * 86400000)
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

function weekIndexInMonth(mondayDate) {
  const firstDay = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), 1)
  const dow = firstDay.getDay()
  const daysToMon = dow === 1 ? 0 : (8 - dow) % 7
  const firstMonday = new Date(firstDay)
  firstMonday.setDate(firstDay.getDate() + daysToMon)
  const diffDays = Math.round((mondayDate - firstMonday) / 86400000)
  return Math.floor(diffDays / 7) + 1
}

function upcomingWeeks(n = 10) {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const dow = today.getDay()
  const daysToThisMon = dow === 0 ? -6 : 1 - dow
  let mon = new Date(today)
  mon.setDate(today.getDate() + daysToThisMon)

  const weeks = []
  while (weeks.length < n) {
    const monStr = format(mon, 'yyyy-MM-dd')
    const friStr = format(new Date(mon.getTime() + 4 * 86400000), 'yyyy-MM-dd')
    const isCurrentWeek = monStr <= todayStr && todayStr <= friStr

    // Always skip current week — already distributed
    if (isCurrentWeek) {
      mon = new Date(mon); mon.setDate(mon.getDate() + 7); continue
    }

    const weekIdx = weekIndexInMonth(mon)
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
    weeks.push({
      value: monStr,
      label: `Week ${weekIdx}  ·  ${format(mon, 'MMM d')} – ${format(fri, 'MMM d, yyyy')}`,
    })
    mon = new Date(mon); mon.setDate(mon.getDate() + 7)
  }
  return weeks
}

export default function Impact() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [holidays, setHolidays] = useState([])
  const [tasks, setTasks] = useState([])
  const [selectedPersonId, setSelectedPersonId] = useState(null)
  const [makeupEntries, setMakeupEntries] = useState([])
  const [redirectForm, setRedirectForm] = useState(null)
  const [carryForwardForm, setCarryForwardForm] = useState(null)
  const [holidayModalOpen, setHolidayModalOpen] = useState(false)

  useEffect(() => {
    api.getTasks().then(setTasks)
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const now = new Date()
      const weekStartOffset = parseInt(localStorage.getItem(`week_start_${now.getFullYear()}_${now.getMonth() + 1}`) || '1', 10)
      const [res, holidayRows] = await Promise.all([
        api.getImpactUpcoming(today, weekStartOffset),
        api.getImpactHolidays(today),
      ])
      setData(res)
      setHolidays(holidayRows)
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

  useEffect(() => {
    if (!selectedPersonId) return
    api.getMakeup(selectedPersonId).then(setMakeupEntries).catch(() => {})
  }, [selectedPersonId])

  const exportToExcel = async () => {
    const [reallocations, makeupAll] = await Promise.all([
      api.getReallocations(),
      api.getMakeup(),
    ])

    // Sheet 1: Coverage log
    const coverageData = (reallocations || []).map((r) => [
      r.week_start_date,
      r.covering_person?.name ?? r.covering_person_id,
      r.task?.name ?? r.task_id,
      r.hours,
      r.redirected_from?.name ?? '',
      r.confirmed_by ?? '',
    ])
    const coverageRows = [
      ['Week', 'Covering person', 'Task', 'Hours', 'Redirected from task', 'Confirmed by'],
      ...coverageData,
      ['', '', 'Total', null, '', ''],
    ]

    // Sheet 2: Carry-forward log
    const carryData = (makeupAll || []).map((m) => [
      m.makeup_week_start_date,
      m.person?.name ?? m.absent_person_id,
      m.task?.name ?? m.task_id,
      m.hours,
      m.note ?? '',
    ])
    const carryRows = [
      ['Target week', 'Absent person', 'Task', 'Hours', 'Note'],
      ...carryData,
      ['', '', 'Total', null, ''],
    ]

    const wb = XLSX.utils.book_new()
    const coverageSheet = XLSX.utils.aoa_to_sheet(coverageRows)
    coverageSheet['D' + coverageRows.length] = { t: 'n', f: `SUM(D2:D${coverageRows.length - 1})` }
    const carrySheet = XLSX.utils.aoa_to_sheet(carryRows)
    carrySheet['D' + carryRows.length] = { t: 'n', f: `SUM(D2:D${carryRows.length - 1})` }
    XLSX.utils.book_append_sheet(wb, coverageSheet, 'Coverage log')
    XLSX.utils.book_append_sheet(wb, carrySheet, 'Carry forward')
    XLSX.writeFile(wb, 'impact_log.xlsx')
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Impact</h1>
        <button onClick={() => setHolidayModalOpen(true)} className="text-sm text-amber-700 border border-amber-300 rounded px-3 py-1 hover:bg-amber-50">
          + Holiday
        </button>
        <button onClick={exportToExcel} className="ml-auto text-sm text-gray-600 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50">
          Download log
        </button>
        <button onClick={load} className="text-sm text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {data && !loading && (
        <>
          {holidays.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Team Holidays</h2>
              <div className="flex flex-wrap gap-2">
                {holidays.map((h) => (
                  <div key={`${h.date}:${h.name}`} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                    <span className="font-medium text-amber-800">{h.name}</span>
                    <span className="text-amber-700">{fmtDate(h.date)}</span>
                    <button
                      onClick={async () => {
                        await api.deleteImpactHoliday(h.date)
                        load()
                      }}
                      className="text-xs text-amber-700 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.persons.length === 0 ? (
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
                makeupEntries={makeupEntries}
                onRedirect={(taskId, taskName, candidates, weekStart) =>
                  setRedirectForm({ taskId, taskName, candidates, absentPersonName: selectedPerson.person_name, weekStart })
                }
                onCarryForward={(task) =>
                  setCarryForwardForm({ absentPersonId: selectedPerson.person_id, absentPersonName: selectedPerson.person_name, task: task || null })
                }
                onRefresh={() => {
                  load()
                  api.getMakeup(selectedPersonId).then(setMakeupEntries).catch(() => {})
                }}
              />
            )}
            </>
          )}
        </>
      )}

      {redirectForm && (
        <RedirectModal
          {...redirectForm}
          tasks={tasks}
          onClose={() => setRedirectForm(null)}
          onDone={() => { setRedirectForm(null); load() }}
        />
      )}

      {carryForwardForm && (
        <CarryForwardModal
          {...carryForwardForm}
          tasks={tasks}
          onClose={() => setCarryForwardForm(null)}
          onDone={() => { setCarryForwardForm(null); load() }}
        />
      )}

      {holidayModalOpen && (
        <HolidayModal
          onClose={() => setHolidayModalOpen(false)}
          onDone={() => { setHolidayModalOpen(false); load() }}
        />
      )}
    </div>
  )
}

function HolidayModal({ onClose, onDone }) {
  const [form, setForm] = useState({
    date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    name: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.date) { setError('Select a date'); return }
    setSaving(true)
    setError('')
    try {
      await api.createImpactHoliday({
        date: form.date,
        name: form.name.trim() || null,
      })
      onDone()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Add Team Holiday" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        This marks everyone absent for a weekday holiday, so Impact, Calendar, Daily View, and Actual copy all use the same date.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Public holiday"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={saving}
            className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save holiday'}
          </button>
          <button onClick={onClose} className="text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

function PersonView({ person, tasks, makeupEntries, onRedirect, onCarryForward, onRefresh }) {
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
          onClick={() => onCarryForward(null)}
          className="ml-auto text-xs text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-50"
        >
          + Carry forward
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
            onCarryForward={onCarryForward}
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
                <DeleteReallocationButton id={r.id} onDone={onRefresh} />
              </div>
            ))}
          </div>
        </div>
      )}

      {makeupEntries.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Carried Forward</h3>
          <div className="space-y-1">
            {makeupEntries.map((m) => (
              <div key={m.id} className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-sm flex items-center gap-3">
                <span className="text-emerald-700 font-medium">{person.person_name}</span>
                <span className="text-gray-500">will do</span>
                <span className="font-medium">{m.task?.name || m.task_id}</span>
                <span className="text-gray-500">— {m.hours} hrs</span>
                <span className="text-xs text-gray-400">week of {fmtDate(m.makeup_week_start_date)}</span>
                {m.note && <span className="text-xs text-gray-400 italic">{m.note}</span>}
                <DeleteMakeupButton id={m.id} onDone={onRefresh} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WeekSection({ week, onRedirect, onCarryForward }) {
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
              onCarryForward={() => onCarryForward(t)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function TaskImpactRow({ task, onRedirect, onCarryForward }) {
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
          {!isFullyCovered && (
            <button
              onClick={onCarryForward}
              className="text-xs border border-emerald-300 text-emerald-700 px-3 py-1 rounded-lg hover:bg-emerald-50"
            >
              Carry forward →
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
  const weekOptions = upcomingWeeks()
  const defaultWeek = weekOptions.find(w => w.value >= weekStart)?.value || weekOptions[0]?.value || weekStart

  const initSelections = () => Object.fromEntries(candidates.map(c => [c.person_id, { checked: false, hours: '' }]))

  const [weekDate, setWeekDate] = useState(defaultWeek)
  const [selections, setSelections] = useState(initSelections)
  const [confirmed, setConfirmed] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleCheck = (pid) => setSelections(s => ({ ...s, [pid]: { ...s[pid], checked: !s[pid].checked } }))
  const setHours = (pid, val) => setSelections(s => ({ ...s, [pid]: { ...s[pid], hours: val } }))

  const checkedCandidates = candidates.filter(c => selections[c.person_id]?.checked)

  const submit = async () => {
    if (checkedCandidates.length === 0) { setError('Select at least one person'); return }
    const invalid = checkedCandidates.find(c => !selections[c.person_id]?.hours || Number(selections[c.person_id].hours) <= 0)
    if (invalid) { setError(`Enter hours for ${invalid.name}`); return }
    setSaving(true)
    setError('')
    try {
      for (const c of checkedCandidates) {
        await api.createReallocation({
          week_start_date: weekDate,
          covering_person_id: c.person_id,
          task_id: taskId,
          redirected_from_task_id: null,
          hours: Number(selections[c.person_id].hours),
          confirmed_by: '',
        })
        setConfirmed(prev => [...prev, { name: c.name, hours: selections[c.person_id].hours, weekDate }])
      }
      setSelections(initSelections())
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <Modal title={`Redirect Coverage — ${taskName}`} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        Covering for <strong>{absentPersonName}</strong>'s absence
      </p>

      {/* Confirmed so far */}
      {confirmed.length > 0 && (
        <div className="mb-4 space-y-1">
          {confirmed.map((c, i) => (
            <div key={i} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm">
              <span className="text-green-700 font-medium">{c.name}</span>
              <span className="text-gray-500">— {c.hours} hrs</span>
              <span className="text-xs text-gray-400">{weekOptions.find(w => w.value === c.weekDate)?.label ?? c.weekDate}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Week</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={weekDate}
            onChange={e => setWeekDate(e.target.value)}
          >
            {weekOptions.map(w => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-2">Who covers — select people and set hours</label>
          <div className="space-y-2">
            {candidates.map(c => {
              const sel = selections[c.person_id]
              return (
                <div key={c.person_id} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sel.checked}
                    onChange={() => toggleCheck(c.person_id)}
                    className="mt-1 w-4 h-4 rounded text-indigo-600 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${sel.checked ? 'text-gray-800' : 'text-gray-500'}`}>{c.name}</span>
                      <span className="text-xs text-gray-400">{c.hours_on_task} hrs on task</span>
                      {c.spare_hours > 0
                        ? <span className="text-xs text-emerald-600">{c.spare_hours} spare</span>
                        : <span className="text-xs text-gray-400">0 spare</span>
                      }
                    </div>
                    {c.reducible_tasks.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">could reduce: {c.reducible_tasks.map(r => r.task_name).join(', ')}</p>
                    )}
                  </div>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    placeholder="hrs"
                    disabled={!sel.checked}
                    value={sel.hours}
                    onChange={e => setHours(c.person_id, e.target.value)}
                    className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-30 flex-shrink-0"
                  />
                </div>
              )
            })}
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={saving || checkedCandidates.length === 0}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Confirming…' : 'Confirm'}
          </button>
          {confirmed.length > 0 && (
            <button onClick={onDone} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
              Done
            </button>
          )}
          <button onClick={onClose} className="text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CarryForwardModal({ absentPersonId, absentPersonName, task, tasks, onClose, onDone }) {
  const weekOptions = upcomingWeeks()
  // task may be null (opened from the top-level "+ Carry forward" button)
  const [form, setForm] = useState({
    task_id: task?.task_id || '',
    makeup_week_start_date: weekOptions[0]?.value || '',
    hours: task ? String(task.raw_unallocated_hours) : '',
    note: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.task_id) { setError('Select a task'); return }
    if (!form.makeup_week_start_date) { setError('Select a target week'); return }
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
    <Modal title={task ? `Carry Forward — ${task.task_name}` : `Carry Forward — ${absentPersonName}`} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        <strong>{absentPersonName}</strong> will do this task themselves in a future week.
      </p>

      <div className="space-y-4">
        {!task && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">Task</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              value={form.task_id}
              onChange={(e) => setForm({ ...form, task_id: e.target.value })}
            >
              <option value="">Select task…</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-600 mb-1">Target week</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            value={form.makeup_week_start_date}
            onChange={(e) => setForm({ ...form, makeup_week_start_date: e.target.value })}
          >
            {weekOptions.map(w => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Hours</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
            placeholder="e.g. 4"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Note (optional)</label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
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
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirm'}
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
    <button onClick={handleDelete} disabled={del} className="text-xs text-red-400 hover:text-red-600 ml-auto">
      ×
    </button>
  )
}

function DeleteMakeupButton({ id, onDone }) {
  const [del, setDel] = useState(false)
  const handleDelete = async () => {
    if (!confirm('Remove this carry-forward entry?')) return
    setDel(true)
    await api.deleteMakeup(id)
    onDone()
  }
  return (
    <button onClick={handleDelete} disabled={del} className="text-xs text-red-400 hover:text-red-600 ml-auto">
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
