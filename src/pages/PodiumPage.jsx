import { useCallback, useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import TrophyIcon from '../components/TrophyIcon'
import UserAvatar from '../components/UserAvatar'
import { useParticipantProfile } from '../context/ParticipantProfileContext'
import { groupPodiumSeasons } from '../lib/podium'
import { supabase } from '../lib/supabase'
import '../styles/podium-gallery.css'

function ChampionPortrait({ winner, size = 'large', onOpenProfile }) {
  const profile = winner.profile || { display_name: winner.winner_name }
  const portrait = <UserAvatar profile={profile} size={size === 'large' ? 'xl' : 'large'} />
  if (winner.profile?.id) {
    return <button type="button" className={`podium-v2-portrait size-${size} is-clickable`} onClick={() => onOpenProfile?.(winner.profile)} aria-label={`Abrir perfil de ${winner.winner_name}`}>{portrait}</button>
  }
  return (
    <div className={`podium-v2-portrait size-${size}`}>{portrait}</div>
  )
}

function PodiumHeader() {
  return (
    <header className="podium-v2-header">
      <div className="podium-v2-header-copy">
        <span>CHAMPIONS LEAGUE</span>
        <h1>Pódio</h1>
      </div>
    </header>
  )
}

function PodiumLoading() {
  return (
    <div className="page-wrap podium-v2-page">
      <PodiumHeader />
      <div className="podium-v2-feature-skeleton" aria-label="Carregando campeões" />
      <div className="podium-v2-history-skeleton"><i /><i /><i /></div>
    </div>
  )
}

export default function PodiumPage() {
  const participantProfile = useParticipantProfile()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [entries, setEntries] = useState([])
  const [profiles, setProfiles] = useState([])
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [{ data: podiumData, error: podiumError }, { data: profileData, error: profileError }] = await Promise.all([
        supabase.from('podium_champions').select('*').order('season_sort', { ascending: false }).order('winner_order', { ascending: true }),
        supabase.from('profiles').select('id, display_name, avatar_path').order('display_name'),
      ])
      if (podiumError) throw podiumError
      if (profileError) throw profileError
      setEntries(podiumData || [])
      setProfiles(profileData || [])
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar o histórico de campeões.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, reloadKey])

  const grouped = useMemo(() => {
    return groupPodiumSeasons(entries, profiles)
  }, [entries, profiles])

  if (loading) return <PodiumLoading />

  const featured = grouped[0] || null
  const previousSeasons = grouped.slice(1)
  const shared = (group) => group.winners.length > 1
  const openChampionProfile = (winner) => participantProfile?.openParticipant?.(winner.profile)
  const winnerName = (winner, className) => winner.profile?.id
    ? <button type="button" className={`${className} podium-v2-linked-name`} onClick={() => openChampionProfile(winner)}>{winner.winner_name}</button>
    : <strong className={className}>{winner.winner_name}</strong>

  return (
    <div className="page-wrap podium-v2-page">
      <PodiumHeader />

      {error && (
        <div className="podium-v2-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setReloadKey((current) => current + 1)}>Tentar novamente</button>
        </div>
      )}

      {error ? null : !grouped.length ? (
        <div className="podium-v2-empty"><EmptyState title="Ainda não há campeões registrados" text="Quando uma temporada tiver um campeão oficial, ele aparecerá nesta galeria." /></div>
      ) : (
        <>
          <section className={`podium-v2-feature ${featured.winners.length === 1 ? 'is-single' : featured.winners.length === 2 ? 'is-double' : 'is-multiple'}`} aria-labelledby="podium-feature-title">
            <div className="podium-v2-feature-topline">
              <div className="podium-v2-feature-season">
                <span>ÚLTIMA TEMPORADA COM CAMPEÃO</span>
                <strong>{featured.season}</strong>
              </div>
              <span className="podium-v2-title-mark"><TrophyIcon size={16} />{shared(featured) ? 'Título compartilhado' : 'Campeão da temporada'}</span>
            </div>
            <div className="podium-v2-feature-heading">
              <h2 id="podium-feature-title">Campeões da temporada</h2>
            </div>
            <div className={`podium-v2-feature-winners${featured.winners.length === 2 ? ' is-double' : ''}`}>
              {featured.winners.map((winner, index) => (
                <div className="podium-v2-feature-winner" key={winner.id}>
                  <ChampionPortrait winner={winner} onOpenProfile={openChampionProfile} />
                  <div className="podium-v2-feature-name">
                    {winnerName(winner, '')}
                  </div>
                  {featured.winners.length === 2 && index === 0 && <span className="podium-v2-joint-mark" aria-label="Título compartilhado"><TrophyIcon size={18} /></span>}
                </div>
              ))}
            </div>
          </section>

          <section className="podium-v2-history" aria-labelledby="podium-history-title">
            <header className="podium-v2-history-heading">
              <div><span>HISTÓRIA DA COMPETIÇÃO</span><h2 id="podium-history-title">Temporadas anteriores</h2></div>
              <span className="podium-v2-season-count">{grouped.length} {grouped.length === 1 ? 'temporada registrada' : 'temporadas registradas'}</span>
            </header>
            {previousSeasons.length ? (
              <div className="podium-v2-history-list">
                {previousSeasons.map((group) => (
                  <article className="podium-v2-history-row" key={group.key}>
                    <h3>{group.season}</h3>
                    <div className="podium-v2-history-winners">
                      {group.winners.map((winner, index) => (
                        <div className="podium-v2-history-winner" key={winner.id}>
                          <ChampionPortrait winner={winner} size="small" onOpenProfile={openChampionProfile} />
                          {winnerName(winner, '')}
                          {index < group.winners.length - 1 && <span className="podium-v2-plus" aria-hidden="true">+</span>}
                        </div>
                      ))}
                    </div>
                    <span className={`podium-v2-history-status${shared(group) ? ' is-shared' : ''}`}>
                      <TrophyIcon size={14} />{shared(group) ? 'Compartilhado' : 'Campeão'}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="podium-v2-history-empty">Esta é a primeira temporada com campeão registrado.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
