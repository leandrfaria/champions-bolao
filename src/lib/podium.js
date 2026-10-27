function seasonIdentity(entry) {
  const label = String(entry?.season_label || '').trim()
  const sort = entry?.season_sort
  return sort != null ? `sort:${sort}` : `label:${label.toLocaleLowerCase('pt-BR')}`
}

/**
 * Counts official titles by distinct season. Shared titles grant one full
 * title to each explicitly linked profile; unlinked historical names are
 * intentionally not guessed or matched by display name.
 */
export function countTitlesByProfile(entries = []) {
  const seasonsByProfile = new Map()

  entries.forEach((entry) => {
    if (!entry?.user_id) return
    const season = seasonIdentity(entry)
    if (!seasonsByProfile.has(entry.user_id)) seasonsByProfile.set(entry.user_id, new Set())
    seasonsByProfile.get(entry.user_id).add(season)
  })

  return new Map([...seasonsByProfile].map(([profileId, seasons]) => [profileId, seasons.size]))
}

export function countTitlesForProfile(profileId, entries = []) {
  if (!profileId) return 0
  return countTitlesByProfile(entries).get(profileId) || 0
}

export function groupPodiumSeasons(entries = [], profiles = []) {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const groups = new Map()

  entries.forEach((entry) => {
    const key = seasonIdentity(entry)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        season: entry.season_label,
        sort: Number(entry.season_sort) || 0,
        winners: [],
      })
    }
    groups.get(key).winners.push({
      ...entry,
      profile: entry.user_id ? profileById.get(entry.user_id) || null : null,
    })
  })

  return [...groups.values()].sort((a, b) => b.sort - a.sort)
}
