import { useEffect, useMemo, useState } from 'react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import UserAvatar from '../components/UserAvatar'
import TrophyIcon from '../components/TrophyIcon'
import AccessibleSelect from '../components/AccessibleSelect'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction } from '../lib/utils'
import '../styles/leaderboard.css'

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

function rankTone(rank) {
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'neutral'
}

function RaceCard({ row, leaderTieCount, userId, mode, leader = false }) {
  const tone = rankTone(row.rank)
  const isLeader = row.rank === 1
  return (
    <article className={`standings-v4-podium-entry tone-${tone}${leader ? ' is-leader' : ''}${row.id === userId ? ' is-user' : ''}`}>
      <div className="standings-v4-race-rank">
        {leader && <TrophyIcon size={16} />}
        <strong>{row.rank}º</strong>
      </div>
      <UserAvatar profile={row} size="podium" />
      <div className="standings-v4-race-player">
        <span>{isLeader && leaderTieCount > 1 ? 'Liderança compartilhada' : leader ? (mode === 'general' ? 'Líder da temporada' : 'Líder da rodada') : `${row.rank}º lugar`}</span>
        <div><strong>{row.display_name}</strong>{row.id === userId && <em>Você</em>}</div>
        <div className="standings-v4-race-stats"><span><strong>{row.exact}</strong> exatos</span><span><strong>{row.winners}</strong> vencedores</span></div>
      </div>
      <div className="standings-v4-race-points"><strong>{row.points}</strong><span>pts</span></div>
    </article>
  )
}

function Podium({ rows, leaderTieCount, userId, mode }) {
  const [leader, ...chasers] = rows
  if (!leader) return null
  return (
    <div className="standings-v4-podium" data-count={rows.length}>
      <RaceCard row={leader} leader leaderTieCount={leaderTieCount} userId={userId} mode={mode} />
      {chasers.length > 0 && <div className="standings-v4-podium-chasers">
        {chasers.map((row) => <RaceCard key={row.id} row={row} leaderTieCount={leaderTieCount} userId={userId} mode={mode} />)}
      </div>}
    </div>
  )
}

function SummaryMetric({ label, value, detail, title }) {
  return <div className="standings-v4-summary-metric" title={title} aria-label={title}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>
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
    let cancelled = false
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
        if (cancelled) return
        const list = seasonData || []
        setProfiles(profileData || [])
        setSeasons(list)
        setSeasonId(list.find((item) => item.is_active)?.id || list[0]?.id || '')
      } catch (err) {
        if (!cancelled) setError(err.message || 'Não foi possível carregar a classificação.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!seasonId) {
      setRounds([])
      setPredictions([])
      setRoundId('')
      return undefined
    }
    let cancelled = false
    async function loadSeason() {
      setSeasonLoading(true)
      setError('')
      setRounds([])
      setPredictions([])
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
  const seasonAveragePerRound = useMemo(() => {
    const completedRoundAverages = rounds.flatMap((round) => {
      const roundMatches = round.matches || []
      if (!roundMatches.length || !roundMatches.every(hasResult)) return []
      const rows = roundMetrics.get(round.id) || []
      const participatingRows = rows.filter((row) => row.played > 0)
      if (!participatingRows.length) return []
      const roundPoints = participatingRows.reduce((total, row) => total + row.points, 0)
      return [roundPoints / participatingRows.length]
    })
    if (!completedRoundAverages.length) return '—'
    const mean = completedRoundAverages.reduce((total, value) => total + value, 0) / completedRoundAverages.length
    return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(mean)} pts`
  }, [rounds, roundMetrics])

  const displayRows = mode === 'round' ? (roundMetrics.get(roundId) || []) : seasonRows
  const topThree = displayRows.slice(0, 3)
  const leader = displayRows[0] || null
  const currentRow = displayRows.find((item) => item.id === user?.id) || null
  const selectedRoundFinishedCount = selectedRound?.matches.filter(hasResult).length || 0
  const leaderTieCount = displayRows.filter((row) => row.rank === 1).length
  const seasonTitle = season?.name || 'Champions League'
  const roundOptions = rounds.map((round) => ({ value: round.id, label: round.name }))
  const seasonOptions = seasons.map((item) => ({ value: item.id, label: `${item.name}${item.is_active ? ' · atual' : ''}` }))

  const highlights = useMemo(() => {
    if (!seasonRows.length) return null
    const exactLeader = [...seasonRows].sort((a, b) => b.exact - a.exact || sortStats(a, b))[0]
    const winnerLeader = [...seasonRows].sort((a, b) => b.winners - a.winners || sortStats(a, b))[0]
    return { exactLeader, winnerLeader }
  }, [seasonRows])

  if (loading) return <Loading label="Carregando classificação..." />

  return (
    <main className="page-wrap standings-v4-page sports-surface">
      <header className="standings-v4-header">
        <div className="standings-v4-heading">
          <span className="standings-v4-eyebrow">{seasonTitle.toUpperCase()}</span>
          <h1>Classificação</h1>
        </div>
        {seasons.length > 0 ? <div className="standings-v4-season-select"><span>Temporada</span><AccessibleSelect value={seasonId} options={seasonOptions} onChange={setSeasonId} ariaLabel="Selecionar temporada" /></div> : null}
      </header>

      <nav className="standings-v4-controls" aria-label="Visão da classificação">
        <div className="standings-v4-tabs" role="tablist" aria-label="Tipo de classificação">
          <button type="button" role="tab" aria-selected={mode === 'general'} className={mode === 'general' ? 'active' : ''} onClick={() => setMode('general')}>Geral</button>
          <button type="button" role="tab" aria-selected={mode === 'round'} className={mode === 'round' ? 'active' : ''} onClick={() => setMode('round')}>Por rodada</button>
        </div>
        {(mode === 'round' && rounds.length > 0) ? <div className="standings-v4-round-select"><span>Rodada</span><AccessibleSelect value={roundId} options={roundOptions} onChange={setRoundId} ariaLabel="Selecionar rodada" /></div> : null}
      </nav>

      {error && <div className="form-error" role="alert">{error}</div>}
      {!seasons.length ? (
        <EmptyState title="Nenhuma temporada" text="Crie uma temporada para começar a disputa pela classificação." />
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
          {mode === 'general' ? (
            <section className="standings-v4-overview" aria-label="Resumo da classificação geral">
              <div className="standings-v4-overview-heading"><span>Corrida pelo título</span><strong>Geral da temporada</strong></div>
              <Podium rows={topThree} leaderTieCount={leaderTieCount} userId={user?.id} mode={mode} />
              <div className="standings-v4-summary-strip" aria-label="Estatísticas da temporada">
                <SummaryMetric label="Sua posição" value={currentRow ? `${currentRow.rank}º` : '—'} />
                <SummaryMetric label="Distância para o líder" value={currentRow && leader ? `${Math.max(0, leader.points - currentRow.points)} pts` : '—'} />
                <SummaryMetric label="Participantes" value={seasonRows.length} />
                <SummaryMetric label="Mais placares exatos" value={highlights?.exactLeader?.display_name || '—'} detail={highlights ? `${highlights.exactLeader.exact} ${highlights.exactLeader.exact === 1 ? 'placar exato' : 'placares exatos'}` : ''} />
                <SummaryMetric label="Mais vencedores" value={highlights?.winnerLeader?.display_name || '—'} detail={highlights ? `${highlights.winnerLeader.winners} acertos` : ''} />
                <SummaryMetric label="Média por jogador/rodada" value={seasonAveragePerRound} title="Média das pontuações médias por rodada concluída; entram apenas participantes com ao menos um palpite válido naquela rodada." detail="Somente rodadas concluídas" />
              </div>
            </section>
          ) : selectedRound && (
            <section className="standings-v4-round-overview" aria-label="Resumo da rodada selecionada">
              <div className="standings-v4-overview-heading"><span>Corrida pelo título</span><strong>Por rodada</strong></div>
              <div className="standings-v4-round-title"><div><span>Rodada selecionada</span><h2>{selectedRound.name}</h2><p>{selectedRound.stage || 'Fase da competição'} · {roundDates(selectedRound)}</p></div><span className="standings-v4-round-progress">{selectedRoundFinishedCount}<small>de {selectedRound.matches.length} jogos finalizados</small></span></div>
              <Podium rows={topThree} leaderTieCount={leaderTieCount} userId={user?.id} mode={mode} />
              <div className="standings-v4-summary-strip standings-v4-round-summary">
                <SummaryMetric label="Líder da rodada" value={leader?.display_name || '—'} detail={leader ? `${leader.points} pts` : 'Sem pontuação'} />
                <SummaryMetric label="Sua posição" value={currentRow ? `${currentRow.rank}º` : '—'} detail={currentRow ? `${currentRow.points} pts na rodada` : 'Sem pontuação'} />
                <SummaryMetric label="Distância para o líder" value={currentRow && leader ? `${Math.max(0, leader.points - currentRow.points)} pts` : '—'} />
              </div>
            </section>
          )}

          <section className="standings-v4-ranking" aria-labelledby="standings-v4-ranking-title">
            <div className="standings-v4-ranking-heading">
              <div><span>{mode === 'general' ? 'Temporada completa' : `Rodada · ${selectedRound?.name || ''}`}</span><h2 id="standings-v4-ranking-title">{mode === 'general' ? 'Classificação geral' : 'Ranking da rodada'}</h2></div>
              <p>{displayRows.length} {displayRows.length === 1 ? 'participante' : 'participantes'}</p>
            </div>
            <div className="standings-v4-table" role="table" aria-label={mode === 'general' ? 'Classificação geral' : `Classificação da rodada ${selectedRound?.name || ''}`}>
              <div className="standings-v4-table-head" role="row"><span role="columnheader">Posição</span><span role="columnheader">Jogador</span><span role="columnheader">Pontos</span><span role="columnheader">Placares exatos</span><span role="columnheader">Vencedores</span></div>
              <div className="standings-v4-table-body">
                {displayRows.map((row) => {
                  const tone = rankTone(row.rank)
                  return <div className={`standings-v4-row tone-${tone}${row.id === user?.id ? ' is-user' : ''}`} role="row" key={row.id}>
                    <span className={`standings-v4-rank tone-${tone}`} role="cell">{row.rank}<small>º</small></span>
                    <div className="standings-v4-player" role="cell"><UserAvatar profile={row} size="small" /><div className="standings-v4-player-copy"><strong>{row.display_name}</strong>{row.id === user?.id && <em>Você</em>}</div></div>
                    <div className="standings-v4-stat points" role="cell"><strong>{row.points}</strong><small>pts</small></div>
                    <div className="standings-v4-stat" role="cell"><strong>{row.exact}</strong><small>exatos</small></div>
                    <div className="standings-v4-stat" role="cell"><strong>{row.winners}</strong><small>vencedores</small></div>
                  </div>
                })}
              </div>
            </div>
          </section>

          <aside className="standings-v4-tiebreak"><span aria-hidden="true">i</span><p><strong>Critérios de desempate:</strong> pontos → placares exatos → vencedores acertados. Se os critérios forem iguais, os participantes compartilham a posição.</p></aside>
        </>
      )}
    </main>
  )
}
