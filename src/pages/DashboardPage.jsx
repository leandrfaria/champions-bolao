import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import HomeMatchRow from '../components/HomeMatchRow'
import UserAvatar from '../components/UserAvatar'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction, isLocked } from '../lib/utils'
import { activityText, isFeedActivity, parseMatchName } from '../lib/activity'

function formatDeadline(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value)).replace('.', '')
}

function formatRelativeActivity(value) {
  if (!value) return 'agora'
  const diffMs = Date.now() - new Date(value).getTime()
  const diffMin = Math.max(0, Math.round(diffMs / 60000))
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `há ${diffHr} ${diffHr === 1 ? 'hora' : 'horas'}`
  const diffDay = Math.round(diffHr / 24)
  return `há ${diffDay} ${diffDay === 1 ? 'dia' : 'dias'}`
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
      setLogs((logData || []).filter(isFeedActivity).slice(0, 3))

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
    const rows = profiles.map((item) => {
      const computed = finishedPredictions
        .filter((prediction) => prediction.user_id === item.id)
        .map((prediction) => ({ prediction, match: matchMap.get(prediction.match_id) }))
        .filter((entry) => entry.match)
      const points = computed.reduce((sum, entry) => sum + calculatePoints(entry.prediction, entry.match), 0)
      const exact = computed.filter((entry) => isExactPrediction(entry.prediction, entry.match)).length
      const winners = computed.filter((entry) => didPickWinner(entry.prediction, entry.match)).length
      return { ...item, points, exact, winners }
    }).sort((a, b) => b.points - a.points || b.exact - a.exact || b.winners - a.winners || a.display_name.localeCompare(b.display_name))

    let rank = 0
    return rows.map((row, index) => {
      const previous = rows[index - 1]
      if (index === 0) rank = 1
      else if (!(previous && row.points === previous.points && row.exact === previous.exact && row.winners === previous.winners)) rank += 1
      return { ...row, rank }
    })
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

  const currentMatches = useMemo(() => {
    const list = [...(round?.matches || [])]
    const group = (match) => {
      const hasOwnPrediction = ownPredictionMap.has(match.id)
      if (!isLocked(match) && !hasOwnPrediction) return 0
      if (!isLocked(match) && hasOwnPrediction) return 1
      if (!hasResult(match)) return 2
      return 3
    }
    return list.sort((a, b) => group(a) - group(b) || new Date(a.kickoff_at) - new Date(b.kickoff_at))
  }, [round?.matches, ownPredictionMap])

  if (loading) return <Loading label="Carregando a rodada atual..." />

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
  const titleRace = leaderboard.slice(0, 5)

  const heroStatusCopy = pendingCount === 0
    ? `${ownCount}/${currentMatches.length || 0} palpites enviados. Tudo certo para a rodada.`
    : `${ownCount}/${currentMatches.length || 0} palpites enviados. Faltam ${pendingCount} ${pendingCount === 1 ? 'palpite' : 'palpites'}.`

  return (
    <div className="page-wrap home-screen-reference home-reference-surface">
      {error && <div className="form-error">{error}</div>}

      {!season || !round ? (
        <EmptyState title="Nenhuma rodada ativa" text="O administrador ainda não cadastrou a temporada e os jogos." />
      ) : (
        <>
          <header className="home-ref-hero" aria-label="Central da rodada">
            <div className="home-ref-hero-art" aria-hidden="true" />

            <div className="home-ref-hero-copy">
              <span className="home-ref-kicker">UEFA Champions League {season?.name?.replace('Champions League ', '') || '2026/27'}</span>
              <h1>{round.stage || round.name}</h1>
              <div className="home-ref-subline">
                <strong>{round.name}</strong>
                <em>{roundInProgress ? 'Palpites em andamento' : 'Rodada concluída'}</em>
              </div>
              <p>{heroStatusCopy}</p>

              <div className="home-ref-metrics" aria-label="Resumo da rodada">
                <article>
                  <strong>{currentMatches.length}</strong>
                  <span>{currentMatches.length === 1 ? 'jogo' : 'jogos'}</span>
                </article>
                <article>
                  <strong>{ownCount}/{currentMatches.length || 0}</strong>
                  <span>enviados</span>
                </article>
                <article>
                  <strong>{pendingCount}</strong>
                  <span>{pendingCount === 1 ? 'pendente' : 'pendentes'}</span>
                </article>
                <article>
                  <strong>{completion}%</strong>
                  <span>concluído</span>
                </article>
              </div>

              <div className="home-ref-progress">
                <div className="home-ref-progress-track" aria-hidden="true">
                  <i style={{ width: `${completion}%` }} />
                </div>
                <b>{completion}%</b>
              </div>
            </div>
            <aside className="home-ref-deadline-card">
              <div className="home-ref-deadline-icon">◔</div>
              <div className="home-ref-deadline-copy">
                <span>Próximo prazo</span>
                <strong>{nextDeadline ? formatDeadline(nextDeadline.kickoff_at) : 'Encerrado'}</strong>
                <small>{nextDeadline ? 'Até o início da próxima partida' : 'Nenhum jogo aberto nesta rodada'}</small>
                <p>{openMatches} partidas abertas · {finishedCount} finalizadas</p>
              </div>
            </aside>
          </header>

          <section className="home-ref-section">
            <div className="home-ref-section-head">
              <div className="home-ref-heading-inline">
                <i className="home-ref-accent" aria-hidden="true" />
                <h2>Seus palpites</h2>
                <small>{round.name}</small>
              </div>
              <Link to={`/rodadas/${round.id}`}>Ver rodada completa <span>→</span></Link>
            </div>

            <div className="home-ref-fixtures-grid">
              {currentMatches.map((match) => (
                <HomeMatchRow
                  key={match.id}
                  match={match}
                  ownPrediction={ownPredictionMap.get(match.id)}
                  presence={presence.filter((item) => item.match_id === match.id)}
                  profiles={profiles}
                  onSave={savePrediction}
                />
              ))}
            </div>
          </section>

          <div className="home-ref-bottom-grid">
            <section className="home-ref-panel home-ref-panel-leaderboard">
              <div className="home-ref-section-head compact">
                <div className="home-ref-heading-inline">
                  <i className="home-ref-accent" aria-hidden="true" />
                  <h2>Classificação</h2>
                  <small>Top 5</small>
                </div>
                <Link to="/classificacao">Ver tabela completa <span>→</span></Link>
              </div>

              {!leaderboard.length ? <p className="sports-empty-copy">Nenhum participante na classificação.</p> : (
                <>
                  <div className="home-ref-leaderboard-strip">
                    {titleRace.map((item, index) => (
                      <article key={item.id} className={`home-ref-rank-card place-${index + 1} ${item.id === user.id ? 'is-user' : ''}`}>
                        <div className="home-ref-rank-avatar"><UserAvatar profile={item} size="tiny" /></div>
                        <strong>{item.display_name}</strong>
                        <b>{item.points} pts</b>
                        {item.id === user.id && <em>Você</em>}
                      </article>
                    ))}
                  </div>
                  {myStanding && (
                    <p className="home-ref-rank-summary">
                      Você está em <strong>{String(myStanding.rank || myRankIndex + 1).padStart(2, '0')}º</strong> com <strong>{myStanding.points} pts</strong>
                      {gap > 0 ? ` · ${gap} ${gap === 1 ? 'ponto' : 'pontos'} atrás do líder` : ' · empatado com a liderança'}.
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="home-ref-panel home-ref-panel-activity">
              <div className="home-ref-section-head compact">
                <div className="home-ref-heading-inline">
                  <i className="home-ref-accent" aria-hidden="true" />
                  <h2>Movimento da rodada</h2>
                  <small>Atividades mais recentes</small>
                </div>
                <Link to="/atividades">Ver todas <span>→</span></Link>
              </div>

              {!logs.length ? <p className="sports-empty-copy">Nenhuma atividade recente.</p> : (
                <div className="home-ref-activity-list">
                  {logs.map((item) => {
                    const matchInfo = parseMatchName(item?.metadata?.match_name || '')
                    return (
                      <article className="home-ref-activity-item" key={item.id}>
                        <time>{formatRelativeActivity(item.created_at)}</time>
                        <div>
                          <p>{activityText(item)}</p>
                          {matchInfo && <span>{matchInfo.home} x {matchInfo.away}</span>}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
