import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Team() {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setPeople(await api.getPeople())
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
      )}
    </div>
  )
}
