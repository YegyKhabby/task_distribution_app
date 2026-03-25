const BASE = import.meta.env.VITE_API_URL || '/api'

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // People
  getPeople: () => req('GET', '/people'),
  createPerson: (data) => req('POST', '/people', data),
  updatePerson: (id, data) => req('PUT', `/people/${id}`, data),
  deletePerson: (id) => req('DELETE', `/people/${id}`),

  // Schedule
  getSchedule: (personId) => req('GET', `/schedule/${personId}`),
  saveSchedule: (personId, entries) => req('PUT', `/schedule/${personId}`, entries),

  // Tasks
  getTasks: () => req('GET', '/tasks'),
  createTask: (data) => req('POST', '/tasks', data),
  updateTask: (id, data) => req('PUT', `/tasks/${id}`, data),
  deleteTask: (id) => req('DELETE', `/tasks/${id}`),

  // Assignments
  getAssignments: (taskId) => req('GET', `/assignments${taskId ? `?task_id=${taskId}` : ''}`),
  assignPerson: (data) => req('POST', '/assignments', data),
  unassignPerson: (taskId, personId) => req('DELETE', `/assignments?task_id=${taskId}&person_id=${personId}`),

  // Fixed hours
  getFixedHours: (taskId) => req('GET', `/assignments/fixed${taskId ? `?task_id=${taskId}` : ''}`),
  setFixedHours: (data) => req('PUT', '/assignments/fixed', data),

  // Distribution (auto)
  previewDistribution: (weekType) => req('GET', `/distribute/preview?week_type=${weekType}`),
  confirmDistribution: (data) => req('POST', '/distribute/confirm', data),

  // Distribution (saved matrix — for Matrix page)
  getDistribution: (weekType) => req('GET', `/distribution${weekType ? `?week_type=${weekType}` : ''}`),

  // Absences
  getAbsences: (personId) => req('GET', `/absences${personId ? `?person_id=${personId}` : ''}`),
  createAbsence: (data) => req('POST', '/absences', data),
  createAbsenceRange: (data) => req('POST', '/absences/range', data),
  deleteAbsence: (id) => req('DELETE', `/absences/${id}`),

  // Impact
  getImpact: (weekStart) => req('GET', `/impact/${weekStart}`),

  // Reallocations
  getReallocations: (weekStart) => req('GET', `/reallocations${weekStart ? `?week_start_date=${weekStart}` : ''}`),
  createReallocation: (data) => req('POST', '/reallocations', data),
  deleteReallocation: (id) => req('DELETE', `/reallocations/${id}`),

  // Calendar
  getCalendar: (year, month, personId, fromWeek = 1) => req('GET', `/calendar/${year}/${month}?person_id=${personId}&from_week=${fromWeek}`),

  // Makeup
  getMakeup: (personId) => req('GET', `/makeup${personId ? `?person_id=${personId}` : ''}`),
  createMakeup: (data) => req('POST', '/makeup', data),
  deleteMakeup: (id) => req('DELETE', `/makeup/${id}`),
}
