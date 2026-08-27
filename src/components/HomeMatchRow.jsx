import { useState } from 'react'
import HomeBetModal from './HomeBetModal'
import TeamCrest from './TeamCrest'
import { calculatePoints, hasResult, isLocked } from '../lib/utils'

function dateParts(value) {
  const date = new Date(value)
  return {
    day: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '').toUpperCase(),
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date),
  }
}

function resultLabel(points) {
  if (points === 3) return { label: 'PLACAR EXATO', className: 'exact' }
  if (points === 1) return { label: 'VENCEDOR', className: 'winner' }
  return { label: 'NÃO PONTUOU', className: 'miss' }
}

export default function HomeMatchRow({ match, ownPrediction, presence = [], profiles = [], onSave }) {
  const [betModalOpen, setBetModalOpen] = useState(false)

  const finished = hasResult(match)
  const locked = isLocked(match)
  const points = calculatePoints(ownPrediction, match)
  const feedback = resultLabel(points)
  const date = dateParts(match.kickoff_at)
  const predictedCount = presence.filter((item) => item.has_predicted).length
  const totalParticipants = presence.length

  return (
    <>
      <article className={`home-match-row ${finished ? 'is-finished' : locked ? 'is-locked' : ownPrediction ? 'is-sent' : 'is-pending'}`}>
        <div className="home-match-date">
          <strong>{date.day}</strong>
          <span>{date.time}</span>
        </div>

        <div className="home-match-teams">
          <div className="home-team-line">
            <TeamCrest team={match.home_team} size="medium" />
            <strong>{match.home_team}</strong>
          </div>
          <span className="home-versus">×</span>
          <div className="home-team-line away">
            <TeamCrest team={match.away_team} size="medium" />
            <strong>{match.away_team}</strong>
          </div>
        </div>

        {finished ? (
          <>
            <div className="home-match-score-block result-score">
              <span>Resultado</span>
              <strong>{match.home_score} <i>×</i> {match.away_score}</strong>
            </div>
            <div className={`home-match-score-block own-score ${ownPrediction ? feedback.className : 'no-prediction'}`}>
              <span>Seu palpite</span>
              <strong>{ownPrediction ? `${ownPrediction.home_score} × ${ownPrediction.away_score}` : '—'}</strong>
            </div>
            <div className={`home-match-feedback ${feedback.className}`}>
              <strong>{ownPrediction ? feedback.label : 'SEM PALPITE'}</strong>
              <span>{ownPrediction ? `${points > 0 ? '+' : ''}${points} ${points === 1 ? 'pt' : 'pts'}` : '0 pts'}</span>
            </div>
          </>
        ) : locked ? (
          <>
            <div className="home-match-score-block own-score locked-score">
              <span>Seu palpite</span>
              <strong>{ownPrediction ? `${ownPrediction.home_score} × ${ownPrediction.away_score}` : '—'}</strong>
            </div>
            <div className="home-match-feedback locked-feedback">
              <strong>PALPITES ENCERRADOS</strong>
              <span>{ownPrediction ? 'Aguardando resultado' : 'Você não apostou'}</span>
            </div>
          </>
        ) : (
          <div className="home-match-action-area">
            {ownPrediction ? (
              <div className="home-sent-state">
                <div className="home-match-score-block own-score editable-score sent-score-card">
                  <span className="home-sent-label">Seu palpite</span>
                  <strong>{ownPrediction.home_score} <i>×</i> {ownPrediction.away_score}</strong>
                </div>
                <button type="button" className="home-edit-prediction-button" onClick={() => setBetModalOpen(true)}>Alterar palpite</button>
              </div>
            ) : (
              <div className="home-pending-action">
                <button
                  type="button"
                  className="home-pending-count"
                  aria-label={`${predictedCount}/${totalParticipants || 0} pessoas apostaram`}
                  data-tooltip={`${predictedCount}/${totalParticipants || 0} pessoas apostaram`}
                >
                  <b>{predictedCount}</b>{totalParticipants ? `/${totalParticipants}` : ''}
                </button>
                <div className="home-pending-cta">
                  <strong>PALPITE PENDENTE</strong>
                  <button onClick={() => setBetModalOpen(true)}>Apostar</button>
                </div>
              </div>
            )}
          </div>
        )}
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
