import { useState, useEffect } from 'react'
import { api } from '../api'

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
  const base = `flex-1 min-w-0 p-2 min-h-[110px] ${otherMonth ? 'opacity-40' : ''}`

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

  useEffect(() => {
    api.getPeople().then(all => {
      const active = all.filter(p => p.active !== false)
      setPeople(active)
      if (active.length > 0) setPersonId(active[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(`week_start_${year}_${month}`) || '1', 10)
    setWeekStart(stored)
  }, [year, month])

  useEffect(() => {
    if (!personId) return
    setLoading(true)
    setError(null)
    setCalData(null)
    api.getCalendar(year, month, personId, fromWeek, weekStart)
      .then(setCalData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [year, month, personId, fromWeek, weekStart])

  function changeWeekStart(w) {
    localStorage.setItem(`week_start_${year}_${month}`, String(w))
    setWeekStart(w)
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

        <a
          href={api.getCalendarExportUrl(year, month, weekStart)}
          download
          className="ml-auto px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
        >
          Download Excel
        </a>
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
