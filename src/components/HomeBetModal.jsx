import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ScorePicker from './ScorePicker'
import TeamCrest from './TeamCrest'
import UserAvatar from './UserAvatar'
import '../styles/home-bet-modal-v2.css'

function formatKickoff(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value)).replace('.', '')
}

function formatPresenceTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

export default function HomeBetModal({
  match,
  ownPrediction,
  presence = [],
  presenceStatus = 'ready',
  presenceUpdatedAt,
  profiles = [],
  onSave,
  onClose,
}) {
  const [homeScore, setHomeScore] = useState(ownPrediction?.home_score != null ? String(ownPrediction.home_score) : '0')
  const [awayScore, setAwayScore] = useState(ownPrediction?.away_score != null ? String(ownPrediction.away_score) : '0')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [presenceTab, setPresenceTab] = useState('submitted')
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const savingRef = useRef(saving)
  onCloseRef.current = onClose
  savingRef.current = saving

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const submittedUsers = presence.filter((item) => item.has_predicted)
  const pendingUsers = presence.filter((item) => !item.has_predicted)
  const visibleUsers = presenceTab === 'submitted' ? submittedUsers : pendingUsers
  const selectedByProfile = match.selected_by_user_id ? profileMap.get(match.selected_by_user_id) : null
  const presenceTime = formatPresenceTime(presenceUpdatedAt)

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    function onKeyDown(event) {
      if (event.key === 'Escape' && !savingRef.current) {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || [])]
        .filter((element) => element.getClientRects().length > 0)
      if (!focusable.length) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  async function save() {
    if (saving) return
    if (homeScore === '' || awayScore === '') {
      setMessage('Informe os dois placares.')
      return
    }

    const home = Number(homeScore)
    const away = Number(awayScore)
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 99 || away > 99) {
      setMessage('Use gols entre 0 e 99.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      await onSave(match.id, home, away)
      onCloseRef.current?.()
    } catch (error) {
      setMessage(error.message || 'Não foi possível salvar o palpite.')
    } finally {
      setSaving(false)
    }
  }

  function handlePresenceTabKeyDown(event) {
    const tabIds = [`bet-tab-submitted-${match.id}`, `bet-tab-pending-${match.id}`]
    const currentIndex = tabIds.indexOf(document.activeElement?.id)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabIds.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex + tabIds.length - 1) % tabIds.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabIds.length - 1
    else return
    event.preventDefault()
    setPresenceTab(nextIndex === 0 ? 'submitted' : 'pending')
    document.getElementById(tabIds[nextIndex])?.focus()
  }

  const modalContent = (
    <div className="home-bet-backdrop home-bet-backdrop-v2" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCloseRef.current?.() }}>
      <section ref={dialogRef} className="home-bet-modal home-bet-modal-v2" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby={`bet-title-${match.id}`}>
        <header className="home-bet-modal-header">
          <div>
            <span className="sports-eyebrow">Palpite da rodada</span>
            <h2 id={`bet-title-${match.id}`}>{ownPrediction ? 'Alterar palpite' : 'Fazer palpite'}</h2>
            <p><time dateTime={match.kickoff_at}>{formatKickoff(match.kickoff_at)}</time></p>
          </div>
          <button ref={closeButtonRef} type="button" className="home-bet-close" onClick={() => onCloseRef.current?.()} disabled={saving} aria-label="Fechar">×</button>
        </header>

        <div className="home-bet-modal-content">
          {selectedByProfile && (
            <div className="home-bet-selected-by">
              <span>Jogo escolhido por</span>
              <div><UserAvatar profile={selectedByProfile} size="tiny" interactive={false} /><strong>{selectedByProfile.display_name}</strong></div>
            </div>
          )}

          <div className="home-bet-matchup home-bet-matchup-v2">
            <div className="home-bet-team home-bet-team-v2">
              <div className="home-bet-team-identity">
                <small>Mandante</small>
                <div><TeamCrest team={match.home_team} size="large" /><strong>{match.home_team}</strong></div>
              </div>
              <ScorePicker value={homeScore} onChange={setHomeScore} disabled={saving} ariaLabel={`Gols de ${match.home_team}`} />
            </div>

            <span className="home-bet-x home-bet-x-v2" aria-hidden="true">×</span>

            <div className="home-bet-team home-bet-team-v2 away">
              <div className="home-bet-team-identity">
                <small>Visitante</small>
                <div><TeamCrest team={match.away_team} size="large" /><strong>{match.away_team}</strong></div>
              </div>
              <ScorePicker value={awayScore} onChange={setAwayScore} disabled={saving} ariaLabel={`Gols de ${match.away_team}`} />
            </div>
          </div>

          <p className="home-bet-tip">Digite o placar ou ajuste com − e +.</p>
          {message && <div className="home-bet-error" role="alert">{message}</div>}

          <section className="home-bet-pending home-bet-attendance" aria-labelledby={`bet-attendance-title-${match.id}`}>
            <div className="home-bet-attendance-heading">
              <div>
                <span className="home-bet-attendance-kicker">Participação</span>
                <h3 id={`bet-attendance-title-${match.id}`}>Quem já enviou</h3>
              </div>
              {presenceStatus === 'ready' && presence.length > 0 && (
                <p className="home-bet-attendance-total">{submittedUsers.length} de {presence.length} enviaram</p>
              )}
            </div>

            {presenceStatus === 'ready' && presenceUpdatedAt && (
              <p className="home-bet-attendance-updated">Consulta atualizada às <time dateTime={new Date(presenceUpdatedAt).toISOString()}>{presenceTime}</time></p>
            )}

            {presenceStatus === 'loading' && <p className="home-bet-attendance-state" role="status">Atualizando participação…</p>}
            {presenceStatus === 'error' && <p className="home-bet-attendance-state is-error" role="status">Não foi possível consultar a participação agora. Tente novamente mais tarde.</p>}
            {presenceStatus === 'empty' && <p className="home-bet-attendance-state">Não há participantes disponíveis nesta rodada.</p>}

            {presenceStatus === 'ready' && (
              <>
                <div className="home-bet-attendance-tabs" role="tablist" aria-label="Filtrar participantes por envio">
                  <button id={`bet-tab-submitted-${match.id}`} type="button" role="tab" aria-selected={presenceTab === 'submitted'} aria-controls={`bet-panel-${match.id}`} tabIndex={presenceTab === 'submitted' ? 0 : -1} onClick={() => setPresenceTab('submitted')} onKeyDown={handlePresenceTabKeyDown}>
                    Enviaram <span>{submittedUsers.length}</span>
                  </button>
                  <button id={`bet-tab-pending-${match.id}`} type="button" role="tab" aria-selected={presenceTab === 'pending'} aria-controls={`bet-panel-${match.id}`} tabIndex={presenceTab === 'pending' ? 0 : -1} onClick={() => setPresenceTab('pending')} onKeyDown={handlePresenceTabKeyDown}>
                    Pendentes <span>{pendingUsers.length}</span>
                  </button>
                </div>

                <div id={`bet-panel-${match.id}`} className="home-bet-attendance-list" role="tabpanel" aria-labelledby={presenceTab === 'submitted' ? `bet-tab-submitted-${match.id}` : `bet-tab-pending-${match.id}`}>
                  {visibleUsers.length ? visibleUsers.map((item) => {
                    const profile = profileMap.get(item.user_id) || { id: item.user_id, display_name: item.display_name }
                    const displayName = item.display_name || profile.display_name || 'Participante'
                    return (
                      <div className={`home-bet-person home-bet-person-v2 ${item.has_predicted ? 'is-submitted' : 'is-pending'}`} key={item.user_id}>
                        <UserAvatar profile={{ ...profile, display_name: displayName }} size="small" interactive={false} />
                        <span className="home-bet-person-name">{displayName}</span>
                        <span className="home-bet-person-state">{item.has_predicted ? 'Enviado' : 'Pendente'}</span>
                      </div>
                    )
                  }) : (
                    <p className="home-bet-attendance-empty">
                      {presenceTab === 'submitted' ? 'Ninguém enviou palpite para esta partida ainda.' : 'Todos os participantes já enviaram palpite.'}
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <footer className="home-bet-actions">
          <button type="button" className="secondary-button" onClick={() => onCloseRef.current?.()} disabled={saving}>Cancelar</button>
          <button type="button" className="primary-button" onClick={save} disabled={saving}>{saving ? 'Salvando...' : ownPrediction ? 'Salvar alteração' : 'Salvar palpite'}</button>
        </footer>
      </section>
    </div>
  )

  if (typeof document === 'undefined') return modalContent
  return createPortal(modalContent, document.body)
}
