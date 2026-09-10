import { useEffect, useMemo, useState } from 'react'
import TeamCrest from '../components/TeamCrest'
import TrophyIcon from '../components/TrophyIcon'
import UserAvatar from '../components/UserAvatar'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction } from '../lib/utils'
import { activityCategory, activityText, activityTone, isFeedActivity, parseMatchName } from '../lib/activity'

const FILTERS = [
  ['all', 'Todas'],
  ['predictions', 'Palpites'],
  ['rounds', 'Rodadas'],
  ['results', 'Resultados'],
  ['classification', 'Classificação'],
]

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

function dayLabel(value) {
  const key = dateKey(value)
  const today = dateKey(new Date())
  const yesterdayDate = new Date(Date.now() - 86400000)
  const yesterday = dateKey(yesterdayDate)
  if (key === today) return 'Hoje'
  if (key === yesterday) return 'Ontem'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function dayCaption(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function timeLabel(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function relativeTimeLabel(value) {
  const date = new Date(value)
  const diffMs = Math.max(0, Date.now() - date.getTime())
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const yesterday = new Date(Date.now() - 86400000)
  if (dateKey(date) === dateKey(yesterday)) return `ontem, ${timeLabel(date)}`
  return `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)}, ${timeLabel(date)}`
}

function roundDateLabel(round) {
  const matches = [...(round?.matches || [])]
    .filter((match) => match.kickoff_at)
    .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
  if (!matches.length) return 'Sem data definida'
  const first = new Date(matches[0].kickoff_at)
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo',
  }).format(first)
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
  return String(value).replace(/\s*:\s*/g, 'x')
}

function ActivityMatchContext({ item }) {
  const parsed = item.match
    ? { home: item.match.home_team, away: item.match.away_team }
    : parseMatchName(item.metadata?.match_name)
  if (!parsed) return null

  const result = item.action === 'result_updated' ? formatScore(item.metadata?.result || '') : ''

  return (
    <div className={`activity-live-match ${result ? 'has-result' : ''}`} aria-label={`${parsed.home} x ${parsed.away}`}>
      <div className="activity-live-match-team home">
        <TeamCrest team={parsed.home} size="small" />
        <span>{parsed.home}</span>
      </div>
      <strong className="activity-live-match-score">{result || '×'}</strong>
      <div className="activity-live-match-team away">
        <span>{parsed.away}</span>
        <TeamCrest team={parsed.away} size="small" />
      </div>
    </div>
  )
}

function eventDescription(item) {
  switch (item.action) {
    case 'prediction_created': return 'Palpite registrado. O placar continua secreto até o início da partida.'
    case 'prediction_updated': return 'Palpite atualizado dentro do prazo permitido.'
    case 'result_updated': return 'Os pontos da partida já podem impactar a classificação.'
    case 'round_created': return 'A rodada entrou no calendário do bolão.'
    case 'round_started': return 'Os jogos desta rodada já começaram a ser disputados.'
    case 'round_finished': return `${item.metadata?.games || 0} ${item.metadata?.games === 1 ? 'jogo concluído' : 'jogos concluídos'} nesta rodada.`
    case 'season_created': return 'Nova temporada preparada para receber rodadas e partidas.'
    case 'season_activated': return 'Esta passou a ser a temporada ativa da competição.'
    case 'round_deleted': return 'A rodada e os dados ligados a ela foram removidos pelo administrador.'
    case 'season_deleted': return 'A temporada e toda a sua estrutura foram removidas pelo administrador.'
    case 'leader_changed': return `${item.metadata?.points ?? 0} pts na classificação acumulada.`
    case 'second_changed': return `${item.metadata?.points ?? 0} pts na classificação acumulada.`
    case 'roulette_spun': return 'Os dois escolhidos saem dos próximos sorteios até a roleta ser redefinida na Administração.'
    default: return ''
  }
}

function activityBadgeLabel(item) {
  if (item.action === 'prediction_created' || item.action === 'prediction_updated') return 'PALPITE'
  if (item.action === 'result_updated') return 'RESULTADO'
  if (item.action === 'leader_changed' || item.action === 'second_changed') return 'CLASSIFICAÇÃO'
  return 'RODADA'
}

function summaryIcon(type) {
  if (type === 'activity') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>
  if (type === 'participants') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM8 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM8 15c-3.314 0-6 2.239-6 5v1h12v-1c0-2.761-2.686-5-6-5Zm8 0c-.71 0-1.391.097-2.03.278A6.78 6.78 0 0 1 18 21v1h4v-1c0-3.314-2.686-6-6-6Z"/></svg>
  if (type === 'predictions') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m9 12 2 2 4-4"/></svg>
  if (type === 'results') return <TrophyIcon size={18} />
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 3v5M16 3v5M4 10h16"/></svg>
}

function activityPrimaryText(item) {
  const actor = item.profiles?.display_name || 'Alguém'
  switch (item.action) {
    case 'prediction_created': return <><strong>{actor}</strong> enviou um palpite.</>
    case 'prediction_updated': return <><strong>{actor}</strong> atualizou um palpite.</>
    case 'result_updated': return <>Resultado registrado.</>
    case 'leader_changed': return <><strong>{actor}</strong> assumiu o 1º lugar.</>
    case 'second_changed': return <><strong>{actor}</strong> assumiu a 2ª posição.</>
    default: return <>{activityText(item)}</>
  }
}

function ActivityFeedSkeleton() {
  return (
    <div className="page-wrap activity-live-page">
      <div className="activity-live-skeleton-header activity-live-skeleton-pulse" />
      <div className="activity-live-skeleton-toolbar activity-live-skeleton-pulse" />
      <div className="activity-live-skeleton-feed">
        {[0, 1, 2, 3].map((item) => <div className="activity-live-skeleton-row activity-live-skeleton-pulse" key={item} />)}
      </div>
    </div>
  )
}

function ActivityCard({ item }) {
  const tone = activityTone(item.action)
  const isClassification = item.action === 'leader_changed' || item.action === 'second_changed'
  const actorRelated = item.action.startsWith('prediction_') || isClassification

  return (
    <article className={`activity-live-card tone-${tone} ${isClassification ? 'is-ranking-event' : ''}`}>
      <div className="activity-live-card-mobile-meta">
        <time>{timeLabel(item.created_at)}</time>
        <span className={`activity-live-type-badge tone-${tone}`}>{activityBadgeLabel(item)}</span>
      </div>

      <div className={`activity-live-avatar ${actorRelated ? '' : 'system-event'}`}>
        {actorRelated ? <UserAvatar profile={item.profiles} size="small" /> : <span className="activity-live-system-icon"><EventGlyph action={item.action} /></span>}
      </div>

      <div className="activity-live-main">
        <div className="activity-live-title-row">
          <h3>{activityPrimaryText(item)}</h3>
          <time>{relativeTimeLabel(item.created_at)}</time>
        </div>
        <p>{eventDescription(item)}</p>
        <div className="activity-live-mobile-match"><ActivityMatchContext item={item} /></div>
      </div>

      <div className="activity-live-context">
        <ActivityMatchContext item={item} />
        <div className="activity-live-context-meta">
          {isClassification && (
            <span className="activity-live-rank-mark">
              <TrophyIcon size={14} />
              {item.action === 'leader_changed' ? '1º' : '2º'}
            </span>
          )}
          <span className={`activity-live-type-badge tone-${tone}`}>{activityBadgeLabel(item)}</span>
        </div>
      </div>
    </article>
  )
}

export default function ActivityPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState([])
  const [derived, setDerived] = useState([])
  const [profiles, setProfiles] = useState([])
  const [rounds, setRounds] = useState([])
  const [filter, setFilter] = useState('all')
  const [roundFilter, setRoundFilter] = useState('all')
  const [roundOptions, setRoundOptions] = useState([])
  const [activeSeason, setActiveSeason] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [{ data: logData, error: logError }, { data: profileData, error: profileError }, { data: season, error: seasonError }] = await Promise.all([
          supabase.from('audit_logs').select('*, profiles(id, display_name, avatar_path)').order('created_at', { ascending: false }).limit(500),
          supabase.from('profiles').select('*').order('display_name'),
          supabase.from('seasons').select('*').eq('is_active', true).maybeSingle(),
        ])
        if (logError) throw logError
        if (profileError) throw profileError
        if (seasonError) throw seasonError

        let loadedRounds = []
        let predictions = []
        if (season) {
          const { data: roundData, error: roundError } = await supabase
            .from('rounds')
            .select('id, name, stage, sort_order, season_id, closed_at, matches(*)')
            .eq('season_id', season.id)
            .order('sort_order', { ascending: true })
          if (roundError) throw roundError
          loadedRounds = roundData || []
          const finishedIds = loadedRounds.flatMap((round) => round.matches || []).filter(hasResult).map((match) => match.id)
          if (finishedIds.length) {
            const { data: predictionData, error: predictionError } = await supabase.from('predictions').select('*').in('match_id', finishedIds)
            if (predictionError) throw predictionError
            predictions = predictionData || []
          }
        }

        if (!active) return
        setActiveSeason(season || null)
        const rawLogs = logData || []
        const clearMarker = rawLogs.find((item) => item.action === 'activity_feed_cleared')
        const clearedAt = clearMarker ? new Date(clearMarker.created_at).getTime() : 0
        const visibleRawLogs = rawLogs.filter((item) => item.action !== 'activity_feed_cleared' && new Date(item.created_at).getTime() > clearedAt)
        const matchMap = new Map(loadedRounds.flatMap((round) => (round.matches || []).map((match) => [match.id, { ...match, round }])))
        const roundByName = new Map(loadedRounds.map((round) => [round.name, round]))

        const attachRound = (item) => {
          const match = item.entity_type === 'match' ? matchMap.get(item.entity_id) : null
          const byName = item.metadata?.round_name ? roundByName.get(item.metadata.round_name) : null
          const roundId = item.metadata?.round_id || (item.entity_type === 'round' ? item.entity_id : null) || match?.round_id || byName?.id || null
          const roundName = item.metadata?.round_name || match?.round?.name || byName?.name || null
          return { ...item, match, roundId, roundName }
        }

        const derivedEvents = deriveCompetitionEvents({ logs: visibleRawLogs, profiles: profileData || [], rounds: loadedRounds, predictions })
          .filter((item) => new Date(item.created_at).getTime() > clearedAt)
          .map(attachRound)
        const feedLogs = visibleRawLogs.filter(isFeedActivity).map(attachRound)

        const optionMap = new Map(loadedRounds.map((round) => [round.id, { id: round.id, name: round.name, sort_order: round.sort_order }]))
        ;[...feedLogs, ...derivedEvents].forEach((item) => {
          if (item.roundId && item.roundName && !optionMap.has(item.roundId)) {
            optionMap.set(item.roundId, { id: item.roundId, name: item.roundName, sort_order: -1 })
          }
        })

        setProfiles(profileData || [])
        setRounds(loadedRounds)
        setRoundOptions([...optionMap.values()].sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0) || a.name.localeCompare(b.name)))
        setLogs(feedLogs)
        setDerived(derivedEvents)
      } catch (err) {
        if (active) setError(err.message || 'Não foi possível carregar as atividades.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const mergedEvents = useMemo(() => {
    return [...logs, ...derived]
      .filter(isFeedActivity)
      .map((item) => ({ ...item, category: item.category || activityCategory(item.action) }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [logs, derived])

  const scopedEvents = useMemo(() => {
    return roundFilter === 'all'
      ? mergedEvents
      : mergedEvents.filter((item) => item.roundId === roundFilter || item.metadata?.round_id === roundFilter)
  }, [mergedEvents, roundFilter])

  const events = useMemo(() => {
    return filter === 'all' ? scopedEvents : scopedEvents.filter((item) => item.category === filter)
  }, [scopedEvents, filter])

  const groups = useMemo(() => {
    const map = new Map()
    events.forEach((item) => {
      const key = dateKey(item.created_at)
      if (!map.has(key)) map.set(key, { key, value: item.created_at, items: [] })
      map.get(key).items.push(item)
    })
    return [...map.values()]
  }, [events])

  const stats = useMemo(() => {
    const today = dateKey(new Date())
    const activitiesToday = scopedEvents.filter((item) => dateKey(item.created_at) === today).length
    const activeParticipants = new Set(scopedEvents.map((item) => item.profiles?.id).filter(Boolean)).size
    const predictionsRegistered = scopedEvents.filter((item) => item.category === 'predictions').length
    const resultsReleased = scopedEvents.filter((item) => item.category === 'results').length
    const futureRounds = rounds
      .map((round) => ({
        round,
        firstKickoff: [...(round.matches || [])]
          .filter((match) => match.kickoff_at)
          .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))[0]?.kickoff_at || null,
      }))
      .filter((entry) => entry.firstKickoff && new Date(entry.firstKickoff) > new Date())
      .sort((a, b) => new Date(a.firstKickoff) - new Date(b.firstKickoff))
    return {
      activitiesToday,
      activeParticipants: activeParticipants || profiles.length,
      predictionsRegistered,
      resultsReleased,
      nextRound: futureRounds[0]?.round || null,
    }
  }, [scopedEvents, rounds, profiles])

  if (loading) return <ActivityFeedSkeleton />

  const seasonTitle = activeSeason?.name || 'Champions League'

  return (
    <div className="page-wrap activity-live-page">
      <header className="activity-live-header">
        <div className="activity-live-header-copy">
          <span>{seasonTitle.toUpperCase()}</span>
          <h1>Atividades</h1>
          <p>Acompanhe tudo que está acontecendo no bolão.</p>
        </div>
        <div className="activity-live-header-today" aria-label={`${stats.activitiesToday} acontecimentos hoje`}>
          <span>Hoje</span>
          <strong>{stats.activitiesToday}</strong>
          <small>{stats.activitiesToday === 1 ? 'acontecimento' : 'acontecimentos'}</small>
        </div>
      </header>

      <section className="activity-live-toolbar" aria-label="Filtros de atividades">
        <div className="activity-live-filter-row" role="tablist" aria-label="Filtrar atividades">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
              <EventGlyph action={value === 'all' ? 'all' : value === 'predictions' ? 'prediction_created' : value === 'results' ? 'result_updated' : value === 'classification' ? 'leader_changed' : 'round_started'} />
              {label}
            </button>
          ))}
        </div>
        <label className="activity-live-round-filter">
          <span>Rodada</span>
          <select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
            <option value="all">Todas as rodadas</option>
            {roundOptions.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
          </select>
        </label>
      </section>

      {error && <div className="form-error">{error}</div>}

      <div className="activity-live-feed" key={`${filter}-${roundFilter}`}>
        {!groups.length ? (
          <div className="activity-live-empty">
            <strong>Nenhuma atividade por aqui.</strong>
            <span>{filter === 'all' ? 'Os acontecimentos relevantes da competição aparecerão aqui.' : 'Não há eventos deste tipo para o filtro selecionado.'}</span>
            {(filter !== 'all' || roundFilter !== 'all') && <button type="button" onClick={() => { setFilter('all'); setRoundFilter('all') }}>Limpar filtros</button>}
          </div>
        ) : (
          groups.map((group) => (
            <section className="activity-live-day" key={group.key}>
              <header className="activity-live-day-heading">
                <strong>{dayLabel(group.value)}</strong>
                <span>{dayCaption(group.value)}</span>
              </header>
              <div className="activity-live-day-events">
                {group.items.map((item) => (
                  <div className="activity-live-row" key={item.id}>
                    <time className="activity-live-time">{timeLabel(item.created_at)}</time>
                    <span className={`activity-live-node tone-${activityTone(item.action)}`}><EventGlyph action={item.action} /></span>
                    <ActivityCard item={item} />
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
