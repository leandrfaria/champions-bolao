import { useMemo, useState } from 'react'
import HomeBetModal from './HomeBetModal'
import TeamCrest from './TeamCrest'
import UserAvatar from './UserAvatar'
import { calculatePoints, hasResult, isLocked } from '../lib/utils'

function score(home, away) {
  if (home === null || home === undefined || away === null || away === undefined) return '— × —'
  return `${home} × ${away}`
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

function RoundChevron({ expanded }) {
  return (
    <svg className={`round-explorer-chevron${expanded ? ' is-expanded' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function PlayerRow({ profile, prediction, currentUserId, match, started, finished, hasPredicted }) {
  const isMine = profile.id === currentUserId
  const ownPick = isMine ? prediction : null
  const pickText = prediction ? score(prediction.home_score, prediction.away_score) : null
  const points = prediction && finished ? calculatePoints(prediction, match) : null
  const participantStatus = started ? (pickText || 'Sem palpite') : (ownPick ? pickText : (isMine ? 'Sem palpite' : hasPredicted ? 'Enviado' : 'Pendente'))

  return (
    <div className={`round-explorer-player-row${isMine ? ' is-mine' : ''}`}>
      <div className="round-explorer-player-person">
        <UserAvatar profile={profile} size="small" interactive={false} />
        <strong className="round-explorer-player-name" title={profile.display_name}>
          {profile.display_name || 'Participante'}{isMine && <em>Você</em>}
        </strong>
      </div>
      <span className="round-explorer-player-pick">{participantStatus}</span>
      {started && (
        <span className={`round-explorer-player-points ${points === null ? 'is-pending' : getPointTone(points)}`}>
          {points === null ? '—' : `+${points}`}
        </span>
      )}
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
  const started = isLocked(match) || finished
  const submittedCount = presence.filter((item) => item.has_predicted).length
  const participantCount = presence.length || profiles.length
  const centerLabel = finished ? 'Resultado oficial' : 'Palpite'
  const centerScore = finished ? score(match.home_score, match.away_score) : score(ownPrediction?.home_score, ownPrediction?.away_score)
  const points = ownPrediction && finished ? calculatePoints(ownPrediction, match) : null
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

  const secondary = []
  if (finished) {
    secondary.push(ownPrediction ? `Meu palpite: ${score(ownPrediction.home_score, ownPrediction.away_score)}` : 'Sem palpite')
    if (points !== null) secondary.push(<strong key="points" className={`round-explorer-match-points ${getPointTone(points)}`}>+{points} pts</strong>)
  }
  if (mode === 'general') secondary.unshift(`${submittedCount}/${participantCount} enviaram`)

  function openBet() {
    if (!started) setBetOpen(true)
  }

  return (
    <article className={`round-explorer-match${expanded ? ' is-expanded' : ''}${finished ? ' is-finished' : started ? ' is-live' : ' is-open'}`}>
      <div className="round-explorer-match-main">
        <div className="round-explorer-match-meta">
          <time dateTime={match.kickoff_at}>{formatKickoff(match.kickoff_at)}</time>
          <span className={`round-explorer-match-status ${finished ? 'finished' : started ? 'live' : 'open'}`}>
            <i aria-hidden="true" />{finished ? 'Finalizado' : started ? 'Em andamento' : 'Palpites abertos'}
          </span>
        </div>

        <div className="round-explorer-match-line">
          <button
            type="button"
            className="round-explorer-match-toggle"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={`${expanded ? 'Recolher' : 'Expandir'} detalhes de ${match.home_team} contra ${match.away_team}`}
            onClick={onToggle}
          >
            <span className="round-explorer-team home">
              <TeamCrest team={match.home_team} size="medium" />
              <strong title={match.home_team}>{match.home_team}</strong>
            </span>
            <span className={`round-explorer-score ${finished ? 'official' : ownPrediction ? 'predicted' : 'empty'}`}>
              <small>{centerLabel}</small>
              <strong>{centerScore}</strong>
            </span>
            <span className="round-explorer-team away">
              <TeamCrest team={match.away_team} size="medium" />
              <strong title={match.away_team}>{match.away_team}</strong>
            </span>
            {Boolean(secondary.length) && (
              <span className="round-explorer-match-secondary" aria-label={secondary.filter((item) => typeof item === 'string').join(', ')}>
                {secondary.map((item, index) => typeof item === 'string' ? <span key={`${item}-${index}`}>{item}</span> : item)}
              </span>
            )}
          </button>

          {!started && (
            <button type="button" className="round-explorer-bet-action" onClick={openBet}>
              {ownPrediction ? 'Editar' : 'Apostar'}
            </button>
          )}
          <button
            type="button"
            className="round-explorer-match-expand"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={`${expanded ? 'Recolher' : 'Expandir'} palpites de ${match.home_team} contra ${match.away_team}`}
            onClick={onToggle}
          >
            <RoundChevron expanded={expanded} />
          </button>
        </div>
      </div>

      <div id={panelId} className={`round-explorer-match-panel${expanded ? ' is-open' : ''}`} aria-hidden={!expanded} inert={!expanded}>
        <div className="round-explorer-match-panel-inner">
          {!started ? (
            <>
              <div className="round-explorer-details-heading">
                <div><strong>Participação</strong><span>{submittedCount} de {participantCount} enviaram</span></div>
                <small>Palpites de terceiros protegidos até o início da partida</small>
              </div>
              <div className="round-explorer-participants">
                {visibleParticipants.length ? visibleParticipants.map(({ profile, prediction, hasPredicted }) => (
                  <PlayerRow key={profile.id} profile={profile} prediction={prediction} currentUserId={currentUserId} match={match} started={false} finished={false} hasPredicted={hasPredicted} />
                )) : <p className="round-explorer-empty">Não há participantes disponíveis para esta partida.</p>}
              </div>
            </>
          ) : (
            <>
              <div className="round-explorer-details-heading">
                <div><strong>Palpites liberados</strong><span>{revealed.length} {revealed.length === 1 ? 'participante' : 'participantes'}</span></div>
                <small>{finished ? 'Pontuação individual apurada' : 'Pontuação após o resultado oficial'}</small>
              </div>
              <div className="round-explorer-participants">
                {visibleParticipants.length ? visibleParticipants.map(({ profile, prediction }) => (
                  <PlayerRow key={profile.id} profile={profile} prediction={prediction} currentUserId={currentUserId} match={match} started finished={finished} />
                )) : <p className="round-explorer-empty">Nenhum palpite liberado para esta partida.</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {betOpen && !started && (
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
