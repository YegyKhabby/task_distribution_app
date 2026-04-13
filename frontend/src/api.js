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

function invalidatePrefix(prefix) {
  Object.keys(_cache).forEach((k) => {
    if (k === prefix || k.startsWith(`${prefix}:`)) delete _cache[k]
  })
}

export const api = {
  // People
  getPeople: (onDate) => (
    onDate
      ? req('GET', `/people?on_date=${onDate}`)
      : cached('people', () => req('GET', '/people'))
  ),
  createPerson: (data) => req('POST', '/people', data).then(r => { invalidatePrefix('people'); invalidate('schedules'); return r }),
  updatePerson: (id, data) => req('PUT', `/people/${id}`, data).then(r => { invalidatePrefix('people'); return r }),
  deletePerson: (id) => req('DELETE', `/people/${id}`).then(r => { invalidatePrefix('people'); invalidate('schedules'); return r }),

  // Schedule
  getAllSchedules: () => cached('schedules', () => req('GET', '/schedule')),
  getSchedule: (personId) => req('GET', `/schedule/${personId}`),
  // entries: [{day_of_week, hours, valid_from, valid_until?}]
  saveSchedule: (personId, entries) => req('PUT', `/schedule/${personId}`, entries).then(r => { invalidate('schedules'); return r }),
  deleteScheduleVersion: (personId, validFrom) => req('DELETE', `/schedule/${personId}/version?valid_from=${validFrom}`).then(r => { invalidate('schedules'); return r }),

  // Tasks
  getTasks: () => cached('tasks', () => req('GET', '/tasks')),
  getTaskWeekSettings: (weekNumber) => req('GET', `/tasks/week-settings?week_number=${weekNumber}`),
  createTask: (data) => req('POST', '/tasks', data).then(r => { invalidate('tasks'); localStorage.setItem('dist_stale', 'true'); return r }),
  updateTask: (id, data) => req('PUT', `/tasks/${id}`, data).then(r => { invalidate('tasks'); localStorage.setItem('dist_stale', 'true'); return r }),
  updateTaskWeekSettings: (id, weekNumber, weeklyHoursTarget) => req('PUT', `/tasks/${id}/week-settings`, {
    week_number: weekNumber,
    weekly_hours_target: weeklyHoursTarget,
  }).then(r => { localStorage.setItem('dist_stale', 'true'); return r }),
  deleteTask: (id) => req('DELETE', `/tasks/${id}`).then(r => { invalidate('tasks'); localStorage.setItem('dist_stale', 'true'); return r }),

  // Assignments (per week)
  getAssignments: (weekNumber, taskId) => {
    const parts = []
    if (weekNumber != null) parts.push(`week_number=${weekNumber}`)
    if (taskId) parts.push(`task_id=${taskId}`)
    return req('GET', `/assignments${parts.length ? '?' + parts.join('&') : ''}`)
  },
  assignPerson: (data) => req('POST', '/assignments', data).then(r => { localStorage.setItem('dist_stale', 'true'); return r }),
  unassignPerson: (taskId, personId, weekNumber) => req('DELETE', `/assignments?task_id=${taskId}&person_id=${personId}&week_number=${weekNumber}`).then(r => { localStorage.setItem('dist_stale', 'true'); return r }),

  // Fixed hours
  getFixedHours: (taskId, weekNumber) => {
    const parts = []
    if (taskId) parts.push(`task_id=${taskId}`)
    if (weekNumber != null) parts.push(`week_number=${weekNumber}`)
    return req('GET', `/assignments/fixed${parts.length ? `?${parts.join('&')}` : ''}`)
  },
  setFixedHours: (data) => req('PUT', '/assignments/fixed', data).then(r => { localStorage.setItem('dist_stale', 'true'); return r }),

  // Distribution (auto)
  previewDistribution: (weekNumber, weekStart) => req('GET', `/distribute/preview?week_number=${weekNumber}${weekStart ? `&week_start=${weekStart}` : ''}`),
  confirmDistribution: (weekNumber, effectiveFrom, overrides, weekOnly = false) => req('POST', '/distribute/confirm', {
    week_number: weekNumber,
    effective_from: effectiveFrom,
    week_only: weekOnly,
    overrides: overrides || null,
  }).then(r => { localStorage.removeItem('dist_stale'); return r }),

  // Distribution (saved matrix — for Matrix page)
  getDistribution: (weekNumber, weekStart) => {
    const parts = []
    if (weekNumber != null) parts.push(`week_number=${weekNumber}`)
    if (weekStart) parts.push(`week_start=${weekStart}`)
    return req('GET', `/distribution${parts.length ? `?${parts.join('&')}` : ''}`)
  },

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

  // Responsible persons
  getResponsiblePersons: () => cached('responsiblePersons', () => req('GET', '/responsible-persons')),
  createResponsiblePerson: (name) => req('POST', '/responsible-persons', { name }).then(r => { invalidate('responsiblePersons'); return r }),
  deleteResponsiblePerson: (id) => req('DELETE', `/responsible-persons/${id}`).then(r => { invalidate('responsiblePersons'); return r }),

  // Actual hours
  getActual: (weekStart) => req('GET', `/actual?week_start=${weekStart}`),
  createActual: (data) => req('POST', '/actual', data),
  updateActual: (id, data) => req('PUT', `/actual/${id}`, data),
  deleteActual: (id) => req('DELETE', `/actual/${id}`),
  copyActualWeek: (weekStart, force = false, weekStartOffset = 1) => req('POST', '/actual/copy-week', { week_start: weekStart, force, week_start_offset: weekStartOffset }),
  getActualLocation: (weekStart) => req('GET', `/actual/location?week_start=${weekStart}`),
  upsertActualLocation: (personId, date, location) => req('PUT', '/actual/location', { person_id: personId, date, location }),
  getActualExportUrl: (dates) => `${BASE}/actual/export?dates=${dates.join(',')}`,
}
