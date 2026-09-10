import { useEffect, useMemo, useState } from 'react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import UserAvatar from '../components/UserAvatar'
import TrophyIcon from '../components/TrophyIcon'
import NavIcon from '../components/NavIcon'
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
    if (index === 0) rank = 1
    else if (!sameRank(row, sorted[index - 1])) rank += 1
    return { ...row, rank }
  })
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

  const titleRaceRows = displayRows.slice(0, 3)
  const leaderTieCount = displayRows.filter((row) => row.rank === 1).length
  const seasonTitle = season?.name || 'Champions League'

  if (loading) return <Loading label="Carregando classificação..." />

  return (
    <div className="page-wrap standings-v3-page sports-surface">
      <header className="standings-v3-header">
        <div className="standings-v3-header-copy">
          <span className="standings-v3-eyebrow">{seasonTitle.toUpperCase()}</span>
          <h1>Classificação</h1>
          <p>Veja quem está liderando a disputa pelo título.</p>
        </div>

        {seasons.length > 0 && (
          <label className="standings-v3-season-select">
            <span>Temporada</span>
            <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)} aria-label="Selecionar temporada">
              {seasons.map((item) => <option value={item.id} key={item.id}>{item.name}{item.is_active ? ' · atual' : ''}</option>)}
            </select>
          </label>
        )}
      </header>

      <div className="standings-v3-controls">
        <div className="standings-v3-tabs" role="tablist" aria-label="Tipo de classificação">
          <button className={mode === 'general' ? 'active' : ''} onClick={() => setMode('general')}>Geral</button>
          <button className={mode === 'round' ? 'active' : ''} onClick={() => setMode('round')}>Por rodada</button>
        </div>

        {mode === 'round' && rounds.length > 0 && (
          <label className="standings-v3-round-select">
            <span>Rodada</span>
            <select value={roundId} onChange={(event) => setRoundId(event.target.value)}>
              {rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {!seasons.length ? (
        <EmptyState title="Nenhuma temporada" text="Crie uma temporada para começar a disputar a classificação." />
      ) : seasonLoading ? (
        <Loading label="Calculando classificação da temporada..." />
      ) : !profiles.length ? (
        <EmptyState title="Nenhum participante" text="Os participantes aparecem aqui depois de serem criados no Supabase." />
      ) : !allFinishedMatches.length && mode === 'general' ? (
        <EmptyState title="Temporada sem resultados" text="A classificação começa a ganhar pontos assim que o primeiro resultado for informado." />
      ) : mode === 'round' && selectedRound && selectedRoundFinishedCount === 0 ? (
        <EmptyState title="Rodada sem pontuação" text="Ainda não há jogos finalizados nesta rodada. O ranking dela aparece assim que um resultado for registrado." />
      ) : (
        <>
          <section className="standings-v3-race-section">
            <div className="standings-v3-section-heading">
              <div>
                <span>Corrida pelo título</span>
                <h2>{mode === 'general' ? 'Na frente da temporada' : 'Destaques da rodada'}</h2>
              </div>
              <p>{mode === 'general' ? 'Os participantes mais próximos da liderança.' : selectedRound?.name}</p>
            </div>

            <div className={`standings-v3-race-grid count-${titleRaceRows.length}`}>
              {titleRaceRows.map((row, index) => {
                const isLeadCard = index === 0
                const gap = leader ? Math.max(0, leader.points - row.points) : 0
                const tone = row.rank === 1 ? 'gold' : row.rank === 2 ? 'silver' : row.rank === 3 ? 'bronze' : 'neutral'
                return (
                  <article className={`standings-v3-racer ${isLeadCard ? 'is-leader' : 'is-chaser'} tone-${tone} ${row.id === user.id ? 'is-user' : ''}`} key={row.id}>
                    <div className="standings-v3-racer-position">
                      {isLeadCard && <TrophyIcon size={16} />}
                      <strong>{row.rank}º</strong>
                    </div>
                    <UserAvatar profile={row} size="podium" />
                    <div className="standings-v3-racer-copy">
                      <span>{isLeadCard ? (leaderTieCount > 1 ? 'Liderança compartilhada' : mode === 'general' ? 'Líder da temporada' : 'Líder da rodada') : `${row.rank}º lugar`}</span>
                      <div className="standings-v3-racer-name"><h3>{row.display_name}</h3>{row.id === user.id && <em>VOCÊ</em>}</div>
                      <small>{row.exact} {row.exact === 1 ? 'exato' : 'exatos'} · {row.winners} {row.winners === 1 ? 'vencedor' : 'vencedores'}</small>
                    </div>
                    <div className="standings-v3-racer-score">
                      <strong>{row.points}</strong>
                      <span>pts</span>
                      {!isLeadCard && <small>{gap === 0 ? 'Empatado com o líder' : `${gap} ${gap === 1 ? 'ponto' : 'pontos'} atrás`}</small>}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {mode === 'general' && highlights && (
            <section className="standings-v3-highlights">
              <div className="standings-v3-highlights-title">Destaques da temporada</div>
              <div className="standings-v3-highlight-item">
                <span className="standings-v3-highlight-icon">◎</span>
                <div><small>Mais placares exatos</small><strong>{highlights.exactLeader?.display_name || '—'}</strong><span>{highlights.exactLeader ? `${highlights.exactLeader.exact} ${highlights.exactLeader.exact === 1 ? 'exato' : 'exatos'}` : ''}</span></div>
              </div>
              <div className="standings-v3-highlight-item">
                <span className="standings-v3-highlight-icon"><NavIcon name="leaderboard" size={18} /></span>
                <div><small>Melhor rodada</small><strong>{highlights.bestRound?.display_name || '—'}</strong><span>{highlights.bestRound ? `${highlights.bestRound.points} pts · ${highlights.bestRound.round.name}` : ''}</span></div>
              </div>
              <div className="standings-v3-highlight-item">
                <span className="standings-v3-highlight-icon"><NavIcon name="podium" size={18} /></span>
                <div><small>Mais vencedores</small><strong>{highlights.winnerLeader?.display_name || '—'}</strong><span>{highlights.winnerLeader ? `${highlights.winnerLeader.winners} acertos` : ''}</span></div>
              </div>
            </section>
          )}

          {mode === 'round' && selectedRound && (
            <section className="standings-v3-round-context">
              <div><small>Rodada selecionada</small><strong>{selectedRound.name}</strong><span>{roundDates(selectedRound)} · {selectedRound.stage}</span></div>
              <div><small>Jogos finalizados</small><strong>{selectedRound.matches.filter(hasResult).length}/{selectedRound.matches.length}</strong></div>
              <div><small>Sua posição</small><strong>{currentRow ? `${currentRow.rank}º` : '—'}</strong><span>{currentRow ? `${currentRow.points} pts` : ''}</span></div>
            </section>
          )}

          <section className="standings-v3-list-section">
            <div className="standings-v3-list-heading">
              <div>
                <span>{mode === 'general' ? 'Classificação geral' : 'Classificação da rodada'}</span>
                <p>Critérios: pontos, placares exatos e vencedores.</p>
              </div>
            </div>

            <div className="standings-v3-table" role="table" aria-label={mode === 'general' ? 'Classificação geral' : 'Classificação da rodada'}>
              <div className="standings-v3-table-head" role="row">
                <span>Pos.</span>
                <span>Jogador</span>
                <span>Pontos</span>
                <span>Exatos</span>
                <span>Vencedores</span>
              </div>

              <div className="standings-v3-table-body">
                {displayRows.map((row) => {
                  const tone = row.rank === 1 ? 'gold' : row.rank === 2 ? 'silver' : row.rank === 3 ? 'bronze' : 'neutral'
                  return (
                    <div className={`standings-v3-row rank-${row.rank} tone-${tone} ${row.id === user.id ? 'is-user' : ''}`} role="row" key={row.id}>
                      <span className={`standings-v3-rank tone-${tone}`}>{row.rank}</span>
                      <div className="standings-v3-player">
                        <UserAvatar profile={row} size="small" />
                        <div>
                          <div className="standings-v3-player-name"><strong>{row.display_name}</strong>{row.id === user.id && <em>VOCÊ</em>}</div>
                          <small>{row.exact} {row.exact === 1 ? 'exato' : 'exatos'} · {row.winners} {row.winners === 1 ? 'vencedor' : 'vencedores'}</small>
                        </div>
                      </div>
                      <div className="standings-v3-points"><strong>{row.points}</strong><span>pts</span></div>
                      <span className="standings-v3-exact">{row.exact}</span>
                      <span className="standings-v3-winners">{row.winners}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <div className="standings-v3-tiebreak">
            <span className="standings-v3-info-icon">i</span>
            <div><strong>Desempate</strong><p>Pontos → Placares exatos → Vencedores acertados. Se todos forem iguais, os participantes permanecem empatados.</p></div>
          </div>
        </>
      )}
    </div>
  )
}
