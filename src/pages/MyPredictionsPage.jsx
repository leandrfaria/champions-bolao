import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import AccessibleSelect from '../components/AccessibleSelect'
import MyCampaignMatch from '../components/MyCampaignMatch'
import TeamCrest from '../components/TeamCrest'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction, isLocked } from '../lib/utils'
import '../styles/my-predictions-v3.css'
import '../styles/round-explorer.css'

const STATUS_LABELS = { pending: 'Pendentes', upcoming: 'Próximos', live: 'Em andamento', results: 'Resultados' }
const STATUS_EMPTY = {
  pending: 'Você não tem palpites pendentes.',
  upcoming: 'Nenhum próximo jogo disponível.',
  live: 'Nenhuma partida aguardando resultado.',
  results: 'Ainda não há resultados nesta temporada.',
}

function compareLeaderboard(a, b) {
  return b.points - a.points || b.exact - a.exact || b.outcomes - a.outcomes || a.display_name.localeCompare(b.display_name)
}

function sameRank(a, b) {
  return a && b && a.points === b.points && a.exact === b.exact && a.outcomes === b.outcomes
}

function rankParticipants(profiles, predictions, matches) {
  const matchById = new Map(matches.map((match) => [match.id, match]))
  const rows = profiles.map((profile) => {
    const own = predictions.filter((prediction) => prediction.user_id === profile.id)
      .map((prediction) => ({ prediction, match: matchById.get(prediction.match_id) }))
      .filter(({ match }) => match && hasResult(match))
    return {
      id: profile.id,
      display_name: profile.display_name || 'Participante',
      points: own.reduce((sum, item) => sum + calculatePoints(item.prediction, item.match), 0),
      exact: own.filter((item) => isExactPrediction(item.prediction, item.match)).length,
      outcomes: own.filter((item) => didPickWinner(item.prediction, item.match)).length,
    }
  }).sort(compareLeaderboard)

  let rank = 0
  return rows.map((row, index) => {
    if (!index || !sameRank(row, rows[index - 1])) rank += 1
    return { ...row, rank }
  })
}

function shortRound(round) {
  const raw = String(round?.name || '').trim()
  const stage = String(round?.stage || '').trim()
  let detail = raw
  if (stage && detail.toLocaleLowerCase().startsWith(stage.toLocaleLowerCase())) {
    detail = detail.slice(stage.length).replace(/^[\s·\-–—:]+/, '').trim()
  }
  if (/^rodada\s+/i.test(detail)) detail = detail.replace(/^rodada\s+/i, '').trim()
  const total = round?.total_rounds || round?.rounds_count
  const number = round?.sort_order || ''
  if (/^\d+(\s+de\s+\d+)?$/i.test(detail)) return `Rodada ${detail}`
  return number ? `Rodada ${number}${total ? ` de ${total}` : ''}` : raw || 'Rodada'
}

function dateLabel(value) {
  if (!value) return 'Data a confirmar'
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' })
    .format(new Date(value)).replace('.', '')
}

function kickoffLabel(value) {
  if (!value) return 'Horário a confirmar'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    .format(new Date(value)).replace('.', '')
}

function matchCategory(match, ownPrediction) {
  if (hasResult(match)) return 'results'
  if (isLocked(match)) return 'live'
  return ownPrediction ? 'upcoming' : 'pending'
}

function scoreForRound(round, predictionByMatch) {
  const settled = (round.matches || []).filter(hasResult)
  const picks = settled.map((match) => ({ match, prediction: predictionByMatch.get(match.id) })).filter((item) => item.prediction)
  return {
    points: picks.reduce((total, item) => total + calculatePoints(item.prediction, item.match), 0),
    exact: picks.filter((item) => isExactPrediction(item.prediction, item.match)).length,
    outcomes: picks.filter((item) => didPickWinner(item.prediction, item.match)).length,
    settled: settled.length,
    total: (round.matches || []).length,
  }
}

function PerformanceChart({ rounds, predictionByMatch }) {
  const data = rounds.map((round) => ({ round, ...scoreForRound(round, predictionByMatch) })).filter((item) => item.settled > 0)
  const max = Math.max(1, ...data.map((item) => item.points))
  if (!data.length) return <div className="mc-chart-empty">A evolução aparece após os primeiros resultados oficiais.</div>
  return (
    <div className="mc-chart" role="list" aria-label="Pontos conquistados por rodada">
      {data.map((item) => (
        <div className={`mc-chart-item${item.settled < item.total ? ' is-partial' : ''}`} role="listitem" key={item.round.id}>
          <div className="mc-chart-value">{item.points}<small> pt</small></div>
          <div className="mc-chart-track" aria-label={`${item.points} pontos`}><i style={{ height: `${Math.max(8, item.points / max * 100)}%` }} /></div>
          <strong>R{item.round.sort_order}</strong>
          {item.settled < item.total && <span className="mc-chart-partial">{item.settled}/{item.total}</span>}
        </div>
      ))}
    </div>
  )
}

function MatchGroup({ title, matches, predictionByMatch, profiles, userId, onSaved }) {
  return (
    <section className="mc-date-group">
      <h3><span>{title}</span><small>{matches.length} {matches.length === 1 ? 'jogo' : 'jogos'}</small></h3>
      <div className="mc-match-list">
        {matches.map((match) => (
          <MyCampaignMatch
            key={match.id}
            match={match}
            ownPrediction={predictionByMatch.get(match.id) || null}
            profiles={profiles}
            userId={userId}
            onSaved={onSaved}
          />
        ))}
      </div>
    </section>
  )
}

function ResultRound({ round, predictionByMatch }) {
  const [expanded, setExpanded] = useState(false)
  const score = scoreForRound(round, predictionByMatch)
  const settledMatches = (round.matches || []).filter(hasResult).sort((a, b) => new Date(b.kickoff_at || 0) - new Date(a.kickoff_at || 0))
  return (
    <article className="mc-history-round">
      <button type="button" className="mc-history-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span className="mc-history-round-number">{String(round.sort_order || '—').padStart(2, '0')}</span>
        <span className="mc-history-round-copy"><strong>{shortRound(round)}</strong><small>{round.stage || 'Competição'} · {score.settled}/{score.total} apurados</small></span>
        <span className="mc-history-round-stats"><b>{score.points} <small>pts</small></b><small>{score.exact} exatos · {score.outcomes} desfechos</small></span>
        <svg className={expanded ? 'is-open' : ''} aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7.5 5 5 5-5" /></svg>
      </button>
      {expanded && (
        <div className="mc-history-matches">
          {settledMatches.map((match) => {
            const prediction = predictionByMatch.get(match.id)
            const points = prediction ? calculatePoints(prediction, match) : 0
            const exact = prediction && isExactPrediction(prediction, match)
            const outcome = prediction && didPickWinner(prediction, match)
            const tone = !prediction ? 'neutral' : exact ? 'exact' : outcome ? 'outcome' : 'miss'
            const resultLabel = !prediction
              ? 'SEM PALPITE'
              : exact
                ? 'PLACAR EXATO'
                : outcome
                  ? Number(match.home_score) === Number(match.away_score) ? 'EMPATE' : 'VENCEDOR'
                  : 'ERROU'
            return (
              <div className="mc-history-match" key={match.id}>
                <div className="mc-history-game"><small>{kickoffLabel(match.kickoff_at)}</small><div className="mc-history-teams"><span><TeamCrest team={match.home_team} size="small" /><b>{match.home_team}</b></span><strong>{match.home_score} × {match.away_score}</strong><span><TeamCrest team={match.away_team} size="small" /><b>{match.away_team}</b></span></div></div>
                <div className="mc-history-pick"><strong>{prediction ? `${prediction.home_score} × ${prediction.away_score}` : 'Sem palpite'}</strong></div>
                <div className={`mc-points mc-points--${tone}`}><strong>{prediction ? `+${points}` : '0'}</strong><small>{resultLabel}</small></div>
              </div>
            )
          })}
          {score.settled < score.total && <p className="mc-history-partial">Rodada em apuração: {score.settled} de {score.total} partidas com resultado oficial. Os demais jogos permanecem nas categorias correspondentes.</p>}
        </div>
      )}
    </article>
  )
}

export default function MyPredictionsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [seasons, setSeasons] = useState([])
  const [profiles, setProfiles] = useState([])
  const [seasonId, setSeasonId] = useState('')
  const [rounds, setRounds] = useState([])
  const [ownPredictions, setOwnPredictions] = useState([])
  const [rankingPredictions, setRankingPredictions] = useState([])
  const [status, setStatus] = useState('pending')
  const [performanceOpen, setPerformanceOpen] = useState(false)
  const [error, setError] = useState('')
  const loadSequence = useRef(0)

  useEffect(() => {
    let cancelled = false
    async function loadBase() {
      setLoading(true)
      setError('')
      try {
        const [{ data: seasonData, error: seasonError }, { data: profileData, error: profileError }] = await Promise.all([
          supabase.from('seasons').select('*').order('created_at', { ascending: false }),
          supabase.from('profiles').select('*').order('display_name'),
        ])
        if (seasonError) throw seasonError
        if (profileError) throw profileError
        if (cancelled) return
        const list = seasonData || []
        setSeasons(list)
        setProfiles(profileData || [])
        setSeasonId(list.find((item) => item.is_active)?.id || list[0]?.id || '')
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Não foi possível carregar sua campanha.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadBase()
    return () => { cancelled = true }
  }, [])

  const loadSeason = useCallback(async (selectedSeasonId, { silent = false } = {}) => {
    const sequence = ++loadSequence.current
    if (!selectedSeasonId) {
      setRounds([])
      setOwnPredictions([])
      setRankingPredictions([])
      return
    }
    if (silent) setRefreshing(true)
    else {
      setLoading(true)
      setRounds([])
      setOwnPredictions([])
      setRankingPredictions([])
    }
    setError('')
    try {
      const { data: roundRows, error: roundsError } = await supabase.from('rounds').select('*, matches(*)').eq('season_id', selectedSeasonId).order('sort_order')
      if (roundsError) throw roundsError
      const loadedRounds = (roundRows || []).map((round) => ({
        ...round,
        matches: [...(round.matches || [])].sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0)),
      }))
      const matchList = loadedRounds.flatMap((round) => round.matches.map((match) => ({ ...match, rounds: round })))
      const matchIds = matchList.map((match) => match.id)
      const settledIds = matchList.filter(hasResult).map((match) => match.id)
      const [ownResult, rankingResult] = await Promise.all([
        matchIds.length
          ? supabase.from('predictions').select('*').eq('user_id', user.id).in('match_id', matchIds)
          : Promise.resolve({ data: [], error: null }),
        settledIds.length
          ? supabase.from('predictions').select('*').in('match_id', settledIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (ownResult.error) throw ownResult.error
      if (rankingResult.error) throw rankingResult.error
      if (sequence !== loadSequence.current) return
      setRounds(loadedRounds)
      setOwnPredictions(ownResult.data || [])
      setRankingPredictions(rankingResult.data || [])
      if (!silent) {
        const ownMap = new Map((ownResult.data || []).map((prediction) => [prediction.match_id, prediction]))
        const priority = ['pending', 'upcoming', 'live', 'results'].find((category) => matchList.some((match) => matchCategory(match, ownMap.get(match.id)) === category))
        setStatus(priority || 'pending')
      }
    } catch (loadError) {
      if (sequence !== loadSequence.current) return
      setError(loadError.message || 'Não foi possível carregar seus palpites.')
      if (!silent) {
        setRounds([])
        setOwnPredictions([])
        setRankingPredictions([])
      }
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [user.id])

  useEffect(() => {
    if (!seasonId) return undefined
    loadSeason(seasonId)
    return () => { loadSequence.current += 1 }
  }, [seasonId, loadSeason])

  useEffect(() => {
    setStatus('pending')
  }, [seasonId])

  const allMatches = useMemo(() => rounds.flatMap((round) => (round.matches || []).map((match) => ({ ...match, rounds: round }))), [rounds])
  const predictionByMatch = useMemo(() => new Map(ownPredictions.map((prediction) => [prediction.match_id, prediction])), [ownPredictions])
  const categories = useMemo(() => {
    const result = { pending: [], upcoming: [], live: [], results: [] }
    allMatches.forEach((match) => result[matchCategory(match, predictionByMatch.get(match.id))].push(match))
    result.pending.sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0))
    result.upcoming.sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0))
    result.live.sort((a, b) => new Date(b.kickoff_at || 0) - new Date(a.kickoff_at || 0))
    result.results.sort((a, b) => new Date(b.kickoff_at || 0) - new Date(a.kickoff_at || 0))
    return result
  }, [allMatches, predictionByMatch])

  const standings = useMemo(() => rankParticipants(profiles, rankingPredictions, allMatches.filter(hasResult)), [profiles, rankingPredictions, allMatches])
  const standing = standings.find((row) => row.id === user.id)
  const settledOwn = ownPredictions.map((prediction) => ({ prediction, match: allMatches.find((match) => match.id === prediction.match_id) }))
    .filter((item) => item.match && hasResult(item.match))
  const stats = useMemo(() => {
    const scores = settledOwn.map((item) => calculatePoints(item.prediction, item.match))
    const exact = settledOwn.filter((item) => isExactPrediction(item.prediction, item.match)).length
    const outcomes = settledOwn.filter((item) => didPickWinner(item.prediction, item.match)).length
    const correct = scores.filter((score) => score > 0).length
    return {
      points: scores.reduce((sum, score) => sum + score, 0),
      exact,
      outcomes,
      settled: settledOwn.length,
      correct,
      rate: settledOwn.length ? Math.round(correct / settledOwn.length * 100) : 0,
      rank: standing?.rank || null,
      participants: standings.length,
    }
  }, [settledOwn, standing?.rank, standings.length])
  const season = seasons.find((item) => item.id === seasonId)
  const seasonEyebrow = season?.name
    ? `CHAMPIONS LEAGUE ${season.name.replace(/^champions league\s*/i, '').trim()}`.trim()
    : 'CHAMPIONS LEAGUE'
  const visibleMatches = categories[status] || []
  const groupedMatches = useMemo(() => {
    const map = new Map()
    visibleMatches.forEach((match) => {
      const key = match.kickoff_at ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(match.kickoff_at)) : 'unknown'
      if (!map.has(key)) map.set(key, { title: key === 'unknown' ? 'Data a confirmar' : dateLabel(match.kickoff_at), matches: [] })
      map.get(key).matches.push(match)
    })
    return [...map.values()]
  }, [visibleMatches])

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = document.scrollingElement
      if (!scroller) return
      const maxScrollTop = Math.max(0, scroller.scrollHeight - window.innerHeight)
      if (scroller.scrollTop > maxScrollTop) scroller.scrollTop = maxScrollTop
    })
    return () => window.cancelAnimationFrame(frame)
  }, [status, seasonId, performanceOpen, rounds])

  async function savePrediction(matchId, homeScore, awayScore) {
    const match = allMatches.find((item) => item.id === matchId)
    if (!match || isLocked(match)) throw new Error('O prazo para palpitar nesta partida terminou.')
    const { error: saveError } = await supabase.from('predictions').upsert({
      user_id: user.id,
      match_id: matchId,
      home_score: Number(homeScore),
      away_score: Number(awayScore),
    }, { onConflict: 'match_id,user_id' })
    if (saveError) throw saveError
    await loadSeason(seasonId, { silent: true })
  }

  if (loading) return <Loading label="Carregando sua campanha..." />
  if (error && !rounds.length && seasons.length) return <div className="page-wrap my-campaign-page"><div className="form-error mc-error">{error}</div></div>

  return (
    <div className="page-wrap my-campaign-page">
      <header className="round-explorer-header mc-header">
        <div className="round-explorer-heading"><span>{seasonEyebrow}</span><h1>Meus palpites</h1></div>
        <div className="round-explorer-season-select mc-season-picker"><span>Temporada</span><AccessibleSelect ariaLabel="Selecionar temporada" value={seasonId} options={seasons.map((item) => ({ value: item.id, label: `${item.name}${item.is_active ? ' · atual' : ''}` }))} onChange={setSeasonId} className="mc-select" /></div>
      </header>

      {error && <div className="form-error mc-error" role="alert">{error}</div>}

      {seasons.length === 0 ? <EmptyState title="Nenhuma temporada" text="Ainda não há uma temporada disponível para acompanhar." /> : (
        <>
          <section className="mc-campaign" aria-label="Resumo da campanha">
            <div className="mc-campaign-primary">
              <div className="mc-stat-primary"><span>PONTUAÇÃO</span><strong>{stats.points}<small> pts</small></strong><em>{stats.settled} partidas apuradas</em></div>
              <div className="mc-stat-primary mc-rank-stat"><span>CLASSIFICAÇÃO</span><strong>{stats.rank ? `${stats.rank}º` : '—'}<small>{stats.participants ? ` / ${stats.participants}` : ''}</small></strong><em>{stats.rank ? 'posição oficial da temporada' : 'sem posição apurada'}</em></div>
            </div>
            <div className="mc-precision-group">
              <div className="mc-precision-main"><strong>{stats.rate}%</strong><span>Taxa de acerto</span></div>
              <div className="mc-precision-secondary"><div><strong>{stats.exact}</strong><span>Placares exatos</span></div><div><strong>{stats.outcomes}</strong><span>Desfechos corretos</span></div></div>
            </div>
            <div className="mc-performance">
              <div className="mc-performance-heading"><div><span>EVOLUÇÃO</span><strong>Pontos por rodada</strong></div><button className="mc-chart-toggle" type="button" aria-expanded={performanceOpen} onClick={() => setPerformanceOpen((value) => !value)}>{performanceOpen ? 'Recolher' : 'Ver evolução'}<svg className={performanceOpen ? 'is-open' : ''} viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg></button></div>
              <div className={`mc-performance-content${performanceOpen ? ' is-open' : ''}`}><PerformanceChart rounds={rounds} predictionByMatch={predictionByMatch} /></div>
            </div>
          </section>

          <section className="mc-center" aria-labelledby="mc-center-title">
            <div className="mc-section-heading"><h2 id="mc-center-title">Seus jogos</h2></div>
            <div className="mc-status-tabs" role="tablist" aria-label="Categorias de jogos">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <button key={key} id={`mc-tab-${key}`} type="button" role="tab" aria-selected={status === key} aria-controls="mc-match-panel" className={status === key ? 'is-active' : ''} onClick={() => setStatus(key)}>
                  <span>{label}</span><b>{categories[key].length}</b>
                </button>
              ))}
            </div>
            <div id="mc-match-panel" role="tabpanel" aria-labelledby={`mc-tab-${status}`} className="mc-match-panel">
              {refreshing && <div className="mc-refreshing" role="status">Atualizando sua campanha…</div>}
              {!rounds.length ? <div className="mc-empty"><strong>Sem partidas nesta temporada</strong><span>Os jogos aparecerão aqui quando forem cadastrados.</span></div> : !visibleMatches.length ? <div className="mc-empty"><strong>{STATUS_EMPTY[status]}</strong><span>{status === 'pending' && 'Quando houver partidas futuras sem palpite, elas aparecerão aqui.'}</span></div> : status === 'results' ? (
                <div className="mc-history-list">
                  <div className="mc-history-columns" aria-hidden="true"><span>Confronto · resultado</span><span>Meu palpite</span><span>Desempenho</span></div>
                  {rounds.filter((round) => (round.matches || []).some(hasResult)).sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0)).map((round) => <ResultRound key={round.id} round={round} predictionByMatch={predictionByMatch} />)}
                </div>
              ) : (
                <div className="mc-date-groups">
                  {groupedMatches.map((group) => <MatchGroup key={group.title} title={group.title} matches={group.matches} predictionByMatch={predictionByMatch} profiles={profiles} userId={user.id} onSaved={savePrediction} />)}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
