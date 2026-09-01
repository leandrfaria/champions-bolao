import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import ScorePicker from './ScorePicker'
import TeamCrest from './TeamCrest'
import UserAvatar from './UserAvatar'

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

export default function HomeBetModal({ match, ownPrediction, presence = [], profiles = [], onSave, onClose }) {
  const [homeScore, setHomeScore] = useState(ownPrediction?.home_score != null ? String(ownPrediction.home_score) : '0')
  const [awayScore, setAwayScore] = useState(ownPrediction?.away_score != null ? String(ownPrediction.away_score) : '0')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const pendingUsers = presence.filter((item) => !item.has_predicted)
  const predictedCount = presence.filter((item) => item.has_predicted).length
  const selectedByProfile = match.selected_by_user_id ? profileMap.get(match.selected_by_user_id) : null

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !saving) onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, saving])

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
      onClose?.()
    } catch (error) {
      setMessage(error.message || 'Não foi possível salvar o palpite.')
    } finally {
      setSaving(false)
    }
  }

  const modalContent = (
    <div className="home-bet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose?.() }}>
      <section className="home-bet-modal" role="dialog" aria-modal="true" aria-labelledby={`bet-title-${match.id}`}>
        <header className="home-bet-modal-header">
          <div>
            <span className="sports-eyebrow">Palpite da rodada</span>
            <h2 id={`bet-title-${match.id}`}>{ownPrediction ? 'Alterar palpite' : 'Fazer palpite'}</h2>
            <p>{formatKickoff(match.kickoff_at)}</p>
          </div>
          <button type="button" className="home-bet-close" onClick={onClose} disabled={saving} aria-label="Fechar">×</button>
        </header>

        {selectedByProfile && (
          <div className="home-bet-selected-by">
            <span>Jogo escolhido por</span>
            <div><UserAvatar profile={selectedByProfile} size="tiny" interactive={false} /><strong>{selectedByProfile.display_name}</strong></div>
          </div>
        )}

        <div className="home-bet-matchup">
          <div className="home-bet-team">
            <TeamCrest team={match.home_team} size="large" />
            <strong>{match.home_team}</strong>
          </div>

          <div className="home-bet-score-area">
            <ScorePicker value={homeScore} onChange={setHomeScore} disabled={saving} ariaLabel={`Gols de ${match.home_team}`} />
            <span className="home-bet-x">×</span>
            <ScorePicker value={awayScore} onChange={setAwayScore} disabled={saving} ariaLabel={`Gols de ${match.away_team}`} />
          </div>

          <div className="home-bet-team away">
            <TeamCrest team={match.away_team} size="large" />
            <strong>{match.away_team}</strong>
          </div>
        </div>

        <p className="home-bet-tip">Você pode digitar o placar ou usar os botões − e +.</p>
        {message && <div className="home-bet-error">{message}</div>}

        <section className="home-bet-pending">
          <div className="home-bet-pending-head">
            <div>
              <span>Quem ainda falta apostar</span>
              <strong>{pendingUsers.length ? `${pendingUsers.length} ${pendingUsers.length === 1 ? 'participante' : 'participantes'}` : 'Todo mundo apostou'}</strong>
            </div>
            {presence.length > 0 && <small>{predictedCount}/{presence.length} enviados</small>}
          </div>

          {pendingUsers.length ? (
            <div className="home-bet-pending-list">
              {pendingUsers.map((item) => {
                const profile = profileMap.get(item.user_id) || { id: item.user_id, display_name: item.display_name }
                return (
                  <span className="home-bet-person" key={item.user_id}>
                    <UserAvatar profile={profile} size="tiny" />
                    <span>{item.display_name}</span>
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="home-bet-all-done">Todos os participantes já enviaram seus palpites para este jogo.</p>
          )}
        </section>

        <footer className="home-bet-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="primary-button" onClick={save} disabled={saving}>{saving ? 'Salvando...' : ownPrediction ? 'Salvar alteração' : 'Salvar palpite'}</button>
        </footer>
      </section>
    </div>
  )

  if (typeof document === 'undefined') return modalContent
  return createPortal(modalContent, document.body)
}
