import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import TeamCrest from '../components/TeamCrest'
import UserAvatar from '../components/UserAvatar'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction, isLocked } from '../lib/utils'

const stageFilters = [
  { key: 'all', label: 'Todas' },
  { key: 'league', label: 'Fase de liga' },
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

function roundDates(round) {
  const matches = [...(round.matches || [])].filter((match) => match.kickoff_at).sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
  if (!matches.length) return 'Sem data'
  const first = new Date(matches[0].kickoff_at)
  const last = new Date(matches.at(-1).kickoff_at)
  const day = (date) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)
  const month = (date) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '').toUpperCase()
  if (first.toDateString() === last.toDateString()) return `${day(first)} ${month(first)}`
  if (first.getMonth() === last.getMonth()) return `${day(first)}–${day(last)} ${month(last)}`
  return `${day(first)} ${month(first)} – ${day(last)} ${month(last)}`
}

function matchDate(value) {
  if (!value) return { date: '—', time: '' }
  const d = new Date(value)
  return {
    date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d),
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d),
  }
}

function pointsFeedback(points) {
  if (points === 3) return { label: 'EXATO', className: 'exact' }
  if (points === 1) return { label: 'VENCEDOR', className: 'winner' }
  return { label: 'ERRO', className: 'miss' }
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

function movement(previous, current) {
  if (!current) return '—'
  if (!previous || previous === current) return `${current}º`
  return `${previous}º → ${current}º`
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
  const [roundOrder, setRoundOrder] = useState('asc')
  const [expanded, setExpanded] = useState(new Set())
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
          setExpanded(new Set())
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
    let previousPositions = new Map()

    rounds.forEach((round) => {
      const finishedMatches = round.matches.filter(hasResult)
      const perPlayer = profiles.map((profile) => {
        const entries = finishedMatches.map((match) => ({ match, prediction: predictionByUserMatch.get(`${profile.id}:${match.id}`) })).filter((entry) => entry.prediction)
        const scores = entries.map((entry) => calculatePoints(entry.prediction, entry.match))
        const points = scores.reduce((sum, value) => sum + value, 0)
        const exact = entries.filter((entry) => isExactPrediction(entry.prediction, entry.match)).length
        const winners = entries.filter((entry) => didPickWinner(entry.prediction, entry.match)).length
        const errors = scores.filter((value) => value === 0).length
        const submitted = round.matches.filter((match) => predictionByUserMatch.has(`${profile.id}:${match.id}`)).length
        return { ...profile, points, exact, winners, errors, submitted }
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
      const positions = buildPositions(standing)
      snapshots.set(round.id, {
        standing,
        positions,
        previousPositions: new Map(previousPositions),
      })
      previousPositions = positions
    })
    return { roundMetrics, snapshots }
  }, [profiles, rounds, predictionByUserMatch])

  const currentRound = useMemo(() => rounds.find((round) => round.matches.some((match) => !hasResult(match))) || null, [rounds])
  const filteredRounds = useMemo(() => rounds.filter((round) => filter === 'all' || stageKey(round.stage) === filter), [rounds, filter])
  const historyRounds = [...filteredRounds]
    .filter((round) => round.id !== currentRound?.id)
    .sort((a, b) => roundOrder === 'asc' ? a.sort_order - b.sort_order : b.sort_order - a.sort_order)
  const finalSnapshot = rounds.length ? computed.snapshots.get(rounds.at(-1).id) : null
  const ownCurrentPosition = finalSnapshot?.positions.get(user.id)
  const ownSeason = finalSnapshot?.standing.find((item) => item.id === user.id) || { points: 0, exact: 0, winners: 0 }
  const leader = finalSnapshot?.standing[0] || null
  const seasonTotalPoints = (finalSnapshot?.standing || []).reduce((sum, item) => sum + item.points, 0)
  const seasonAveragePoints = profiles.length ? seasonTotalPoints / profiles.length : 0

  function roundStats(round, profileId = user.id) {
    const list = computed.roundMetrics.get(round.id) || []
    const stats = list.find((item) => item.id === profileId) || { points: 0, exact: 0, winners: 0, errors: 0, submitted: 0 }
    const snapshot = computed.snapshots.get(round.id)
    return {
      ...stats,
      position: snapshot?.positions.get(profileId),
      previousPosition: snapshot?.previousPositions.get(profileId),
    }
  }

  function toggleRound(roundId) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(roundId)) next.delete(roundId)
      else next.add(roundId)
      return next
    })
  }

  if (loading) return <Loading label="Carregando temporadas..." />

  return (
    <div className="page-wrap rounds-hub sports-surface">
      <header className="rounds-page-header">
        <div>
          <span className="sports-eyebrow">{season?.name || 'Champions League'}</span>
          <h1>Rodadas</h1>
          <p><span className="rounds-copy-desktop">Acompanhe a evolução da temporada, seus resultados e seus palpites em cada rodada.</span><span className="rounds-copy-mobile">Acompanhe a evolução da temporada rodada a rodada.</span></p>
        </div>
        {seasons.length > 0 && (
          <label className="season-selector">
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
          <div className="rounds-toolbar">
            <div className="view-mode-toggle" role="tablist" aria-label="Modo de visualização">
              <button className={mode === 'individual' ? 'active' : ''} onClick={() => setMode('individual')}>Individual</button>
              <button className={mode === 'general' ? 'active' : ''} onClick={() => setMode('general')}>Geral</button>
            </div>
            <div className="rounds-toolbar-right">
              <div className="stage-filter-row" aria-label="Filtrar por fase">
                {stageFilters.map((item) => (
                  <button key={item.key} className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>{item.label}</button>
                ))}
              </div>
              <label className="round-order-control">
                <span>Ordem</span>
                <select value={roundOrder} onChange={(event) => setRoundOrder(event.target.value)} aria-label="Ordenar rodadas">
                  <option value="asc">1 → última</option>
                  <option value="desc">Última → 1</option>
                </select>
              </label>
            </div>
          </div>

          <section className={`rounds-overview-grid ${currentRound ? '' : 'single'}`.trim()}>
            {currentRound && (
              <div className="current-round-card">
                <div className="current-round-label">AGORA</div>
                <div className="current-round-main">
                  <div>
                    <span className="current-round-number">{String(currentRound.sort_order).padStart(2, '0')}</span>
                    <div><h2>{currentRound.name}</h2><p>{roundDates(currentRound)} · {currentRound.stage} · {currentRound.matches.length} {currentRound.matches.length === 1 ? 'jogo' : 'jogos'}</p></div>
                  </div>
                  {mode === 'individual' ? (() => {
                    const stats = roundStats(currentRound)
                    return <div className="current-round-numbers"><div><strong>{stats.submitted}/{currentRound.matches.length}</strong><span>palpites enviados</span></div><div className="positive"><strong>{stats.points}</strong><span>pts conquistados</span></div></div>
                  })() : (() => {
                    const submitted = (presenceByRound.get(currentRound.id) || []).filter((item) => item.has_predicted).length
                    return <div className="current-round-numbers"><div><strong>{profiles.length}</strong><span>participantes</span></div><div><strong>{submitted}</strong><span>palpites enviados</span></div></div>
                  })()}
                </div>
                <div className="current-round-progress"><i style={{ width: `${Math.min(100, mode === 'individual' ? (roundStats(currentRound).submitted / Math.max(1, currentRound.matches.length)) * 100 : ((presenceByRound.get(currentRound.id) || []).filter((item) => item.has_predicted).length / Math.max(1, currentRound.matches.length * profiles.length)) * 100)}%` }} /></div>
                <Link className="current-round-open-link" to={`/rodadas/${currentRound.id}`}>Abrir rodada e ver palpites →</Link>
              </div>
            )}

            <div className="season-performance-panel">
              <span className="performance-title">{mode === 'individual' ? 'Seu desempenho na temporada' : 'Panorama da temporada'}</span>
              {mode === 'individual' ? (
                <div className="performance-metrics">
                  <div><span>Total de pontos</span><strong>{ownSeason.points}<small> pts</small></strong></div>
                  <div><span>Placares exatos</span><strong>{ownSeason.exact}</strong></div>
                  <div><span>Vencedores</span><strong>{ownSeason.winners}</strong></div>
                  <div><span>Posição atual</span><strong className="gold">{placement(ownCurrentPosition)}</strong></div>
                </div>
              ) : (
                <div className="performance-metrics general-season-metrics">
                  <div><span>Pontos distribuídos</span><strong>{seasonTotalPoints}<small> pts</small></strong></div>
                  <div><span>Participantes</span><strong>{profiles.length}</strong></div>
                  <div><span>Média por participante</span><strong>{seasonAveragePoints.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}<small> pts</small></strong></div>
                  <div><span>Maior pontuação</span><strong className="metric-name">{leader?.display_name || '—'}</strong><small>{leader ? `${leader.points} pts` : ''}</small></div>
                </div>
              )}
            </div>
          </section>

          {profiles.length === 0 && mode === 'general' ? (
            <EmptyState title="Nenhum participante" text="Crie usuários no Supabase para que o desempenho geral possa ser exibido." />
          ) : (
            <section className="round-timeline">
              {!historyRounds.length ? (
                <div className="rounds-filter-empty">Nenhuma rodada encontrada para este filtro.</div>
              ) : historyRounds.map((round) => {
                const stats = roundStats(round)
                const isExpanded = expanded.has(round.id)
                const roundPlayers = computed.roundMetrics.get(round.id) || []
                const finished = round.matches.filter(hasResult).length
                const status = round.matches.length && round.matches.every(hasResult) ? 'Concluída' : round.matches.some((match) => !isLocked(match)) ? 'Aberta' : 'Aguardando resultado'
                return (
                  <article className={`timeline-round ${isExpanded ? 'expanded' : ''}`} key={round.id}>
                    <div className="round-history-card">
                      <div className="round-history-summary">
                        <div className="round-history-identity">
                          <div><strong>Rodada {String(round.sort_order).padStart(2, '0')} · {roundDates(round)}</strong><span>{round.stage} · {round.matches.length} jogos · {status}</span></div>
                        </div>

                        {mode === 'individual' ? (
                          <div className="round-history-metrics">
                            <div className="points"><strong>{stats.points}<small> pts</small></strong><span>conquistados</span></div>
                            <div><strong>{stats.exact}</strong><span>{stats.exact === 1 ? 'placar exato' : 'placares exatos'}</span></div>
                            <div><strong>{stats.winners}</strong><span>{stats.winners === 1 ? 'vencedor' : 'vencedores'}</span></div>
                            <div><strong>{stats.errors}</strong><span>{stats.errors === 1 ? 'erro' : 'erros'}</span></div>
                            <div className="movement"><strong>{movement(stats.previousPosition, stats.position)}</strong><span>na classificação</span></div>
                          </div>
                        ) : (
                          <div className="round-general-preview aggregate">
                            {(() => {
                              const participants = roundPlayers.filter((player) => player.submitted > 0).length
                              const total = roundPlayers.reduce((sum, player) => sum + player.points, 0)
                              const average = participants ? total / participants : 0
                              const top = roundPlayers[0]
                              return <>
                                <span><b>{total}</b> pts no total</span>
                                <span><b>{participants}</b> participantes</span>
                                <span><b>{average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</b> pts de média</span>
                                <span><b>{top?.points || 0}</b> maior pontuação</span>
                              </>
                            })()}
                          </div>
                        )}

                        <div className="round-history-actions">
                          <Link className="round-open-link" to={`/rodadas/${round.id}`} title="Ver jogos e palpites da rodada">Abrir rodada</Link>
                          <button className="round-expand-button" onClick={() => toggleRound(round.id)}>{isExpanded ? 'Ver menos' : 'Resumo'} <span>{isExpanded ? '⌃' : '⌄'}</span></button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="round-inline-details">
                          {mode === 'individual' ? (
                            <div className="individual-round-table">
                              <div className="round-table-head"><span>Data</span><span>Jogo</span><span>Placar final</span><span>Seu palpite</span><span>Resultado</span><span>Pontos</span></div>
                              {round.matches.map((match) => {
                                const prediction = predictionByUserMatch.get(`${user.id}:${match.id}`)
                                const points = calculatePoints(prediction, match)
                                const feedback = pointsFeedback(points)
                                const date = matchDate(match.kickoff_at)
                                return (
                                  <div className="round-table-row" key={match.id}>
                                    <div className="round-match-date"><strong>{date.date}</strong><span>{date.time}</span></div>
                                    <div className="round-match-teams"><span><TeamCrest team={match.home_team} size="small" />{match.home_team}</span><i>×</i><span><TeamCrest team={match.away_team} size="small" />{match.away_team}</span></div>
                                    <strong className="round-final-score">{hasResult(match) ? `${match.home_score} × ${match.away_score}` : '—'}</strong>
                                    <strong className="round-own-score">{prediction ? `${prediction.home_score} × ${prediction.away_score}` : '—'}</strong>
                                    <span className={`round-result-pill ${hasResult(match) && prediction ? feedback.className : 'neutral'}`}>{hasResult(match) ? (prediction ? feedback.label : 'SEM PALPITE') : 'PENDENTE'}</span>
                                    <strong className={points > 0 ? 'round-points-positive' : ''}>{hasResult(match) && prediction ? `${points > 0 ? '+' : ''}${points} pts` : '—'}</strong>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="general-round-table">
                              <div className="general-table-head"><span>Participante</span><span>Pontos</span><span>Exatos</span><span>Vencedores</span><span>Posição</span></div>
                              {roundPlayers.map((player, index) => {
                                const snapshot = computed.snapshots.get(round.id)
                                const currentPosition = snapshot?.positions.get(player.id)
                                const previousPosition = snapshot?.previousPositions.get(player.id)
                                return (
                                  <div className={`general-table-row ${player.id === user.id ? 'mine' : ''}`} key={player.id}>
                                    <div className="general-player"><span className="general-rank">{index + 1}</span><UserAvatar profile={player} size="tiny" /><strong>{player.display_name}</strong>{player.id === user.id && <small>você</small>}</div>
                                    <strong className={player.points > 0 ? 'round-points-positive' : ''}>{player.points} pts</strong>
                                    <span>{player.exact}</span>
                                    <span>{player.winners}</span>
                                    <span>{movement(previousPosition, currentPosition)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </section>
          )}
        </>
      )}
    </div>
  )
}
