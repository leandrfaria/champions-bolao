import { useEffect, useMemo, useState } from 'react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import TeamCrest from '../components/TeamCrest'
import ScorePicker from '../components/ScorePicker'
import NavIcon from '../components/NavIcon'
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
  return { label: 'ERROU', className: 'miss' }
}

function scoreText(home, away) {
  return `${home}x${away}`
}

function roundOrder(prediction) {
  return prediction.matches?.rounds?.sort_order ?? -1
}

function roundTitle(round) {
  const stage = String(round?.stage || '').trim()
  const raw = String(round?.name || `Rodada ${round?.sort_order || ''}`).trim()
  let detail = raw

  if (stage && raw.toLowerCase().startsWith(stage.toLowerCase())) {
    detail = raw.slice(stage.length).replace(/^[\s·\-–—:]+/, '').trim()
  }

  if (/^rodada\s+/i.test(detail)) detail = detail.replace(/^rodada\s+/i, '').trim()
  if (!detail) detail = String(round?.sort_order || '').padStart(2, '0')

  return {
    stage,
    detail,
    full: stage ? `${stage} - ${detail}` : detail,
  }
}

function sortStats(a, b) {
  return b.points - a.points || b.exact - a.exact || b.winners - a.winners || a.display_name.localeCompare(b.display_name)
}

function sameStanding(a, b) {
  return Boolean(a && b && a.points === b.points && a.exact === b.exact && a.winners === b.winners)
}

function withRank(rows) {
  let rank = 0
  return rows.map((row, index) => {
    if (index === 0) rank = 1
    else if (!sameStanding(row, rows[index - 1])) rank += 1
    return { ...row, rank }
  })
}

function placement(value) {
  return value ? `${value}º` : '—'
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

  function cancelEditing() {
    setEditing(false)
    setHomeScore(String(prediction.home_score))
    setAwayScore(String(prediction.away_score))
    setMessage('')
  }

  return (
    <article className={`prediction-v2-card ${locked ? 'locked' : ''}`}>
      <div className="prediction-v2-card-head">
        <div className="prediction-v2-date"><strong>{date.day}</strong><span>·</span><strong>{date.time}</strong></div>
        <span className={`prediction-v2-status ${locked ? 'in-progress' : 'sent'}`}>{locked ? 'EM ANDAMENTO' : 'PALPITE ENVIADO'}</span>
      </div>

      <div className="prediction-v2-match">
        <div className="prediction-v2-team home">
          <TeamCrest team={match.home_team} size="medium" />
          <span>{match.home_team}</span>
        </div>

        <div className={`prediction-v2-score ${editing ? 'editing' : ''}`}>
          <small>Seu palpite</small>
          {editing ? (
            <div className="prediction-v2-editor">
              <ScorePicker value={homeScore} onChange={setHomeScore} disabled={saving} ariaLabel={`Gols de ${match.home_team}`} />
              <i>×</i>
              <ScorePicker value={awayScore} onChange={setAwayScore} disabled={saving} ariaLabel={`Gols de ${match.away_team}`} />
            </div>
          ) : (
            <strong>{scoreText(prediction.home_score, prediction.away_score)}</strong>
          )}
        </div>

        <div className="prediction-v2-team away">
          <span>{match.away_team}</span>
          <TeamCrest team={match.away_team} size="medium" />
        </div>
      </div>

      <div className="prediction-v2-card-foot">
        <span className="prediction-v2-deadline">{locked ? 'Aguardando resultado final' : timeUntilStart(match.kickoff_at)}</span>

        {!locked && !editing && <button className="prediction-v2-edit" onClick={() => setEditing(true)}>Editar <span>→</span></button>}

        {!locked && editing && (
          <div className="prediction-v2-actions">
            <button className="save" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            <button onClick={cancelEditing}>Cancelar</button>
          </div>
        )}
      </div>

      {message && <small className="prediction-v2-error">{message}</small>}
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
  const [predictions, setPredictions] = useState([])
  const [allPredictions, setAllPredictions] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [roundFilter, setRoundFilter] = useState('all')
  const [expanded, setExpanded] = useState(new Set())
  const [error, setError] = useState('')

  async function loadPredictions(silent = false) {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError('')

    try {
      const [seasonRes, ownRes, profileRes, allRes] = await Promise.all([
        supabase.from('seasons').select('*').order('created_at', { ascending: false }),
        supabase
          .from('predictions')
          .select('*, matches(*, rounds(*, seasons(*)))')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').order('display_name'),
        supabase
          .from('predictions')
          .select('user_id, home_score, away_score, matches(*, rounds(*, seasons(*)))'),
      ])

      if (seasonRes.error) throw seasonRes.error
      if (ownRes.error) throw ownRes.error
      if (profileRes.error) throw profileRes.error
      if (allRes.error) throw allRes.error

      const seasonList = seasonRes.data || []
      setSeasons(seasonList)
      setPredictions(ownRes.data || [])
      setProfiles(profileRes.data || [])
      setAllPredictions(allRes.data || [])
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

  const seasonPredictions = useMemo(
    () => predictions.filter((item) => item.matches?.rounds?.season_id === seasonId),
    [predictions, seasonId],
  )

  const seasonAllPredictions = useMemo(
    () => allPredictions.filter((item) => item.matches?.rounds?.season_id === seasonId),
    [allPredictions, seasonId],
  )

  const rounds = useMemo(() => {
    const map = new Map()
    seasonPredictions.forEach((item) => {
      const round = item.matches?.rounds
      if (round?.id) map.set(round.id, round)
    })
    return [...map.values()].sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
  }, [seasonPredictions])

  const standings = useMemo(() => {
    const activeUserIds = new Set(seasonAllPredictions.map((item) => item.user_id).filter(Boolean))
    const rows = [...profiles]
      .filter((profile) => activeUserIds.has(profile.id))
      .map((profile) => {
        const settled = seasonAllPredictions.filter((item) => item.user_id === profile.id && hasResult(item.matches))
        return {
          id: profile.id,
          display_name: profile.display_name || 'Jogador',
          points: settled.reduce((sum, item) => sum + calculatePoints(item, item.matches), 0),
          exact: settled.filter((item) => isExactPrediction(item, item.matches)).length,
          winners: settled.filter((item) => didPickWinner(item, item.matches)).length,
        }
      })
      .sort(sortStats)

    return withRank(rows)
  }, [profiles, seasonAllPredictions])

  const currentStanding = standings.find((item) => item.id === user.id) || null

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
      rank: currentStanding?.rank || null,
      participants: standings.length,
    }
  }, [seasonPredictions, currentStanding?.rank, standings.length])

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

  const scopedPredictions = useMemo(
    () => seasonPredictions.filter((item) => roundFilter === 'all' || item.matches?.rounds?.id === roundFilter),
    [seasonPredictions, roundFilter],
  )

  const openPredictions = useMemo(
    () => scopedPredictions.filter((item) => !hasResult(item.matches)).sort((a, b) => new Date(a.matches?.kickoff_at) - new Date(b.matches?.kickoff_at)),
    [scopedPredictions],
  )

  const finishedPredictions = useMemo(
    () => scopedPredictions.filter((item) => hasResult(item.matches)),
    [scopedPredictions],
  )

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
  const openCount = seasonPredictions.filter((item) => !hasResult(item.matches)).length
  const finishedCount = seasonPredictions.filter((item) => hasResult(item.matches)).length

  return (
    <div className="page-wrap predictions-v2-page">
      {error && <div className="form-error predictions-v2-error-banner">{error}</div>}

      {!seasons.length ? (
        <EmptyState title="Nenhuma temporada" text="Crie uma temporada para começar a registrar seus palpites." />
      ) : (
        <>
          <header className="predictions-v2-header">
            <div className="predictions-v2-header-copy">
              <span>{season?.name || 'Champions League'}</span>
              <h1>Meus palpites</h1>
              <p>Acompanhe seus palpites e desempenho na temporada.</p>
              {refreshing && <small>Atualizando…</small>}
            </div>

            <label className="predictions-v2-season-select">
              <span>Temporada</span>
              <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>
                {seasons.map((item) => <option value={item.id} key={item.id}>{item.name}{item.is_active ? ' · atual' : ''}</option>)}
              </select>
            </label>
          </header>

          <section className="predictions-v2-season-strip" aria-label="Resumo da temporada">
            <div className="predictions-v2-season-title">Minha temporada</div>

            <div className="predictions-v2-season-metrics">
              <div className="predictions-v2-season-metric">
                <NavIcon name="podium" size={17} />
                <strong>{stats.points}<small> pts</small></strong>
                <span>Pontos</span>
              </div>
              <div className="predictions-v2-season-metric">
                <span className="predictions-v2-metric-icon">◎</span>
                <strong>{stats.exact}</strong>
                <span>Exatos</span>
              </div>
              <div className="predictions-v2-season-metric">
                <span className="predictions-v2-metric-icon">♛</span>
                <strong>{stats.winners}</strong>
                <span>Vencedores</span>
              </div>
              <div className="predictions-v2-season-metric accent-cyan">
                <span className="predictions-v2-metric-icon">▥</span>
                <strong>{stats.rate}<small>%</small></strong>
                <span>Acerto</span>
              </div>
              <div className="predictions-v2-season-metric accent-gold">
                <span className="predictions-v2-metric-icon">★</span>
                <strong>{placement(stats.rank)}</strong>
                <span>Posição</span>
              </div>
            </div>

            <aside className="predictions-v2-mini-chart" aria-label="Desempenho por rodada">
              <div className="predictions-v2-mini-chart-head">
                <span>Desempenho por rodada</span>
                <small>{roundPerformance.length ? `${roundPerformance.length} ${roundPerformance.length === 1 ? 'rodada' : 'rodadas'}` : 'sem dados'}</small>
              </div>
              {roundPerformance.length ? (
                <div className="predictions-v2-mini-bars">
                  {roundPerformance.map((item) => (
                    <div className="predictions-v2-mini-bar-item" key={item.round.id} title={`${item.round.name}: ${item.points} pts`}>
                      <div className="predictions-v2-mini-track"><i style={{ height: `${Math.max(14, (item.points / chartMax) * 100)}%` }} /></div>
                      <span>R{item.round.sort_order}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="predictions-v2-mini-empty">O gráfico aparece após o primeiro resultado.</div>
              )}
            </aside>
          </section>

          <div className="predictions-v2-controls">
            <div className="predictions-v2-tabs" role="tablist" aria-label="Status dos palpites">
              <button className={statusFilter === 'open' ? 'active' : ''} onClick={() => setStatusFilter('open')}>Em aberto <span>{openCount}</span></button>
              <button className={statusFilter === 'finished' ? 'active' : ''} onClick={() => setStatusFilter('finished')}>Finalizados <span>{finishedCount}</span></button>
              <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Todos <span>{seasonPredictions.length}</span></button>
            </div>

            <label className="predictions-v2-round-filter">
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
            <main className="predictions-v2-content">
              {showOpen && openPredictions.length > 0 && (
                <section className="predictions-v2-section predictions-v2-open-section">
                  <div className="predictions-v2-section-head">
                    <div>
                      <span>Em aberto</span>
                      <h2>Palpites em andamento</h2>
                      <p>{openPredictions.length} {openPredictions.length === 1 ? 'palpite aguardando resultado' : 'palpites aguardando resultado'}</p>
                    </div>
                  </div>

                  <div className="predictions-v2-open-grid">
                    {openPredictions.map((prediction) => <OpenPredictionCard prediction={prediction} onSaved={() => loadPredictions(true)} key={prediction.id} />)}
                  </div>
                </section>
              )}

              {showFinished && finishedGroups.length > 0 && (
                <section className="predictions-v2-section predictions-v2-history-section">
                  <div className="predictions-v2-section-head history">
                    <div>
                      <span>Histórico</span>
                      <h2>Histórico por rodada</h2>
                      <p>Acompanhe os resultados e veja quanto você pontuou.</p>
                    </div>
                    <small>{finishedPredictions.length} finalizados</small>
                  </div>

                  <div className="predictions-v2-round-list">
                    {finishedGroups.map(({ round, items }) => {
                      const key = round?.id || 'sem-rodada'
                      const isExpanded = expanded.has(key)
                      const ordered = [...items].sort((a, b) => new Date(a.matches?.kickoff_at) - new Date(b.matches?.kickoff_at))
                      const scores = ordered.map((item) => calculatePoints(item, item.matches))
                      const points = scores.reduce((sum, value) => sum + value, 0)
                      const exact = ordered.filter((item) => isExactPrediction(item, item.matches)).length
                      const winners = ordered.filter((item) => didPickWinner(item, item.matches)).length
                      const misses = scores.filter((value) => value === 0).length
                      const title = roundTitle(round)

                      return (
                        <article className={`predictions-v2-round ${isExpanded ? 'expanded' : ''}`} key={key}>
                          <button className="predictions-v2-round-head" onClick={() => toggleRound(key)} aria-expanded={isExpanded}>
                            <span className="predictions-v2-round-number">{String(round?.sort_order || '').padStart(2, '0')}</span>
                            <div className="predictions-v2-round-title">
                              <strong>{title.stage ? `${title.stage} · Rodada ${title.detail}` : `Rodada ${title.detail}`}</strong>
                              <span>{points} pts <i>·</i> {exact} {exact === 1 ? 'exato' : 'exatos'} <i>·</i> {winners} {winners === 1 ? 'vencedor' : 'vencedores'} <i>·</i> {misses} {misses === 1 ? 'erro' : 'erros'}</span>
                            </div>
                            <span className="predictions-v2-round-chevron">{isExpanded ? '⌃' : '⌄'}</span>
                          </button>

                          {isExpanded && (
                            <div className="predictions-v2-round-body">
                              <div className="predictions-v2-history-labels" aria-hidden="true">
                                <span>Data</span>
                                <span>Confronto</span>
                                <span>Seu palpite</span>
                                <span>Desempenho</span>
                              </div>

                              {ordered.map((prediction) => {
                                const match = prediction.matches
                                const score = calculatePoints(prediction, match)
                                const feedback = feedbackFor(score)
                                const date = shortDate(match.kickoff_at)
                                return (
                                  <div className={`predictions-v2-history-row tone-${feedback.className}`} key={prediction.id}>
                                    <div className="predictions-v2-history-date">
                                      <strong>{date.day}</strong>
                                      <span>{date.time}</span>
                                    </div>

                                    <div className="predictions-v2-history-match">
                                      <div className="predictions-v2-history-team home"><TeamCrest team={match.home_team} size="small" /><span>{match.home_team}</span></div>
                                      <strong>{scoreText(match.home_score, match.away_score)}</strong>
                                      <div className="predictions-v2-history-team away"><span>{match.away_team}</span><TeamCrest team={match.away_team} size="small" /></div>
                                    </div>

                                    <div className="predictions-v2-history-pick">
                                      <small>Seu palpite</small>
                                      <strong>{scoreText(prediction.home_score, prediction.away_score)}</strong>
                                    </div>

                                    <div className={`predictions-v2-history-feedback ${feedback.className}`}>
                                      <span>{feedback.label}</span>
                                      <strong>{score > 0 ? '+' : ''}{score} {score === 1 ? 'pt' : 'pts'}</strong>
                                    </div>
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
            </main>
          )}
        </>
      )}
    </div>
  )
}
