import { useState, useEffect } from 'react'
import { api } from '../api'

const DAYS = [
  { num: 1, label: 'Monday' },
  { num: 2, label: 'Tuesday' },
  { num: 3, label: 'Wednesday' },
  { num: 4, label: 'Thursday' },
  { num: 5, label: 'Friday' },
]

export default function Setup() {
  const [people, setPeople] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [schedule, setSchedule] = useState(emptySchedule())
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Add new person
  const [newName, setNewName] = useState('')
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => { api.getPeople().then(setPeople) }, [])

  const selectPerson = async (id) => {
    setSelectedId(id)
    setSaved(false)
    if (!id) { setSchedule(emptySchedule()); return }
    setLoadingSchedule(true)
    const rows = await api.getSchedule(id)
    const s = emptySchedule()
    for (const r of rows) {
      const d = s.find((x) => x.day === r.day_of_week)
      if (d) { d.checked = true; d.hours = r.hours; d.location = r.location || 'office' }
    }
    setSchedule(s)
    setLoadingSchedule(false)
  }

  const addPerson = async () => {
    if (!newName.trim()) return
    try {
      const p = await api.createPerson({ name: newName.trim() })
      const updated = await api.getPeople()
      setPeople(updated)
      setNewName('')
      setAddingNew(false)
      selectPerson(p.id)
    } catch (e) {
      alert('Could not add person: ' + e.message)
    }
  }

  const toggleDay = (day) => {
    setSchedule((s) =>
      s.map((d) => d.day === day ? { ...d, checked: !d.checked, hours: d.checked ? 0 : d.hours || 4 } : d)
    )
  }

  const setHours = (day, val) => {
    setSchedule((s) =>
      s.map((d) => d.day === day ? { ...d, hours: val } : d)
    )
  }

  const setLocation = (day, loc) => {
    setSchedule((s) =>
      s.map((d) => d.day === day ? { ...d, location: loc } : d)
    )
  }

  const save = async () => {
    if (!selectedId) { setError('Select a person first'); return }
    setSaving(true)
    setError('')
    try {
      const entries = schedule
        .filter((d) => d.checked && d.hours > 0)
        .map((d) => ({ person_id: selectedId, day_of_week: d.day, hours: Number(d.hours), location: d.location }))
      await api.saveSchedule(selectedId, entries)
      setSaved(true)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  const selectedPerson = people.find((p) => p.id === selectedId)
  const totalHours = schedule.filter((d) => d.checked).reduce((s, d) => s + Number(d.hours || 0), 0)

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Schedule</h1>

      {/* Person picker */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">Who are you?</label>
        <div className="flex gap-2">
          <select
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={selectedId}
            onChange={(e) => selectPerson(e.target.value)}
          >
            <option value="">Select your name…</option>
            {people.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => setAddingNew(true)}
            className="text-sm px-3 py-2 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
          >
            + New
          </button>
        </div>

        {addingNew && (
          <div className="flex gap-2 mt-3">
            <input
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Your full name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPerson()}
              autoFocus
            />
            <button onClick={addPerson} className="bg-indigo-600 text-white px-3 py-2 rounded-md text-sm hover:bg-indigo-700">
              Add
            </button>
            <button onClick={() => setAddingNew(false)} className="text-gray-500 px-3 py-2 rounded-md text-sm hover:bg-gray-100">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Schedule editor */}
      {selectedId && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">
              Work days — <span className="text-indigo-600">{selectedPerson?.name}</span>
            </h2>
            {totalHours > 0 && (
              <span className="text-sm font-medium text-gray-500">{totalHours} hrs/week total</span>
            )}
          </div>

          {loadingSchedule ? (
            <p className="text-gray-400 text-sm">Loading schedule…</p>
          ) : (
            <div className="space-y-3">
              {DAYS.map((d) => {
                const entry = schedule.find((s) => s.day === d.num)
                return (
                  <div key={d.num} className="flex items-center gap-4">
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={entry.checked}
                        onChange={() => toggleDay(d.num)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-400"
                      />
                      <span className={`text-sm font-medium w-24 ${entry.checked ? 'text-gray-800' : 'text-gray-400'}`}>
                        {d.label}
                      </span>
                    </label>
                    {entry.checked ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0.5}
                          max={12}
                          step={0.5}
                          value={entry.hours}
                          onChange={(e) => setHours(d.num, e.target.value)}
                          className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <span className="text-sm text-gray-400">hrs</span>
                        <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs font-medium">
                          <button
                            onClick={() => setLocation(d.num, 'office')}
                            className={`px-2.5 py-1 transition-colors ${entry.location === 'office' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                          >
                            Office
                          </button>
                          <button
                            onClick={() => setLocation(d.num, 'home')}
                            className={`px-2.5 py-1 transition-colors border-l border-gray-200 ${entry.location === 'home' ? 'bg-teal-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                          >
                            Home
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-300">day off</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || totalHours === 0}
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save Schedule'}
            </button>
            {saved && (
              <span className="text-green-600 text-sm font-medium">Saved!</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function emptySchedule() {
  return [
    { day: 1, checked: false, hours: 4, location: 'office' },
    { day: 2, checked: false, hours: 4, location: 'office' },
    { day: 3, checked: false, hours: 4, location: 'office' },
    { day: 4, checked: false, hours: 4, location: 'office' },
    { day: 5, checked: false, hours: 4, location: 'office' },
  ]
}
