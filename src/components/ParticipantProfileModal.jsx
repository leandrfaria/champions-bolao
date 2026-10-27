import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import TrophyIcon from './TrophyIcon'
import UserAvatar, { getAvatarUrl } from './UserAvatar'
import { acquirePageScrollLock } from '../lib/pageScrollLock'
import { countTitlesForProfile } from '../lib/podium'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction } from '../lib/utils'
import '../styles/participant-profile-titles.css'

function sortStats(a, b) {
  return b.points - a.points || b.exact - a.exact || b.winners - a.winners || a.display_name.localeCompare(b.display_name)
}

function withRank(rows) {
  let rank = 0
  return rows.map((row, index) => {
    const previous = rows[index - 1]
    const tied = previous && row.points === previous.points && row.exact === previous.exact && row.winners === previous.winners
    if (index === 0) rank = 1
    else if (!tied) rank += 1
    return { ...row, rank }
  })
}

function buildStats(profile, finishedMatches, predictions) {
  const matchMap = new Map(finishedMatches.map((match) => [match.id, match]))
  const entries = predictions
    .filter((prediction) => prediction.user_id === profile.id)
    .map((prediction) => ({ prediction, match: matchMap.get(prediction.match_id) }))
    .filter((entry) => entry.match)
  const points = entries.reduce((sum, entry) => sum + calculatePoints(entry.prediction, entry.match), 0)
  const exact = entries.filter((entry) => isExactPrediction(entry.prediction, entry.match)).length
  const winners = entries.filter((entry) => didPickWinner(entry.prediction, entry.match)).length
  const scored = entries.filter((entry) => calculatePoints(entry.prediction, entry.match) > 0).length
  return {
    ...profile,
    points,
    exact,
    winners,
    finishedPredictions: entries.length,
    accuracy: entries.length ? Math.round((scored / entries.length) * 100) : 0,
  }
}

function formatMetricPill(value, suffix = '') {
  if (value == null || value === '') return '—'
  return `${value}${suffix}`
}

function formatOrdinal(rank) {
  return rank ? `${rank}º` : '—'
}

function resolveProfileHighlight(stats, totalParticipants) {
  if (!stats?.rank) return 'Sem classificação ainda'
  if (stats.rank === 1) return 'Líder da temporada'
  if (stats.rank <= 3) return 'Top 3 da temporada'
  if (stats.rank <= 5) return 'Top 5 da temporada'
  if ((stats.accuracy || 0) >= 70) return 'Boa fase'
  if ((stats.winners || 0) >= Math.max(1, Math.floor((stats.finishedPredictions || 0) / 2))) return 'Na disputa'
  return totalParticipants && stats.rank <= Math.ceil(totalParticipants / 2) ? 'Segue competitivo' : 'Temporada em andamento'
}

function sortByKickoff(a, b) {
  return new Date(a?.kickoff_at || 0).getTime() - new Date(b?.kickoff_at || 0).getTime()
}

function ParticipantPerformanceChart({ rounds }) {
  const [activePoint, setActivePoint] = useState(null)
  const max = Math.max(3, ...rounds.map((item) => item.points || 0))
  const points = rounds.map((round, index) => {
    const x = rounds.length === 1 ? 200 : 24 + (index * 352) / (rounds.length - 1)
    const y = 112 - ((round.points || 0) / max) * 82
    return { ...round, x, y }
  })
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const selected = points.find((point) => point.id === activePoint)
  const tooltipX = selected ? Math.max(6, Math.min(304, selected.x - 48)) : 0
  const tooltipY = selected ? Math.max(2, selected.y - 40) : 0

  return (
    <div className="participant-profile-v3-chart" role="group" aria-label="Evolução dos pontos por rodada. Use Tab para consultar os valores.">
      <svg viewBox="0 0 400 148" preserveAspectRatio="xMidYMid meet" aria-label="Pontos conquistados em cada rodada">
        <defs>
          <linearGradient id="participant-profile-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#9a72f2" />
            <stop offset="100%" stopColor="#63c7ff" />
          </linearGradient>
        </defs>
        <path className="participant-profile-v3-chart-baseline" d="M 12 114 H 388" />
        {points.length > 1 && <path className="participant-profile-v3-chart-line" d={path} />}
        {points.map((point) => (
          <g
            key={point.id}
            className={`participant-profile-v3-chart-point${activePoint === point.id ? ' is-active' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${point.name}: ${point.points} ${point.points === 1 ? 'ponto' : 'pontos'}${point.isPartial ? ', rodada parcialmente apurada' : ''}`}
            onMouseEnter={() => setActivePoint(point.id)}
            onMouseLeave={() => setActivePoint(null)}
            onFocus={() => setActivePoint(point.id)}
            onBlur={() => setActivePoint(null)}
            onClick={() => setActivePoint((current) => current === point.id ? null : point.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setActivePoint((current) => current === point.id ? null : point.id)
              }
            }}
          >
            <circle className="participant-profile-v3-chart-hit" cx={point.x} cy={point.y} r="14" />
            <circle className={`participant-profile-v3-chart-dot${point.isPartial ? ' is-partial' : ''}`} cx={point.x} cy={point.y} r={activePoint === point.id ? 5 : 4} />
            <text className="participant-profile-v3-chart-label" x={point.x} y="137" textAnchor="middle">R{point.orderLabel}</text>
          </g>
        ))}
        {selected && (
          <g className="participant-profile-v3-chart-tooltip" transform={`translate(${tooltipX} ${tooltipY})`} aria-hidden="true">
            <rect width="96" height="25" rx="7" />
            <text x="48" y="16" textAnchor="middle">R{selected.orderLabel} · {selected.points} pts{selected.isPartial ? ' *' : ''}</text>
          </g>
        )}
      </svg>
      {selected?.isPartial && <span className="participant-profile-v3-chart-note">* Rodada parcial</span>}
    </div>
  )
}

function MetricIcon({ name }) {
  const icons = {
    star: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.1 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" fill="currentColor" opacity=".22" />
      </svg>
    ),
    target: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    ),
    trophy: <TrophyIcon size={22} />,
    bars: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20h16" />
        <path d="M7 20v-7" />
        <path d="M12 20V8" />
        <path d="M17 20V4" />
      </svg>
    ),
    list: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 6h10M8 12h10M8 18h10" />
        <circle cx="5" cy="6" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="5" cy="18" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
    bolt: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 2 5 13h5l-1 9 8-11h-5l1-9Z" fill="currentColor" opacity=".18" />
      </svg>
    ),
    users: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 20a5 5 0 0 0-10 0" />
        <circle cx="12" cy="9" r="3.2" />
        <path d="M21 19a4 4 0 0 0-3.4-3.9M3 19a4 4 0 0 1 3.4-3.9" />
      </svg>
    ),
    crown: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m4 17 1.6-9L12 13l6.4-5 1.6 9H4Z" />
        <path d="M8 17v3h8v-3" />
        <circle cx="5.6" cy="8" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
        <circle cx="18.4" cy="8" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    photo: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7h4l1.3-2h5.4L16 7h4v11H4V7Z" />
        <circle cx="12" cy="12.2" r="3.4" />
      </svg>
    ),
  }

  return <span className="participant-profile-icon">{icons[name] || icons.star}</span>
}

export default function ParticipantProfileModal({ profile, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [photoOpen, setPhotoOpen] = useState(false)
  const photoTriggerRef = useRef(null)
  const photoCloseRef = useRef(null)
  const photoWasOpenRef = useRef(false)
  const profileDialogRef = useRef(null)
  const profileCloseRef = useRef(null)
  const photoViewerRef = useRef(null)

  useLayoutEffect(() => {
    const isMobileViewport = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760
    const previouslyFocused = document.activeElement
    const releaseScrollLock = acquirePageScrollLock({
      freezePosition: isMobileViewport,
      getAllowedElements: () => [profileDialogRef.current, photoViewerRef.current],
    })
    profileCloseRef.current?.focus({ preventScroll: true })
    return () => {
      releaseScrollLock()
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (photoOpen) setPhotoOpen(false)
        else onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [photoOpen, onClose])

  useEffect(() => {
    if (photoOpen) {
      photoWasOpenRef.current = true
      photoCloseRef.current?.focus()
    } else if (photoWasOpenRef.current) {
      photoWasOpenRef.current = false
      photoTriggerRef.current?.focus()
    }
  }, [photoOpen])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [{ data: targetProfile, error: targetError }, { data: profiles, error: profilesError }, { data: season, error: seasonError }, { data: podiumEntries, error: podiumError }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', profile.id).maybeSingle(),
          supabase.from('profiles').select('*').order('display_name'),
          supabase.from('seasons').select('*').eq('is_active', true).maybeSingle(),
          supabase.from('podium_champions').select('season_label, season_sort, winner_name, user_id'),
        ])
        if (targetError) throw targetError
        if (profilesError) throw profilesError
        if (seasonError) throw seasonError
        if (podiumError) throw podiumError
        const resolvedProfile = targetProfile || profile
        const titleCount = countTitlesForProfile(resolvedProfile.id, podiumEntries || [])

        if (season) {
          const { data: roundData, error: roundError } = await supabase
            .from('rounds')
            .select('id, name, sort_order, matches(*)')
            .eq('season_id', season.id)
            .order('sort_order')
          if (roundError) throw roundError

          const rounds = roundData || []
          const allMatches = rounds.flatMap((round) => (round.matches || []).map((match) => ({ ...match, round_id: round.id, round_name: round.name, round_sort_order: round.sort_order })))
          const finishedMatches = allMatches.filter(hasResult)

          const [predictionResult, presenceResult] = await Promise.all([
            finishedMatches.length
              ? supabase.from('predictions').select('*').in('match_id', finishedMatches.map((match) => match.id))
              : Promise.resolve({ data: [], error: null }),
            allMatches.length
              ? supabase.rpc('get_prediction_presence', { p_match_ids: allMatches.map((match) => match.id) })
              : Promise.resolve({ data: [], error: null }),
          ])
          if (predictionResult.error) throw predictionResult.error
          if (presenceResult.error) throw presenceResult.error
          const predictions = predictionResult.data || []
          const submittedPredictions = (presenceResult.data || []).filter((item) => item.user_id === resolvedProfile.id && item.has_predicted).length

          const ranked = withRank((profiles || []).map((item) => buildStats(item, finishedMatches, predictions)).sort(sortStats))
          const currentBase = ranked.find((item) => item.id === resolvedProfile.id) || buildStats(resolvedProfile, finishedMatches, predictions)
          const current = finishedMatches.length ? currentBase : { ...currentBase, rank: null }
          current.sentPredictions = submittedPredictions
          current.titleCount = titleCount
          const predictionMap = new Map(predictions.filter((prediction) => prediction.user_id === resolvedProfile.id).map((prediction) => [prediction.match_id, prediction]))

          const roundPerformance = rounds.map((round, index) => {
            const roundMatches = (round.matches || []).slice().sort(sortByKickoff)
            const matches = roundMatches.filter(hasResult)
            const entries = matches.map((match) => {
              const prediction = predictionMap.get(match.id)
              if (!prediction) return null
              return { match, prediction, points: calculatePoints(prediction, match) }
            }).filter(Boolean)
            const points = entries.reduce((sum, entry) => sum + entry.points, 0)
            const exact = entries.filter((entry) => isExactPrediction(entry.prediction, entry.match)).length
            const winners = entries.filter((entry) => didPickWinner(entry.prediction, entry.match)).length
            return {
              id: round.id,
              index: index + 1,
              orderLabel: String(round.sort_order || index + 1),
              name: round.name,
              points,
              exact,
              winners,
              matches: entries.length,
              totalMatches: roundMatches.length,
              settledMatches: matches.length,
              isPartial: matches.length > 0 && matches.length < roundMatches.length,
            }
          })

          const bestRound = roundPerformance
            .filter((item) => item.matches > 0)
            .sort((a, b) => b.points - a.points || b.exact - a.exact || a.index - b.index)[0] || null

          if (active) {
            setDetails({
              profile: resolvedProfile,
              season,
              stats: current,
              bestRound,
              totalParticipants: ranked.length,
              roundPerformance,
            })
          }
        } else if (active) {
          setDetails({
            profile: resolvedProfile,
            season: null,
            stats: { ...resolvedProfile, points: 0, exact: 0, winners: 0, rank: null, finishedPredictions: 0, sentPredictions: 0, accuracy: 0, titleCount },
            bestRound: null,
            totalParticipants: (profiles || []).length,
            roundPerformance: [],
          })
        }

        if (resolvedProfile.avatar_path) {
          const url = await getAvatarUrl(resolvedProfile.avatar_path).catch(() => null)
          if (active) setPhotoUrl(url)
        } else if (active) {
          setPhotoUrl(null)
        }
      } catch (err) {
        if (active) setError(err.message || 'Não foi possível carregar o perfil.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [profile.id])

  const target = details?.profile || profile
  const stats = details?.stats
  const rankingLabel = useMemo(() => formatOrdinal(stats?.rank), [stats?.rank])
  const chartSeries = (details?.roundPerformance || []).filter((item) => item.matches > 0)
  const rankTone = stats?.rank === 1 ? 'gold' : stats?.rank === 2 ? 'silver' : stats?.rank === 3 ? 'bronze' : 'standard'

  const modalContent = (
    <>
      <div className="participant-profile-backdrop participant-profile-backdrop-v3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
        <section ref={profileDialogRef} className="participant-profile-v3" role="dialog" aria-modal="true" aria-label={`Perfil de ${target.display_name || 'participante'}`}>
          <button ref={profileCloseRef} className="participant-profile-v3-close" type="button" onClick={onClose} aria-label="Fechar perfil">×</button>

          <header className="participant-profile-v3-header">
            <button
              ref={photoTriggerRef}
              type="button"
              className="participant-profile-v3-avatar"
              onClick={() => photoUrl && setPhotoOpen(true)}
              disabled={!photoUrl}
              aria-label={photoUrl ? 'Abrir foto do participante' : 'Participante sem foto cadastrada'}
            >
              <UserAvatar profile={target} size="profile" interactive={false} />
              {photoUrl && <span className="participant-profile-v3-photo-overlay"><MetricIcon name="photo" /> Ver foto</span>}
            </button>

            <div className="participant-profile-v3-identity">
              <span className="participant-profile-v3-kicker">Perfil do participante</span>
              <h2>{target.display_name || 'Participante'}</h2>
              {details && <div className={`participant-profile-title-count${details.stats?.titleCount ? ' has-titles' : ''}`} aria-label={details.stats?.titleCount ? `${details.stats.titleCount} ${details.stats.titleCount === 1 ? 'título' : 'títulos'} históricos` : 'Nenhum título histórico'}>
                {details.stats?.titleCount > 0 && <TrophyIcon size={14} />}
                <strong>{details.stats?.titleCount ? `${details.stats.titleCount} ${details.stats.titleCount === 1 ? 'título' : 'títulos'}` : 'Nenhum título'}</strong>
              </div>}
              <p>Jogador{details?.season ? ` · ${details.season.name}` : ''}</p>
            </div>

            <div className={`participant-profile-v3-rank ${rankTone}`} aria-label={`Posição oficial: ${rankingLabel}`}>
              <strong>{rankingLabel}</strong>
            </div>
          </header>

          {loading ? (
            <div className="participant-profile-loading"><span /><span /><span /></div>
          ) : error ? (
            <div className="form-error participant-profile-error">{error}</div>
          ) : (
            <div className="participant-profile-v3-body">
              <section className="participant-profile-v3-season" aria-label="Temporada atual">
                <div className="participant-profile-v3-section-label">Temporada atual</div>
                <div className="participant-profile-v3-metrics">
                  <div className="participant-profile-v3-metric">
                    <span>Palpites enviados</span>
                    <strong>{stats?.sentPredictions ?? 0}</strong>
                  </div>
                  <div className="participant-profile-v3-metric">
                    <span>Pontos</span>
                    <strong>{stats?.points ?? 0}</strong>
                  </div>
                  <div className="participant-profile-v3-metric">
                    <span>Placares exatos</span>
                    <strong>{stats?.exact ?? 0}</strong>
                  </div>
                  <div className="participant-profile-v3-metric">
                    <span>Vencedores</span>
                    <strong>{stats?.winners ?? 0}</strong>
                  </div>
                  <div className="participant-profile-v3-metric">
                    <span>Taxa de acerto</span>
                    <strong>{stats?.accuracy ?? 0}%</strong>
                  </div>
                </div>
              </section>

              <div className="participant-profile-v3-lower participant-profile-v3-lower-wide-chart">
                <section className="participant-profile-v3-best">
                  <div className="participant-profile-v3-section-label">Melhor rodada</div>
                  {details?.bestRound ? (
                    <div className="participant-profile-v3-best-inline">
                      <strong>{details.bestRound.points} pts</strong>
                      <span>{details.bestRound.name}</span>
                      <small>{details.bestRound.exact} {details.bestRound.exact === 1 ? 'placar exato' : 'placares exatos'} · {details.bestRound.winners} {details.bestRound.winners === 1 ? 'vencedor' : 'vencedores'}</small>
                    </div>
                  ) : (
                    <p className="participant-profile-v3-empty-copy">Sem rodada pontuada ainda.</p>
                  )}
                </section>

                <section className="participant-profile-v3-chart-panel participant-profile-v3-chart-panel-wide">
                  <div className="participant-profile-v3-section-label">Evolução por rodada</div>
                  {chartSeries.length ? (
                    <ParticipantPerformanceChart rounds={chartSeries} />
                  ) : (
                    <p className="participant-profile-v3-empty-copy">Sem rodadas finalizadas ainda.</p>
                  )}
                </section>
              </div>
            </div>
          )}
        </section>
      </div>

    </>
  )

  if (typeof document === 'undefined') return modalContent
  return (
    <>
      {createPortal(modalContent, document.body)}
      {photoOpen && photoUrl && createPortal(
        <div ref={photoViewerRef} className="participant-photo-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhotoOpen(false) }}>
          <button ref={photoCloseRef} type="button" onClick={() => setPhotoOpen(false)} aria-label="Fechar foto">×</button>
          <figure>
            <img src={photoUrl} alt={`Foto de ${target.display_name || 'participante'}`} />
            <figcaption>{target.display_name}</figcaption>
          </figure>
        </div>,
        document.body,
      )}
    </>
  )
}
