import { useState } from 'react'
import HomeBetModal from './HomeBetModal'
import TeamCrest from './TeamCrest'
import { calculatePoints, hasResult, isLocked } from '../lib/utils'

function formatKickoff(value) {
  const date = new Date(value)
  const day = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo',
  }).format(date).replace('.', '').toUpperCase()
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(date)
  return `${day} · ${time}`
}

function formatScore(home, away, empty = '—x—') {
  if (home === null || home === undefined || away === null || away === undefined) return empty
  return `${home}x${away}`
}

function buildResult(points) {
  if (points === 3) return { label: 'Você acertou', score: '+3 pts', className: 'exact' }
  if (points === 1) return { label: 'Você acertou', score: '+1 pt', className: 'winner' }
  return { label: 'Não pontuou', score: '0 pts', className: 'miss' }
}

export default function HomeMatchRow({ match, ownPrediction, presence = [], profiles = [], onSave }) {
  const [betModalOpen, setBetModalOpen] = useState(false)

  const finished = hasResult(match)
  const locked = isLocked(match)
  const points = calculatePoints(ownPrediction, match)
  const feedback = buildResult(points)
  const predictedCount = presence.filter((item) => item.has_predicted).length
  const totalParticipants = presence.length
  const realScore = formatScore(match.home_score, match.away_score)
  const pickScore = ownPrediction ? formatScore(ownPrediction.home_score, ownPrediction.away_score) : '—x—'

  return (
    <>
      <article className={`home-ref-match-card ${finished ? 'is-finished' : locked ? 'is-locked' : 'is-open'}`}>
        <div className="home-ref-match-top">
          <span className="home-ref-match-kickoff">{formatKickoff(match.kickoff_at)}</span>
        </div>

        <div className="home-ref-match-main">
          <div className="home-ref-match-teams">
            <div className="home-ref-team home-ref-team-home">
              <TeamCrest team={match.home_team} size="medium" />
              <strong title={match.home_team}>{match.home_team}</strong>
            </div>

            {finished ? (
              <strong className="home-ref-center-score">{realScore}</strong>
            ) : (
              <span className="home-ref-versus">x</span>
            )}

            <div className="home-ref-team home-ref-team-away">
              <TeamCrest team={match.away_team} size="medium" />
              <strong title={match.away_team}>{match.away_team}</strong>
            </div>
          </div>

          {finished ? (
            <div className="home-ref-match-side home-ref-match-side-finished">
              <div className="home-ref-score-block compact">
                <span>Seu palpite</span>
                <strong>{pickScore}</strong>
              </div>
              <div className={`home-ref-match-feedback ${feedback.className}`}>
                <span>{feedback.label}</span>
                <b>{feedback.score}</b>
              </div>
            </div>
          ) : locked ? (
            <div className="home-ref-match-side home-ref-match-side-finished">
              <div className="home-ref-score-block compact">
                <span>Seu palpite</span>
                <strong>{pickScore}</strong>
              </div>
              <div className="home-ref-match-feedback locked">
                <span>Palpites encerrados</span>
                <b>{ownPrediction ? 'Aguardando resultado' : 'Você não apostou'}</b>
              </div>
            </div>
          ) : (
            <div className="home-ref-match-side home-ref-match-side-open">
              <div className="home-ref-score-block">
                <span>Seu palpite</span>
                <strong>{pickScore}</strong>
              </div>
              <div className="home-ref-match-actions">
                <small>{predictedCount}/{totalParticipants || 0} enviados</small>
                <button type="button" className="home-ref-edit-link" onClick={() => setBetModalOpen(true)}>
                  {ownPrediction ? 'Editar' : 'Apostar'} <span>→</span>
                </button>
              </div>
            </div>
          )}
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
