import { useEffect, useMemo, useState } from 'react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import UserAvatar from '../components/UserAvatar'
import TrophyIcon from '../components/TrophyIcon'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction } from '../lib/utils'

function sortStats(a, b) {
  return b.points - a.points || b.exact - a.exact || b.winners - a.winners || a.display_name.localeCompare(b.display_name)
}

function sameRank(a, b) {
  return a && b && a.points === b.points && a.exact === b.exact && a.winners === b.winners
}

function rankStats(rows) {
  const sorted = [...rows].sort(sortStats)
  let rank = 0
  return sorted.map((row, index) => {
    if (index === 0 || !sameRank(row, sorted[index - 1])) rank = index + 1
    return { ...row, rank }
  })
}

function shortSeasonName(season) {
  const name = season?.name || ''
  const match = name.match(/\d{4}\/\d{2,4}/)
  return match?.[0] || name || 'Temporada'
}

function roundDates(round) {
  const matches = [...(round?.matches || [])].filter((match) => match.kickoff_at).sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
  if (!matches.length) return 'Sem data definida'
  const first = new Date(matches[0].kickoff_at)
  const last = new Date(matches.at(-1).kickoff_at)
  const day = (date) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)
  const month = (date) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '').toUpperCase()
  if (first.toDateString() === last.toDateString()) return `${day(first)} ${month(first)}`
  if (first.getMonth() === last.getMonth()) return `${day(first)}–${day(last)} ${month(last)}`
  return `${day(first)} ${month(first)} – ${day(last)} ${month(last)}`
}

function buildPlayerStats(profiles, matches, predictions) {
  const matchMap = new Map(matches.map((match) => [match.id, match]))
  return profiles.map((profile) => {
    const entries = predictions
      .filter((item) => item.user_id === profile.id)
      .map((prediction) => ({ prediction, match: matchMap.get(prediction.match_id) }))
      .filter((item) => item.match)
    const scores = entries.map((item) => calculatePoints(item.prediction, item.match))
    return {
      ...profile,
      points: scores.reduce((sum, value) => sum + value, 0),
      exact: entries.filter((item) => isExactPrediction(item.prediction, item.match)).length,
      winners: entries.filter((item) => didPickWinner(item.prediction, item.match)).length,
      correct: scores.filter((value) => value > 0).length,
      played: scores.length,
    }
  })
}

export default function LeaderboardPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [seasonLoading, setSeasonLoading] = useState(false)
  const [profiles, setProfiles] = useState([])
  const [seasons, setSeasons] = useState([])
  const [seasonId, setSeasonId] = useState('')
  const [rounds, setRounds] = useState([])
  const [predictions, setPredictions] = useState([])
  const [mode, setMode] = useState('general')
  const [roundId, setRoundId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function bootstrap() {
      setLoading(true)
      setError('')
      try {
        const [{ data: profileData, error: profilesError }, { data: seasonData, error: seasonsError }] = await Promise.all([
          supabase.from('profiles').select('*').order('display_name'),
          supabase.from('seasons').select('*').order('created_at', { ascending: false }),
        ])
        if (profilesError) throw profilesError
        if (seasonsError) throw seasonsError
        const list = seasonData || []
        setProfiles(profileData || [])
        setSeasons(list)
        setSeasonId(list.find((item) => item.is_active)?.id || list[0]?.id || '')
      } catch (err) {
        setError(err.message || 'Não foi possível carregar a classificação.')
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
      setRoundId('')
      return
    }
    let cancelled = false
    async function loadSeason() {
      setSeasonLoading(true)
      setError('')
      try {
        const { data: roundData, error: roundError } = await supabase
          .from('rounds')
          .select('*, matches(*)')
          .eq('season_id', seasonId)
          .order('sort_order')
        if (roundError) throw roundError
        const loadedRounds = (roundData || []).map((round) => ({
          ...round,
          matches: [...(round.matches || [])].sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at)),
        }))
        const finishedMatches = loadedRounds.flatMap((round) => round.matches).filter(hasResult)
        let predictionData = []
        if (finishedMatches.length) {
          const { data, error } = await supabase.from('predictions').select('*').in('match_id', finishedMatches.map((match) => match.id))
          if (error) throw error
          predictionData = data || []
        }
        if (!cancelled) {
          setRounds(loadedRounds)
          setPredictions(predictionData)
          const latestWithGames = [...loadedRounds].reverse().find((round) => round.matches.some(hasResult)) || loadedRounds.at(-1)
          setRoundId(latestWithGames?.id || '')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Não foi possível carregar a temporada.')
      } finally {
        if (!cancelled) setSeasonLoading(false)
      }
    }
    loadSeason()
    return () => { cancelled = true }
  }, [seasonId])

  const season = seasons.find((item) => item.id === seasonId) || null
  const selectedRound = rounds.find((round) => round.id === roundId) || null
  const allFinishedMatches = useMemo(() => rounds.flatMap((round) => round.matches).filter(hasResult), [rounds])

  const seasonRows = useMemo(() => rankStats(buildPlayerStats(profiles, allFinishedMatches, predictions)), [profiles, allFinishedMatches, predictions])

  const roundMetrics = useMemo(() => {
    const map = new Map()
    rounds.forEach((round) => {
      const matches = round.matches.filter(hasResult)
      const ids = new Set(matches.map((match) => match.id))
      const roundPredictions = predictions.filter((item) => ids.has(item.match_id))
      map.set(round.id, rankStats(buildPlayerStats(profiles, matches, roundPredictions)))
    })
    return map
  }, [rounds, profiles, predictions])

  const displayRows = mode === 'round' ? (roundMetrics.get(roundId) || []) : seasonRows
  const topThree = displayRows.slice(0, 3)
  const leader = displayRows[0] || null
  const currentRow = displayRows.find((item) => item.id === user.id) || null
  const selectedRoundFinishedCount = selectedRound?.matches.filter(hasResult).length || 0

  const highlights = useMemo(() => {
    if (!seasonRows.length) return null
    const exactLeader = [...seasonRows].sort((a, b) => b.exact - a.exact || sortStats(a, b))[0]
    const winnerLeader = [...seasonRows].sort((a, b) => b.winners - a.winners || sortStats(a, b))[0]
    let bestRound = null
    rounds.forEach((round) => {
      const rows = roundMetrics.get(round.id) || []
      rows.forEach((player) => {
        if (!bestRound || player.points > bestRound.points || (player.points === bestRound.points && player.exact > bestRound.exact)) {
          bestRound = { ...player, round }
        }
      })
    })
    return { leader: seasonRows[0], exactLeader, winnerLeader, bestRound }
  }, [seasonRows, roundMetrics, rounds])

  if (loading) return <Loading label="Carregando classificação..." />

  return (
    <div className="page-wrap competition-hub sports-surface">
      <header className="competition-page-header">
        <div>
          <span className="sports-eyebrow">{season?.name || 'Champions League'}</span>
          <h1>Classificação</h1>
          <p><span className="competition-copy-desktop">Veja quem está liderando a disputa e acompanhe o desempenho da temporada.</span><span className="competition-copy-mobile">Veja quem está liderando a disputa.</span></p>
        </div>
        {seasons.length > 0 && (
          <label className="season-selector competition-season-desktop">
            <span>Temporada</span>
            <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>
              {seasons.map((item) => <option value={item.id} key={item.id}>{item.name}{item.is_active ? ' · atual' : ''}</option>)}
            </select>
          </label>
        )}
        {seasons.length > 0 && (
          <label className="competition-mobile-season-selector">
            <span>Temporada</span>
            <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)} aria-label="Selecionar temporada">
              {seasons.map((item) => <option value={item.id} key={item.id}>{shortSeasonName(item)}{item.is_active ? ' · atual' : ''}</option>)}
            </select>
          </label>
        )}
      </header>

      {error && <div className="form-error">{error}</div>}

      {!seasons.length ? (
        <EmptyState title="Nenhuma temporada" text="Crie uma temporada para começar a disputar a classificação." />
      ) : seasonLoading ? (
        <Loading label="Calculando classificação da temporada..." />
      ) : !profiles.length ? (
        <EmptyState title="Nenhum participante" text="Os participantes aparecem aqui depois de serem criados no Supabase." />
      ) : (
        <>
          <div className="competition-toolbar">
            <div className="competition-tabs" role="tablist" aria-label="Tipo de classificação">
              <button className={mode === 'general' ? 'active' : ''} onClick={() => setMode('general')}>Geral</button>
              <button className={mode === 'round' ? 'active' : ''} onClick={() => setMode('round')}>Por rodada</button>
            </div>
            {mode === 'round' && rounds.length > 0 && (
              <label className="competition-round-select">
                <span>Rodada</span>
                <select value={roundId} onChange={(event) => setRoundId(event.target.value)}>
                  {rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}
                </select>
                {selectedRound && <small>{roundDates(selectedRound)} · {selectedRound.stage}</small>}
              </label>
            )}
          </div>

          {!allFinishedMatches.length && mode === 'general' ? (
            <EmptyState title="Temporada sem resultados" text="A classificação começa a ganhar pontos assim que o primeiro resultado for informado." />
          ) : mode === 'round' && selectedRound && selectedRoundFinishedCount === 0 ? (
            <EmptyState title="Rodada sem pontuação" text="Ainda não há jogos finalizados nesta rodada. O ranking dela aparece assim que um resultado for registrado." />
          ) : (
            <>
              <section className={`competition-top-three count-${topThree.length}`}>
                {topThree.map((row, index) => {
                  const gap = leader ? Math.max(0, leader.points - row.points) : 0
                  return (
                    <article className={`competition-podium-card podium-${index + 1} ${row.id === user.id ? 'mine' : ''}`} key={row.id}>
                      {index === 0 && <span className="podium-crown"><TrophyIcon size={21} /></span>}
                      <span className="podium-number">{String(row.rank).padStart(2, '0')}</span>
                      <UserAvatar profile={row} size="podium" />
                      <div className="podium-name-line"><strong>{row.display_name}</strong>{row.id === user.id && <em>VOCÊ</em>}</div>
                      <div className="podium-score"><strong>{row.points}</strong><span>pts</span></div>
                      <small>{index === 0 ? (mode === 'round' ? 'Melhor desempenho da rodada' : 'Líder da temporada') : gap ? `-${gap} ${gap === 1 ? 'ponto' : 'pontos'} do líder` : 'Empatado com o líder'}</small>
                    </article>
                  )
                })}
              </section>

              {mode === 'general' && highlights && (
                <section className="season-highlights-strip">
                  <div><span>Líder atual</span><strong>{highlights.leader?.display_name || '—'}</strong><small>{highlights.leader ? `${highlights.leader.points} pts` : ''}</small></div>
                  <div><span>Mais placares exatos</span><strong>{highlights.exactLeader?.display_name || '—'}</strong><small>{highlights.exactLeader ? `${highlights.exactLeader.exact} exatos` : ''}</small></div>
                  <div><span>Melhor rodada</span><strong>{highlights.bestRound?.display_name || '—'}</strong><small>{highlights.bestRound ? `${highlights.bestRound.points} pts · ${highlights.bestRound.round.name}` : ''}</small></div>
                  <div><span>Mais vencedores</span><strong>{highlights.winnerLeader?.display_name || '—'}</strong><small>{highlights.winnerLeader ? `${highlights.winnerLeader.winners} acertos` : ''}</small></div>
                </section>
              )}

              {mode === 'round' && selectedRound && (
                <section className="round-ranking-context">
                  <div><span>Rodada selecionada</span><strong>{selectedRound.name}</strong><small>{roundDates(selectedRound)} · {selectedRound.stage}</small></div>
                  <div><span>Jogos finalizados</span><strong>{selectedRound.matches.filter(hasResult).length}/{selectedRound.matches.length}</strong></div>
                  <div><span>Participantes</span><strong>{profiles.length}</strong></div>
                  <div><span>Sua posição</span><strong>{currentRow ? `${currentRow.rank}º` : '—'}</strong><small>{currentRow ? `${currentRow.points} pts na rodada` : ''}</small></div>
                </section>
              )}

              <section className="competition-table-shell">
                <div className="competition-table-head"><span>Pos.</span><span>Jogador</span><span>Pontos</span><span>Exatos</span><span>Vencedores</span></div>
                <div className="competition-table-body">
                  {displayRows.map((row) => {
                    const gap = leader ? Math.max(0, leader.points - row.points) : 0
                    return (
                      <div className={`competition-table-row rank-${row.rank} ${row.id === user.id ? 'mine' : ''}`} key={row.id}>
                        <span className={`competition-rank rank-badge-${row.rank}`}>{row.rank}</span>
                        <div className="competition-player"><UserAvatar profile={row} size="small" /><div><div className="competition-player-name"><strong>{row.display_name}</strong>{row.id === user.id && <em>VOCÊ</em>}</div><small className="competition-mobile-stats">{row.exact} {row.exact === 1 ? 'exato' : 'exatos'} <i>•</i> {row.winners} {row.winners === 1 ? 'vencedor' : 'vencedores'}</small></div></div>
                        <div className="competition-points"><strong>{row.points}</strong>{gap > 0 && mode === 'general' ? <small>-{gap} do líder</small> : null}</div>
                        <span className="competition-exact-cell">{row.exact}</span>
                        <span className="competition-winner-cell">{row.winners}</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              <p className="competition-footnote">Desempate: pontos, placares exatos e vencedores acertados. Se os três critérios forem iguais, os participantes permanecem empatados.</p>
            </>
          )}
        </>
      )}
    </div>
  )
}
