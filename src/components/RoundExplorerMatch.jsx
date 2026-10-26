import { useMemo, useState } from 'react'
import HomeBetModal from './HomeBetModal'
import TeamCrest from './TeamCrest'
import UserAvatar from './UserAvatar'
import { calculatePoints, hasResult, isLocked } from '../lib/utils'

function score(home, away) {
  if (home === null || home === undefined || away === null || away === undefined) return '— x —'
  return `${home} x ${away}`
}

function formatKickoff(value) {
  if (!value) return 'Horário não informado'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value)).replace('.', '')
}

function getPointTone(points) {
  if (points === 3) return 'exact'
  if (points === 1) return 'winner'
  return 'miss'
}

function PlayerRow({ profile, prediction, currentUserId, match, hasStarted, finished, hasPredicted }) {
  const isMine = profile.id === currentUserId
  const ownPick = isMine ? prediction : null
  const pickText = prediction ? score(prediction.home_score, prediction.away_score) : null
  const points = prediction && finished ? calculatePoints(prediction, match) : null

  return (
    <div className={`round-explorer-player-row${isMine ? ' is-mine' : ''}`}>
      <UserAvatar profile={profile} size="small" interactive={false} />
      <strong className="round-explorer-player-name" title={profile.display_name}>{profile.display_name || 'Participante'}{isMine && <em>Você</em>}</strong>
      <span className="round-explorer-player-pick">
        {hasStarted ? (pickText || 'Sem palpite') : (ownPick ? `Seu palpite ${pickText}` : (isMine ? 'Sem palpite' : (hasPredicted ? 'Enviado' : 'Pendente')))}
      </span>
      <span className={`round-explorer-player-points ${points === null ? 'is-pending' : getPointTone(points)}`}>
        {points === null ? '—' : `+${points}`}
      </span>
    </div>
  )
}

export default function RoundExplorerMatch({
  match,
  mode,
  ownPrediction,
  predictions = [],
  presence = [],
  profiles = [],
  currentUserId,
  expanded,
  onToggle,
  onSave,
}) {
  const [betOpen, setBetOpen] = useState(false)
  const finished = hasResult(match)
  const locked = isLocked(match)
  const started = locked || finished
  const submittedCount = presence.filter((item) => item.has_predicted).length
  const scoreLabel = finished ? 'Resultado oficial' : ownPrediction ? 'Seu palpite' : 'Previsão pendente'
  const centerScore = finished ? score(match.home_score, match.away_score) : score(ownPrediction?.home_score, ownPrediction?.away_score)
  const points = ownPrediction && finished ? calculatePoints(ownPrediction, match) : null
  const pointTone = points === null ? '' : getPointTone(points)
  const matchStatus = finished ? 'Finalizado' : started ? 'Em andamento' : 'Palpites abertos'
  const panelId = `round-match-details-${match.id}`

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const revealed = useMemo(() => {
    if (!started) return []
    return [...predictions].sort((a, b) => {
      if (a.user_id === currentUserId) return -1
      if (b.user_id === currentUserId) return 1
      return (a.profiles?.display_name || '').localeCompare(b.profiles?.display_name || '')
    })
  }, [currentUserId, predictions, started])

  const visibleParticipants = started
    ? revealed.map((prediction) => ({
      profile: prediction.profiles || profileById.get(prediction.user_id) || { id: prediction.user_id, display_name: 'Participante' },
      prediction,
    }))
    : [...presence]
      .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''))
      .map((entry) => ({
        profile: profileById.get(entry.user_id) || { id: entry.user_id, display_name: entry.display_name || 'Participante' },
        prediction: entry.user_id === currentUserId ? ownPrediction : null,
        hasPredicted: entry.has_predicted,
      }))

  function openBet(event) {
    event.stopPropagation()
    if (!started && !finished) setBetOpen(true)
  }

  return (
    <article className={`round-explorer-match${expanded ? ' is-expanded' : ''}${finished ? ' is-finished' : started ? ' is-live' : ' is-open'}`}>
      <div className="round-explorer-match-main">
        <button
          type="button"
          className="round-explorer-match-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${expanded ? 'Recolher' : 'Expandir'} detalhes de ${match.home_team} contra ${match.away_team}`}
          onClick={onToggle}
        >
          <span className="round-explorer-match-meta">
            <time dateTime={match.kickoff_at}>{formatKickoff(match.kickoff_at)}</time>
            <span className={`round-explorer-match-status ${finished ? 'finished' : started ? 'live' : 'open'}`}><i aria-hidden="true" />{matchStatus}</span>
          </span>

          <span className="round-explorer-scoreboard">
            <span className="round-explorer-team home">
              <TeamCrest team={match.home_team} size="medium" />
              <strong title={match.home_team}>{match.home_team}</strong>
            </span>
            <span className={`round-explorer-score ${finished ? 'official' : ownPrediction ? 'predicted' : 'empty'}`}>
              <small>{scoreLabel}</small>
              <strong>{centerScore}</strong>
            </span>
            <span className="round-explorer-team away">
              <TeamCrest team={match.away_team} size="medium" />
              <strong title={match.away_team}>{match.away_team}</strong>
            </span>
          </span>

          <span className="round-explorer-match-foot">
            <span className="round-explorer-mode-summary">
              {mode === 'individual' ? (
                <>{ownPrediction ? `Meu palpite ${score(ownPrediction.home_score, ownPrediction.away_score)}` : 'Sem palpite'}<span className="round-explorer-summary-separator">·</span>{points === null ? 'Pontos —' : `Pontos +${points}`}</>
              ) : (
                <>{submittedCount}/{presence.length || profiles.length} participantes enviaram<span className="round-explorer-summary-separator">·</span>Meu palpite {ownPrediction ? score(ownPrediction.home_score, ownPrediction.away_score) : '—'}</>
              )}
            </span>
            <span className={`round-explorer-match-chevron${expanded ? ' open' : ''}`} aria-hidden="true">⌄</span>
          </span>
        </button>

        {!started && !finished && (
          <button type="button" className="round-explorer-bet-action" onClick={openBet}>
            {ownPrediction ? 'Editar palpite' : 'Apostar'} <span aria-hidden="true">→</span>
          </button>
        )}
        {points !== null && (
          <span className={`round-explorer-own-points ${pointTone}`} aria-label={`Você fez ${points} pontos`}>
            +{points}<small>pts</small>
          </span>
        )}
      </div>

      <div id={panelId} className={`round-explorer-match-panel${expanded ? ' is-open' : ''}`} aria-hidden={!expanded} inert={!expanded}>
        <div className="round-explorer-match-panel-inner">
          {!started ? (
            <>
              <div className="round-explorer-details-heading">
                <div><strong>Participação</strong><span>{submittedCount} de {presence.length || profiles.length} enviaram</span></div>
                <small>Placar de terceiros protegido até o início da partida</small>
              </div>
              <div className="round-explorer-participants">
                {visibleParticipants.length ? visibleParticipants.map(({ profile, prediction, hasPredicted }) => (
                  <PlayerRow key={profile.id} profile={profile} prediction={prediction} currentUserId={currentUserId} match={match} hasStarted={false} finished={false} hasPredicted={hasPredicted} />
                )) : <p className="round-explorer-empty">Não há participantes disponíveis para esta partida.</p>}
              </div>
            </>
          ) : (
            <>
              <div className="round-explorer-details-heading">
                <div><strong>Palpites liberados</strong><span>{revealed.length} {revealed.length === 1 ? 'participante' : 'participantes'}</span></div>
                <small>{finished ? 'Pontuação individual apurada' : 'Pontuação será exibida após o resultado oficial'}</small>
              </div>
              <div className="round-explorer-participants">
                {visibleParticipants.length ? visibleParticipants.map(({ profile, prediction }) => (
                  <PlayerRow key={profile.id} profile={profile} prediction={prediction} currentUserId={currentUserId} match={match} hasStarted finished={finished} />
                )) : <p className="round-explorer-empty">Nenhum palpite liberado para esta partida.</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {betOpen && !started && !finished && (
        <HomeBetModal
          match={match}
          ownPrediction={ownPrediction}
          presence={presence}
          profiles={profiles}
          onSave={onSave}
          onClose={() => setBetOpen(false)}
          mobile={window.matchMedia?.('(max-width: 680px)').matches || false}
        />
      )}
    </article>
  )
}
