import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import Loading from '../components/Loading'
import TrophyIcon from '../components/TrophyIcon'
import UserAvatar from '../components/UserAvatar'
import { supabase } from '../lib/supabase'

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function formatSeasonCount(value) {
  return `${value} ${value === 1 ? 'temporada' : 'temporadas'} de história`
}

export default function PodiumPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [entries, setEntries] = useState([])
  const [profiles, setProfiles] = useState([])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [{ data: podiumData, error: podiumError }, { data: profileData, error: profileError }] = await Promise.all([
          supabase.from('podium_champions').select('*').order('season_sort', { ascending: false }).order('winner_order', { ascending: true }),
          supabase.from('profiles').select('*').order('display_name'),
        ])
        if (podiumError) throw podiumError
        if (profileError) throw profileError
        if (!active) return
        setEntries(podiumData || [])
        setProfiles(profileData || [])
      } catch (loadError) {
        if (active) setError(loadError.message || 'Não foi possível carregar o pódio.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const grouped = useMemo(() => {
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
    const profileByName = new Map(profiles.map((profile) => [normalize(profile.display_name), profile]))

    const resolveProfile = (entry) => {
      const direct = profileById.get(entry.user_id) || profileByName.get(normalize(entry.winner_name))
      if (direct) return direct
      const winnerName = normalize(entry.winner_name)
      const firstName = winnerName.split(' ')[0]
      const firstNameMatches = profiles.filter((profile) => normalize(profile.display_name).split(' ')[0] === firstName)
      return firstNameMatches.length === 1 ? firstNameMatches[0] : { display_name: entry.winner_name }
    }

    const groups = new Map()
    entries.forEach((entry) => {
      const profile = resolveProfile(entry)
      if (!groups.has(entry.season_label)) {
        groups.set(entry.season_label, {
          season: entry.season_label,
          sort: entry.season_sort,
          winners: [],
        })
      }
      groups.get(entry.season_label).winners.push({ ...entry, profile })
    })

    return [...groups.values()].sort((a, b) => b.sort - a.sort)
  }, [entries, profiles])

  if (loading) return <Loading label="Carregando campeões..." />

  return (
    <div className="page-wrap podium-premium-page sports-surface">
      <section className="podium-history-summary">
        <div className="podium-history-summary-copy">
          <span className="podium-summary-eyebrow">Galeria de campeões</span>
          <h2>{formatSeasonCount(grouped.length)}</h2>
          <p>Vitórias solo e títulos divididos ficam registrados lado a lado.</p>
        </div>
        <div className="podium-history-summary-mark" aria-hidden="true">
          <div className="podium-history-summary-ring">
            <TrophyIcon size={68} />
          </div>
        </div>
      </section>

      {error && <div className="form-error">{error}</div>}

      {!grouped.length ? (
        <EmptyState title="Pódio vazio" text="Ainda não existem campeões cadastrados." />
      ) : (
        <section className="podium-season-gallery" aria-label="Histórico de campeões">
          {grouped.map((group) => {
            const sharedTitle = group.winners.length > 1
            return (
              <article className="podium-season-showcase" key={group.season}>
                <header className="podium-season-showcase-head">
                  <div className="podium-season-headline">
                    <span>Champions League</span>
                    <h2>{group.season}</h2>
                  </div>
                  <div className="podium-season-status">
                    <TrophyIcon size={18} />
                    <strong>{sharedTitle ? 'Campeões' : 'Campeão'}</strong>
                  </div>
                </header>

                <div className={`podium-season-winners ${sharedTitle ? 'is-shared' : 'is-single'}`}>
                  {group.winners.map((winner) => (
                    <article className="podium-winner-panel" key={winner.id}>
                      <div className="podium-winner-panel-avatar">
                        <UserAvatar profile={winner.profile} size="xl" />
                      </div>
                      <div className="podium-winner-panel-body">
                        <span>{sharedTitle ? 'Título compartilhado' : '1º lugar'}</span>
                        <strong>{winner.winner_name}</strong>
                        <small>Campeão {group.season}</small>
                      </div>
                      <div className="podium-winner-panel-glow" aria-hidden="true" />
                    </article>
                  ))}
                </div>
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}
