import { useEffect, useMemo, useState } from 'react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import TeamCrest from '../components/TeamCrest'
import ScorePicker from '../components/ScorePicker'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction, isLocked, timeUntilStart } from '../lib/utils'

function shortDate(value) {
  if (!value) return { day: '—', time: '' }
  const date = new Date(value)
  return {
    day: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '').toUpperCase(),
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date),
  }
}

function feedbackFor(points) {
  if (points === 3) return { label: 'PLACAR EXATO', className: 'exact' }
  if (points === 1) return { label: 'VENCEDOR', className: 'winner' }
  return { label: 'NÃO PONTUOU', className: 'miss' }
}

function roundOrder(prediction) {
  return prediction.matches?.rounds?.sort_order ?? -1
}

function OpenPredictionCard({ prediction, onSaved }) {
  const match = prediction.matches
  const locked = isLocked(match)
  const date = shortDate(match?.kickoff_at)
  const [editing, setEditing] = useState(false)
  const [homeScore, setHomeScore] = useState(String(prediction.home_score))
  const [awayScore, setAwayScore] = useState(String(prediction.away_score))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setHomeScore(String(prediction.home_score))
    setAwayScore(String(prediction.away_score))
    setEditing(false)
    setMessage('')
  }, [prediction.id, prediction.home_score, prediction.away_score])

  async function save() {
    if (locked || saving) return
    if (homeScore === '' || awayScore === '') {
      setMessage('Informe os dois placares.')
      return
    }
    const home = Number(homeScore)
    const away = Number(awayScore)
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 99 || away > 99) {
      setMessage('Use gols entre 0 e 99.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase
        .from('predictions')
        .update({ home_score: home, away_score: away })
        .eq('id', prediction.id)
      if (error) throw error
      await onSaved()
      setEditing(false)
    } catch (error) {
      setMessage(error.message || 'Não foi possível atualizar o palpite.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className={`my-open-bet ${locked ? 'locked' : ''}`}>
      <div className="my-open-bet-top">
        <div className="my-open-date"><strong>{date.day}</strong><span>{date.time}</span></div>
        <span className={`prediction-state ${locked ? 'locked' : 'sent'}`}>{locked ? 'PALPITES ENCERRADOS' : 'PALPITE ENVIADO'}</span>
      </div>

      <div className="my-open-match">
        <div className="my-open-team"><TeamCrest team={match.home_team} size="large" /><strong>{match.home_team}</strong></div>
        {editing ? (
          <div className="my-open-editor">
            <ScorePicker value={homeScore} onChange={setHomeScore} disabled={saving} ariaLabel={`Gols de ${match.home_team}`} />
            <span>×</span>
            <ScorePicker value={awayScore} onChange={setAwayScore} disabled={saving} ariaLabel={`Gols de ${match.away_team}`} />
          </div>
        ) : (
          <div className="my-open-score"><span>Seu palpite</span><strong>{prediction.home_score} <i>×</i> {prediction.away_score}</strong></div>
        )}
        <div className="my-open-team away"><TeamCrest team={match.away_team} size="large" /><strong>{match.away_team}</strong></div>
      </div>

      <div className="my-open-bet-footer">
        <span>{locked ? 'Aguardando o resultado final' : timeUntilStart(match.kickoff_at)}</span>
        {!locked && !editing && <button onClick={() => setEditing(true)}>Editar palpite</button>}
        {!locked && editing && (
          <div className="my-open-edit-actions">
            <button className="save" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alteração'}</button>
            <button onClick={() => { setEditing(false); setHomeScore(String(prediction.home_score)); setAwayScore(String(prediction.away_score)); setMessage('') }}>Cancelar</button>
          </div>
        )}
      </div>
      {message && <small className="my-open-error">{message}</small>}
    </article>
  )
}

export default function MyPredictionsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [seasons, setSeasons] = useState([])
  const [seasonId, setSeasonId] = useState('')
  const [predictions, setPredictions] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [roundFilter, setRoundFilter] = useState('all')
  const [expanded, setExpanded] = useState(new Set())
  const [error, setError] = useState('')

  async function loadPredictions(silent = false) {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      const [{ data: seasonData, error: seasonError }, { data: predictionData, error: predictionError }] = await Promise.all([
        supabase.from('seasons').select('*').order('created_at', { ascending: false }),
        supabase
          .from('predictions')
          .select('*, matches(*, rounds(*, seasons(*)))')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])
      if (seasonError) throw seasonError
      if (predictionError) throw predictionError
      const seasonList = seasonData || []
      setSeasons(seasonList)
      setPredictions(predictionData || [])
      setSeasonId((current) => current || seasonList.find((item) => item.is_active)?.id || seasonList[0]?.id || '')
    } catch (err) {
      setError(err.message || 'Não foi possível carregar seus palpites.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadPredictions() }, [user.id])
  useEffect(() => { setRoundFilter('all'); setExpanded(new Set()) }, [seasonId])

  const season = seasons.find((item) => item.id === seasonId) || null
  const seasonPredictions = useMemo(() => predictions.filter((item) => item.matches?.rounds?.season_id === seasonId), [predictions, seasonId])

  const rounds = useMemo(() => {
    const map = new Map()
    seasonPredictions.forEach((item) => {
      const round = item.matches?.rounds
      if (round?.id) map.set(round.id, round)
    })
    return [...map.values()].sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
  }, [seasonPredictions])

  const stats = useMemo(() => {
    const settled = seasonPredictions.filter((item) => hasResult(item.matches))
    const scores = settled.map((item) => calculatePoints(item, item.matches))
    const points = scores.reduce((sum, value) => sum + value, 0)
    const exact = settled.filter((item) => isExactPrediction(item, item.matches)).length
    const winners = settled.filter((item) => didPickWinner(item, item.matches)).length
    const correct = scores.filter((value) => value > 0).length
    const scoredRounds = new Set(settled.map((item) => item.matches?.rounds?.id).filter(Boolean)).size
    return {
      points,
      exact,
      winners,
      correct,
      settled: settled.length,
      rate: settled.length ? Math.round((correct / settled.length) * 100) : 0,
      average: scoredRounds ? (points / scoredRounds).toFixed(1).replace('.', ',') : '0,0',
    }
  }, [seasonPredictions])

  const roundPerformance = useMemo(() => {
    const map = new Map()
    seasonPredictions.filter((item) => hasResult(item.matches)).forEach((item) => {
      const round = item.matches?.rounds
      if (!round?.id) return
      const current = map.get(round.id) || { round, points: 0 }
      current.points += calculatePoints(item, item.matches)
      map.set(round.id, current)
    })
    return [...map.values()].sort((a, b) => (a.round.sort_order || 0) - (b.round.sort_order || 0))
  }, [seasonPredictions])
  const chartMax = Math.max(1, ...roundPerformance.map((item) => item.points))

  const scopedPredictions = useMemo(() => seasonPredictions.filter((item) => roundFilter === 'all' || item.matches?.rounds?.id === roundFilter), [seasonPredictions, roundFilter])
  const openPredictions = useMemo(() => scopedPredictions.filter((item) => !hasResult(item.matches)).sort((a, b) => new Date(a.matches?.kickoff_at) - new Date(b.matches?.kickoff_at)), [scopedPredictions])
  const finishedPredictions = useMemo(() => scopedPredictions.filter((item) => hasResult(item.matches)), [scopedPredictions])

  const finishedGroups = useMemo(() => {
    const map = new Map()
    finishedPredictions.forEach((prediction) => {
      const round = prediction.matches?.rounds
      const key = round?.id || 'sem-rodada'
      if (!map.has(key)) map.set(key, { round, items: [] })
      map.get(key).items.push(prediction)
    })
    return [...map.values()].sort((a, b) => (b.round?.sort_order || 0) - (a.round?.sort_order || 0))
  }, [finishedPredictions])

  useEffect(() => {
    if (!finishedGroups.length) return
    setExpanded((current) => {
      if (current.size) return current
      return new Set([finishedGroups[0].round?.id || 'sem-rodada'])
    })
  }, [finishedGroups.length, seasonId, roundFilter, statusFilter])

  function toggleRound(key) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading) return <Loading label="Carregando seus palpites..." />

  const showOpen = statusFilter === 'all' || statusFilter === 'open'
  const showFinished = statusFilter === 'all' || statusFilter === 'finished'
  const visibleCount = (showOpen ? openPredictions.length : 0) + (showFinished ? finishedPredictions.length : 0)

  return (
    <div className="page-wrap my-predictions-hub sports-surface">
      <header className="prediction-page-header">
        <div>
          <span className="sports-eyebrow">{season?.name || 'Champions League'}</span>
          <h1>Meus palpites</h1>
          <p>Acompanhe seus palpites, resultados e desempenho na temporada.</p>
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
        <EmptyState title="Nenhuma temporada" text="Crie uma temporada para começar a registrar seus palpites." />
      ) : (
        <>
          <section className="prediction-performance-strip">
            <div className="prediction-kpis">
              <div><span>Total de pontos</span><strong>{stats.points}<small> pts</small></strong><em>Média {stats.average} por rodada</em></div>
              <div><span>Placares exatos</span><strong>{stats.exact}</strong><em>3 pontos cada</em></div>
              <div><span>Vencedores</span><strong>{stats.winners}</strong><em>Inclui placares exatos com vencedor</em></div>
              <div><span>Taxa de acerto</span><strong>{stats.rate}<small>%</small></strong><em>{stats.settled ? `${stats.correct} de ${stats.settled} palpites` : 'Sem jogos finalizados'}</em></div>
            </div>
            <div className="round-points-chart" aria-label="Pontos por rodada">
              <div className="chart-title"><span>Seu desempenho por rodada</span>{refreshing && <small>Atualizando…</small>}</div>
              {roundPerformance.length ? (
                <div className="chart-bars">
                  {roundPerformance.map((item) => (
                    <div className="chart-bar-item" key={item.round.id} title={`${item.round.name}: ${item.points} pts`}>
                      <div className="chart-bar-track"><i style={{ height: `${Math.max(8, (item.points / chartMax) * 100)}%` }}><b>{item.points}</b></i></div>
                      <span>{String(item.round.sort_order || '').padStart(2, '0')}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="chart-empty">O gráfico aparece quando seus jogos tiverem resultado.</div>}
            </div>
          </section>

          <section className="prediction-history-shell">
            <div className="prediction-filterbar">
              <div className="prediction-tabs" role="tablist" aria-label="Status dos palpites">
                <button className={statusFilter === 'open' ? 'active' : ''} onClick={() => setStatusFilter('open')}>Em aberto <span>{seasonPredictions.filter((item) => !hasResult(item.matches)).length}</span></button>
                <button className={statusFilter === 'finished' ? 'active' : ''} onClick={() => setStatusFilter('finished')}>Finalizados <span>{seasonPredictions.filter((item) => hasResult(item.matches)).length}</span></button>
                <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Todos <span>{seasonPredictions.length}</span></button>
              </div>
              <label className="round-filter-select">
                <span>Rodada</span>
                <select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
                  <option value="all">Todas as rodadas</option>
                  {rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}
                </select>
              </label>
            </div>

            {!seasonPredictions.length ? (
              <EmptyState title="Você ainda não fez nenhum palpite" text="Depois que você salvar o primeiro, ele aparecerá aqui. Jogos sem palpite nunca são exibidos nesta página." />
            ) : !visibleCount ? (
              <div className="prediction-filter-empty">Nenhum palpite encontrado com estes filtros.</div>
            ) : (
              <>
                {showOpen && openPredictions.length > 0 && (
                  <section className="open-predictions-section">
                    <div className="prediction-section-heading"><div><span>EM ABERTO</span><h2>Palpites aguardando resultado</h2></div><small>{openPredictions.length} {openPredictions.length === 1 ? 'palpite' : 'palpites'}</small></div>
                    <div className="open-predictions-grid">
                      {openPredictions.map((prediction) => <OpenPredictionCard prediction={prediction} onSaved={() => loadPredictions(true)} key={prediction.id} />)}
                    </div>
                  </section>
                )}

                {showFinished && finishedGroups.length > 0 && (
                  <section className="finished-predictions-section">
                    <div className="prediction-section-heading"><div><span>HISTÓRICO</span><h2>Resultados por rodada</h2></div><small>{finishedPredictions.length} finalizados</small></div>
                    <div className="prediction-round-accordions">
                      {finishedGroups.map(({ round, items }) => {
                        const key = round?.id || 'sem-rodada'
                        const isExpanded = expanded.has(key)
                        const ordered = [...items].sort((a, b) => new Date(a.matches?.kickoff_at) - new Date(b.matches?.kickoff_at))
                        const scores = ordered.map((item) => calculatePoints(item, item.matches))
                        const points = scores.reduce((sum, value) => sum + value, 0)
                        const exact = ordered.filter((item) => isExactPrediction(item, item.matches)).length
                        const winners = ordered.filter((item) => didPickWinner(item, item.matches)).length
                        const misses = scores.filter((value) => value === 0).length
                        return (
                          <article className={`prediction-round ${isExpanded ? 'expanded' : ''}`} key={key}>
                            <button className="prediction-round-summary" onClick={() => toggleRound(key)} aria-expanded={isExpanded}>
                              <div className="prediction-round-title"><span>{String(round?.sort_order || '').padStart(2, '0')}</span><div><strong>{round?.name || 'Rodada'}</strong><small>{round?.stage || ''}</small></div></div>
                              <div className="prediction-round-stats"><strong>{points} pts</strong><span>{exact} {exact === 1 ? 'exato' : 'exatos'} <i>•</i> {winners} {winners === 1 ? 'vencedor' : 'vencedores'} <i>•</i> {misses} {misses === 1 ? 'erro' : 'erros'}</span></div>
                              <span className="prediction-round-chevron">{isExpanded ? '⌃' : '⌄'}</span>
                            </button>
                            {isExpanded && (
                              <div className="prediction-round-games">
                                <div className="prediction-games-head"><span>Data</span><span>Jogo</span><span>Resultado</span><span>Seu palpite</span><span>Desempenho</span><span>Pontos</span></div>
                                {ordered.map((prediction) => {
                                  const match = prediction.matches
                                  const score = calculatePoints(prediction, match)
                                  const feedback = feedbackFor(score)
                                  const date = shortDate(match.kickoff_at)
                                  return (
                                    <div className="prediction-game-row" key={prediction.id}>
                                      <div className="prediction-game-date"><strong>{date.day}</strong><span>{date.time}</span></div>
                                      <div className="prediction-game-teams"><span><TeamCrest team={match.home_team} size="small" />{match.home_team}</span><i>×</i><span><TeamCrest team={match.away_team} size="small" />{match.away_team}</span></div>
                                      <strong className="prediction-score-final" data-label="Resultado">{match.home_score} <i>×</i> {match.away_score}</strong>
                                      <strong className="prediction-score-own" data-label="Seu palpite">{prediction.home_score} <i>×</i> {prediction.away_score}</strong>
                                      <span className={`prediction-result-pill ${feedback.className}`} data-label="Desempenho">{feedback.label}</span>
                                      <strong className={`prediction-points ${feedback.className}`} data-label="Pontos">{score > 0 ? '+' : ''}{score} {score === 1 ? 'pt' : 'pts'}</strong>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
