import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MatchCard from '../components/MatchCard'
import Loading from '../components/Loading'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, hasResult } from '../lib/utils'

export default function RoundPage() {
  const { roundId } = useParams()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [presence, setPresence] = useState([])
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data: roundData, error: roundError } = await supabase
        .from('rounds')
        .select('*, seasons(*), matches(*)')
        .eq('id', roundId)
        .single()
      if (roundError) throw roundError
      roundData.matches = [...(roundData.matches || [])].sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
      setRound(roundData)

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

  const ownPredictions = round.matches.map((match) => ({ match, prediction: ownMap.get(match.id) })).filter((item) => item.prediction)
  const points = ownPredictions.reduce((sum, item) => sum + calculatePoints(item.prediction, item.match), 0)
  const exact = ownPredictions.filter((item) => hasResult(item.match) && calculatePoints(item.prediction, item.match) === 3).length

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={`${round.seasons?.name || 'Champions'} · ${round.stage}`}
        title={round.name}
        description={`${round.matches.length} jogos cadastrados nesta rodada.`}
        actions={<Link className="secondary-button" to="/rodadas">← Todas as rodadas</Link>}
      />

      <section className="round-summary-strip">
        <div><span>Seus palpites</span><strong>{ownPredictions.length}/{round.matches.length}</strong></div>
        <div><span>Pontos</span><strong>{points}</strong></div>
        <div><span>Placares exatos</span><strong>{exact}</strong></div>
      </section>

      {error && <div className="form-error">{error}</div>}

      <div className="matches-grid">
        {round.matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            ownPrediction={ownMap.get(match.id)}
            visiblePredictions={predictions.filter((item) => item.match_id === match.id)}
            presence={presence.filter((item) => item.match_id === match.id)}
            currentUserId={user.id}
            onSave={savePrediction}
          />
        ))}
      </div>
    </div>
  )
}
