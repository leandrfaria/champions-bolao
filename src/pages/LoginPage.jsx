import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/login-v2.css'

export default function LoginPage() {
  const { user, login, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
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
    <main className="login-v2" aria-busy={loading}>
      <section className="login-v2-scene" aria-label="Comemoração dos participantes com a taça da Champions League">
        <img
          className="login-v2-photo"
          src="/images/login-stadium-celebration.webp"
          alt="Participantes comemoram juntos no estádio ao lado da taça da Champions League"
          fetchPriority="high"
          decoding="async"
        />
        <div className="login-v2-photo-shade" aria-hidden="true" />
        <div className="login-v2-editorial">
          <p>A Champions é nossa.</p>
          <span>Palpite a palpite, a disputa pelo título começa aqui.</span>
        </div>
      </section>

      <section className="login-v2-auth" aria-labelledby="login-v2-title">
        <form className="login-v2-form" onSubmit={handleSubmit}>
          <div className="login-v2-brand" aria-label="Champions Bolão">
            <img src="/favicon.svg" alt="" width="42" height="42" />
            <span><strong>CHAMPIONS</strong><b>BOLÃO</b></span>
          </div>

          <div className="login-v2-heading">
            <span className="login-v2-eyebrow">ÁREA PRIVADA</span>
            <h1 id="login-v2-title">Entre na competição.</h1>
            <p>Acesse sua conta para acompanhar a rodada e seus palpites.</p>
          </div>

          <label className="login-v2-field">
            <span>Usuário</span>
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Seu usuário"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
            />
          </label>

          <label className="login-v2-field">
            <span>Senha</span>
            <span className="login-v2-password-wrap">
              <input
                name="password"
                type={passwordVisible ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                autoComplete="current-password"
                required
              />
              <button
                className="login-v2-reveal"
                type="button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={passwordVisible}
              >
                {passwordVisible ? 'Ocultar' : 'Mostrar'}
              </button>
            </span>
          </label>

          {error && <p className="login-v2-error" role="alert">{error}</p>}

          <button className="login-v2-submit" type="submit" disabled={submitting || loading}>
            {submitting ? <><span className="login-v2-spinner" aria-hidden="true" />Entrando...</> : 'Entrar no bolão'}
          </button>
        </form>
      </section>
    </main>
  )
}
