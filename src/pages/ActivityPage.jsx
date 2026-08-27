import { useEffect, useMemo, useState } from 'react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
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
  if (action === 'leader_changed' || action === 'second_changed') return <TrophyIcon size={17} />
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
  if (minutes < 60) return `há ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const yesterday = new Date(Date.now() - 86400000)
  if (dateKey(date) === dateKey(yesterday)) return `ontem, ${timeLabel(date)}`
  return `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)}, ${timeLabel(date)}`
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

  let previous = null
  return rows.map((row, index) => {
    const tied = previous && row.points === previous.points && row.exact === previous.exact && row.winners === previous.winners
    const position = tied ? previous.position : index + 1
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
  const uniqueResults = [...latestResultLogByMatch.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const derived = []
  const processed = []
  let previousLeader = null
  let previousSecond = null

  uniqueResults.forEach((log) => {
    processed.push(log.entity_id)
    const standings = buildStanding(profiles, predictions, matchMap, processed)
    const leaders = standings.filter((entry) => entry.position === 1)
    const seconds = standings.filter((entry) => entry.position === 2)
    const leader = leaders.length === 1 ? leaders[0] : null
    const second = seconds.length === 1 ? seconds[0] : null

    if (leader && leader.id !== previousLeader) {
      derived.push({
        id: `leader-${log.id}`,
        action: 'leader_changed',
        category: 'classification',
        created_at: new Date(new Date(log.created_at).getTime() + 2).toISOString(),
        profiles: leader,
        metadata: { points: leader.points, position: 1, round_id: matchMap.get(log.entity_id)?.round_id || null, round_name: matchMap.get(log.entity_id)?.round?.name || null },
      })
    }
    if (second && second.id !== previousSecond) {
      derived.push({
        id: `second-${log.id}`,
        action: 'second_changed',
        category: 'classification',
        created_at: new Date(new Date(log.created_at).getTime() + 1).toISOString(),
        profiles: second,
        metadata: { points: second.points, position: 2, round_id: matchMap.get(log.entity_id)?.round_id || null, round_name: matchMap.get(log.entity_id)?.round?.name || null },
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
    const resultDates = roundMatches.map((match) => latestResultLogByMatch.get(match.id)?.created_at).filter(Boolean)
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

function MatchVisual({ item }) {
  const parsed = item.match
    ? { home: item.match.home_team, away: item.match.away_team }
    : parseMatchName(item.metadata?.match_name)
  if (!parsed) return null

  const result = item.action === 'result_updated' ? (item.metadata?.result || null) : null
  return (
    <div className="activity-match-visual" aria-label={`${parsed.home} x ${parsed.away}`}>
      <span title={parsed.home}><TeamCrest team={parsed.home} size="small" /></span>
      {result ? <strong>{result}</strong> : <span className="activity-versus">×</span>}
      <span title={parsed.away}><TeamCrest team={parsed.away} size="small" /></span>
    </div>
  )
}

function eventDescription(item) {
  switch (item.action) {
    case 'prediction_created': return 'Palpite registrado. O placar continua secreto até o início da partida.'
    case 'prediction_updated': return 'Palpite atualizado dentro do prazo permitido.'
    case 'result_updated': return 'Placar real da partida registrado pelo administrador.'
    case 'round_created': return 'A rodada entrou no calendário do bolão.'
    case 'round_started': return 'Os jogos desta rodada já começaram a ser disputados.'
    case 'round_finished': return `${item.metadata?.games || 0} ${item.metadata?.games === 1 ? 'jogo concluído' : 'jogos concluídos'} nesta rodada.`
    case 'season_created': return 'Nova temporada preparada para receber rodadas e partidas.'
    case 'season_activated': return 'Esta passou a ser a temporada ativa da competição.'
    case 'round_deleted': return 'A rodada e os dados ligados a ela foram removidos pelo administrador.'
    case 'season_deleted': return 'A temporada e toda a sua estrutura foram removidas pelo administrador.'
    case 'leader_changed': return `${item.metadata?.points ?? 0} pts na classificação acumulada.`
    case 'second_changed': return `${item.metadata?.points ?? 0} pts na classificação acumulada.`
    default: return ''
  }
}

function ActivityCard({ item }) {
  const tone = activityTone(item.action)
  const isClassification = item.action === 'leader_changed' || item.action === 'second_changed'
  const actorRelated = item.action.startsWith('prediction_') || isClassification

  return (
    <article className={`activity-story tone-${tone} ${isClassification ? 'activity-story-featured' : ''}`}>
      <div className={`activity-story-person ${actorRelated ? '' : 'system-event'}`}>
        {actorRelated ? <UserAvatar profile={item.profiles} size="small" /> : <span className="activity-system-icon"><EventGlyph action={item.action} /></span>}
      </div>
      <div className="activity-story-copy">
        {isClassification && <span className="activity-feature-label">{item.action === 'leader_changed' ? 'Nova liderança' : 'Novo 2º lugar'}</span>}
        <p>{activityText(item)}</p>
        <span>{eventDescription(item)}</span>
      </div>
      <div className="activity-story-side">
        <MatchVisual item={item} />
        {isClassification && (
          <div className="activity-rank-mark">
            <TrophyIcon size={20} />
            <span>{item.action === 'leader_changed' ? '1º' : '2º'}</span>
          </div>
        )}
        <small>{activityCategory(item.action) === 'predictions' ? 'Palpite' : activityCategory(item.action) === 'results' ? 'Resultado' : activityCategory(item.action) === 'classification' ? 'Classificação' : 'Rodada'}</small>
      </div>
    </article>
  )
}

export default function ActivityPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState([])
  const [derived, setDerived] = useState([])
  const [filter, setFilter] = useState('all')
  const [roundFilter, setRoundFilter] = useState('all')
  const [roundOptions, setRoundOptions] = useState([])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [{ data: logData, error: logError }, { data: profiles, error: profileError }, { data: season, error: seasonError }] = await Promise.all([
          supabase.from('audit_logs').select('*, profiles(id, display_name, avatar_path)').order('created_at', { ascending: false }).limit(500),
          supabase.from('profiles').select('*').order('display_name'),
          supabase.from('seasons').select('*').eq('is_active', true).maybeSingle(),
        ])
        if (logError) throw logError
        if (profileError) throw profileError
        if (seasonError) throw seasonError

        let rounds = []
        let predictions = []
        if (season) {
          const { data: roundData, error: roundError } = await supabase
            .from('rounds')
            .select('id, name, stage, sort_order, season_id, matches(*)')
            .eq('season_id', season.id)
            .order('sort_order', { ascending: true })
          if (roundError) throw roundError
          rounds = roundData || []
          const finishedIds = rounds.flatMap((round) => round.matches || []).filter(hasResult).map((match) => match.id)
          if (finishedIds.length) {
            const { data: predictionData, error: predictionError } = await supabase.from('predictions').select('*').in('match_id', finishedIds)
            if (predictionError) throw predictionError
            predictions = predictionData || []
          }
        }

        if (!active) return
        const rawLogs = logData || []
        const clearMarker = rawLogs.find((item) => item.action === 'activity_feed_cleared')
        const clearedAt = clearMarker ? new Date(clearMarker.created_at).getTime() : 0
        const visibleRawLogs = rawLogs.filter((item) => item.action !== 'activity_feed_cleared' && new Date(item.created_at).getTime() > clearedAt)
        const matchMap = new Map(rounds.flatMap((round) => (round.matches || []).map((match) => [match.id, match])))
        const roundByName = new Map(rounds.map((round) => [round.name, round]))
        const attachRound = (item) => {
          const match = item.entity_type === 'match' ? matchMap.get(item.entity_id) : null
          const byName = item.metadata?.round_name ? roundByName.get(item.metadata.round_name) : null
          const roundId = item.metadata?.round_id || (item.entity_type === 'round' ? item.entity_id : null) || match?.round_id || byName?.id || null
          const roundName = item.metadata?.round_name || match?.round?.name || byName?.name || null
          return { ...item, match, roundId, roundName }
        }

        const derivedEvents = deriveCompetitionEvents({ logs: visibleRawLogs, profiles: profiles || [], rounds, predictions })
          .filter((item) => new Date(item.created_at).getTime() > clearedAt)
          .map(attachRound)
        const feedLogs = visibleRawLogs.filter(isFeedActivity).map(attachRound)

        const optionMap = new Map(rounds.map((round) => [round.id, { id: round.id, name: round.name, sort_order: round.sort_order }]))
        ;[...feedLogs, ...derivedEvents].forEach((item) => {
          if (item.roundId && item.roundName && !optionMap.has(item.roundId)) {
            optionMap.set(item.roundId, { id: item.roundId, name: item.roundName, sort_order: -1 })
          }
        })
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

  const events = useMemo(() => {
    const merged = [...logs, ...derived]
      .filter(isFeedActivity)
      .map((item) => ({ ...item, category: item.category || activityCategory(item.action) }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const byType = filter === 'all' ? merged : merged.filter((item) => item.category === filter)
    return roundFilter === 'all' ? byType : byType.filter((item) => item.roundId === roundFilter || item.metadata?.round_id === roundFilter)
  }, [logs, derived, filter, roundFilter])

  const groups = useMemo(() => {
    const map = new Map()
    events.forEach((item) => {
      const key = dateKey(item.created_at)
      if (!map.has(key)) map.set(key, { key, value: item.created_at, items: [] })
      map.get(key).items.push(item)
    })
    return [...map.values()]
  }, [events])

  if (loading) return <Loading label="Carregando atividades..." />

  return (
    <div className="page-wrap activity-hub sports-surface">
      <header className="activity-page-header">
        <span className="sports-eyebrow">Competição</span>
        <h1>Atividades</h1>
        <p>Acompanhe os principais acontecimentos do bolão.</p>
      </header>

      <div className="activity-toolbar">
        <div className="activity-filter-row" role="tablist" aria-label="Filtrar atividades">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
              <EventGlyph action={value === 'predictions' ? 'prediction_created' : value === 'results' ? 'result_updated' : value === 'classification' ? 'leader_changed' : 'round_started'} />
              {label}
            </button>
          ))}
        </div>
        <label className="activity-round-filter">
          <span>Rodada</span>
          <select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
            <option value="all">Todas as rodadas</option>
            {roundOptions.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="form-error">{error}</div>}

      {!groups.length ? (
        <EmptyState title="Nada por aqui" text={filter === 'all' ? 'Os acontecimentos relevantes da competição aparecerão nesta timeline.' : 'Ainda não existem atividades desse tipo.'} />
      ) : (
        <div className="activity-timeline">
          {groups.map((group) => (
            <section className="activity-day" key={group.key}>
              <header className="activity-day-label">
                <strong>{dayLabel(group.value)}</strong>
                <span>{dayCaption(group.value)}</span>
              </header>
              <div className="activity-day-events">
                {group.items.map((item) => (
                  <div className="activity-timeline-row" key={item.id}>
                    <time className="activity-time-desktop">{timeLabel(item.created_at)}</time><time className="activity-time-mobile">{relativeTimeLabel(item.created_at)}</time>
                    <span className={`activity-timeline-node tone-${activityTone(item.action)}`}><EventGlyph action={item.action} /></span>
                    <ActivityCard item={item} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
