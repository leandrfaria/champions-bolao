const FOTMOB_LOGO = (id) => `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`

const TEAM_ENTRIES = [
  { id: 'real-madrid', name: 'Real Madrid', logo: FOTMOB_LOGO(8633), aliases: ['real madrid', 'real madrid cf'] },
  { id: 'barcelona', name: 'Barcelona', logo: FOTMOB_LOGO(8634), aliases: ['barcelona', 'fc barcelona', 'barça', 'barca'] },
  { id: 'liverpool', name: 'Liverpool', logo: FOTMOB_LOGO(8650), aliases: ['liverpool', 'liverpool fc'] },
  { id: 'manchester-city', name: 'Manchester City', logo: FOTMOB_LOGO(8456), aliases: ['manchester city', 'man city', 'city'] },
  { id: 'inter', name: 'Inter de Milão', logo: FOTMOB_LOGO(8636), aliases: ['inter', 'internazionale', 'inter milan', 'inter de milão', 'inter de milao', 'fc internazionale'] },
  { id: 'bayern', name: 'Bayern de Munique', logo: FOTMOB_LOGO(9823), aliases: ['bayern', 'bayern munich', 'bayern münchen', 'bayern de munique', 'fc bayern'] },
  { id: 'arsenal', name: 'Arsenal', logo: FOTMOB_LOGO(9825), aliases: ['arsenal', 'arsenal fc'] },
  { id: 'psg', name: 'PSG', logo: FOTMOB_LOGO(9847), aliases: ['psg', 'paris saint-germain', 'paris saint germain', 'paris sg'] },
  { id: 'chelsea', name: 'Chelsea', logo: FOTMOB_LOGO(8455), aliases: ['chelsea', 'chelsea fc'] },
  { id: 'ajax', name: 'Ajax', logo: FOTMOB_LOGO(8593), aliases: ['ajax', 'afc ajax'] },
  { id: 'marseille', name: 'Marseille', logo: FOTMOB_LOGO(8592), aliases: ['marseille', 'olympique de marseille', 'olympique marseille', 'om'] },
  { id: 'juventus', name: 'Juventus', logo: FOTMOB_LOGO(9885), aliases: ['juventus', 'juventus fc', 'juve'] },
]

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}


export const TEAM_CATALOG = TEAM_ENTRIES.map(({ id, name, logo, aliases }) => ({ id, name, logo, aliases: [...aliases] }))

const aliasMap = new Map()
TEAM_ENTRIES.forEach((entry) => entry.aliases.forEach((alias) => aliasMap.set(normalize(alias), entry)))

export function getTeamLogo(team) {
  if (!team) return null
  if (typeof team === 'object') {
    const direct = team.logo || team.crest || team.image || team.badge || team.teamLogo || team.team_logo
    if (direct) return direct
    team = team.name || team.team || team.display_name || ''
  }
  return aliasMap.get(normalize(team))?.logo || null
}

export function getTeamSlug(team) {
  if (!team) return ''
  const value = typeof team === 'string' ? team : (team.name || team.team || '')
  return aliasMap.get(normalize(value))?.id || normalize(value).replace(/\s+/g, '-')
}

export function getTeamInitials(team) {
  const value = typeof team === 'string' ? team : (team?.name || team?.team || '')
  const words = String(value).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'FC'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words.at(-1)[0]}`.toUpperCase()
}
