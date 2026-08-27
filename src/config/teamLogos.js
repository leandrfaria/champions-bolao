const FOTMOB_LOGO = (id) => `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`

const TEAM_ENTRIES = [
  { id: 'real-madrid', name: 'Real Madrid', logo: FOTMOB_LOGO(8633), aliases: ['real madrid', 'real madrid cf'] },
  { id: 'barcelona', name: 'Barcelona', logo: FOTMOB_LOGO(8634), aliases: ['barcelona', 'fc barcelona', 'barça', 'barca'] },
  { id: 'atletico-madrid', name: 'Atlético de Madrid', logo: FOTMOB_LOGO(9906), aliases: ['atletico de madrid', 'atlético de madrid', 'atletico madrid', 'atlético madrid', 'atleti'] },
  { id: 'manchester-city', name: 'Manchester City', logo: FOTMOB_LOGO(8456), aliases: ['manchester city', 'man city', 'city'] },
  { id: 'arsenal', name: 'Arsenal', logo: FOTMOB_LOGO(9825), aliases: ['arsenal', 'arsenal fc'] },
  { id: 'liverpool', name: 'Liverpool', logo: FOTMOB_LOGO(8650), aliases: ['liverpool', 'liverpool fc'] },
  { id: 'bayern', name: 'Bayern de Munique', logo: FOTMOB_LOGO(9823), aliases: ['bayern', 'bayern munich', 'bayern münchen', 'bayern de munique', 'fc bayern'] },
  { id: 'inter', name: 'Inter de Milão', logo: FOTMOB_LOGO(8636), aliases: ['inter', 'internazionale', 'inter milan', 'inter de milão', 'inter de milao', 'fc internazionale'] },
  { id: 'psg', name: 'Paris Saint-Germain', logo: FOTMOB_LOGO(9847), aliases: ['psg', 'paris saint-germain', 'paris saint germain', 'paris sg'] },
  { id: 'borussia-dortmund', name: 'Borussia Dortmund', logo: FOTMOB_LOGO(9789), aliases: ['borussia dortmund', 'dortmund', 'bvb'] },
  { id: 'manchester-united', name: 'Manchester United', logo: FOTMOB_LOGO(10260), aliases: ['manchester united', 'man united', 'man utd', 'united'] },
  { id: 'aston-villa', name: 'Aston Villa', logo: FOTMOB_LOGO(10252), aliases: ['aston villa', 'villa'] },
  { id: 'roma', name: 'Roma', logo: FOTMOB_LOGO(8686), aliases: ['roma', 'as roma'] },
  { id: 'porto', name: 'Porto', logo: FOTMOB_LOGO(9772), aliases: ['porto', 'fc porto'] },
  { id: 'sporting-cp', name: 'Sporting CP', logo: FOTMOB_LOGO(9773), aliases: ['sporting cp', 'sporting', 'sporting clube de portugal'] },
  { id: 'psv', name: 'PSV Eindhoven', logo: FOTMOB_LOGO(8649), aliases: ['psv eindhoven', 'psv'] },
  { id: 'real-betis', name: 'Real Betis', logo: FOTMOB_LOGO(8603), aliases: ['real betis', 'betis'] },
  { id: 'club-brugge', name: 'Club Brugge', logo: FOTMOB_LOGO(8510), aliases: ['club brugge', 'brugge'] },
  { id: 'napoli', name: 'Napoli', logo: FOTMOB_LOGO(9875), aliases: ['napoli', 'ssc napoli'] },
  { id: 'rb-leipzig', name: 'RB Leipzig', logo: FOTMOB_LOGO(178475), aliases: ['rb leipzig', 'leipzig'] },
  { id: 'villarreal', name: 'Villarreal', logo: FOTMOB_LOGO(10205), aliases: ['villarreal', 'villarreal cf'] },
  { id: 'bayer-leverkusen', name: 'Bayer Leverkusen', logo: FOTMOB_LOGO(8178), aliases: ['bayer leverkusen', 'leverkusen'] },
  { id: 'feyenoord', name: 'Feyenoord', logo: FOTMOB_LOGO(10235), aliases: ['feyenoord'] },
  { id: 'lille', name: 'Lille', logo: FOTMOB_LOGO(8639), aliases: ['lille', 'losc', 'lille osc'] },
  { id: 'galatasaray', name: 'Galatasaray', logo: FOTMOB_LOGO(8637), aliases: ['galatasaray', 'gala'] },
  { id: 'fenerbahce', name: 'Fenerbahçe', logo: FOTMOB_LOGO(8640), aliases: ['fenerbahce', 'fenerbahçe', 'fener'] },
  { id: 'shakhtar', name: 'Shakhtar Donetsk', logo: FOTMOB_LOGO(10159), aliases: ['shakhtar donetsk', 'shakhtar'] },
  { id: 'bodo-glimt', name: 'Bodø/Glimt', logo: FOTMOB_LOGO(2619), aliases: ['bodo glimt', 'bodø glimt', 'bodø/glimt', 'bodo/glimt'] },
  { id: 'stuttgart', name: 'Stuttgart', logo: FOTMOB_LOGO(10269), aliases: ['stuttgart', 'vfb stuttgart'] },
  { id: 'como', name: 'Como', logo: FOTMOB_LOGO(6504), aliases: ['como', 'como 1907'] },
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
