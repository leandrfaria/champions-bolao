import { useEffect, useMemo, useState } from 'react'
import ScorePicker from './ScorePicker'
import UserAvatar from './UserAvatar'
import TeamCrest from './TeamCrest'
import { calculatePoints, formatDateTime, hasResult, isLocked, timeUntilStart } from '../lib/utils'

export default function MatchCard({
  match,
  ownPrediction,
  visiblePredictions = [],
  presence = [],
  currentUserId,
  onSave,
  compact = false,
}) {
  const [homeScore, setHomeScore] = useState(ownPrediction?.home_score != null ? String(ownPrediction.home_score) : '0')
  const [awayScore, setAwayScore] = useState(ownPrediction?.away_score != null ? String(ownPrediction.away_score) : '0')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setHomeScore(ownPrediction?.home_score != null ? String(ownPrediction.home_score) : '0')
    setAwayScore(ownPrediction?.away_score != null ? String(ownPrediction.away_score) : '0')
  }, [ownPrediction?.id, ownPrediction?.home_score, ownPrediction?.away_score])

  const locked = isLocked(match)
  const finished = hasResult(match)
  const predictedUsers = presence.filter((item) => item.has_predicted)
  const pendingUsers = presence.filter((item) => !item.has_predicted)
  const points = calculatePoints(ownPrediction, match)

  const revealedPredictions = useMemo(() => {
    if (!locked) return visiblePredictions.filter((p) => p.user_id === currentUserId)
    return [...visiblePredictions].sort((a, b) => (a.profiles?.display_name || '').localeCompare(b.profiles?.display_name || ''))
  }, [locked, visiblePredictions, currentUserId])

  async function handleSave() {
    if (!onSave || locked) return
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
      setMessage('Palpite salvo.')
    } catch (error) {
      setMessage(error.message || 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className={`match-card ${locked ? 'locked' : 'open'} ${compact ? 'compact' : ''}`}>
      <div className="match-card-topline">
        <div className="match-time">
          <span className={`status-dot ${finished ? 'finished' : locked ? 'locked' : 'open'}`} />
          <span>{formatDateTime(match.kickoff_at)}</span>
        </div>
        <span className={`status-pill ${finished ? 'finished' : locked ? 'locked' : 'open'}`}>
          {finished ? 'Finalizado' : locked ? 'Palpites encerrados' : timeUntilStart(match.kickoff_at)}
        </span>
      </div>

      <div className="teams-row">
        <div className="team home-team">
          <TeamCrest team={match.home_team} size="large" />
          <strong>{match.home_team}</strong>
        </div>

        <div className="score-center">
          {finished ? (
            <div className="final-score">
              <strong>{match.home_score}</strong>
              <span>×</span>
              <strong>{match.away_score}</strong>
            </div>
          ) : (
            <span className="versus">VS</span>
          )}
        </div>

        <div className="team away-team">
          <TeamCrest team={match.away_team} size="large" />
          <strong>{match.away_team}</strong>
        </div>
      </div>

      {!locked && onSave && (
        <div className="prediction-box">
          <div className="prediction-heading">
            <div>
              <span className="mini-label">Seu palpite</span>
              <strong>{ownPrediction ? 'Você já apostou — ainda dá para alterar' : 'Escolha o placar'}</strong>
            </div>
            {presence.length > 0 && <span className="participant-count">{predictedUsers.length}/{presence.length} apostaram</span>}
          </div>

          <div className="prediction-controls">
            <div>
              <span>{match.home_team}</span>
              <ScorePicker value={homeScore} onChange={setHomeScore} disabled={saving} ariaLabel={`Gols de ${match.home_team}`} />
            </div>
            <span className="prediction-x">×</span>
            <div>
              <span>{match.away_team}</span>
              <ScorePicker value={awayScore} onChange={setAwayScore} disabled={saving} ariaLabel={`Gols de ${match.away_team}`} />
            </div>
          </div>

          <div className="prediction-actions">
            <button className="primary-button" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : ownPrediction ? 'Atualizar palpite' : 'Salvar palpite'}
            </button>
            {message && <span className="inline-message">{message}</span>}
          </div>

          {pendingUsers.length > 0 && (
            <p className="pending-copy">
              Ainda faltam: {pendingUsers.map((item) => item.display_name).join(', ')}.
            </p>
          )}
        </div>
      )}

      {locked && (
        <div className="revealed-panel">
          <div className="revealed-header">
            <div>
              <span className="mini-label">Palpites liberados</span>
              <strong>{finished ? 'Pontuação desta partida' : 'Agora todos podem comparar os palpites'}</strong>
            </div>
            {finished && ownPrediction && (
              <span className={`points-badge points-${points}`}>+{points} {points === 1 ? 'ponto' : 'pontos'}</span>
            )}
          </div>

          {revealedPredictions.length > 0 ? (
            <div className="prediction-list">
              {revealedPredictions.map((prediction) => (
                <div className={`prediction-row ${prediction.user_id === currentUserId ? 'mine' : ''}`} key={prediction.id}>
                  <span className="prediction-person"><UserAvatar profile={prediction.profiles} size="tiny" /><span>{prediction.profiles?.display_name || 'Jogador'}</span></span>
                  <strong>{prediction.home_score} × {prediction.away_score}</strong>
                  {finished && <em>+{calculatePoints(prediction, match)}</em>}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Nenhum palpite registrado para esta partida.</p>
          )}
        </div>
      )}
    </article>
  )
}
