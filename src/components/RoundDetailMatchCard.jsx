import { useMemo, useState } from 'react'
import HomeBetModal from './HomeBetModal'
import TeamCrest from './TeamCrest'
import UserAvatar from './UserAvatar'
import { calculatePoints, hasResult, isLocked } from '../lib/utils'

function formatKickoff(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value)).replace('.', '')
}

function score(home, away) {
  if (home === null || home === undefined || away === null || away === undefined) return '– x –'
  return `${home}x${away}`
}

export default function RoundDetailMatchCard({
  match,
  ownPrediction,
  predictions = [],
  presence = [],
  profiles = [],
  currentUserId,
  onSave,
}) {
  const locked = isLocked(match)
  const finished = hasResult(match)
  const [expanded, setExpanded] = useState(locked)
  const [showAll, setShowAll] = useState(false)
  const [betOpen, setBetOpen] = useState(false)

  const status = finished
    ? { label: 'Finalizado', className: 'finished' }
    : locked
      ? { label: 'Em andamento', className: 'live' }
      : { label: 'Aberto', className: 'open' }

  const predictedCount = presence.filter((item) => item.has_predicted).length
  const groupSize = presence.length || profiles.length || predictions.length

  const revealedPredictions = useMemo(() => {
    if (!locked) return predictions.filter((item) => item.user_id === currentUserId)
    return [...predictions].sort((a, b) => {
      if (a.user_id === currentUserId) return -1
      if (b.user_id === currentUserId) return 1
      return (a.profiles?.display_name || '').localeCompare(b.profiles?.display_name || '')
    })
  }, [locked, predictions, currentUserId])

  const visibleRows = showAll ? revealedPredictions : revealedPredictions.slice(0, 5)

  return (
    <>
      <article className={`round-detail-match-card ${status.className} ${expanded ? 'expanded' : ''}`}>
        <div className="round-detail-match-top">
          <span>{formatKickoff(match.kickoff_at)}</span>
          <span className={`round-detail-status ${status.className}`}><i />{status.label}</span>
        </div>

        <div className="round-detail-matchup">
          <div className="round-detail-team home">
            <strong>{match.home_team}</strong>
            <TeamCrest team={match.home_team} size="medium" />
          </div>

          <div className="round-detail-score">{finished ? score(match.home_score, match.away_score) : '– x –'}</div>

          <div className="round-detail-team away">
            <TeamCrest team={match.away_team} size="medium" />
            <strong>{match.away_team}</strong>
          </div>
        </div>

        {locked ? (
          <div className="round-detail-group-area">
            <button type="button" className="round-detail-group-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
              <span><b>✦</b> Palpites do grupo ({groupSize})</span>
              <span>{expanded ? 'Ocultar palpites' : 'Ver palpites'} {expanded ? '⌃' : '⌄'}</span>
            </button>

            {expanded && (
              <div className="round-detail-predictions">
                <div className="round-detail-prediction-head">
                  <span>Participante</span><span>Palpite</span><span>Pontos</span>
                </div>
                {visibleRows.length ? visibleRows.map((prediction) => {
                  const points = calculatePoints(prediction, match)
                  const pointsClass = !finished ? '' : points === 3 ? 'exact' : points === 1 ? 'winner' : 'miss'
                  return (
                    <div className={`round-detail-prediction-row ${prediction.user_id === currentUserId ? 'mine' : ''}`} key={prediction.id}>
                      <span className="round-detail-player"><UserAvatar profile={prediction.profiles} size="tiny" /><strong>{prediction.profiles?.display_name || 'Jogador'}</strong>{prediction.user_id === currentUserId && <em>você</em>}</span>
                      <strong>{score(prediction.home_score, prediction.away_score)}</strong>
                      <b className={pointsClass}>{finished ? `${points > 0 ? '+' : ''}${points}` : '—'}</b>
                    </div>
                  )
                }) : <p className="round-detail-no-predictions">Nenhum palpite registrado para esta partida.</p>}

                {!showAll && revealedPredictions.length > 5 && (
                  <button type="button" className="round-detail-show-all" onClick={() => setShowAll(true)}>Ver todos os {revealedPredictions.length} palpites <span>→</span></button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="round-detail-open-area">
            <span><b>✦</b> {predictedCount}/{groupSize || 0} palpites enviados</span>
            <button type="button" onClick={() => setBetOpen(true)}>{ownPrediction ? 'Editar meu palpite' : 'Fazer meu palpite'} <span>→</span></button>
          </div>
        )}
      </article>

      {betOpen && !locked && (
        <HomeBetModal
          match={match}
          ownPrediction={ownPrediction}
          presence={presence}
          profiles={profiles}
          onSave={onSave}
          onClose={() => setBetOpen(false)}
        />
      )}
    </>
  )
}
