export function hasResult(match) {
  return Number.isInteger(match?.home_score) && Number.isInteger(match?.away_score)
}

export function isLocked(match) {
  if (!match?.kickoff_at) return false
  return Date.now() >= new Date(match.kickoff_at).getTime()
}

export function matchStatus(match) {
  if (hasResult(match)) return 'finished'
  if (isLocked(match)) return 'locked'
  return 'open'
}

export function getOutcome(home, away) {
  if (home === away) return 'draw'
  return home > away ? 'home' : 'away'
}

export function calculatePoints(prediction, match) {
  if (!prediction || !hasResult(match)) return 0

  const predictedHome = Number(prediction.home_score)
  const predictedAway = Number(prediction.away_score)
  const realHome = Number(match.home_score)
  const realAway = Number(match.away_score)

  if (predictedHome === realHome && predictedAway === realAway) return 3
  if (getOutcome(predictedHome, predictedAway) === getOutcome(realHome, realAway)) return 1
  return 0
}

export function isExactPrediction(prediction, match) {
  if (!prediction || !hasResult(match)) return false
  return Number(prediction.home_score) === Number(match.home_score)
    && Number(prediction.away_score) === Number(match.away_score)
}

export function didPickWinner(prediction, match) {
  if (!prediction || !hasResult(match)) return false
  const realOutcome = getOutcome(Number(match.home_score), Number(match.away_score))
  if (realOutcome === 'draw') return false
  return getOutcome(Number(prediction.home_score), Number(prediction.away_score)) === realOutcome
}

export function didPredictCorrectOutcome(prediction, match) {
  if (!prediction || !hasResult(match)) return false
  return getOutcome(Number(prediction.home_score), Number(prediction.away_score))
    === getOutcome(Number(match.home_score), Number(match.away_score))
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

export function formatLongDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

export function formatRelativeTime(value) {
  if (!value) return ''
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

  if (abs < 60) return formatter.format(seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  const days = Math.round(hours / 24)
  return formatter.format(days, 'day')
}

export function timeUntilStart(value) {
  const diff = new Date(value).getTime() - Date.now()
  if (diff <= 0) return 'Palpites encerrados'

  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `Encerra em ${Math.max(1, minutes)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Encerra em ${hours}h ${minutes % 60}min`
  const days = Math.floor(hours / 24)
  return `Encerra em ${days}d ${hours % 24}h`
}

export function groupBy(items, keyGetter) {
  return items.reduce((acc, item) => {
    const key = keyGetter(item)
    acc[key] ||= []
    acc[key].push(item)
    return acc
  }, {})
}

export function localDateTimeValue(isoValue) {
  if (!isoValue) return ''
  const date = new Date(isoValue)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}
