import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Setup from './pages/Setup'
import Manager from './pages/Manager'
import Matrix from './pages/Matrix'
import Absences from './pages/Absences'
import Impact from './pages/Impact'
import Team from './pages/Team'
import Calendar from './pages/Calendar'
import DailyView from './pages/DailyView'
import DeskbirdAttendance from './pages/DeskbirdAttendance'
import Actual from './pages/Actual'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/setup" replace />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/team" element={<Team />} />
        <Route path="/manager" element={<Manager />} />
        <Route path="/matrix" element={<Matrix />} />
        <Route path="/absences" element={<Absences />} />
        <Route path="/impact" element={<Impact />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/daily" element={<DailyView />} />
        <Route path="/deskbird-attendance" element={<DeskbirdAttendance />} />
        <Route path="/actual" element={<Actual />} />
      </Routes>
    </Layout>
  )
}
