import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ParticipantProfileContext } from '../context/ParticipantProfileContext'
import ParticipantProfileModal from './ParticipantProfileModal'
import SidebarAvatar from './SidebarAvatar'
import NavIcon from './NavIcon'
import { acquirePageScrollLock } from '../lib/pageScrollLock'
import '../styles/layout-redesign.css'

const primaryNavItems = [
  { to: '/dashboard', label: 'Início' },
  { to: '/rodadas', label: 'Rodadas' },
  { to: '/meus-palpites', label: 'Meus palpites' },
  { to: '/classificacao', label: 'Classificação' },
]

const secondaryNavItems = [
  { to: '/atividades', label: 'Atividades', icon: 'activity', description: 'Acompanhe o que acontece no bolão' },
  { to: '/podio', label: 'Pódio', icon: 'podium', description: 'Campeões de cada temporada' },
  { to: '/sobre', label: 'Sobre', icon: 'info', description: 'Regras e funcionamento' },
]

export default function Layout() {
  const { profile, isAdmin, logout, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [profileTarget, setProfileTarget] = useState(null)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const mobileMoreTrigger = useRef(null)
  const desktopMoreTrigger = useRef(null)
  const profileMenuTrigger = useRef(null)
  const mobileMoreSheet = useRef(null)
  const desktopMoreMenu = useRef(null)
  const profileMenu = useRef(null)

  useEffect(() => {
    if (!desktopMoreOpen) return undefined
    function onPointerDown(event) {
      if (!desktopMoreMenu.current?.contains(event.target)) setDesktopMoreOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setDesktopMoreOpen(false)
        desktopMoreTrigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [desktopMoreOpen])

  useEffect(() => {
    setMobileMoreOpen(false)
    setDesktopMoreOpen(false)
    setProfileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!profile?.id) return
    refreshProfile?.().catch(() => {})
    // profile id is the only signal we need here; avoid re-fetch loops from a recreated callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    if (!profileMenuOpen) return undefined
    function onPointerDown(event) {
      if (!profileMenu.current?.contains(event.target)) setProfileMenuOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false)
        profileMenuTrigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [profileMenuOpen])

  useEffect(() => {
    if (!mobileMoreOpen) return undefined
    const releaseScrollLock = acquirePageScrollLock()
    const previouslyFocused = document.activeElement
    const firstItem = mobileMoreSheet.current?.querySelector('a, button:not(:disabled)')
    firstItem?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileMoreOpen(false)
        mobileMoreTrigger.current?.focus()
        return
      }
      if (event.key !== 'Tab') return
      const items = [...(mobileMoreSheet.current?.querySelectorAll('a[href], button:not(:disabled)') || [])]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      releaseScrollLock()
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [mobileMoreOpen])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const participantProfileValue = useMemo(() => ({
    openParticipant: (nextProfile) => nextProfile?.id && setProfileTarget(nextProfile),
    closeParticipant: () => setProfileTarget(null),
  }), [])

  const morePaths = ['/atividades', '/podio', '/sobre', ...(isAdmin ? ['/admin'] : [])]
  const moreIsActive = morePaths.some((path) => location.pathname.startsWith(path))

  function openOwnProfile() {
    setProfileMenuOpen(false)
    setMobileMoreOpen(false)
    if (profile?.id) setProfileTarget(profile)
  }

  return (
    <ParticipantProfileContext.Provider value={participantProfileValue}>
      <div className={`app-shell topbar-shell${location.pathname === '/rodadas' ? ' rounds-explorer-shell' : ''}${location.pathname === '/meus-palpites' ? ' my-predictions-shell' : ''}${location.pathname === '/atividades' ? ' activity-explorer-shell' : ''}`}>
        <header className="site-header-v2" aria-label="Navegação principal do bolão">
          <div className="site-header-v2-inner">
            <NavLink to="/dashboard" className="site-brand-v2" aria-label="Champions Bolão — início">
              <span className="site-brand-v2-mark" aria-hidden="true"><img src="/favicon.svg" alt="" /></span>
              <span><strong>CHAMPIONS</strong><small>BOLÃO</small></span>
            </NavLink>

            <nav className="site-primary-nav-v2" aria-label="Seções principais">
              {primaryNavItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'site-nav-link-v2 active' : 'site-nav-link-v2'}>
                  {item.label}
                </NavLink>
              ))}
              <div className="site-more-v2" ref={desktopMoreMenu}>
                <button
                  ref={desktopMoreTrigger}
                  type="button"
                  className={`site-nav-link-v2 site-more-trigger-v2 ${desktopMoreOpen || moreIsActive ? 'active' : ''}`}
                  aria-expanded={desktopMoreOpen}
                  aria-controls="site-more-menu-v2"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    setDesktopMoreOpen((value) => !value)
                  }}
                >
                  Mais
                </button>
                {desktopMoreOpen && (
                  <div className="site-more-menu-v2" id="site-more-menu-v2">
                    {secondaryNavItems.map((item) => (
                      <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'site-more-link-v2 active' : 'site-more-link-v2'}>
                        <NavIcon name={item.icon} size={18} />
                        <span><strong>{item.label}</strong><small>{item.description}</small></span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            <div className="site-header-actions-v2">
              {isAdmin && (
                <div className="site-admin-links-v2" aria-label="Acessos administrativos">
                  <NavLink to="/admin" className={({ isActive }) => isActive ? 'site-admin-link-v2 active' : 'site-admin-link-v2'}>Admin</NavLink>
                </div>
              )}
              <div className="site-profile-menu-v2" ref={profileMenu}>
                <SidebarAvatar
                  profile={profile}
                  onClick={() => {
                    setDesktopMoreOpen(false)
                    setProfileMenuOpen((value) => !value)
                  }}
                  expanded={profileMenuOpen}
                  triggerRef={profileMenuTrigger}
                  menuTrigger
                />
                {profileMenuOpen && (
                  <div className="site-profile-dropdown-v2" id="site-profile-dropdown-v2" role="group" aria-label="Menu da conta">
                    <div className="site-profile-identity-v2">
                      <strong>{profile?.display_name || 'Jogador'}</strong>
                      <small>{isAdmin ? 'Administrador · participante' : 'Participante'}</small>
                    </div>
                    <button type="button" onClick={openOwnProfile}><NavIcon name="predictions" size={17} />Meu perfil</button>
                    <button type="button" className="logout" onClick={handleLogout}><NavIcon name="logout" size={17} />Sair da conta</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="main-content topbar-main-content site-main-v2">
          <div key={location.pathname} className="route-scene">
            <Outlet />
          </div>
        </main>

        <div className={`mobile-more-layer-v2 ${mobileMoreOpen ? 'open' : ''}`} aria-hidden={!mobileMoreOpen}>
          <button className="mobile-more-backdrop-v2" aria-label="Fechar menu Mais" onClick={() => setMobileMoreOpen(false)} tabIndex={mobileMoreOpen ? 0 : -1} />
          <section className="mobile-more-sheet-v2" id="mobile-more-sheet-v2" ref={mobileMoreSheet} role="dialog" aria-modal="true" aria-label="Mais opções" aria-hidden={!mobileMoreOpen}>
            <div className="mobile-more-handle-v2" aria-hidden="true" />
            <div className="mobile-more-account-v2">
              <SidebarAvatar profile={profile} onClick={openOwnProfile} />
              <span><strong>{profile?.display_name || 'Jogador'}</strong><small>{isAdmin ? 'Administrador · participante' : 'Participante'}</small></span>
            </div>
            <div className="mobile-more-links-v2">
              {secondaryNavItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'mobile-more-link-v2 active' : 'mobile-more-link-v2'}>
                  <NavIcon name={item.icon} size={19} /><span><strong>{item.label}</strong><small>{item.description}</small></span>
                </NavLink>
              ))}
              {isAdmin && (
                <>
                  <NavLink to="/admin" className={({ isActive }) => isActive ? 'mobile-more-link-v2 active' : 'mobile-more-link-v2'}><NavIcon name="admin" size={19} /><span><strong>Administração</strong><small>Gerenciar a competição</small></span></NavLink>
                </>
              )}
            </div>
            <button type="button" className="mobile-more-account-action-v2" onClick={openOwnProfile}><NavIcon name="predictions" size={18} /><span>Meu perfil</span></button>
            <button type="button" className="mobile-more-account-action-v2 logout" onClick={handleLogout}><NavIcon name="logout" size={18} /><span>Sair da conta</span></button>
          </section>
        </div>

        <nav className="mobile-primary-nav-v2" aria-label="Navegação principal">
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'mobile-primary-link-v2 active' : 'mobile-primary-link-v2'}><NavIcon name="home" size={20} /><small>Início</small></NavLink>
          <NavLink to="/rodadas" className={({ isActive }) => isActive ? 'mobile-primary-link-v2 active' : 'mobile-primary-link-v2'}><NavIcon name="rounds" size={20} /><small>Rodadas</small></NavLink>
          <NavLink to="/meus-palpites" className={({ isActive }) => isActive ? 'mobile-primary-link-v2 active' : 'mobile-primary-link-v2'}><NavIcon name="predictions" size={20} /><small>Meus palpites</small></NavLink>
          <NavLink to="/classificacao" className={({ isActive }) => isActive ? 'mobile-primary-link-v2 active' : 'mobile-primary-link-v2'}><NavIcon name="leaderboard" size={20} /><small>Classificação</small></NavLink>
          <button
            ref={mobileMoreTrigger}
            type="button"
            className={`mobile-primary-link-v2 ${mobileMoreOpen || moreIsActive ? 'active' : ''}`}
            onClick={() => setMobileMoreOpen((value) => !value)}
            aria-expanded={mobileMoreOpen}
            aria-controls="mobile-more-sheet-v2"
          ><NavIcon name="more" size={20} /><small>Mais</small></button>
        </nav>
      </div>

      {profileTarget && <ParticipantProfileModal profile={profileTarget} onClose={() => setProfileTarget(null)} />}
    </ParticipantProfileContext.Provider>
  )
}
