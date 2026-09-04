import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Loading from './Loading'

export default function AdminRoute() {
  const { isAdmin, loading } = useAuth()

  if (loading) {
    return <div className="fullscreen-center"><Loading label="Validando acesso..." /></div>
  }

  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
