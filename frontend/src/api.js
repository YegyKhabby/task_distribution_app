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

// Simple in-memory cache for data that rarely changes within a session
const _cache = {}
const TTL = 30_000 // 30 seconds

async function cached(key, fn) {
  const now = Date.now()
  if (_cache[key] && now - _cache[key].ts < TTL) return _cache[key].data
  const data = await fn()
  _cache[key] = { data, ts: now }
  return data
}

function invalidate(...keys) {
  keys.forEach(k => delete _cache[k])
}

export const api = {
  // People
  getPeople: () => cached('people', () => req('GET', '/people')),
  createPerson: (data) => req('POST', '/people', data).then(r => { invalidate('people', 'schedules'); return r }),
  updatePerson: (id, data) => req('PUT', `/people/${id}`, data).then(r => { invalidate('people'); return r }),
  deletePerson: (id) => req('DELETE', `/people/${id}`).then(r => { invalidate('people', 'schedules'); return r }),

  // Schedule
  getAllSchedules: () => cached('schedules', () => req('GET', '/schedule')),
  getSchedule: (personId) => req('GET', `/schedule/${personId}`),
  saveSchedule: (personId, entries) => req('PUT', `/schedule/${personId}`, entries).then(r => { invalidate('schedules'); return r }),

  // Tasks
  getTasks: () => cached('tasks', () => req('GET', '/tasks')),
  createTask: (data) => req('POST', '/tasks', data).then(r => { invalidate('tasks'); return r }),
  updateTask: (id, data) => req('PUT', `/tasks/${id}`, data).then(r => { invalidate('tasks'); return r }),
  deleteTask: (id) => req('DELETE', `/tasks/${id}`).then(r => { invalidate('tasks'); return r }),

  // Assignments (per week)
  getAssignments: (weekNumber, taskId) => {
    const parts = []
    if (weekNumber != null) parts.push(`week_number=${weekNumber}`)
    if (taskId) parts.push(`task_id=${taskId}`)
    return req('GET', `/assignments${parts.length ? '?' + parts.join('&') : ''}`)
  },
  assignPerson: (data) => req('POST', '/assignments', data),  // data must include week_number
  unassignPerson: (taskId, personId, weekNumber) => req('DELETE', `/assignments?task_id=${taskId}&person_id=${personId}&week_number=${weekNumber}`),

  // Fixed hours
  getFixedHours: (taskId) => req('GET', `/assignments/fixed${taskId ? `?task_id=${taskId}` : ''}`),
  setFixedHours: (data) => req('PUT', '/assignments/fixed', data),

  // Distribution (auto)
  previewDistribution: (weekNumber) => req('GET', `/distribute/preview?week_number=${weekNumber}`),
  confirmDistribution: (data) => req('POST', '/distribute/confirm', data),

  // Distribution (saved matrix — for Matrix page)
  getDistribution: (weekNumber) => req('GET', `/distribution${weekNumber != null ? `?week_number=${weekNumber}` : ''}`),

  // Preferred day pin (per week)
  setPreferredDays: (taskId, personId, weekNumber, days) => req('PUT', '/distribution/preferred-day', { task_id: taskId, person_id: personId, week_number: weekNumber, preferred_days: days }),

  // Absences
  getAbsences: (personId, fromDate) => {
    const parts = []
    if (personId) parts.push(`person_id=${personId}`)
    if (fromDate) parts.push(`from_date=${fromDate}`)
    return req('GET', `/absences${parts.length ? '?' + parts.join('&') : ''}`)
  },
  createAbsence: (data) => req('POST', '/absences', data),
  createAbsenceRange: (data) => req('POST', '/absences/range', data),
  deleteAbsence: (id) => req('DELETE', `/absences/${id}`),

  // Impact
  getImpact: (weekStart, weekStartOffset = 1) => req('GET', `/impact/${weekStart}?week_start_offset=${weekStartOffset}`),
  getImpactUpcoming: (fromDate, weekStartOffset = 1) => req('GET', `/impact/upcoming?from_date=${fromDate}&week_start_offset=${weekStartOffset}`),

  // Reallocations
  getReallocations: (weekStart) => req('GET', `/reallocations${weekStart ? `?week_start_date=${weekStart}` : ''}`),
  createReallocation: (data) => req('POST', '/reallocations', data),
  deleteReallocation: (id) => req('DELETE', `/reallocations/${id}`),

  // Calendar
  getCalendar: (year, month, personId, fromWeek = 1, weekStart = 1, includeOverflow = false) => req('GET', `/calendar/${year}/${month}?person_id=${personId}&from_week=${fromWeek}&week_start=${weekStart}&include_overflow=${includeOverflow}`),
  getCalendarExportUrl: (year, month, weekStart = 1) => `${BASE}/calendar/export?year=${year}&month=${month}&week_start=${weekStart}`,
  getCalendarExportData: (year, month, weekStart = 1) => req('GET', `/calendar/export-data?year=${year}&month=${month}&week_start=${weekStart}`),
  getDayView: (date, weekStart = 1) => req('GET', `/calendar/day?date=${date}&week_start=${weekStart}`),
  getDayViewExportUrl: (date, weekStart = 1) => `${BASE}/calendar/day/export?date=${date}&week_start=${weekStart}`,

  // Deskbird attendance
  getDeskbirdAttendance: (startDate, days = 7) => req('GET', `/attendance/deskbird?start_date=${startDate}&days=${days}`),

  // Makeup
  getMakeup: (personId) => req('GET', `/makeup${personId ? `?person_id=${personId}` : ''}`),
  createMakeup: (data) => req('POST', '/makeup', data),
  deleteMakeup: (id) => req('DELETE', `/makeup/${id}`),
}
