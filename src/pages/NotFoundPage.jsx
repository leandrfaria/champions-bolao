import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="fullscreen-center">
      <div className="empty-state">
        <div className="empty-orbit">404</div>
        <h3>Página não encontrada</h3>
        <p>Esse caminho não faz parte do bolão.</p>
        <Link className="primary-button" to="/dashboard">Voltar ao início</Link>
      </div>
    </div>
  )
}
