import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import Loading from '../components/Loading'
import NavIcon from '../components/NavIcon'
import RoundExplorerMatch from '../components/RoundExplorerMatch'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction } from '../lib/utils'
import '../styles/round-explorer.css'

const stageFilters = [
  { key: 'all', label: 'Todas as fases' },
  { key: 'league', label: 'Fase de liga / grupos' },
  { key: 'r16', label: 'Oitavas' },
  { key: 'quarters', label: 'Quartas' },
  { key: 'semis', label: 'Semifinal' },
  { key: 'final', label: 'Final' },
]

function stageKey(stage = '') {
  const value = String(stage).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (value.includes('semi')) return 'semis'
  if (value.includes('oitav') || value.includes('round of 16')) return 'r16'
  if (value.includes('quart')) return 'quarters'
  if (value.includes('final')) return 'final'
  return 'league'
}

function seasonLabel(season) {
  if (!season) return 'Champions League'
  return season.name || 'Champions League'
}

function roundDates(round) {
  const matches = [...(round?.matches || [])]
    .filter((match) => match.kickoff_at)
    .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
  if (!matches.length) return 'Sem data'

  const first = new Date(matches[0].kickoff_at)
  const last = new Date(matches.at(-1).kickoff_at)
  const day = (date) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)
  const month = (date) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '').toLowerCase()

  if (getMatchDayKey(first) === getMatchDayKey(last)) return `${day(first)} ${month(first)}`
  if (getMatchDayKey(first).slice(0, 7) === getMatchDayKey(last).slice(0, 7)) return `${day(first)}–${day(last)} ${month(last)}`
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

function sortStats(a, b) {
  return b.points - a.points || b.exact - a.exact || b.winners - a.winners || a.display_name.localeCompare(b.display_name)
}

function sameStanding(a, b) {
  return Boolean(a && b && a.points === b.points && a.exact === b.exact && a.winners === b.winners)
}

function buildPositions(standing) {
  const positions = new Map()
  let rank = 0
  standing.forEach((item, index) => {
    if (index === 0 || !sameStanding(item, standing[index - 1])) rank = index + 1
    positions.set(item.id, rank)
  })
  return positions
}

function placement(value) {
  return value ? `${value}º` : '—'
}

function getRoundStatus(round, currentRound) {
  if (round.closed_at) return { label: 'Concluída', className: 'closed' }
  if (currentRound?.id === round.id) return { label: 'Em andamento', className: 'current' }
  return { label: 'Em breve', className: 'upcoming' }
}

function getMatchDayKey(value) {
  if (!value) return 'undated'
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo',
  }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function formatMatchDay(value) {
  if (!value) return 'DATA NÃO INFORMADA'
  const date = new Date(value)
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })
    .format(date).replace(/-feira$/i, '').toLocaleUpperCase('pt-BR')
  const dayMonth = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo',
  }).format(date).replace('.', '').toLocaleUpperCase('pt-BR')
  return `${weekday} · ${dayMonth}`
}

function groupMatchesByDay(matches) {
  const groups = new Map()
  const orderedMatches = [...matches].sort((a, b) => {
    if (!a.kickoff_at) return b.kickoff_at ? 1 : 0
    if (!b.kickoff_at) return -1
    return new Date(a.kickoff_at) - new Date(b.kickoff_at)
  })
  orderedMatches.forEach((match) => {
    const key = getMatchDayKey(match.kickoff_at)
    if (!groups.has(key)) groups.set(key, { label: formatMatchDay(match.kickoff_at), matches: [] })
    groups.get(key).matches.push(match)
  })
  return [...groups.values()]
}

export default function RoundsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [seasonLoading, setSeasonLoading] = useState(false)
  const [seasons, setSeasons] = useState([])
  const [seasonId, setSeasonId] = useState('')
  const [rounds, setRounds] = useState([])
  const [profiles, setProfiles] = useState([])
  const [predictions, setPredictions] = useState([])
  const [presence, setPresence] = useState([])
  const [mode, setMode] = useState('individual')
  const [filter, setFilter] = useState('all')
  const [roundOrder, setRoundOrder] = useState('desc')
  const [expandedRoundId, setExpandedRoundId] = useState('')
  const [expandedMatchId, setExpandedMatchId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function bootstrap() {
      setLoading(true)
      setError('')
      try {
        const [{ data: seasonData, error: seasonsError }, { data: profileData, error: profilesError }] = await Promise.all([
          supabase.from('seasons').select('*').order('created_at', { ascending: false }),
          supabase.from('profiles').select('*').order('display_name'),
        ])
        if (seasonsError) throw seasonsError
        if (profilesError) throw profilesError
        const list = seasonData || []
        setSeasons(list)
        setProfiles(profileData || [])
        const initial = list.find((item) => item.is_active) || list[0]
        setSeasonLoading(Boolean(initial?.id))
        setSeasonId(initial?.id || '')
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    bootstrap()
  }, [])

  useEffect(() => {
    if (!seasonId) {
      setRounds([])
      setPredictions([])
      setPresence([])
      return
    }

    let cancelled = false
    async function loadSeason() {
      setSeasonLoading(true)
      setError('')
      try {
        const { data: roundData, error: roundsError } = await supabase
          .from('rounds')
          .select('*, matches(*)')
          .eq('season_id', seasonId)
          .order('sort_order')
        if (roundsError) throw roundsError

        const loaded = (roundData || []).map((round) => ({
          ...round,
          matches: [...(round.matches || [])].sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at)),
        }))

        const ids = loaded.flatMap((round) => round.matches.map((match) => match.id))
        let predictionData = []
        let presenceData = []
        if (ids.length) {
          const [predictionResult, presenceResult] = await Promise.all([
            supabase.from('predictions').select('*, profiles(id, display_name, avatar_path, role)').in('match_id', ids),
            supabase.rpc('get_prediction_presence', { p_match_ids: ids }),
          ])
          if (predictionResult.error) throw predictionResult.error
          if (presenceResult.error) throw presenceResult.error
          predictionData = predictionResult.data || []
          presenceData = presenceResult.data || []
        }

        if (!cancelled) {
          setRounds(loaded)
          setPredictions(predictionData)
          setPresence(presenceData)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setSeasonLoading(false)
      }
    }

    loadSeason()
    return () => { cancelled = true }
  }, [seasonId])

  const season = seasons.find((item) => item.id === seasonId) || null
  const predictionByUserMatch = useMemo(() => new Map(predictions.map((item) => [`${item.user_id}:${item.match_id}`, item])), [predictions])

  const presenceByRound = useMemo(() => {
    const map = new Map()
    rounds.forEach((round) => {
      const ids = new Set(round.matches.map((match) => match.id))
      map.set(round.id, presence.filter((item) => ids.has(item.match_id)))
    })
    return map
  }, [presence, rounds])

  const predictionsByMatch = useMemo(() => {
    const map = new Map()
    predictions.forEach((item) => {
      const list = map.get(item.match_id) || []
      list.push(item)
      map.set(item.match_id, list)
    })
    return map
  }, [predictions])

  const presenceByMatch = useMemo(() => {
    const map = new Map()
    presence.forEach((item) => {
      const list = map.get(item.match_id) || []
      list.push(item)
      map.set(item.match_id, list)
    })
    return map
  }, [presence])

  const computed = useMemo(() => {
    const roundMetrics = new Map()
    const snapshots = new Map()
    const cumulative = new Map(profiles.map((profile) => [profile.id, { ...profile, points: 0, exact: 0, winners: 0 }]))

    rounds.forEach((round) => {
      const finishedMatches = round.matches.filter(hasResult)
      const perPlayer = profiles.map((profile) => {
        const entries = finishedMatches
          .map((match) => ({ match, prediction: predictionByUserMatch.get(`${profile.id}:${match.id}`) }))
          .filter((entry) => entry.prediction)
        const scores = entries.map((entry) => calculatePoints(entry.prediction, entry.match))
        const points = scores.reduce((sum, value) => sum + value, 0)
        const exact = entries.filter((entry) => isExactPrediction(entry.prediction, entry.match)).length
        const winners = entries.filter((entry) => didPickWinner(entry.prediction, entry.match)).length
        const submitted = round.matches.filter((match) => predictionByUserMatch.has(`${profile.id}:${match.id}`)).length
        return { ...profile, points, exact, winners, submitted }
      }).sort(sortStats)

      roundMetrics.set(round.id, perPlayer)
      perPlayer.forEach((stats) => {
        const current = cumulative.get(stats.id)
        if (!current) return
        current.points += stats.points
        current.exact += stats.exact
        current.winners += stats.winners
      })
      const standing = [...cumulative.values()].sort(sortStats)
      snapshots.set(round.id, { standing, positions: buildPositions(standing) })
    })

    return { roundMetrics, snapshots }
  }, [profiles, rounds, predictionByUserMatch])

  // A Administração usa closed_at como estado operacional da rodada.
  // A tela de Rodadas segue a mesma fonte de verdade: a primeira rodada não encerrada é a atual.
  const currentRound = useMemo(() => rounds.find((round) => !round.closed_at) || null, [rounds])

  const filteredRounds = useMemo(() => {
    const list = rounds.filter((round) => filter === 'all' || stageKey(round.stage) === filter)
    return [...list].sort((a, b) => roundOrder === 'asc' ? a.sort_order - b.sort_order : b.sort_order - a.sort_order)
  }, [rounds, filter, roundOrder])

  useEffect(() => {
    if (expandedRoundId && !filteredRounds.some((round) => round.id === expandedRoundId)) {
      setExpandedRoundId('')
      setExpandedMatchId('')
    }
  }, [expandedRoundId, filteredRounds])

  const latestSnapshot = useMemo(() => {
    const lastRelevant = [...rounds].reverse().find((round) => round.closed_at || round.id === currentRound?.id) || rounds.at(-1)
    return lastRelevant ? computed.snapshots.get(lastRelevant.id) : null
  }, [rounds, currentRound?.id, computed.snapshots])

  const ownCurrentPosition = latestSnapshot?.positions.get(user.id)
  const ownSeason = latestSnapshot?.standing.find((item) => item.id === user.id) || { points: 0, exact: 0, winners: 0 }
  const leader = latestSnapshot?.standing[0] || null
  const seasonTotalPoints = (latestSnapshot?.standing || []).reduce((sum, item) => sum + item.points, 0)
  const seasonAveragePoints = profiles.length ? seasonTotalPoints / profiles.length : 0

  function roundStats(round, profileId = user.id) {
    const list = computed.roundMetrics.get(round.id) || []
    const stats = list.find((item) => item.id === profileId) || { points: 0, exact: 0, winners: 0, submitted: 0 }
    const snapshot = computed.snapshots.get(round.id)
    return { ...stats, position: snapshot?.positions.get(profileId) }
  }

  function generalRoundStats(round) {
    const players = computed.roundMetrics.get(round.id) || []
    const roundPresence = presenceByRound.get(round.id) || []
    const participants = players.filter((player) => player.submitted > 0).length
    const submitted = roundPresence.filter((item) => item.has_predicted).length
    const points = players.reduce((sum, player) => sum + player.points, 0)
    return { participants, submitted, points }
  }

  function handleSeasonChange(nextSeasonId) {
    setSeasonLoading(true)
    setRounds([])
    setPredictions([])
    setPresence([])
    setExpandedRoundId('')
    setExpandedMatchId('')
    setSeasonId(nextSeasonId)
  }

  async function savePrediction(matchId, homeScore, awayScore) {
    const payload = {
      match_id: matchId,
      user_id: user.id,
      home_score: Number(homeScore),
      away_score: Number(awayScore),
    }
    const { error: saveError } = await supabase.from('predictions').upsert(payload, { onConflict: 'match_id,user_id' })
    if (saveError) throw saveError

    const ownProfile = profiles.find((profile) => profile.id === user.id)
    setPredictions((current) => [
      ...current.filter((item) => !(item.match_id === matchId && item.user_id === user.id)),
      { ...current.find((item) => item.match_id === matchId && item.user_id === user.id), ...payload, profiles: ownProfile },
    ])
    setPresence((current) => current.map((item) => item.match_id === matchId && item.user_id === user.id
      ? { ...item, has_predicted: true }
      : item))
  }

  if (loading) return <Loading label="Carregando temporadas..." />

  return (
    <div className="page-wrap season-rounds-page round-explorer-page">
      <header className="round-explorer-header">
        <div className="round-explorer-heading">
          <span>{seasonLabel(season)}</span>
          <h1>Rodadas</h1>
        </div>
        {seasons.length > 0 && (
          <label className="round-explorer-season-select">
            <span>Temporada</span>
            <select value={seasonId} onChange={(event) => handleSeasonChange(event.target.value)}>
              {seasons.map((item) => <option value={item.id} key={item.id}>{item.name}{item.is_active ? ' · atual' : ''}</option>)}
            </select>
          </label>
        )}
      </header>

      {error && <div className="form-error">{error}</div>}

      {!seasons.length ? (
        <EmptyState title="Nenhuma temporada" text="Crie uma temporada na administração para começar a registrar as rodadas." />
      ) : seasonLoading ? (
        <Loading label="Carregando histórico da temporada..." />
      ) : !rounds.length ? (
        <EmptyState title="Nenhuma rodada cadastrada" text="Assim que o administrador criar as rodadas, elas aparecem aqui." />
      ) : (
        <>
          <div className="round-explorer-controls">
            <div className="round-explorer-mode" role="group" aria-label="Modo de visualização">
              <button type="button" aria-pressed={mode === 'individual'} className={mode === 'individual' ? 'active' : ''} onClick={() => setMode('individual')}>
                <NavIcon name="predictions" size={18} /> Individual
              </button>
              <button type="button" aria-pressed={mode === 'general'} className={mode === 'general' ? 'active' : ''} onClick={() => setMode('general')}>
                <NavIcon name="leaderboard" size={18} /> Geral
              </button>
            </div>
            <div className="round-explorer-filters">
              <label>
                <span>Fase</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar por fase">
                  {stageFilters.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
                </select>
              </label>
              <label>
                <span>Ordem</span>
                <select value={roundOrder} onChange={(event) => setRoundOrder(event.target.value)} aria-label="Ordenar rodadas">
                  <option value="desc">Mais recentes</option>
                  <option value="asc">Mais antigas</option>
                </select>
              </label>
            </div>
          </div>

          <section className="round-explorer-summary" aria-label={mode === 'individual' ? 'Resumo pessoal da temporada' : 'Resumo geral da temporada'}>
            <div className="round-explorer-summary-title">
              <NavIcon name={mode === 'individual' ? 'predictions' : 'leaderboard'} size={18} />
              <span>{mode === 'individual' ? 'Sua campanha' : 'Panorama da temporada'}</span>
            </div>
            {mode === 'individual' ? (
              <div className="round-explorer-summary-metrics">
                <div><strong>{ownSeason.points}</strong><span>pontos</span></div>
                <div><strong>{ownSeason.exact}</strong><span>placares exatos</span></div>
                <div><strong>{ownSeason.winners}</strong><span>desfechos certos</span></div>
                <div><strong>{placement(ownCurrentPosition)}</strong><span>posição</span></div>
              </div>
            ) : (
              <div className="round-explorer-summary-metrics">
                <div><strong>{seasonTotalPoints}</strong><span>pontos distribuídos</span></div>
                <div><strong>{profiles.length}</strong><span>participantes</span></div>
                <div><strong>{seasonAveragePoints.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong><span>média por participante</span></div>
                <div><strong className="leader-name">{leader?.display_name || '—'}</strong><span>{leader ? `${leader.points} pts · líder` : 'líder'}</span></div>
              </div>
            )}
          </section>

          <section className="round-explorer-history" aria-labelledby="round-explorer-history-title">
            <div className="round-explorer-history-heading">
              <div>
                <span>HISTÓRICO DA COMPETIÇÃO</span>
                <h2 id="round-explorer-history-title">{seasonLabel(season)}</h2>
              </div>
              <span>{filteredRounds.length} {filteredRounds.length === 1 ? 'rodada' : 'rodadas'}</span>
            </div>

            {filteredRounds.length ? (
              <div className="round-explorer-list">
                {filteredRounds.map((round) => {
                  const stats = roundStats(round)
                  const general = generalRoundStats(round)
                  const status = getRoundStatus(round, currentRound)
                  const expanded = expandedRoundId === round.id
                  const roundPanelId = `round-explorer-panel-${round.id}`
                  const groupedMatches = groupMatchesByDay(round.matches)
                  const pointsVisible = Boolean(round.closed_at || round.id === currentRound?.id)
                  return (
                    <article className={`round-explorer-round ${status.className}${expanded ? ' is-expanded' : ''}`} key={round.id}>
                      <button
                        type="button"
                        className="round-explorer-round-toggle"
                        aria-expanded={expanded}
                        aria-controls={roundPanelId}
                        onClick={() => {
                          const nextRoundId = expanded ? '' : round.id
                          setExpandedRoundId(nextRoundId)
                          setExpandedMatchId('')
                        }}
                      >
                        <span className="round-explorer-round-number">{String(round.sort_order).padStart(2, '0')}</span>
                        <span className="round-explorer-round-copy">
                          <strong>{roundDisplayName(round)}</strong>
                          <small>{roundDates(round)} <i>·</i> {round.matches.length} {round.matches.length === 1 ? 'partida' : 'partidas'}</small>
                        </span>
                        <span className="round-explorer-round-metrics">
                          {mode === 'individual' ? (
                            <>
                              <span><strong>{stats.submitted}/{round.matches.length}</strong><small>palpites</small></span>
                              <span><strong>{pointsVisible ? stats.points : '—'}</strong><small>pontos</small></span>
                              <span className="round-explorer-round-exact"><strong>{pointsVisible ? stats.exact : '—'}</strong><small>exatos</small></span>
                            </>
                          ) : (
                            <>
                              <span><strong>{general.participants}/{profiles.length}</strong><small>participantes</small></span>
                              <span><strong>{general.submitted}</strong><small>palpites</small></span>
                              <span className="round-explorer-round-exact"><strong>{pointsVisible ? general.points : '—'}</strong><small>pontos</small></span>
                            </>
                          )}
                        </span>
                        <span className={`round-explorer-round-status ${status.className}`}>{status.label}</span>
                        <span className={`round-explorer-round-chevron${expanded ? ' open' : ''}`} aria-hidden="true">⌄</span>
                      </button>

                      <div id={roundPanelId} className={`round-explorer-round-panel${expanded ? ' is-open' : ''}`} aria-hidden={!expanded} inert={!expanded}>
                        <div className="round-explorer-round-panel-inner">
                          {round.matches.length ? groupedMatches.map((group) => (
                            <section className="round-explorer-day" key={`${round.id}-${group.label}`} aria-label={group.label}>
                              <h3>{group.label}</h3>
                              <div className="round-explorer-match-list">
                                {group.matches.map((match) => (
                                  <RoundExplorerMatch
                                    key={match.id}
                                    match={match}
                                    mode={mode}
                                    ownPrediction={predictionByUserMatch.get(`${user.id}:${match.id}`)}
                                    predictions={predictionsByMatch.get(match.id) || []}
                                    presence={presenceByMatch.get(match.id) || []}
                                    profiles={profiles}
                                    currentUserId={user.id}
                                    expanded={expandedMatchId === match.id}
                                    onToggle={() => setExpandedMatchId((current) => current === match.id ? '' : match.id)}
                                    onSave={savePrediction}
                                  />
                                ))}
                              </div>
                            </section>
                          )) : <p className="round-explorer-empty">Esta rodada ainda não tem partidas cadastradas.</p>}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <EmptyState title="Nenhuma rodada nesta fase" text="Altere o filtro de fase para consultar outras rodadas da temporada." />
            )}
          </section>
        </>
      )}
    </div>
  )
}
