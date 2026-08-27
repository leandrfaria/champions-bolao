import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TrophyIcon from '../components/TrophyIcon'

export default function LoginPage() {
  const { user, login, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    document.title = 'Entrar · Champions Bolão'
  }, [])

  if (!loading && user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(username, password)
      navigate(location.state?.from || '/dashboard', { replace: true })
    } catch (err) {
      const message = err?.message?.toLowerCase().includes('invalid login credentials')
        ? 'Usuário ou senha incorretos.'
        : err.message || 'Não foi possível entrar.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-visual" aria-hidden="true">
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="star-field">✦ · ✦ · ✦ · ✦</div>
        <div className="login-trophy"><TrophyIcon size={118} /></div>
        <div className="login-copy">
          <span>NOITES DE CHAMPIONS</span>
          <h1>Palpite fechado.<br />Resenha garantida.</h1>
          <p>Faça seu placar, acompanhe a rodada e descubra quem vai chegar na final do bolão por cima.</p>
        </div>
      </div>

      <div className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="brand login-brand">
            <div className="brand-mark"><TrophyIcon size={25} /></div>
            <div><strong>CHAMPIONS</strong><span>BOLÃO</span></div>
          </div>

          <div className="login-heading">
            <span className="eyebrow">Área privada</span>
            <h2>Entrar no bolão</h2>
            <p>Use o usuário criado pelo administrador e sua senha.</p>
          </div>

          <label className="field">
            <span>Usuário</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="seu nome"
              autoComplete="username"
              required
            />
          </label>

          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="primary-button login-button" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>

          <p className="login-note">Os palpites dos outros jogadores só aparecem quando chegar o horário de início da partida.</p>
        </form>
      </div>
    </div>
  )
}
