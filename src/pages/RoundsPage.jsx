import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import Loading from '../components/Loading'
import NavIcon from '../components/NavIcon'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction } from '../lib/utils'

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

  if (first.toDateString() === last.toDateString()) return `${day(first)} ${month(first)}`
  if (first.getMonth() === last.getMonth()) return `${day(first)}–${day(last)} ${month(last)}`
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

function roundSecondaryName(round) {
  const full = roundDisplayName(round)
  const stage = String(round?.stage || '').trim()
  if (stage && full.toLowerCase().startsWith(stage.toLowerCase())) return full.slice(stage.length).replace(/^[\s·\-–—:]+/, '').trim()
  return full
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
            supabase.from('predictions').select('*').in('match_id', ids),
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

  if (loading) return <Loading label="Carregando temporadas..." />

  const currentStats = currentRound ? roundStats(currentRound) : null
  const currentGeneral = currentRound ? generalRoundStats(currentRound) : null
  const currentProgress = currentRound
    ? Math.min(100, mode === 'individual'
      ? (currentStats.submitted / Math.max(1, currentRound.matches.length)) * 100
      : (currentGeneral.submitted / Math.max(1, currentRound.matches.length * profiles.length)) * 100)
    : 0

  return (
    <div className="page-wrap season-rounds-page">
      <header className="season-rounds-hero">
        <div className="season-rounds-hero-art" aria-hidden="true" />
        <div className="season-rounds-heading">
          <span>{seasonLabel(season)}</span>
          <h1>Rodadas</h1>
          <p>Acompanhe sua campanha rodada a rodada.</p>
        </div>

        {seasons.length > 0 && (
          <label className="season-rounds-season-select">
            <span>Temporada</span>
            <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>
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
          <div className="season-rounds-toolbar">
            <div className="season-rounds-mode" role="tablist" aria-label="Modo de visualização">
              <button className={mode === 'individual' ? 'active' : ''} onClick={() => setMode('individual')}>
                <NavIcon name="predictions" size={19} /> Individual
              </button>
              <button className={mode === 'general' ? 'active' : ''} onClick={() => setMode('general')}>
                <NavIcon name="leaderboard" size={19} /> Geral
              </button>
            </div>

            <div className="season-rounds-filters">
              <label>
                <NavIcon name="rounds" size={18} />
                <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar por fase">
                  {stageFilters.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
                </select>
              </label>
              <label>
                <span className="season-rounds-sort-icon">⇅</span>
                <select value={roundOrder} onChange={(event) => setRoundOrder(event.target.value)} aria-label="Ordenar rodadas">
                  <option value="desc">Mais recentes</option>
                  <option value="asc">Mais antigas</option>
                </select>
              </label>
            </div>
          </div>

          <section className={`season-rounds-overview ${currentRound ? '' : 'single'}`.trim()}>
            {currentRound && (
              <article className="season-current-round-card">
                <div className="season-current-round-art" aria-hidden="true" />
                <span className="season-current-badge">● Agora</span>
                <div className="season-current-title">
                  <strong>{String(currentRound.sort_order).padStart(2, '0')}</strong>
                  <div>
                    <h2>{roundDisplayName(currentRound)}</h2>
                    <p>{roundDates(currentRound)} · {currentRound.matches.length} {currentRound.matches.length === 1 ? 'jogo' : 'jogos'} <span>● Em andamento</span></p>
                  </div>
                </div>

                {mode === 'individual' ? (
                  <div className="season-current-metrics">
                    <div><strong>{currentStats.submitted}/{currentRound.matches.length}</strong><span>palpites enviados</span></div>
                    <div className="positive"><strong>{currentStats.points}</strong><span>pontos conquistados</span></div>
                    <div><strong>{currentStats.exact}</strong><span>placares exatos</span></div>
                  </div>
                ) : (
                  <div className="season-current-metrics">
                    <div><strong>{currentGeneral.participants}</strong><span>participantes</span></div>
                    <div><strong>{currentGeneral.submitted}</strong><span>palpites enviados</span></div>
                    <div className="positive"><strong>{currentGeneral.points}</strong><span>pontos distribuídos</span></div>
                  </div>
                )}

                <div className="season-current-progress-row">
                  <div className="season-current-progress"><i style={{ width: `${currentProgress}%` }} /></div>
                  <b>{Math.round(currentProgress)}%</b>
                  <Link to={`/rodadas/${currentRound.id}`}>Ver rodada completa <span>→</span></Link>
                </div>
              </article>
            )}

            <article className="season-performance-card">
              <div className="season-performance-head">
                <div><NavIcon name="leaderboard" size={24} /><h2>{mode === 'individual' ? 'Sua temporada' : 'Panorama da temporada'}</h2></div>
                <Link to="/classificacao">Ver classificação geral <span>→</span></Link>
              </div>

              {mode === 'individual' ? (
                <div className="season-performance-metrics">
                  <div><NavIcon name="podium" size={22} /><strong>{ownSeason.points}</strong><span>Total de pontos</span></div>
                  <div><span className="metric-symbol">◎</span><strong>{ownSeason.exact}</strong><span>Placares exatos</span></div>
                  <div><NavIcon name="leaderboard" size={22} /><strong>{ownSeason.winners}</strong><span>Vencedores</span></div>
                  <div><span className="metric-symbol">▥</span><strong className="gold">{placement(ownCurrentPosition)}</strong><span>Posição atual</span></div>
                </div>
              ) : (
                <div className="season-performance-metrics">
                  <div><span className="metric-symbol">▥</span><strong>{seasonTotalPoints}</strong><span>Pontos distribuídos</span></div>
                  <div><NavIcon name="leaderboard" size={22} /><strong>{profiles.length}</strong><span>Participantes</span></div>
                  <div><span className="metric-symbol">≈</span><strong>{seasonAveragePoints.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong><span>Média por participante</span></div>
                  <div><NavIcon name="podium" size={22} /><strong className="metric-name">{leader?.display_name || '—'}</strong><span>{leader ? `${leader.points} pts` : 'Maior pontuação'}</span></div>
                </div>
              )}
            </article>
          </section>

          <section className="season-round-history">
            <div className="season-round-history-head">
              <div><NavIcon name="activity" size={24} /><div><h2>Histórico da temporada</h2><p>Todas as rodadas da {seasonLabel(season)}.</p></div></div>
            </div>

            {filteredRounds.length > 0 && (
              <div className="season-round-list">
                {filteredRounds.map((round) => {
                  const stats = roundStats(round)
                  const general = generalRoundStats(round)
                  const status = getRoundStatus(round, currentRound)
                  return (
                    <article className={`season-round-row ${status.className}`} key={round.id}>
                      <span className="season-round-index">{String(round.sort_order).padStart(2, '0')}</span>
                      <div className="season-round-name"><strong>{round.stage || round.name}</strong><span>{roundSecondaryName(round)}</span></div>
                      <div className="season-round-date"><NavIcon name="rounds" size={18} /><span>{roundDates(round)}<small>{round.matches.length} {round.matches.length === 1 ? 'jogo' : 'jogos'}</small></span></div>
                      {mode === 'individual' ? (
                        <>
                          <div className="season-round-stat submitted"><strong>{stats.submitted ? `${stats.submitted}/${round.matches.length}` : '-/-'}</strong><span>palpites</span></div>
                          <div className="season-round-stat points positive"><strong>{round.closed_at || round.id === currentRound?.id ? stats.points : '-'}</strong><span>pontos</span></div>
                          <div className="season-round-stat extra"><strong>{round.closed_at || round.id === currentRound?.id ? stats.exact : '-'}</strong><span>exatos</span></div>
                        </>
                      ) : (
                        <>
                          <div className="season-round-stat submitted"><strong>{general.participants || '-'}</strong><span>participantes</span></div>
                          <div className="season-round-stat points"><strong>{general.submitted || '-'}</strong><span>palpites</span></div>
                          <div className="season-round-stat extra positive"><strong>{round.closed_at || round.id === currentRound?.id ? general.points : '-'}</strong><span>pontos</span></div>
                        </>
                      )}
                      <span className={`season-round-status ${status.className}`}>{status.label}</span>
                      <Link className="season-round-link" to={`/rodadas/${round.id}`}>{round.id === currentRound?.id ? 'Ver rodada completa' : 'Ver detalhes'} <span>→</span></Link>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
