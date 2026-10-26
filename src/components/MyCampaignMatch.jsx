import { useEffect, useState } from 'react'
import HomeBetModal from './HomeBetModal'
import TeamCrest from './TeamCrest'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction, isLocked } from '../lib/utils'

function score(home, away) {
  return home == null || away == null ? '— × —' : `${home} × ${away}`
}

function kickoff(value) {
  if (!value) return { date: 'Data a confirmar', time: '—:—' }
  const date = new Date(value)
  return {
    date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', ''),
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date),
  }
}

export default function MyCampaignMatch({ match, ownPrediction, profiles, userId, onSaved }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [presence, setPresence] = useState([])
  const [presenceStatus, setPresenceStatus] = useState('idle')
  const finished = hasResult(match)
  const locked = isLocked(match)
  const date = kickoff(match.kickoff_at)
  const points = ownPrediction && finished ? calculatePoints(ownPrediction, match) : null
  const exact = ownPrediction && finished && isExactPrediction(ownPrediction, match)
  const outcome = ownPrediction && finished && didPickWinner(ownPrediction, match)
  const feedback = exact
    ? 'PLACAR EXATO'
    : outcome
      ? Number(match.home_score) === Number(match.away_score) ? 'EMPATE' : 'VENCEDOR'
      : 'ERROU'

  useEffect(() => {
    if (!modalOpen) return undefined
    let active = true
    setPresenceStatus('loading')
    supabase.rpc('get_prediction_presence', { p_match_ids: [match.id] }).then(({ data, error }) => {
      if (!active) return
      if (error) {
        setPresenceStatus('error')
        setPresence([])
      } else {
        setPresence(data || [])
        setPresenceStatus(data?.length ? 'ready' : 'empty')
      }
    })
    return () => { active = false }
  }, [modalOpen, match.id])

  const category = finished ? 'result' : locked ? 'live' : ownPrediction ? 'upcoming' : 'pending'
  const centerScore = finished ? score(match.home_score, match.away_score) : score(ownPrediction?.home_score, ownPrediction?.away_score)
  const statusLabel = finished ? 'Resultado oficial' : locked ? 'Aguardando resultado' : ownPrediction ? 'Enviado' : 'Pendente'
  const canBet = !finished && !locked

  return (
    <article className={`mc-match mc-match--${category}`}>
      <div className="mc-match-meta"><time dateTime={match.kickoff_at || undefined}>{date.date}<b>{date.time}</b></time><span className={`mc-match-status mc-match-status--${category}`}>{statusLabel}</span></div>
      <div className="mc-match-contest" aria-label={`${match.home_team} ${finished ? `${match.home_score} a ${match.away_score}` : 'contra'} ${match.away_team}`}>
        <div className="mc-match-team mc-match-team--home"><TeamCrest team={match.home_team} size="small" /><strong title={match.home_team}>{match.home_team}</strong></div>
        <div className={`mc-match-score${finished ? ' is-official' : ''}`}><small>{finished ? 'RESULTADO' : 'SEU PALPITE'}</small><strong>{centerScore}</strong></div>
        <div className="mc-match-team mc-match-team--away"><strong title={match.away_team}>{match.away_team}</strong><TeamCrest team={match.away_team} size="small" /></div>
      </div>
      {(finished || canBet) && <div className="mc-match-footer">
        {finished && <div className="mc-match-summary">
          <span>{ownPrediction ? `Meu palpite ${score(ownPrediction.home_score, ownPrediction.away_score)}` : 'Sem palpite'}</span>
          <b className={`mc-points-inline mc-points-inline--${points === 3 ? 'exact' : points === 1 ? 'outcome' : 'miss'}`}>{ownPrediction ? `${points > 0 ? `+${points}` : points} pt${points === 1 ? '' : 's'} · ${feedback}` : '0 pts'}</b>
        </div>}
        {canBet && <button type="button" className="mc-match-action" onClick={() => setModalOpen(true)}>{ownPrediction ? 'Editar' : 'Palpitar'}<span aria-hidden="true">→</span></button>}
      </div>}
      {modalOpen && canBet && <HomeBetModal match={match} ownPrediction={ownPrediction} presence={presence} presenceStatus={presenceStatus} profiles={profiles} onSave={onSaved} onClose={() => setModalOpen(false)} mobile={window.matchMedia('(max-width: 700px)').matches} />}
    </article>
  )
}
