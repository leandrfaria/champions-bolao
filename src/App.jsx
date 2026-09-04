import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import RoundsPage from './pages/RoundsPage'
import RoundPage from './pages/RoundPage'
import MyPredictionsPage from './pages/MyPredictionsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import ActivityPage from './pages/ActivityPage'
import AboutPage from './pages/AboutPage'
import AdminPage from './pages/AdminPage'
import RoulettePage from './pages/RoulettePage'
import PodiumPage from './pages/PodiumPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/rodadas" element={<RoundsPage />} />
          <Route path="/rodadas/:roundId" element={<RoundPage />} />
          <Route path="/meus-palpites" element={<MyPredictionsPage />} />
          <Route path="/classificacao" element={<LeaderboardPage />} />
          <Route path="/atividades" element={<ActivityPage />} />
          <Route path="/sorteio" element={<RoulettePage />} />
          <Route path="/podio" element={<PodiumPage />} />
          <Route path="/sobre" element={<AboutPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
