import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import HomeMatchRow from '../components/HomeMatchRow'
import MobileDashboard from '../components/MobileDashboard'
import UserAvatar from '../components/UserAvatar'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction, isLocked } from '../lib/utils'
import { activityCategory, activityTone, isFeedActivity, parseMatchName } from '../lib/activity'
import { activitySummary, formatDeadline, formatRelativeActivity, formatRoundLabel, getActivityLabel, progressValue } from '../lib/dashboardPresentation'
import '../styles/home-dashboard.css'

function useIsMobileHome() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 820px)')
    const update = (event) => setIsMobile(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isMobile
}

export default function DashboardPage() {
  const { user } = useAuth()
  const isMobileHome = useIsMobileHome()
  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState(null)
  const [round, setRound] = useState(null)
  const [roundProgress, setRoundProgress] = useState({ position: 0, total: 0 })
  const [predictions, setPredictions] = useState([])
  const [presence, setPresence] = useState([])
  const [presenceStatus, setPresenceStatus] = useState('idle')
  const [profiles, setProfiles] = useState([])
  const [finishedPredictions, setFinishedPredictions] = useState([])
  const [finishedMatchesAll, setFinishedMatchesAll] = useState([])
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    setPresenceStatus('loading')
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
      setLogs((logData || []).filter(isFeedActivity).slice(0, 12))

      if (!activeSeason) {
        setRound(null)
        setRoundProgress({ position: 0, total: 0 })
        setFinishedPredictions([])
        setFinishedMatchesAll([])
        setPresence([])
        setPresenceStatus('empty')
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
      const currentRoundPosition = currentRound ? usableRounds.findIndex((item) => item.id === currentRound.id) + 1 : 0
      setRoundProgress({ position: currentRoundPosition, total: usableRounds.length })
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
        setPresenceStatus(presenceData?.length ? 'ready' : 'empty')
      } else {
        setPredictions([])
        setPresence([])
        setPresenceStatus('empty')
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
      setPresenceStatus('error')
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useLayoutEffect(() => {
    const pendingRestore = window.__championsHomeReloadScroll
    if (loading || !pendingRestore) return

    window.__championsHomeReloadScroll = null
    try {
      sessionStorage.removeItem(pendingRestore.storageKey)
    } catch {
      // The pending in-memory position is enough for this page load.
    }

    const matchday = document.querySelector('.home-v3-matchday')
    const savedY = Math.max(0, pendingRestore.position.y)
    // iOS Safari can persist a small viewport/toolbar offset as page scroll.
    // Treat any reload position inside the matchday header as the Home's top.
    const restoreY = isMobileHome && matchday && savedY < matchday.getBoundingClientRect().height
      ? 0
      : savedY

    window.scrollTo(Math.max(0, pendingRestore.position.x), restoreY)
    if ('scrollRestoration' in history) history.scrollRestoration = 'auto'
  }, [loading, isMobileHome])

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

  const ownCount = currentMatches.filter((match) => ownPredictionMap.has(match.id)).length
  const completion = progressValue(ownCount, currentMatches.length)
  const nextDeadline = currentMatches.filter((match) => !isLocked(match)).sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))[0]
  const myRankIndex = leaderboard.findIndex((item) => item.id === user.id)
  const myStanding = myRankIndex >= 0 ? leaderboard[myRankIndex] : null
  const leader = leaderboard[0]
  const gap = myStanding && leader ? Math.max(0, leader.points - myStanding.points) : 0
  const tiedForFirst = Boolean(myStanding && leader && myStanding.rank === leader.rank)
  const firstPlaceIsShared = tiedForFirst && leaderboard.filter((item) => item.rank === 1).length > 1
  const titleRace = leaderboard.slice(0, 5)

  return (
    <div className="page-wrap home-v2-page">
      {error && <div className="form-error" role="alert">{error}</div>}

      {!season || !round ? (
        <EmptyState title="Nenhuma rodada ativa" text="O administrador ainda não cadastrou a temporada e os jogos." />
      ) : isMobileHome ? (
        <MobileDashboard
          season={season}
          round={round}
          roundProgress={roundProgress}
          currentMatches={currentMatches}
          ownPredictionMap={ownPredictionMap}
          ownCount={ownCount}
          completion={completion}
          nextDeadline={nextDeadline}
          presence={presence}
          presenceStatus={presenceStatus}
          profiles={profiles}
          savePrediction={savePrediction}
          titleRace={titleRace}
          userId={user.id}
          myStanding={myStanding}
          leader={leader}
          gap={gap}
          firstPlaceIsShared={firstPlaceIsShared}
          logs={logs}
        />
      ) : (
        <>
          <section className="home-v2-context" aria-label="Resumo da competição">
            <div className="home-v2-context-main">
              <span className="home-v2-season">{season.name || 'UEFA Champions League'}</span>
              <h1>{round.stage || round.name}</h1>
              <p className="home-v2-round"><strong>{formatRoundLabel(round)}</strong></p>
              <div className="home-v2-progress-line">
                <span>{ownCount} de {currentMatches.length} palpites enviados</span>
                <span>{completion}%</span>
              </div>
              <div
                className="home-v2-progress-track"
                role="progressbar"
                aria-label="Progresso dos seus palpites na rodada"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completion}
              >
                <span style={{ width: `${completion}%` }} />
              </div>
            </div>
            <aside className="home-v2-deadline" aria-label="Próximo prazo para palpites">
              <span className="home-v2-deadline-label">Próximo prazo</span>
              <strong>{nextDeadline ? formatDeadline(nextDeadline.kickoff_at) : 'Encerrado'}</strong>
              <small>{nextDeadline ? `Antes de ${nextDeadline.home_team} x ${nextDeadline.away_team}` : 'Não há partidas abertas nesta rodada'}</small>
            </aside>
          </section>

          <section className="home-v2-section home-v2-predictions" aria-label="Rodada atual: seus palpites">
            <div className="home-v2-section-head">
              <span className="home-v2-section-kicker">Rodada atual</span>
              <Link className="home-v2-text-link" to={`/rodadas/${round.id}`}>Ver rodada completa <span aria-hidden="true">→</span></Link>
            </div>

            {currentMatches.length ? (
              <div className="home-v2-fixtures">
                {currentMatches.map((match) => (
                  <HomeMatchRow
                    key={match.id}
                    match={match}
                    ownPrediction={ownPredictionMap.get(match.id)}
                    presence={presence.filter((item) => item.match_id === match.id)}
                    presenceStatus={presenceStatus}
                    profiles={profiles}
                    onSave={savePrediction}
                  />
                ))}
              </div>
            ) : (
              <p className="home-v2-empty">Ainda não há partidas cadastradas nesta rodada.</p>
            )}
          </section>

          <div className="home-v2-competition-grid">
            <section className="home-v2-panel home-v2-leaderboard" aria-label="Corrida pelo título: classificação">
              <div className="home-v2-section-head home-v2-panel-head">
                <span className="home-v2-section-kicker">Corrida pelo título</span>
                <Link className="home-v2-text-link" to="/classificacao">Ver classificação <span aria-hidden="true">→</span></Link>
              </div>

              {!titleRace.length ? <p className="home-v2-empty">Nenhum participante na classificação.</p> : (
                <>
                  <ol className="home-v2-rank-list">
                    {titleRace.map((item) => (
                      <li key={item.id} className={`home-v2-rank-row ${item.rank <= 3 ? `place-${item.rank}` : ''} ${item.id === user.id ? 'is-user' : ''}`}>
                        <span className="home-v2-rank-position">{item.rank}º</span>
                        <UserAvatar profile={item} size="tiny" className="home-v2-rank-avatar" />
                        <span className="home-v2-rank-name" title={item.display_name}>{item.display_name}{item.id === user.id && <small>Você</small>}</span>
                        <strong className="home-v2-rank-points">{item.points}<small> pts</small></strong>
                      </li>
                    ))}
                  </ol>
                  {myStanding && (
                    <p className="home-v2-rank-summary">
                      Você está em <strong>{myStanding.rank}º</strong> com <strong>{myStanding.points} pts</strong>
                      {firstPlaceIsShared
                        ? ' · empatado na liderança'
                        : myStanding.rank === 1
                          ? ' · na liderança'
                          : gap > 0
                            ? ` · ${gap} ${gap === 1 ? 'ponto' : 'pontos'} atrás do líder`
                            : ' · empatado em pontos, atrás nos critérios de desempate'}.
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="home-v2-panel home-v2-movement" aria-label="Acontecimentos recentes">
              <div className="home-v2-section-head home-v2-panel-head">
                <span className="home-v2-section-kicker">Acontecimentos recentes</span>
                <Link className="home-v2-text-link" to="/atividades">Todas as atividades <span aria-hidden="true">→</span></Link>
              </div>

              {!logs.length ? <p className="home-v2-empty">Nenhuma atividade recente.</p> : (
                <ul className="home-v2-activity-list">
                  {logs.slice(0, 4).map((item) => {
                    const category = activityCategory(item.action)
                    const summary = activitySummary(item)
                    const matchName = item?.metadata?.match_name || ''
                    const matchInfo = parseMatchName(matchName)
                    const tone = activityTone(item.action)
                    const activityDetail = matchInfo && matchName && summary.detail?.toLocaleLowerCase('pt-BR').startsWith(matchName.toLocaleLowerCase('pt-BR'))
                      ? item.action === 'result_updated' && item.metadata?.result ? `Resultado oficial: ${item.metadata.result}` : ''
                      : summary.detail
                    return (
                      <li className={`home-v2-activity-item tone-${activityTone(item.action)}`} key={item.id}>
                        <span className={`home-v2-activity-mark category-${category}`} aria-hidden="true" />
                        <div className="home-v2-activity-copy">
                          <div className="home-v2-activity-topline">
                            <span className={`home-v2-activity-category tone-${tone}`}>{getActivityLabel(category)}</span>
                            <time dateTime={item.created_at}>{formatRelativeActivity(item.created_at)}</time>
                          </div>
                          <strong className="home-v2-activity-title">{summary.title}</strong>
                          {activityDetail && <p>{activityDetail}</p>}
                          {matchInfo && <span className="home-v2-activity-match">{matchInfo.home} <i aria-hidden="true">×</i> {matchInfo.away}</span>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
