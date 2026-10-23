import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import HomeMatchRow from '../components/HomeMatchRow'
import UserAvatar from '../components/UserAvatar'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction, isLocked } from '../lib/utils'
import { activityCategory, activityTone, isFeedActivity, parseMatchName } from '../lib/activity'
import '../styles/home-dashboard.css'

function formatDeadline(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value)).replace('.', '')
}

function formatRoundLabel(round) {
  const name = String(round?.name || '').trim()
  const stage = String(round?.stage || '').trim()
  if (!name) return 'Rodada atual'
  if (stage && name.toLocaleLowerCase('pt-BR').startsWith(stage.toLocaleLowerCase('pt-BR'))) {
    const remaining = name.slice(stage.length).replace(/^\s*[-–—|·:]\s*/, '').trim()
    if (remaining) return /\brodada\b/i.test(remaining) ? remaining : `Rodada ${remaining}`
    return 'Rodada atual'
  }
  const withoutPhasePrefix = name.replace(/^fase\b[^-–—|·:]*[-–—|·:]\s*/i, '').trim()
  if (!withoutPhasePrefix) return 'Rodada atual'
  return /\brodada\b/i.test(withoutPhasePrefix) ? withoutPhasePrefix : `Rodada ${withoutPhasePrefix}`
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

function activitySummary(item) {
  const metadata = item.metadata || {}
  const actor = item.profiles?.display_name || 'Participante'
  const match = metadata.match_name || 'uma partida'
  const round = metadata.round_name || 'Rodada'
  const season = metadata.season_name || 'Temporada'

  switch (item.action) {
    case 'prediction_created': return { title: `${actor} enviou um palpite`, detail: match }
    case 'prediction_updated': return { title: `${actor} atualizou um palpite`, detail: match }
    case 'result_updated': return { title: 'Resultado registrado', detail: `${match}${metadata.result ? ` · ${metadata.result}` : ''}` }
    case 'round_created': return { title: 'Rodada aberta', detail: round }
    case 'round_started': return { title: 'Rodada iniciada', detail: round }
    case 'round_finished': return { title: 'Rodada encerrada', detail: round }
    case 'round_deleted': return { title: 'Rodada removida', detail: round }
    case 'roulette_spun': {
      const names = Array.isArray(metadata.selected_names) ? metadata.selected_names.filter(Boolean) : []
      return { title: 'Sorteio realizado', detail: names.length ? names.join(' · ') : round }
    }
    case 'season_created': return { title: 'Temporada criada', detail: season }
    case 'season_activated': return { title: 'Temporada iniciada', detail: season }
    case 'season_deleted': return { title: 'Temporada removida', detail: season }
    case 'leader_changed': return { title: 'Mudança na liderança', detail: `${actor} assumiu o 1º lugar` }
    case 'second_changed': return { title: 'Mudança na classificação', detail: `${actor} assumiu a 2ª posição` }
    default: return { title: 'Atividade registrada', detail: '' }
  }
}

function getActivityLabel(category) {
  if (category === 'predictions') return 'Palpite'
  if (category === 'results') return 'Resultado'
  if (category === 'classification') return 'Classificação'
  if (category === 'rounds') return 'Competição'
  return 'Atividade'
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
  const [presenceStatus, setPresenceStatus] = useState('idle')
  const [presenceUpdatedAt, setPresenceUpdatedAt] = useState(null)
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
      setLogs((logData || []).filter(isFeedActivity).slice(0, 3))

      if (!activeSeason) {
        setRound(null)
        setFinishedPredictions([])
        setFinishedMatchesAll([])
        setPresence([])
        setPresenceUpdatedAt(null)
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
        setPresenceUpdatedAt(new Date())
        setPresenceStatus('ready')
      } else {
        setPredictions([])
        setPresence([])
        setPresenceUpdatedAt(null)
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
      ) : (
        <>
          <section className="home-v2-context" aria-labelledby="home-v2-phase">
            <div className="home-v2-context-main">
              <span className="home-v2-season">{season.name || 'UEFA Champions League'}</span>
              <h1 id="home-v2-phase">{round.stage || round.name}</h1>
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

          <section className="home-v2-section home-v2-predictions" aria-labelledby="home-v2-predictions-title">
            <div className="home-v2-section-head">
              <div>
                <span className="home-v2-section-kicker">Rodada atual</span>
                <h2 id="home-v2-predictions-title">Seus palpites</h2>
              </div>
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
                    presenceUpdatedAt={presenceUpdatedAt}
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
            <section className="home-v2-panel home-v2-leaderboard" aria-labelledby="home-v2-leaderboard-title">
              <div className="home-v2-section-head home-v2-panel-head">
                <div>
                  <span className="home-v2-section-kicker">Corrida pelo título</span>
                  <h2 id="home-v2-leaderboard-title">Classificação</h2>
                </div>
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

            <section className="home-v2-panel home-v2-movement" aria-labelledby="home-v2-movement-title">
              <div className="home-v2-section-head home-v2-panel-head">
                <div>
                  <span className="home-v2-section-kicker">Acontecimentos recentes</span>
                  <h2 id="home-v2-movement-title">Movimento da rodada</h2>
                </div>
                <Link className="home-v2-text-link" to="/atividades">Todas as atividades <span aria-hidden="true">→</span></Link>
              </div>

              {!logs.length ? <p className="home-v2-empty">Nenhuma atividade recente.</p> : (
                <ul className="home-v2-activity-list">
                  {logs.map((item) => {
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
