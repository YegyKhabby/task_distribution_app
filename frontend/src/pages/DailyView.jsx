import { useState, useEffect } from 'react'
import { api } from '../api'

function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

function stepDay(dateStr, direction) {
  const d = new Date(dateStr + 'T00:00:00')
  do {
    d.setDate(d.getDate() + direction)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return toDateStr(d)
}

function formatLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatShort(dateStr, direction) {
  const d = new Date(dateStr + 'T00:00:00')
  do {
    d.setDate(d.getDate() + direction)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function DailyView() {
  const today = toDateStr(new Date())
  const [date, setDate] = useState(() => isWeekend(today) ? stepDay(today, 1) : today)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isWeekend(date)) {
      setData(null)
      return
    }
    const [y, m] = date.split('-')
    const weekStart = parseInt(localStorage.getItem(`week_start_${y}_${parseInt(m, 10)}`) || '1', 10)
    setLoading(true)
    setError(null)
    api.getDayView(date, weekStart)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [date])

  const prevDate = stepDay(date, -1)
  const nextDate = stepDay(date, 1)
  const [_y, _m] = date.split('-')
  const weekStartForDate = parseInt(localStorage.getItem(`week_start_${_y}_${parseInt(_m, 10)}`) || '1', 10)

  return (
    <div className="max-w-2xl mx-auto">
      {/* Title + download */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Daily View</h1>
        {data && !data.is_weekend && (
          <a
            href={api.getDayViewExportUrl(date, weekStartForDate)}
            download
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
          >
            Download Excel
          </a>
        )}
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-between mb-5 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <button
          onClick={() => setDate(prevDate)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          ← {formatShort(date, -1)}
        </button>
        <div className="text-center">
          <div className="font-semibold text-gray-900">{formatLabel(date)}</div>
          {data && !data.is_weekend && (
            <div className="text-xs text-gray-500 mt-0.5">
              Week {data.week_number} · {data.total_hours}h total across team
            </div>
          )}
        </div>
        <button
          onClick={() => setDate(nextDate)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {formatShort(date, 1)} →
        </button>
      </div>

      {/* Date picker */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm text-gray-600">Jump to:</label>
        <input
          type="date"
          value={date}
          onChange={e => {
            const v = e.target.value
            if (!v) return
            setDate(isWeekend(v) ? stepDay(v, 1) : v)
          }}
          className="border border-gray-300 rounded-md text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* Content */}
      {loading && (
        <div className="text-center text-gray-400 py-16 text-sm">Loading…</div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {data.tasks.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">No tasks scheduled for this day.</div>
          ) : (
            <div className="space-y-3">
              {data.tasks.map(task => (
                <div key={task.task_id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    {task.task_color && (
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: task.task_color }}
                      />
                    )}
                    <span className="font-semibold text-gray-900 flex-1">{task.task_name}</span>
                    {task.responsible_person && (
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                        {task.responsible_person}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-gray-700">{task.total_hours}h total</span>
                  </div>
                  <div className="flex flex-wrap gap-2 px-4 py-3">
                    {task.people.map(p => (
                      <span
                        key={p.person_name}
                        className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-sm"
                      >
                        <span className="font-medium text-gray-800">{p.person_name}</span>
                        <span className="text-gray-500">{p.hours}h</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.absent_people && data.absent_people.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
              <span className="font-medium">Absent today:</span> {data.absent_people.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
