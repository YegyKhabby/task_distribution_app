import { useState, useEffect } from 'react'
import { api } from '../api'

const DAYS = [
  { num: 1, label: 'Mon' },
  { num: 2, label: 'Tue' },
  { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' },
  { num: 5, label: 'Fri' },
]

function WeeklyTable({ people, scheduleMap }) {
  const active = people.filter(p => p.active)
  if (active.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8 shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">Weekly Schedule</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2 font-medium text-gray-500 w-32">Person</th>
              {DAYS.map(d => (
                <th key={d.num} className="text-center px-2 py-2 font-medium text-gray-500 w-20">{d.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {active.map((p, idx) => {
              const sched = scheduleMap[p.id] || {}
              return (
                <tr key={p.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-1.5 font-medium text-gray-800 whitespace-nowrap">{p.name}</td>
                  {DAYS.map(d => {
                    const entry = sched[d.num]
                    if (!entry) {
                      return (
                        <td key={d.num} className="px-2 py-1.5 text-center text-gray-300 text-xs">—</td>
                      )
                    }
                    const isHome = entry.location === 'home'
                    return (
                      <td key={d.num} className="px-2 py-1.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          isHome
                            ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                            : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                        }`}>
                          <span>{isHome ? 'Home' : 'Office'}</span>
                          <span className="font-normal opacity-60">{entry.hours}h</span>
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Team() {
  const [people, setPeople] = useState([])
  const [scheduleMap, setScheduleMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const all = await api.getPeople()
    setPeople(all)
    const allSchedules = await api.getAllSchedules()
    const map = {}
    for (const row of allSchedules) {
      if (!map[row.person_id]) map[row.person_id] = {}
      map[row.person_id][row.day_of_week] = { hours: row.hours, location: row.location || 'office' }
    }
    setScheduleMap(map)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const startEdit = (p) => { setEditing(p.id); setName(p.name); setError('') }

  const save = async () => {
    if (!name.trim()) { setError('Name required'); return }
    try {
      await api.updatePerson(editing, { name: name.trim() })
      setEditing(null)
      load()
    } catch (e) { setError(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Remove this person? Their schedule and assignments will also be deleted.')) return
    await api.deletePerson(id)
    load()
  }

  const toggle = async (p) => {
    await api.updatePerson(p.id, { active: !p.active })
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Team</h1>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <>
          <WeeklyTable people={people} scheduleMap={scheduleMap} />

          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                {editing === p.id ? (
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <input
                      className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                    />
                    {error && <span className="text-red-500 text-xs">{error}</span>}
                    <button onClick={save} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700">Save</button>
                    <button onClick={() => setEditing(null)} className="text-gray-500 px-3 py-1.5 rounded-md text-sm hover:bg-gray-100">Cancel</button>
                  </div>
                ) : (
                  <>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div className="flex-1">
                      <span className={`font-medium ${p.active ? '' : 'text-gray-400 line-through'}`}>{p.name}</span>
                      {p.weekly_hours > 0 && (
                        <span className="ml-3 text-sm text-gray-400">{p.weekly_hours} hrs/week</span>
                      )}
                    </div>
                    <button onClick={() => toggle(p)} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
                      {p.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => startEdit(p)} className="text-xs px-2 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50">Edit</button>
                    <button onClick={() => remove(p.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">Remove</button>
                  </>
                )}
              </div>
            ))}
            {people.length === 0 && (
              <p className="px-5 py-8 text-center text-gray-400">No team members yet. Add people from My Schedule.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
