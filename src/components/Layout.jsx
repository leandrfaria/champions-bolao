import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ParticipantProfileContext } from '../context/ParticipantProfileContext'
import ParticipantProfileModal from './ParticipantProfileModal'
import TrophyIcon from './TrophyIcon'
import SidebarAvatar from './SidebarAvatar'
import NavIcon from './NavIcon'

const navItems = [
  { to: '/dashboard', label: 'Início', icon: 'home' },
  { to: '/rodadas', label: 'Rodadas', icon: 'rounds' },
  { to: '/meus-palpites', label: 'Meus palpites', icon: 'predictions' },
  { to: '/classificacao', label: 'Classificação', icon: 'leaderboard' },
  { to: '/podio', label: 'Pódio', icon: 'podium' },
  { to: '/atividades', label: 'Atividades', icon: 'activity' },
  { to: '/sobre', label: 'Sobre', icon: 'info' },
]

const mobilePrimaryItems = [
  { to: '/dashboard', label: 'Início', icon: 'home' },
  { to: '/rodadas', label: 'Rodadas', icon: 'rounds' },
  { to: '/classificacao', label: 'Classificação', icon: 'leaderboard' },
  { to: '/podio', label: 'Pódio', icon: 'podium' },
  { to: '/atividades', label: 'Atividades', icon: 'activity' },
]

export default function Layout() {
  const { profile, isAdmin, logout, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [profileTarget, setProfileTarget] = useState(null)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

  useEffect(() => {
    setMobileMoreOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!profile?.id) return
    refreshProfile?.().catch(() => {})
    // profile id is the only signal we need here; avoid re-fetch loops from a recreated callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const participantProfileValue = useMemo(() => ({
    openParticipant: (nextProfile) => nextProfile?.id && setProfileTarget(nextProfile),
    closeParticipant: () => setProfileTarget(null),
  }), [])

  const morePaths = ['/meus-palpites', '/podio', '/sobre', '/admin', ...(isAdmin ? ['/sorteio'] : [])]
  const moreIsActive = morePaths.some((path) => location.pathname.startsWith(path))

  return (
    <ParticipantProfileContext.Provider value={participantProfileValue}>
      <div className="app-shell topbar-shell">
        <header className="topbar" aria-label="Navegação principal do bolão">
          <div className="topbar-inner">
            <NavLink to="/dashboard" className="brand topbar-brand" aria-label="Champions Bolão">
              <div className="brand-mark"><TrophyIcon size={23} /></div>
              <div className="brand-copy">
                <strong>CHAMPIONS</strong>
                <span>BOLÃO</span>
              </div>
            </NavLink>

            <nav className="topbar-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => isActive ? 'topbar-link active' : 'topbar-link'}
                >
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="topbar-actions">
              {isAdmin && (
                <div className="topbar-admin-links">
                  <NavLink to="/sorteio" className={({ isActive }) => isActive ? 'topbar-link admin-link active' : 'topbar-link admin-link'}>Sorteio</NavLink>
                  <NavLink to="/admin" className={({ isActive }) => isActive ? 'topbar-link admin-link active' : 'topbar-link admin-link'}>Administração</NavLink>
                </div>
              )}

              <div className="topbar-user">
                <SidebarAvatar key={`${profile?.id || 'guest'}:${profile?.avatar_path || 'no-avatar'}`} profile={profile} />
                <span className="topbar-user-copy">
                  <strong>{profile?.display_name || 'Jogador'}</strong>
                  <small>{isAdmin ? 'Administrador · jogador' : 'Jogador'}</small>
                </span>
              </div>

              <button type="button" className="topbar-logout" onClick={handleLogout} aria-label="Sair">
                <NavIcon name="logout" size={16} />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </header>

        <main className="main-content topbar-main-content">
          <div key={location.pathname} className="route-scene">
            <Outlet />
          </div>
        </main>

        <div className={`mobile-more-layer ${mobileMoreOpen ? 'open' : ''}`} aria-hidden={!mobileMoreOpen}>
          <button className="mobile-more-backdrop" aria-label="Fechar menu" onClick={() => setMobileMoreOpen(false)} />
          <div className="mobile-more-sheet" role="dialog" aria-label="Mais opções de navegação">
            <div className="mobile-more-handle" />
            <NavLink to="/meus-palpites" className="mobile-more-link"><NavIcon name="predictions" size={19} /><span><strong>Meus palpites</strong><small>Histórico e desempenho pessoal</small></span></NavLink>
            <NavLink to="/podio" className="mobile-more-link"><NavIcon name="podium" size={19} /><span><strong>Pódio</strong><small>Campeões de cada temporada</small></span></NavLink>
            <NavLink to="/sobre" className="mobile-more-link"><NavIcon name="info" size={19} /><span><strong>Sobre o bolão</strong><small>Regras e funcionamento</small></span></NavLink>
            {isAdmin && (
              <div className="mobile-more-admin-group">
                <NavLink to="/sorteio" className="mobile-more-link"><NavIcon name="roulette" size={19} /><span><strong>Sorteio</strong><small>Quem escolhe os jogos da rodada</small></span></NavLink>
                <NavLink to="/admin" className="mobile-more-link"><NavIcon name="admin" size={19} /><span><strong>Administração</strong><small>Gerenciar competição</small></span></NavLink>
              </div>
            )}
            <button type="button" className="mobile-more-link mobile-more-logout" onClick={handleLogout}><NavIcon name="logout" size={19} /><span><strong>Sair</strong><small>Encerrar sua sessão</small></span></button>
          </div>
        </div>

        <nav className="mobile-nav" aria-label="Navegação principal">
          {mobilePrimaryItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'mobile-nav-link active' : 'mobile-nav-link'}>
              <NavIcon name={item.icon} size={20} />
              <small>{item.label}</small>
            </NavLink>
          ))}
          <button type="button" className={`mobile-nav-link mobile-nav-more ${mobileMoreOpen || moreIsActive ? 'active' : ''}`} onClick={() => setMobileMoreOpen((value) => !value)} aria-expanded={mobileMoreOpen} aria-label="Mais opções">
            <NavIcon name="more" size={20} />
            <small>Mais</small>
          </button>
        </nav>
      </div>

      {profileTarget && <ParticipantProfileModal profile={profileTarget} onClose={() => setProfileTarget(null)} />}
    </ParticipantProfileContext.Provider>
  )
}
