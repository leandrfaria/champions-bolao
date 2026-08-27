import { useEffect, useMemo, useState } from 'react'
import TrophyIcon from './TrophyIcon'
import UserAvatar, { getAvatarUrl } from './UserAvatar'
import { supabase } from '../lib/supabase'
import { calculatePoints, didPickWinner, hasResult, isExactPrediction } from '../lib/utils'

function sortStats(a, b) {
  return b.points - a.points || b.exact - a.exact || b.winners - a.winners || a.display_name.localeCompare(b.display_name)
}

function withRank(rows) {
  let previous = null
  return rows.map((row, index) => {
    const tied = previous && row.points === previous.points && row.exact === previous.exact && row.winners === previous.winners
    const rank = tied ? previous.rank : index + 1
    const next = { ...row, rank }
    previous = next
    return next
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

export default function ParticipantProfileModal({ profile, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [photoOpen, setPhotoOpen] = useState(false)

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
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [{ data: targetProfile, error: targetError }, { data: profiles, error: profilesError }, { data: season, error: seasonError }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', profile.id).maybeSingle(),
          supabase.from('profiles').select('*').order('display_name'),
          supabase.from('seasons').select('*').eq('is_active', true).maybeSingle(),
        ])
        if (targetError) throw targetError
        if (profilesError) throw profilesError
        if (seasonError) throw seasonError
        const resolvedProfile = targetProfile || profile

        let rounds = []
        let predictions = []
        if (season) {
          const { data: roundData, error: roundError } = await supabase
            .from('rounds')
            .select('id, name, sort_order, matches(*)')
            .eq('season_id', season.id)
            .order('sort_order')
          if (roundError) throw roundError
          rounds = roundData || []
          const finishedMatches = rounds.flatMap((round) => (round.matches || []).map((match) => ({ ...match, round_id: round.id }))).filter(hasResult)
          if (finishedMatches.length) {
            const { data: predictionData, error: predictionError } = await supabase
              .from('predictions')
              .select('*')
              .in('match_id', finishedMatches.map((match) => match.id))
            if (predictionError) throw predictionError
            predictions = predictionData || []
          }

          const ranked = withRank((profiles || []).map((item) => buildStats(item, finishedMatches, predictions)).sort(sortStats))
          const currentBase = ranked.find((item) => item.id === resolvedProfile.id) || buildStats(resolvedProfile, finishedMatches, predictions)
          const current = finishedMatches.length ? currentBase : { ...currentBase, rank: null }
          let bestRound = null
          rounds.forEach((round) => {
            const matches = (round.matches || []).filter(hasResult)
            const stats = buildStats(resolvedProfile, matches, predictions)
            if (!bestRound || stats.points > bestRound.points || (stats.points === bestRound.points && stats.exact > bestRound.exact)) {
              bestRound = { name: round.name, points: stats.points, exact: stats.exact }
            }
          })

          if (active) setDetails({ profile: resolvedProfile, season, stats: current, bestRound, totalParticipants: ranked.length })
        } else if (active) {
          setDetails({ profile: resolvedProfile, season: null, stats: { ...resolvedProfile, points: 0, exact: 0, winners: 0, rank: null, finishedPredictions: 0, accuracy: 0 }, bestRound: null, totalParticipants: (profiles || []).length })
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
  const rankingLabel = useMemo(() => stats?.rank ? `${stats.rank}º` : '—', [stats?.rank])

  return (
    <>
      <div className="participant-profile-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
        <section className="participant-profile-modal" role="dialog" aria-modal="true" aria-label={`Perfil de ${target.display_name || 'participante'}`}>
          <button className="participant-profile-close" type="button" onClick={onClose} aria-label="Fechar perfil">×</button>

          <header className="participant-profile-hero">
            <button
              type="button"
              className="participant-profile-avatar-button"
              onClick={() => photoUrl && setPhotoOpen(true)}
              disabled={!photoUrl}
              aria-label={photoUrl ? 'Abrir foto do participante' : 'Participante sem foto cadastrada'}
            >
              <UserAvatar profile={target} size="profile" interactive={false} />
              {photoUrl && <span>Ver foto</span>}
            </button>
            <div>
              <span className="participant-profile-kicker">Perfil do participante</span>
              <h2>{target.display_name || 'Participante'}</h2>
              <p>{target.role === 'admin' ? 'Administrador · jogador' : 'Jogador'}{details?.season ? ` · ${details.season.name}` : ''}</p>
            </div>
            {stats?.rank && (
              <div className={`participant-profile-rank ${stats.rank === 1 ? 'leader' : ''}`}>
                {stats.rank === 1 && <TrophyIcon size={18} />}
                <span>Posição</span>
                <strong>{rankingLabel}</strong>
              </div>
            )}
          </header>

          {loading ? (
            <div className="participant-profile-loading"><span /><span /><span /></div>
          ) : error ? (
            <div className="form-error participant-profile-error">{error}</div>
          ) : (
            <>
              <div className="participant-profile-metrics">
                <div><span>Pontos</span><strong>{stats?.points ?? 0}<small> pts</small></strong></div>
                <div><span>Placares exatos</span><strong>{stats?.exact ?? 0}</strong></div>
                <div><span>Vencedores</span><strong>{stats?.winners ?? 0}</strong></div>
                <div><span>Taxa de acerto</span><strong>{stats?.accuracy ?? 0}<small>%</small></strong></div>
              </div>

              <div className="participant-profile-summary">
                <div>
                  <span>Palpites finalizados</span>
                  <strong>{stats?.finishedPredictions ?? 0}</strong>
                </div>
                <div>
                  <span>Melhor rodada</span>
                  <strong>{details?.bestRound?.points ? `${details.bestRound.points} pts` : '—'}</strong>
                  <small>{details?.bestRound?.points ? details.bestRound.name : 'Sem rodada pontuada'}</small>
                </div>
                <div>
                  <span>Classificação</span>
                  <strong>{stats?.rank ? `${stats.rank}º de ${details?.totalParticipants || 0}` : '—'}</strong>
                  <small>Critérios oficiais do bolão</small>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {photoOpen && photoUrl && (
        <div className="participant-photo-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhotoOpen(false) }}>
          <button type="button" onClick={() => setPhotoOpen(false)} aria-label="Fechar foto">×</button>
          <figure>
            <img src={photoUrl} alt={`Foto de ${target.display_name || 'participante'}`} />
            <figcaption>{target.display_name}</figcaption>
          </figure>
        </div>
      )}
    </>
  )
}
