import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TeamCrest from '../components/TeamCrest'
import TrophyIcon from '../components/TrophyIcon'
import UserAvatar from '../components/UserAvatar'
import AccessibleSelect from '../components/AccessibleSelect'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction } from '../lib/utils'
import { activityCategory, activityText, activityTone, isFeedActivity, parseMatchName } from '../lib/activity'
import '../styles/activity-feed.css'

const FILTERS = [
  ['all', 'Todas'],
  ['predictions', 'Palpites'],
  ['rounds', 'Rodadas'],
  ['results', 'Resultados'],
  ['classification', 'Classificação'],
]

const PERIODS = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o histórico' },
]
const PAGE_SIZE = 20
const CATEGORY_ACTIONS = {
  predictions: ['prediction_created', 'prediction_updated'],
  rounds: ['round_created', 'round_started', 'round_finished', 'season_created', 'season_activated', 'season_deleted', 'round_deleted', 'roulette_spun'],
  results: ['result_updated'],
  classification: ['leader_changed', 'second_changed'],
}
const FEED_ACTIONS = [
  'prediction_created', 'prediction_updated', 'round_created', 'round_started', 'round_finished',
  'result_updated', 'season_created', 'season_activated', 'season_deleted', 'round_deleted',
  'leader_changed', 'second_changed', 'roulette_spun',
]

function periodStart(period) {
  const hours = period === '7d' ? 168 : period === '30d' ? 720 : period === '90d' ? 2160 : null
  return hours ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() : null
}

async function fetchActivityBatch({ offset, period, filter, clearedAt }) {
  let query = supabase
    .from('audit_logs')
    .select('*, profiles(id, display_name, avatar_path)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  query = query.in('action', filter === 'all' ? FEED_ACTIONS : CATEGORY_ACTIONS[filter] || FEED_ACTIONS)
  if (clearedAt) query = query.gt('created_at', new Date(clearedAt).toISOString())
  const start = periodStart(period)
  if (start) query = query.gte('created_at', start)

  return query
}

function EventGlyph({ action }) {
  if (action === 'all') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="17" r="1" fill="currentColor" stroke="none"/></svg>
  if (action === 'leader_changed' || action === 'second_changed') return <TrophyIcon size={17} />
  if (action === 'roulette_spun') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6M12 14v6M4 12h6M14 12h6M6.5 6.5l4 4M13.5 13.5l4 4M17.5 6.5l-4 4M10.5 13.5l-4 4"/></svg>
  if (action === 'prediction_created' || action === 'prediction_updated') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>
  }
  if (action === 'result_updated') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m9 12 2 2 4-4"/></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 3v5M16 3v5M4 10h16"/></svg>
}

function dateKey(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function timeLabel(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function buildStanding(profiles, predictions, matchMap, matchIds) {
  const idSet = new Set(matchIds)
  const rows = profiles.map((profile) => {
    const entries = predictions
      .filter((prediction) => prediction.user_id === profile.id && idSet.has(prediction.match_id))
      .map((prediction) => ({ prediction, match: matchMap.get(prediction.match_id) }))
      .filter((entry) => entry.match && hasResult(entry.match))
    const points = entries.reduce((sum, entry) => sum + calculatePoints(entry.prediction, entry.match), 0)
    const exact = entries.filter((entry) => isExactPrediction(entry.prediction, entry.match)).length
    const winners = entries.filter((entry) => didPickWinner(entry.prediction, entry.match)).length
    return { ...profile, points, exact, winners }
  }).sort((a, b) => b.points - a.points || b.exact - a.exact || b.winners - a.winners || a.display_name.localeCompare(b.display_name))

  let position = 0
  let previous = null
  return rows.map((row, index) => {
    if (index === 0) position = 1
    else if (!(previous && row.points === previous.points && row.exact === previous.exact && row.winners === previous.winners)) position += 1
    const next = { ...row, position }
    previous = next
    return next
  })
}

function deriveCompetitionEvents({ logs, profiles, rounds, predictions }) {
  if (!profiles.length || !rounds.length) return []

  const matches = rounds.flatMap((round) => (round.matches || []).map((match) => ({ ...match, round })))
  const matchMap = new Map(matches.map((match) => [match.id, match]))
  const resultLogs = logs.filter((log) => log.action === 'result_updated' && matchMap.has(log.entity_id))

  const latestResultLogByMatch = new Map()
  resultLogs.forEach((log) => {
    const previous = latestResultLogByMatch.get(log.entity_id)
    if (!previous || new Date(log.created_at) > new Date(previous.created_at)) latestResultLogByMatch.set(log.entity_id, log)
  })

  const finishedTimeline = matches
    .filter(hasResult)
    .map((match) => {
      const log = latestResultLogByMatch.get(match.id)
      return {
        match,
        occurredAt: log?.created_at || match.updated_at || match.kickoff_at || new Date().toISOString(),
      }
    })
    .sort((a, b) => {
      const dateDiff = new Date(a.occurredAt) - new Date(b.occurredAt)
      if (dateDiff) return dateDiff
      return new Date(a.match.kickoff_at || 0) - new Date(b.match.kickoff_at || 0)
    })

  const derived = []
  const processed = []
  let previousLeader = null
  let previousSecond = null

  finishedTimeline.forEach(({ match, occurredAt }) => {
    processed.push(match.id)
    const standings = buildStanding(profiles, predictions, matchMap, processed)
    const leaders = standings.filter((entry) => entry.position === 1)
    const seconds = standings.filter((entry) => entry.position === 2)
    const leader = leaders.length === 1 ? leaders[0] : null
    const second = seconds.length === 1 ? seconds[0] : null
    const baseDate = new Date(occurredAt)

    if (leader && leader.id !== previousLeader) {
      derived.push({
        id: `leader-${match.id}`,
        action: 'leader_changed',
        category: 'classification',
        created_at: new Date(baseDate.getTime() + 2).toISOString(),
        profiles: leader,
        metadata: { points: leader.points, position: 1, round_id: match.round_id || match.round?.id || null, round_name: match.round?.name || null },
      })
    }

    if (second && second.id !== previousSecond) {
      derived.push({
        id: `second-${match.id}`,
        action: 'second_changed',
        category: 'classification',
        created_at: new Date(baseDate.getTime() + 1).toISOString(),
        profiles: second,
        metadata: { points: second.points, position: 2, round_id: match.round_id || match.round?.id || null, round_name: match.round?.name || null },
      })
    }

    previousLeader = leader?.id || null
    previousSecond = second?.id || null
  })

  rounds.forEach((round) => {
    const roundMatches = [...(round.matches || [])].sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
    if (!roundMatches.length) return
    const firstStart = roundMatches[0]?.kickoff_at
    if (firstStart && new Date(firstStart) <= new Date()) {
      derived.push({
        id: `round-start-${round.id}`,
        action: 'round_started',
        category: 'rounds',
        created_at: firstStart,
        metadata: { round_id: round.id, round_name: round.name, stage: round.stage, games: roundMatches.length },
      })
    }

    const allFinished = roundMatches.every(hasResult)
    const resultDates = roundMatches
      .map((match) => latestResultLogByMatch.get(match.id)?.created_at || match.updated_at || null)
      .filter(Boolean)
    if (allFinished && resultDates.length === roundMatches.length) {
      const finishedAt = resultDates.sort((a, b) => new Date(b) - new Date(a))[0]
      derived.push({
        id: `round-finish-${round.id}`,
        action: 'round_finished',
        category: 'rounds',
        created_at: new Date(new Date(finishedAt).getTime() + 3).toISOString(),
        metadata: { round_id: round.id, round_name: round.name, stage: round.stage, games: roundMatches.length },
      })
    }
  })

  return derived
}

function formatScore(value) {
  if (!value) return ''
  return String(value).replace(/\s*:\s*/g, ' × ')
}

function ActivityMatchContext({ item, compact = false }) {
  const parsed = item.match
    ? { home: item.match.home_team, away: item.match.away_team }
    : parseMatchName(item.metadata?.match_name)
  if (!parsed) return null
  const result = item.action === 'result_updated' ? formatScore(item.metadata?.result || '') : ''
  return (
    <div className={`activity-v2-match${result ? ' has-result' : ''}${compact ? ' is-compact' : ''}`} aria-label={`${parsed.home} ${result || 'contra'} ${parsed.away}`}>
      <div className="activity-v2-match-team home"><span>{parsed.home}</span><TeamCrest team={parsed.home} size="small" /></div>
      <strong className="activity-v2-match-score">{result || '×'}</strong>
      <div className="activity-v2-match-team away"><TeamCrest team={parsed.away} size="small" /><span>{parsed.away}</span></div>
    </div>
  )
}

function eventTitle(item, count = 1) {
  const actor = item.profiles?.display_name || 'Alguém'
  const round = item.roundName || item.metadata?.round_name || 'Rodada'
  switch (item.action) {
    case 'prediction_created': return <><strong>{actor}</strong> enviou {count > 1 ? `${count} palpites` : 'um palpite'}</>
    case 'prediction_updated': return <><strong>{actor}</strong> atualizou {count > 1 ? `${count} palpites` : 'um palpite'}</>
    case 'result_updated': return <>Resultado registrado</>
    case 'leader_changed': return <><strong>{actor}</strong> assumiu a liderança</>
    case 'second_changed': return <><strong>{actor}</strong> chegou ao 2º lugar</>
    case 'round_created': return <>{round} criada</>
    case 'round_started': return <>{round} iniciada</>
    case 'round_finished': return <>{round} concluída</>
    case 'round_deleted': return <>{round} removida</>
    case 'season_created': return <>Temporada {item.metadata?.season_name || ''} criada</>
    case 'season_activated': return <>Temporada {item.metadata?.season_name || ''} ativada</>
    case 'season_deleted': return <>Temporada {item.metadata?.season_name || ''} removida</>
    case 'roulette_spun': return <>Sorteio realizado em {round}</>
    default: return <>{activityText(item)}</>
  }
}

function eventDetail(item) {
  if (item.action === 'leader_changed' || item.action === 'second_changed') return `${item.metadata?.position || (item.action === 'leader_changed' ? 1 : 2)}º lugar · ${item.metadata?.points ?? 0} pontos`
  if (item.action === 'round_finished') {
    const games = item.metadata?.games || 0
    return `${games} ${games === 1 ? 'jogo concluído' : 'jogos concluídos'}`
  }
  if (item.action === 'round_created' || item.action === 'round_started') return item.round?.stage || item.metadata?.stage || ''
  if (item.action === 'roulette_spun') {
    const selected = Array.isArray(item.metadata?.selected_names) ? item.metadata.selected_names.filter(Boolean) : []
    return selected.length ? `Sorteados: ${selected.join(' + ')}` : ''
  }
  if (item.action === 'season_created' || item.action === 'season_activated' || item.action === 'season_deleted') return item.metadata?.season_name || ''
  return ''
}

function groupPredictionEvents(events) {
  const groups = []
  events.forEach((item) => {
    const lastGroup = groups[groups.length - 1]
    const lastItem = lastGroup?.items[0]
    const predictionEvent = item.action === 'prediction_created' || item.action === 'prediction_updated'
    const canJoin = predictionEvent && lastItem
      && lastItem.action === item.action
      && lastItem.profiles?.id === item.profiles?.id
      && dateKey(lastItem.created_at) === dateKey(item.created_at)
      && Math.abs(new Date(lastItem.created_at) - new Date(item.created_at)) <= 10 * 60 * 1000
    if (canJoin) lastGroup.items.push(item)
    else groups.push({ id: item.id, items: [item] })
  })
  return groups
}

function dayHeading(value) {
  const key = dateKey(value)
  const todayKey = dateKey(new Date())
  const yesterdayKey = dateKey(new Date(Date.now() - 86400000))
  const date = new Date(value)
  const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)
  const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '').toUpperCase()
  if (key === todayKey) return `HOJE · ${day} ${shortMonth}`
  if (key === yesterdayKey) return `ONTEM · ${day} ${shortMonth}`
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' }).format(date).toUpperCase()
  return `${day} DE ${month}`
}

function ActivityFeedSkeleton() {
  return (
    <div className="page-wrap activity-v2-page" aria-label="Carregando atividades">
      <div className="activity-v2-skeleton-header" />
      <div className="activity-v2-skeleton-toolbar" />
      <div className="activity-v2-feed-skeleton">{[0, 1, 2, 3].map((item) => <div key={item} />)}</div>
    </div>
  )
}

function ActivityFeedRow({ group, expanded, onToggle }) {
  const item = group.items[0]
  const tone = activityTone(item.action)
  const predictionOrRanking = item.action.startsWith('prediction_') || item.action === 'leader_changed' || item.action === 'second_changed'
  const matchName = item.metadata?.match_name || (item.match ? `${item.match.home_team} × ${item.match.away_team}` : '')
  const detail = eventDetail(item)

  return (
    <article className={`activity-v2-row tone-${tone}`}>
      <div className={`activity-v2-avatar${predictionOrRanking ? '' : ' is-system'}`}>
        {predictionOrRanking ? (
          <UserAvatar profile={item.profiles} size="small" />
        ) : <span><EventGlyph action={item.action} /></span>}
      </div>
      <div className="activity-v2-copy">
        <div className="activity-v2-title-line">
          <h3>{eventTitle(item, group.items.length)}</h3>
          <time dateTime={item.created_at}>{timeLabel(item.created_at)}</time>
        </div>
        {group.items.length > 1 ? (
          <button type="button" className="activity-v2-group-toggle" aria-expanded={expanded} aria-controls={`activity-group-${group.id}`} onClick={onToggle}>
            {matchName ? <><span>{matchName}</span><span>e mais {group.items.length - 1} {group.items.length === 2 ? 'jogo' : 'jogos'}</span></> : <span>Ver os {group.items.length} acontecimentos</span>}
            <span className="activity-v2-group-chevron" aria-hidden="true">⌄</span>
          </button>
        ) : (
          <>
            {detail && <p>{detail}</p>}
            <ActivityMatchContext item={item} />
          </>
        )}
        {group.items.length > 1 && expanded && (
          <div className="activity-v2-group-items" id={`activity-group-${group.id}`}>
            {group.items.map((entry) => (
              <div className="activity-v2-group-item" key={entry.id}>
                <time dateTime={entry.created_at}>{timeLabel(entry.created_at)}</time>
                <ActivityMatchContext item={entry} compact />
              </div>
            ))}
          </div>
        )}
      </div>
      {item.roundId && <Link className="activity-v2-round-link" to={`/rodadas/${item.roundId}`}>Ver rodada <span aria-hidden="true">↗</span></Link>}
    </article>
  )
}

export default function ActivityPage() {
  const [baseLoading, setBaseLoading] = useState(true)
  const [baseReady, setBaseReady] = useState(false)
  const [baseError, setBaseError] = useState('')
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState('')
  const [logs, setLogs] = useState([])
  const [derived, setDerived] = useState([])
  const [rounds, setRounds] = useState([])
  const [roundCatalog, setRoundCatalog] = useState([])
  const [activeSeason, setActiveSeason] = useState(null)
  const [filter, setFilter] = useState('all')
  const [period, setPeriod] = useState('7d')
  const [roundFilter, setRoundFilter] = useState('all')
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
  const [hasMoreLogs, setHasMoreLogs] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())
  const [baseReload, setBaseReload] = useState(0)
  const [feedReload, setFeedReload] = useState(0)
  const offsetRef = useRef(0)
  const clearedAtRef = useRef(0)
  const feedRef = useRef(null)
  const previousFiltersRef = useRef({ filter, period, roundFilter })

  useEffect(() => {
    let active = true
    async function loadBase() {
      setBaseLoading(true)
      setBaseError('')
      setBaseReady(false)
      try {
        const [profileResult, seasonResult, clearResult, roundCatalogResult] = await Promise.all([
          supabase.from('profiles').select('*').order('display_name'),
          supabase.from('seasons').select('*').eq('is_active', true).maybeSingle(),
          supabase.from('audit_logs').select('created_at').eq('action', 'activity_feed_cleared').order('created_at', { ascending: false }).limit(1),
          supabase.from('rounds').select('id, name, sort_order, season_id').order('sort_order', { ascending: true }),
        ])
        if (profileResult.error) throw profileResult.error
        if (seasonResult.error) throw seasonResult.error
        if (clearResult.error) throw clearResult.error
        if (roundCatalogResult.error) throw roundCatalogResult.error

        const profileData = profileResult.data || []
        const season = seasonResult.data || null
        const clearMarker = clearResult.data?.[0]
        const clearedAt = clearMarker ? new Date(clearMarker.created_at).getTime() : 0
        let loadedRounds = []
        let predictions = []
        let resultLogs = []
        if (season) {
          const { data: roundData, error: roundError } = await supabase
            .from('rounds')
            .select('id, name, stage, sort_order, season_id, closed_at, matches(*)')
            .eq('season_id', season.id)
            .order('sort_order', { ascending: true })
          if (roundError) throw roundError
          loadedRounds = roundData || []
          const seasonMatches = loadedRounds.flatMap((round) => round.matches || [])
          const matchIds = seasonMatches.map((match) => match.id)
          const finishedIds = seasonMatches.filter(hasResult).map((match) => match.id)
          if (matchIds.length) {
            const result = await supabase.from('audit_logs').select('action, entity_id, created_at, metadata').eq('action', 'result_updated').in('entity_id', matchIds)
            if (result.error) throw result.error
            resultLogs = (result.data || []).filter((log) => new Date(log.created_at).getTime() > clearedAt)
          }
          if (finishedIds.length) {
            const result = await supabase.from('predictions').select('*').in('match_id', finishedIds)
            if (result.error) throw result.error
            predictions = result.data || []
          }
        }
        if (!active) return
        clearedAtRef.current = clearedAt
        setRoundCatalog(roundCatalogResult.data || [])
        setRounds(loadedRounds)
        setActiveSeason(season)
        setDerived(deriveCompetitionEvents({ logs: resultLogs, profiles: profileData, rounds: loadedRounds, predictions }).filter((item) => new Date(item.created_at).getTime() > clearedAt))
        setBaseReady(true)
      } catch (err) {
        if (active) setBaseError(err.message || 'Não foi possível carregar a página de atividades.')
      } finally {
        if (active) setBaseLoading(false)
      }
    }
    loadBase()
    return () => { active = false }
  }, [baseReload])

  const matchMap = useMemo(() => new Map(rounds.flatMap((round) => (round.matches || []).map((match) => [match.id, { ...match, round }]))), [rounds])
  const roundByName = useMemo(() => new Map(rounds.map((round) => [round.name, round])), [rounds])
  const enrichEvent = useCallback((item) => {
    const match = item.entity_type === 'match' ? matchMap.get(item.entity_id) : null
    const byName = item.metadata?.round_name ? roundByName.get(item.metadata.round_name) : null
    const roundId = item.roundId || item.metadata?.round_id || (item.entity_type === 'round' ? item.entity_id : null) || match?.round_id || byName?.id || null
    const roundName = item.roundName || item.metadata?.round_name || match?.round?.name || byName?.name || null
    return { ...item, match: item.match || match || null, round: item.round || byName || match?.round || null, roundId, roundName, category: item.category || activityCategory(item.action) }
  }, [matchMap, roundByName])

  useEffect(() => {
    if (!baseReady) return undefined
    let active = true
    setFeedLoading(true)
    setFeedError('')
    setLogs([])
    setVisibleLimit(PAGE_SIZE)
    setExpandedGroups(new Set())
    offsetRef.current = 0
    async function loadFirstPage() {
      try {
        const { data, error } = await fetchActivityBatch({ offset: 0, period, filter, clearedAt: clearedAtRef.current })
        if (error) throw error
        if (!active) return
        setLogs((data || []).filter(isFeedActivity))
        offsetRef.current = data?.length || 0
        setHasMoreLogs((data?.length || 0) === PAGE_SIZE)
      } catch (err) {
        if (active) setFeedError(err.message || 'Não foi possível carregar as atividades.')
      } finally {
        if (active) setFeedLoading(false)
      }
    }
    loadFirstPage()
    return () => { active = false }
  }, [baseReady, period, filter, feedReload])

  const mergedEvents = useMemo(() => [...logs, ...derived]
    .filter(isFeedActivity)
    .map(enrichEvent)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || String(b.id).localeCompare(String(a.id))), [logs, derived, enrichEvent])
  const filteredEvents = useMemo(() => {
    const start = periodStart(period)
    return mergedEvents.filter((item) => {
      if (start && new Date(item.created_at).getTime() < new Date(start).getTime()) return false
      if (filter !== 'all' && item.category !== filter) return false
      if (roundFilter !== 'all' && item.roundId !== roundFilter && item.metadata?.round_id !== roundFilter) return false
      return true
    })
  }, [mergedEvents, filter, period, roundFilter])
  const groupedEvents = useMemo(() => groupPredictionEvents(filteredEvents), [filteredEvents])
  const visibleEvents = groupedEvents.slice(0, visibleLimit)
  const dayGroups = useMemo(() => {
    const groups = new Map()
    visibleEvents.forEach((group) => {
      const item = group.items[0]
      const key = dateKey(item.created_at)
      if (!groups.has(key)) groups.set(key, { key, value: item.created_at, items: [] })
      groups.get(key).items.push(group)
    })
    return [...groups.values()]
  }, [visibleEvents])
  const roundOptions = useMemo(() => {
    const options = new Map(roundCatalog.map((round) => [round.id, { id: round.id, name: round.name, sort_order: round.sort_order }]))
    ;[...logs, ...derived].map(enrichEvent).forEach((item) => {
      if (item.roundId && item.roundName && !options.has(item.roundId)) options.set(item.roundId, { id: item.roundId, name: item.roundName, sort_order: -1 })
    })
    return [...options.values()].sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0) || a.name.localeCompare(b.name))
  }, [roundCatalog, logs, derived, enrichEvent])

  useEffect(() => {
    const previous = previousFiltersRef.current
    if (previous.filter !== filter || previous.period !== period || previous.roundFilter !== roundFilter) {
      feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      previousFiltersRef.current = { filter, period, roundFilter }
    }
  }, [filter, period, roundFilter])

  const loadMore = useCallback(async () => {
    if (loadingMore || feedLoading) return
    const targetLimit = visibleLimit + PAGE_SIZE
    setVisibleLimit(targetLimit)
    if (groupedEvents.length >= targetLimit || !hasMoreLogs) return
    setLoadingMore(true)
    setFeedError('')
    try {
      const { data, error } = await fetchActivityBatch({ offset: offsetRef.current, period, filter, clearedAt: clearedAtRef.current })
      if (error) throw error
      const page = (data || []).filter(isFeedActivity)
      setLogs((current) => {
        const ids = new Set(current.map((item) => item.id))
        return [...current, ...page.filter((item) => !ids.has(item.id))]
      })
      offsetRef.current += data?.length || 0
      setHasMoreLogs((data?.length || 0) === PAGE_SIZE)
    } catch (err) {
      setFeedError(err.message || 'Não foi possível carregar mais atividades.')
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, feedLoading, visibleLimit, groupedEvents.length, hasMoreLogs, period, filter])

  const seasonTitle = activeSeason?.name || 'Champions League'
  const periodLabel = PERIODS.find((item) => item.value === period)?.label || 'Últimos 7 dias'
  const hasMoreToShow = groupedEvents.length > visibleLimit || hasMoreLogs

  if (baseLoading) return <ActivityFeedSkeleton />
  if (baseError) return <div className="page-wrap activity-v2-page"><header className="activity-v2-header"><div className="activity-v2-heading"><span>CHAMPIONS LEAGUE</span><h1>Atividades</h1></div></header><div className="activity-v2-error" role="alert"><p>{baseError}</p><button type="button" onClick={() => setBaseReload((value) => value + 1)}>Tentar novamente</button></div></div>

  return (
    <div className="page-wrap activity-v2-page">
      <header className="activity-v2-header"><div className="activity-v2-heading"><span>{seasonTitle.toUpperCase()}</span><h1>Atividades</h1></div></header>

      <section className="activity-v2-toolbar" aria-label="Filtros de atividades">
        <div className="activity-v2-category-tabs" aria-label="Categoria">
          {FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <div className="activity-v2-filter-selects">
          <label><span>Período</span><AccessibleSelect value={period} ariaLabel="Filtrar por período" onChange={setPeriod} options={PERIODS} className="activity-v2-select" /></label>
          <label className="activity-v2-round-select"><span>Rodada</span><AccessibleSelect value={roundFilter} ariaLabel="Filtrar por rodada" onChange={setRoundFilter} options={[{ value: 'all', label: 'Todas as rodadas' }, ...roundOptions.map((round) => ({ value: round.id, label: round.name }))]} className="activity-v2-select" /></label>
        </div>
        <div className="activity-v2-mobile-filters">
          <label><span>Categoria</span><AccessibleSelect value={filter} ariaLabel="Filtrar por categoria" onChange={setFilter} options={FILTERS.map(([value, label]) => ({ value, label }))} className="activity-v2-select" /></label>
          <label><span>Período</span><AccessibleSelect value={period} ariaLabel="Filtrar por período" onChange={setPeriod} options={PERIODS.map((item) => ({ ...item, label: item.value === '7d' ? '7 dias' : item.value === '30d' ? '30 dias' : item.value === '90d' ? '90 dias' : 'Todo o histórico' }))} className="activity-v2-select" /></label>
          <label className="activity-v2-round-mobile"><span>Rodada</span><AccessibleSelect value={roundFilter} ariaLabel="Filtrar por rodada" onChange={setRoundFilter} options={[{ value: 'all', label: 'Todas' }, ...roundOptions.map((round) => ({ value: round.id, label: round.name }))]} className="activity-v2-select" /></label>
        </div>
      </section>

      <div className="activity-v2-results-heading" ref={feedRef}>
        <h2>Feed da competição</h2><span>{periodLabel}{roundFilter !== 'all' ? ` · ${roundOptions.find((round) => round.id === roundFilter)?.name || 'Rodada'}` : ''}</span>
      </div>
      {feedError && <div className="activity-v2-inline-error" role="alert"><span>{feedError}</span><button type="button" onClick={() => setFeedReload((value) => value + 1)}>Tentar novamente</button></div>}

      {feedLoading ? <div className="activity-v2-feed-skeleton" aria-label="Carregando acontecimentos">{[0, 1, 2].map((item) => <div key={item} />)}</div> : !dayGroups.length ? (
        <div className="activity-v2-empty">
          <strong>{hasMoreLogs ? 'Nenhuma atividade neste trecho.' : `Nenhuma atividade ${period === 'all' ? 'no histórico' : period === '7d' ? 'nos últimos 7 dias' : period === '30d' ? 'nos últimos 30 dias' : 'nos últimos 90 dias'}.`}</strong>
          <span>{hasMoreLogs ? 'Há registros anteriores que ainda podem corresponder aos filtros.' : 'Escolha um período maior para consultar mais acontecimentos.'}</span>
          {hasMoreLogs ? <button type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Carregando…' : 'Carregar mais'}</button> : period !== 'all' && <button type="button" onClick={() => setPeriod('all')}>Ver todo o histórico</button>}
        </div>
      ) : (
        <div className="activity-v2-feed">
          {dayGroups.map((group) => <section className="activity-v2-day" key={group.key}>
            <h3>{dayHeading(group.value)}</h3>
            <div className="activity-v2-day-rows">
              {group.items.map((eventGroup) => <ActivityFeedRow key={eventGroup.id} group={eventGroup} expanded={expandedGroups.has(eventGroup.id)} onToggle={() => setExpandedGroups((current) => { const next = new Set(current); if (next.has(eventGroup.id)) next.delete(eventGroup.id); else next.add(eventGroup.id); return next })} />)}
            </div>
          </section>)}
        </div>
      )}
      {!feedLoading && dayGroups.length > 0 && hasMoreToShow && <button type="button" className="activity-v2-load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Carregando atividades…' : 'Carregar mais'}</button>}
    </div>
  )
}
