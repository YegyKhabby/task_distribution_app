import { useEffect, useState } from 'react'
import { api } from '../api'

function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatLong(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function DeskbirdAttendance() {
  const [startDate, setStartDate] = useState(toDateStr(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getDeskbirdAttendance(startDate, 7)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [startDate])

  const totalMissing = data ? data.days.reduce((sum, day) => sum + day.missing_bookings.length, 0) : 0
  const duplicateGroups = data?.warnings?.duplicate_first_names || {}
  const hasDuplicateWarnings = Object.keys(duplicateGroups).length > 0

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Deskbird/Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Scheduled office days from the app, compared against Deskbird bookings for today and the next workdays.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm min-w-[220px]">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Missing bookings</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{totalMissing}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
        <label className="text-sm text-gray-600">Start date:</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border border-gray-300 rounded-md text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {data?.sync?.available === false && (
          <span className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1">
            No Deskbird sync uploaded yet.
          </span>
        )}
      </div>

      {data?.sync?.fetched_at && (
        <div className="bg-gray-50 border border-gray-200 text-gray-500 text-sm px-4 py-3 rounded-lg">
          Info updated at {new Date(data.sync.fetched_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {hasDuplicateWarnings && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          Duplicate first names detected. These people should be written exactly like Deskbird in TaskDist:
          {' '}
          {Object.values(duplicateGroups).flat().join(', ')}
        </div>
      )}

      {loading && <div className="text-center text-gray-400 py-16 text-sm">Loading…</div>}
      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {!loading && !error && data && (
        <div className="space-y-4">
          {data.days.map((day) => (
            <div key={day.date} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-gray-900">{formatLong(day.date)}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {day.expected_office.length} expected in office, {day.actual_deskbird.length} found in Deskbird
                  </div>
                </div>
                <div className={`text-sm font-medium px-3 py-1 rounded-full ${
                  day.missing_bookings.length
                    ? 'bg-red-100 text-red-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {day.missing_bookings.length ? `${day.missing_bookings.length} missing` : 'All booked'}
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-4 px-4 py-4">
                <section>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">Expected Office</h2>
                  <div className="flex flex-wrap gap-2">
                    {day.expected_office.length ? day.expected_office.map((name) => (
                      <span key={name} className="inline-flex bg-indigo-50 text-indigo-700 rounded-full px-3 py-1 text-sm">
                        {name}
                      </span>
                    )) : <span className="text-sm text-gray-400">None</span>}
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">Missing Bookings</h2>
                  <div className="flex flex-wrap gap-2">
                    {day.missing_bookings.length ? day.missing_bookings.map((name) => (
                      <span key={name} className="inline-flex bg-red-50 text-red-700 rounded-full px-3 py-1 text-sm">
                        {name}
                      </span>
                    )) : <span className="text-sm text-gray-400">None</span>}
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">In Deskbird</h2>
                  <div className="flex flex-wrap gap-2">
                    {day.actual_deskbird.length ? day.actual_deskbird.map((name) => (
                      <span key={name} className="inline-flex bg-emerald-50 text-emerald-700 rounded-full px-3 py-1 text-sm">
                        {name}
                      </span>
                    )) : <span className="text-sm text-gray-400">None</span>}
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">Absent</h2>
                  <div className="flex flex-wrap gap-2">
                    {day.absent_people.length ? day.absent_people.map((name) => (
                      <span key={name} className="inline-flex bg-slate-100 text-slate-700 rounded-full px-3 py-1 text-sm">
                        {name}
                      </span>
                    )) : <span className="text-sm text-gray-400">None</span>}
                  </div>
                </section>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
