import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ParticipantProfileContext } from '../context/ParticipantProfileContext'
import ParticipantProfileModal from './ParticipantProfileModal'
import TrophyIcon from './TrophyIcon'
import UserAvatar from './UserAvatar'
import NavIcon from './NavIcon'

const navItems = [
  { to: '/dashboard', label: 'Início', icon: 'home' },
  { to: '/rodadas', label: 'Rodadas', icon: 'rounds' },
  { to: '/meus-palpites', label: 'Meus palpites', icon: 'predictions' },
  { to: '/classificacao', label: 'Classificação', icon: 'leaderboard' },
  { to: '/atividades', label: 'Atividades', icon: 'activity' },
  { to: '/sobre', label: 'Sobre', icon: 'info' },
]

const mobilePrimaryItems = [
  { to: '/dashboard', label: 'Início', icon: 'home' },
  { to: '/rodadas', label: 'Rodadas', icon: 'rounds' },
  { to: '/classificacao', label: 'Classificação', icon: 'leaderboard' },
  { to: '/atividades', label: 'Atividades', icon: 'activity' },
]

export default function Layout() {
  const { profile, isAdmin, logout, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [profileTarget, setProfileTarget] = useState(null)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('champions-sidebar-collapsed') === '1' } catch { return false }
  })

  useEffect(() => {
    try { window.localStorage.setItem('champions-sidebar-collapsed', sidebarCollapsed ? '1' : '0') } catch { /* storage may be unavailable */ }
  }, [sidebarCollapsed])

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

  const moreIsActive = ['/meus-palpites', '/sobre', '/admin'].some((path) => location.pathname.startsWith(path))

  return (
    <ParticipantProfileContext.Provider value={participantProfileValue}>
      <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className="sidebar">
          <div className="sidebar-brand-row">
            <div className="brand">
              <div className="brand-mark"><TrophyIcon size={23} /></div>
              <div className="brand-copy">
                <strong>CHAMPIONS</strong>
                <span>BOLÃO</span>
              </div>
            </div>
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={sidebarCollapsed ? 'Mostrar menu lateral' : 'Ocultar menu lateral'}
              title={sidebarCollapsed ? 'Mostrar menu lateral' : 'Ocultar menu lateral'}
            >
              <NavIcon name={sidebarCollapsed ? 'expand' : 'collapse'} size={17} />
            </button>
          </div>

          <nav className="main-nav">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} title={sidebarCollapsed ? item.label : undefined} aria-label={item.label} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                <span className="nav-icon"><NavIcon name={item.icon} /></span>
                <span>{item.label}</span>
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink to="/admin" title={sidebarCollapsed ? 'Administração' : undefined} aria-label="Administração" className={({ isActive }) => isActive ? 'nav-link active admin-link' : 'nav-link admin-link'}>
                <span className="nav-icon"><NavIcon name="admin" /></span>
                <span>Administração</span>
              </NavLink>
            )}
          </nav>

          <div className="sidebar-footer">
            <div className="user-chip">
              <UserAvatar key={`${profile?.id || 'guest'}:${profile?.avatar_path || 'no-avatar'}`} profile={profile} size="sidebar" refreshPath />
              <div>
                <strong>{profile?.display_name || 'Jogador'}</strong>
                <span>{isAdmin ? 'Administrador · jogador' : 'Jogador'}</span>
              </div>
            </div>
            <button className="sidebar-logout" onClick={handleLogout} title={sidebarCollapsed ? 'Sair' : undefined} aria-label="Sair"><NavIcon name="logout" size={17} /> <span>Sair</span></button>
          </div>
        </aside>

        <main className="main-content">
          <Outlet />
        </main>

        <div className={`mobile-more-layer ${mobileMoreOpen ? 'open' : ''}`} aria-hidden={!mobileMoreOpen}>
          <button className="mobile-more-backdrop" aria-label="Fechar menu" onClick={() => setMobileMoreOpen(false)} />
          <div className="mobile-more-sheet" role="dialog" aria-label="Mais opções de navegação">
            <div className="mobile-more-handle" />
            <NavLink to="/meus-palpites" className="mobile-more-link"><NavIcon name="predictions" size={19} /><span><strong>Meus palpites</strong><small>Histórico e desempenho pessoal</small></span></NavLink>
            <NavLink to="/sobre" className="mobile-more-link"><NavIcon name="info" size={19} /><span><strong>Sobre o bolão</strong><small>Regras e funcionamento</small></span></NavLink>
            {isAdmin && <NavLink to="/admin" className="mobile-more-link"><NavIcon name="admin" size={19} /><span><strong>Administração</strong><small>Gerenciar competição</small></span></NavLink>}
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
