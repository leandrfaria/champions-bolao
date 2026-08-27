import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import HomeMatchRow from '../components/HomeMatchRow'
import UserAvatar from '../components/UserAvatar'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction, isLocked, formatRelativeTime } from '../lib/utils'
import { activityText, activityTone, isFeedActivity } from '../lib/activity'

function formatDeadline(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value)).replace('.', '')
}

function progressValue(done, total) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState(null)
  const [round, setRound] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [presence, setPresence] = useState([])
  const [profiles, setProfiles] = useState([])
  const [finishedPredictions, setFinishedPredictions] = useState([])
  const [finishedMatchesAll, setFinishedMatchesAll] = useState([])
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [{ data: activeSeason, error: seasonError }, { data: profileData, error: profileError }, { data: logData, error: logError }] = await Promise.all([
        supabase.from('seasons').select('*').eq('is_active', true).maybeSingle(),
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('audit_logs').select('*, profiles(display_name)').order('created_at', { ascending: false }).limit(30),
      ])
      if (seasonError) throw seasonError
      if (profileError) throw profileError
      if (logError) throw logError
      setSeason(activeSeason)
      setProfiles(profileData || [])
      setLogs((logData || []).filter(isFeedActivity).slice(0, 5))

      if (!activeSeason) {
        setRound(null)
        setFinishedPredictions([])
        setFinishedMatchesAll([])
        return
      }

      const { data: rounds, error: roundsError } = await supabase
        .from('rounds')
        .select('*, matches(*)')
        .eq('season_id', activeSeason.id)
        .order('sort_order', { ascending: true })
      if (roundsError) throw roundsError

      const usableRounds = rounds || []
      const currentRound = usableRounds.find((item) => (item.matches || []).some((match) => !hasResult(match))) || usableRounds.at(-1) || null
      if (currentRound) currentRound.matches = [...(currentRound.matches || [])].sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
      setRound(currentRound)

      const currentMatchIds = currentRound?.matches?.map((match) => match.id) || []
      if (currentMatchIds.length) {
        const [{ data: predictionData, error: predictionError }, { data: presenceData, error: presenceError }] = await Promise.all([
          supabase.from('predictions').select('*').in('match_id', currentMatchIds),
          supabase.rpc('get_prediction_presence', { p_match_ids: currentMatchIds }),
        ])
        if (predictionError) throw predictionError
        if (presenceError) throw presenceError
        setPredictions(predictionData || [])
        setPresence(presenceData || [])
      } else {
        setPredictions([])
        setPresence([])
      }

      const allFinishedMatches = usableRounds.flatMap((item) => item.matches || []).filter(hasResult)
      setFinishedMatchesAll(allFinishedMatches)
      const finishedIds = allFinishedMatches.map((match) => match.id)
      const finishedResult = finishedIds.length
        ? await supabase.from('predictions').select('*').in('match_id', finishedIds)
        : { data: [], error: null }
      if (finishedResult.error) throw finishedResult.error
      setFinishedPredictions(finishedResult.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const ownPredictionMap = useMemo(() => {
    const map = new Map()
    predictions.filter((item) => item.user_id === user.id).forEach((item) => map.set(item.match_id, item))
    return map
  }, [predictions, user.id])

  const leaderboard = useMemo(() => {
    const matchMap = new Map(finishedMatchesAll.map((match) => [match.id, match]))
    return profiles.map((item) => {
      const computed = finishedPredictions
        .filter((prediction) => prediction.user_id === item.id)
        .map((prediction) => ({ prediction, match: matchMap.get(prediction.match_id) }))
        .filter((entry) => entry.match)
      const points = computed.reduce((sum, entry) => sum + calculatePoints(entry.prediction, entry.match), 0)
      const exact = computed.filter((entry) => isExactPrediction(entry.prediction, entry.match)).length
      const winners = computed.filter((entry) => didPickWinner(entry.prediction, entry.match)).length
      return { ...item, points, exact, winners }
    }).sort((a, b) => b.points - a.points || b.exact - a.exact || b.winners - a.winners || a.display_name.localeCompare(b.display_name))
  }, [profiles, finishedPredictions, finishedMatchesAll])

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

  if (loading) return <Loading label="Carregando a rodada atual..." />

  const currentMatches = round?.matches || []
  const roundInProgress = currentMatches.some((match) => !hasResult(match))
  const ownCount = currentMatches.filter((match) => ownPredictionMap.has(match.id)).length
  const openMatches = currentMatches.filter((match) => !isLocked(match)).length
  const finishedCount = currentMatches.filter(hasResult).length
  const pendingCount = currentMatches.filter((match) => !isLocked(match) && !ownPredictionMap.has(match.id)).length
  const completion = progressValue(ownCount, currentMatches.length)
  const nextDeadline = currentMatches.filter((match) => !isLocked(match)).sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))[0]
  const myRankIndex = leaderboard.findIndex((item) => item.id === user.id)
  const myStanding = myRankIndex >= 0 ? leaderboard[myRankIndex] : null
  const leader = leaderboard[0]
  const gap = myStanding && leader ? Math.max(0, leader.points - myStanding.points) : 0
  const preview = leaderboard.slice(0, 4)
  if (myStanding && myRankIndex >= 4) preview.push(myStanding)

  return (
    <div className="page-wrap home-hub sports-surface">
      <header className="home-round-header">
        <span className="sports-eyebrow">{season?.name || 'Champions Bolão'}</span>
        <h1>{round ? (roundInProgress ? `${round.name} está valendo` : `${round.name} encerrada`) : 'Rodada atual'}</h1>
        {round && <p className="home-round-state-copy">{roundInProgress ? 'A rodada está aberta para seus palpites.' : 'A rodada foi concluída.'}</p>}
        {round && (
          <>
            <div className="home-round-meta">
              <span><b>{currentMatches.length}</b> {currentMatches.length === 1 ? 'jogo' : 'jogos'}</span>
              <span><b>{ownCount}</b> {ownCount === 1 ? 'palpite feito' : 'palpites feitos'}</span>
              <span className={`home-meta-pending ${pendingCount ? 'has-pending' : 'is-complete'}`}><b>{pendingCount}</b> {pendingCount === 1 ? 'pendente' : 'pendentes'}</span>
              <span className="home-meta-completion"><b>{completion}%</b> concluído</span>
            </div>
            <div className="home-progress-line"><i style={{ width: `${completion}%` }} /><span>{completion}% concluído</span></div>
          </>
        )}
      </header>

      {error && <div className="form-error">{error}</div>}

      {!season || !round ? (
        <EmptyState title="Nenhuma rodada ativa" text="O administrador ainda não cadastrou a temporada e os jogos." />
      ) : (
        <>
          <section className="round-summary-bar" aria-label="Resumo da rodada">
            <div><span>Rodada atual</span><strong>{round.name}</strong><small>{round.stage}</small></div>
            <div><span>Jogos da rodada</span><strong>{currentMatches.length} {currentMatches.length === 1 ? 'jogo' : 'jogos'}</strong><small>{openMatches} abertos · {finishedCount} finalizados</small></div>
            <div><span>Seus palpites</span><strong>{ownCount}/{currentMatches.length}</strong><small>{completion}% concluído</small><div className="summary-mini-progress"><i style={{ width: `${completion}%` }} /></div></div>
            <div><span>Próximo prazo</span><strong>{nextDeadline ? formatDeadline(nextDeadline.kickoff_at) : 'Encerrado'}</strong><small>{nextDeadline ? 'Até o início da próxima partida' : 'Nenhum jogo aberto'}</small></div>
          </section>

          <div className="home-content-grid">
            <section className="home-matches-section">
              <div className="sports-section-heading">
                <div><span>Rodada atual</span><h2>Seus palpites da rodada</h2></div>
                <Link to={`/rodadas/${round.id}`}>Ver rodada completa</Link>
              </div>
              <div className="home-match-list">
                {currentMatches.length ? currentMatches.map((match) => (
                  <HomeMatchRow
                    key={match.id}
                    match={match}
                    ownPrediction={ownPredictionMap.get(match.id)}
                    presence={presence.filter((item) => item.match_id === match.id)}
                    profiles={profiles}
                    onSave={savePrediction}
                  />
                )) : <EmptyState title="Rodada sem jogos" text="Os jogos desta rodada ainda não foram cadastrados." />}
              </div>
            </section>

            <aside className="home-side-column">
              <section className="sports-panel compact-standings">
                <div className="sports-panel-title"><h2>Classificação</h2><Link to="/classificacao">Ver tabela completa</Link></div>
                {!leaderboard.length ? <p className="sports-empty-copy">Nenhum participante na classificação.</p> : (
                  <div className="home-standing-list">
                    {preview.map((item, index) => {
                      const realIndex = leaderboard.findIndex((entry) => entry.id === item.id)
                      const separated = index === 4 && myRankIndex >= 4
                      return (
                        <div key={item.id} className={`home-standing-row ${item.id === user.id ? 'mine' : ''} ${separated ? 'separated' : ''}`}>
                          <span className={`home-standing-place place-${realIndex + 1}`}>{realIndex + 1}</span>
                          <div className="home-standing-player">
                            <UserAvatar profile={item} size="tiny" />
                            <div className="home-standing-copy">
                              <strong>{item.display_name}</strong>
                              {item.id === user.id && gap > 0 && <small>{gap} {gap === 1 ? 'ponto' : 'pontos'} atrás do líder</small>}
                            </div>
                          </div>
                          <b>{item.points}</b>
                        </div>
                      )
                    })}
                  </div>
                )}
                <Link className="sports-panel-footer" to="/classificacao">Ver todos os participantes <span>→</span></Link>
              </section>

              <section className="sports-panel compact-activity">
                <div className="sports-panel-title"><h2>Últimas atividades</h2><Link to="/atividades">Ver tudo</Link></div>
                {!logs.length ? <p className="sports-empty-copy">Nenhuma atividade recente.</p> : (
                  <div className="home-activity-list">
                    {logs.map((item) => (
                      <div className="home-activity-row" key={item.id}>
                        <span className={`activity-dot ${activityTone(item.action)}`} />
                        <p>{activityText(item)}</p>
                        <time>{formatRelativeTime(item.created_at)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
