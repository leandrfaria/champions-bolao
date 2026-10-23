import { useState } from 'react'
import HomeBetModal from './HomeBetModal'
import TeamCrest from './TeamCrest'
import { calculatePoints, hasResult, isLocked } from '../lib/utils'

function formatKickoff(value) {
  const date = new Date(value)
  const day = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo',
  }).format(date).replace('.', '')
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(date)
  return `${day} · ${time}`
}

function formatScore(home, away, empty = '—x—') {
  if (home === null || home === undefined || away === null || away === undefined) return empty
  return `${home}x${away}`
}

function pointFeedback(points) {
  if (points === 3) return { label: 'Placar exato', value: '+3 pts', tone: 'exact' }
  if (points === 1) return { label: 'Desfecho certo', value: '+1 pt', tone: 'winner' }
  return { label: 'Sem pontos', value: '0 pts', tone: 'miss' }
}

export default function HomeMatchRow({ match, ownPrediction, presence = [], presenceStatus = 'ready', profiles = [], onSave, variant = 'desktop', kickoffTime }) {
  const [betModalOpen, setBetModalOpen] = useState(false)

  const finished = hasResult(match)
  const locked = isLocked(match)
  const points = calculatePoints(ownPrediction, match)
  const feedback = pointFeedback(points)
  const predictedCount = presence.filter((item) => item.has_predicted).length
  const totalParticipants = presence.length
  const realScore = formatScore(match.home_score, match.away_score)
  const pickScore = ownPrediction ? formatScore(ownPrediction.home_score, ownPrediction.away_score) : null
  const centerScore = finished ? realScore : pickScore || '—x—'
  const [centerHome, centerAway] = centerScore.split('x')
  const status = finished ? 'Resultado oficial' : locked ? 'Aguardando resultado' : 'Palpites abertos'
  const statusTone = finished ? 'finished' : locked ? 'locked' : 'open'
  const canOpenMobilePick = !finished && !locked

  function openBetModal() {
    if (canOpenMobilePick) setBetModalOpen(true)
  }

  function handleMobileKeyDown(event) {
    if (!canOpenMobilePick || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    openBetModal()
  }

  return (
    <>
      {variant === 'mobile' ? (
        <article
          className={`home-v3-fixture ${finished ? 'is-finished' : locked ? 'is-locked' : 'is-open'} ${canOpenMobilePick ? 'is-actionable' : ''}`}
          role={canOpenMobilePick ? 'button' : undefined}
          tabIndex={canOpenMobilePick ? 0 : undefined}
          aria-label={canOpenMobilePick ? `${ownPrediction ? 'Editar' : 'Fazer'} palpite: ${match.home_team} contra ${match.away_team}, às ${kickoffTime}` : undefined}
          onClick={canOpenMobilePick ? openBetModal : undefined}
          onKeyDown={handleMobileKeyDown}
        >
          <div className="home-v3-fixture-meta">
            <time dateTime={match.kickoff_at}>{kickoffTime}</time>
            <span className={`home-v3-fixture-state state-${statusTone}`}><i aria-hidden="true" />{status}</span>
          </div>

          <div className="home-v3-scoreboard" role="group" aria-label={`${match.home_team} ${finished ? `resultado oficial ${realScore}` : `seu palpite ${centerScore}`} ${match.away_team}`}>
            <div className="home-v3-club home">
              <TeamCrest team={match.home_team} size="medium" />
              <strong title={match.home_team}>{match.home_team}</strong>
            </div>
            <div className={`home-v3-score ${finished ? 'is-official' : pickScore ? 'is-prediction' : 'is-pending'}`} aria-label={finished ? `Resultado oficial ${realScore}` : pickScore ? `Seu palpite ${pickScore}` : 'Palpite pendente'}>
              <small>{finished ? 'Oficial' : 'Palpite'}</small>
              <strong><span>{centerHome}</span><i aria-hidden="true">×</i><span>{centerAway}</span></strong>
            </div>
            <div className="home-v3-club away">
              <TeamCrest team={match.away_team} size="medium" />
              <strong title={match.away_team}>{match.away_team}</strong>
            </div>
          </div>

          <div className="home-v3-fixture-footer">
            {finished ? (
              <div className="home-v3-fixture-pick">
                <span>Seu palpite</span>
                <strong className={!pickScore ? 'no-prediction' : ''}>{pickScore || 'Sem palpite'}</strong>
                {ownPrediction && <em className={`home-v3-points ${feedback.tone}`}><span>{feedback.label}</span><b>{feedback.value}</b></em>}
              </div>
            ) : (
              <>
                {presenceStatus === 'ready' && totalParticipants > 0 && (
                  <small className="home-v3-participation" aria-label={`${predictedCount} de ${totalParticipants} participantes enviaram palpites`}>
                    {predictedCount}/{totalParticipants} enviaram
                  </small>
                )}
                {!locked && <span className="home-v3-open-action" aria-hidden="true">{ownPrediction ? 'Editar' : 'Apostar'} <i>→</i></span>}
              </>
            )}
          </div>
        </article>
      ) : (
      <article className={`home-v2-match ${finished ? 'is-finished' : locked ? 'is-locked' : 'is-open'}`}>
        <div className="home-v2-match-meta">
          <time dateTime={match.kickoff_at}>{formatKickoff(match.kickoff_at)}</time>
          <span className={`home-v2-match-state state-${statusTone}`}><i aria-hidden="true" />{status}</span>
        </div>

        <div className="home-v2-matchup" role="group" aria-label={`${match.home_team} ${finished ? `resultado oficial ${realScore}` : `seu palpite ${centerScore}`} ${match.away_team}`}>
          <div className="home-v2-team home">
            <strong title={match.home_team}>{match.home_team}</strong>
            <TeamCrest team={match.home_team} size="medium" />
          </div>
          <div className={`home-v2-match-score ${finished ? 'is-official' : pickScore ? 'is-prediction' : 'is-pending'}`} aria-label={finished ? `Resultado oficial ${realScore}` : pickScore ? `Seu palpite ${pickScore}` : 'Palpite pendente'}>
            <small>{finished ? 'Oficial' : 'Seu palpite'}</small>
            <strong><span>{centerHome}</span><i aria-hidden="true">×</i><span>{centerAway}</span></strong>
          </div>
          <div className="home-v2-team away">
            <TeamCrest team={match.away_team} size="medium" />
            <strong title={match.away_team}>{match.away_team}</strong>
          </div>
        </div>

        <div className="home-v2-match-footer">
          {finished && (
            <div className="home-v2-my-pick">
              <span>Seu palpite</span>
              <strong className={!pickScore ? 'no-prediction' : ''}>{pickScore || 'Sem palpite'}</strong>
              {ownPrediction && <em className={`home-v2-points ${feedback.tone}`}><span>{feedback.label}</span><b>{feedback.value}</b></em>}
            </div>
          )}

          <div className="home-v2-match-actions">
            {presenceStatus === 'ready' && totalParticipants > 0 && (
              <small aria-label={`${predictedCount} de ${totalParticipants} participantes enviaram palpites`}>
                {predictedCount}/{totalParticipants} <span>participantes</span>
              </small>
            )}
            {!locked && !finished && (
              <button type="button" onClick={() => setBetModalOpen(true)} aria-label={`${ownPrediction ? 'Editar' : 'Fazer'} palpite para ${match.home_team} contra ${match.away_team}`}>
                {ownPrediction ? 'Editar' : 'Apostar'} <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </div>
      </article>
      )}

      {betModalOpen && !locked && !finished && (
        <HomeBetModal
          match={match}
          ownPrediction={ownPrediction}
          presence={presence}
          presenceStatus={presenceStatus}
          profiles={profiles}
          onSave={onSave}
          onClose={() => setBetModalOpen(false)}
          mobile={variant === 'mobile'}
        />
      )}
    </>
  )
}
