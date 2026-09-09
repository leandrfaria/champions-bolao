import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Loading from '../components/Loading'
import NavIcon from '../components/NavIcon'
import RoundDetailMatchCard from '../components/RoundDetailMatchCard'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction } from '../lib/utils'

function roundDates(round) {
  const matches = [...(round?.matches || [])]
    .filter((match) => match.kickoff_at)
    .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
  if (!matches.length) return 'Sem data'
  const first = new Date(matches[0].kickoff_at)
  const last = new Date(matches.at(-1).kickoff_at)
  const day = (date) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)
  const month = (date) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '').toLowerCase()
  if (first.toDateString() === last.toDateString()) return `${day(first)} ${month(first)}`
  if (first.getMonth() === last.getMonth()) return `${day(first)}–${day(last)} ${month(last)}`
  return `${day(first)} ${month(first)} – ${day(last)} ${month(last)}`
}


function roundDisplayName(round) {
  const stage = String(round?.stage || '').trim()
  const raw = String(round?.name || `Rodada ${round?.sort_order || ''}`).trim()
  let detail = raw
  if (stage && raw.toLowerCase().startsWith(stage.toLowerCase())) detail = raw.slice(stage.length).replace(/^[\s·\-–—:]+/, '').trim()
  if (!detail) detail = `Rodada ${round?.sort_order || ''}`.trim()
  if (/^\d+\s+de\s+\d+$/i.test(detail)) detail = `Rodada ${detail}`
  return stage ? `${stage} · ${detail}` : detail
}

function roundSecondaryName(round) {
  const full = roundDisplayName(round)
  const stage = String(round?.stage || '').trim()
  if (stage && full.toLowerCase().startsWith(stage.toLowerCase())) return full.slice(stage.length).replace(/^[\s·\-–—:]+/, '').trim()
  return full
}

export default function RoundPage() {
  const { roundId } = useParams()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [presence, setPresence] = useState([])
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [{ data: roundData, error: roundError }, { data: profileData, error: profileError }] = await Promise.all([
        supabase.from('rounds').select('*, seasons(*), matches(*)').eq('id', roundId).single(),
        supabase.from('profiles').select('*').order('display_name'),
      ])
      if (roundError) throw roundError
      if (profileError) throw profileError

      roundData.matches = [...(roundData.matches || [])].sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
      setRound(roundData)
      setProfiles(profileData || [])

      const ids = roundData.matches.map((match) => match.id)
      if (ids.length) {
        const [{ data: predictionData, error: predictionError }, { data: presenceData, error: presenceError }] = await Promise.all([
          supabase.from('predictions').select('*, profiles(id, display_name, avatar_path, role)').in('match_id', ids),
          supabase.rpc('get_prediction_presence', { p_match_ids: ids }),
        ])
        if (predictionError) throw predictionError
        if (presenceError) throw presenceError
        setPredictions(predictionData || [])
        setPresence(presenceData || [])
      } else {
        setPredictions([])
        setPresence([])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [roundId])

  const ownMap = useMemo(() => {
    const map = new Map()
    predictions.filter((item) => item.user_id === user.id).forEach((item) => map.set(item.match_id, item))
    return map
  }, [predictions, user.id])

  async function savePrediction(matchId, homeScore, awayScore) {
    const { error: saveError } = await supabase.from('predictions').upsert({
      match_id: matchId,
      user_id: user.id,
      home_score: Number(homeScore),
      away_score: Number(awayScore),
    }, { onConflict: 'match_id,user_id' })
    if (saveError) throw saveError
    await load()
  }

  if (loading) return <Loading label="Abrindo a rodada..." />
  if (!round) return <div className="page-wrap"><div className="form-error">{error || 'Rodada não encontrada.'}</div></div>

  const ownPredictions = round.matches
    .map((match) => ({ match, prediction: ownMap.get(match.id) }))
    .filter((item) => item.prediction)
  const points = ownPredictions.reduce((sum, item) => sum + calculatePoints(item.prediction, item.match), 0)
  const exact = ownPredictions.filter((item) => isExactPrediction(item.prediction, item.match)).length
  const winners = ownPredictions.filter((item) => didPickWinner(item.prediction, item.match)).length

  return (
    <div className="page-wrap round-detail-page">
      <header className="round-detail-hero">
        <div className="round-detail-hero-art" aria-hidden="true" />
        <div className="round-detail-heading">
          <Link className="round-detail-back" to="/rodadas">← Todas as rodadas</Link>
          <span>{round.seasons?.name || 'Champions League'} · {round.stage}</span>
          <h1>{roundDisplayName(round)}</h1>
          <p>{roundDates(round)} · {round.matches.length} {round.matches.length === 1 ? 'jogo' : 'jogos'}</p>
        </div>

        <div className="round-detail-summary">
          <div><NavIcon name="predictions" size={20} /><span>Seus palpites</span><strong>{ownPredictions.length}/{round.matches.length}</strong></div>
          <div><span className="round-detail-summary-icon">◎</span><span>Pontos</span><strong>{points}</strong></div>
          <div><span className="round-detail-summary-icon">◎</span><span>Placares exatos</span><strong>{exact}</strong></div>
          <div className="winners"><NavIcon name="leaderboard" size={20} /><span>Vencedores</span><strong>{winners}</strong></div>
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}

      <section className="round-detail-match-grid">
        {round.matches.map((match) => (
          <RoundDetailMatchCard
            key={match.id}
            match={match}
            ownPrediction={ownMap.get(match.id)}
            predictions={predictions.filter((item) => item.match_id === match.id)}
            presence={presence.filter((item) => item.match_id === match.id)}
            profiles={profiles}
            currentUserId={user.id}
            onSave={savePrediction}
          />
        ))}
      </section>

    </div>
  )
}
