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

export default function HomeMatchRow({ match, ownPrediction, presence = [], profiles = [], onSave }) {
  const [betModalOpen, setBetModalOpen] = useState(false)

  const finished = hasResult(match)
  const locked = isLocked(match)
  const points = calculatePoints(ownPrediction, match)
  const feedback = pointFeedback(points)
  const predictedCount = presence.filter((item) => item.has_predicted).length
  const totalParticipants = presence.length
  const realScore = formatScore(match.home_score, match.away_score)
  const pickScore = ownPrediction ? formatScore(ownPrediction.home_score, ownPrediction.away_score) : null
  const status = finished ? 'Resultado oficial' : locked ? 'Aguardando resultado' : 'Palpites abertos'
  const statusTone = finished ? 'finished' : locked ? 'locked' : 'open'

  return (
    <>
      <article className={`home-v2-match ${finished ? 'is-finished' : locked ? 'is-locked' : 'is-open'}`}>
        <div className="home-v2-match-meta">
          <time dateTime={match.kickoff_at}>{formatKickoff(match.kickoff_at)}</time>
          <span className={`home-v2-match-state state-${statusTone}`}><i aria-hidden="true" />{status}</span>
        </div>

        <div className="home-v2-matchup" role="group" aria-label={`${match.home_team} ${finished ? realScore : 'contra'} ${match.away_team}`}>
          <div className="home-v2-team home">
            <strong title={match.home_team}>{match.home_team}</strong>
            <TeamCrest team={match.home_team} size="medium" />
          </div>
          <strong className={`home-v2-match-score ${finished ? 'has-result' : ''}`} aria-label={finished ? `Resultado ${realScore}` : 'Confronto'}>
            {finished ? realScore : <span aria-hidden="true">×</span>}
          </strong>
          <div className="home-v2-team away">
            <TeamCrest team={match.away_team} size="medium" />
            <strong title={match.away_team}>{match.away_team}</strong>
          </div>
        </div>

        <div className="home-v2-match-footer">
          <div className="home-v2-my-pick">
            <span>Seu palpite</span>
            {pickScore ? (
              <strong>{pickScore}</strong>
            ) : (
              <strong className="no-prediction">{finished ? 'Sem palpite' : locked ? 'Não enviado' : 'Pendente'}</strong>
            )}
            {finished && ownPrediction && <em className={`home-v2-points ${feedback.tone}`}><span>{feedback.label}</span><b>{feedback.value}</b></em>}
            {!finished && locked && ownPrediction && <em className="home-v2-awaiting">Aguardando resultado</em>}
          </div>

          <div className="home-v2-match-actions">
            {totalParticipants > 0 && (
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

      {betModalOpen && !locked && !finished && (
        <HomeBetModal
          match={match}
          ownPrediction={ownPrediction}
          presence={presence}
          profiles={profiles}
          onSave={onSave}
          onClose={() => setBetModalOpen(false)}
        />
      )}
    </>
  )
}
