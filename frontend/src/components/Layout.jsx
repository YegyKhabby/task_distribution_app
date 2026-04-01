import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/setup',    label: 'My Schedule' },
  { to: '/team',     label: 'Team' },
  { to: '/manager',  label: 'Manager' },
  { to: '/matrix',   label: 'Matrix' },
  { to: '/absences', label: 'Absences' },
  { to: '/impact',    label: 'Impact' },
  { to: '/calendar',  label: 'Calendar' },
  { to: '/daily',     label: 'Daily View' },
  { to: '/deskbird-attendance', label: 'Deskbird/Attendance' },
]

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-8">
          <span className="font-bold text-lg text-indigo-700 tracking-tight">TaskDist</span>
          <nav className="flex gap-1 flex-wrap">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  )
}
