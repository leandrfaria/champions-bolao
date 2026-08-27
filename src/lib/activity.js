const FEED_ACTIONS = new Set([
  'prediction_created',
  'prediction_updated',
  'round_created',
  'round_started',
  'round_finished',
  'result_updated',
  'season_created',
  'season_activated',
  'season_deleted',
  'round_deleted',
  'leader_changed',
  'second_changed',
])

export function activityCategory(action = '') {
  if (action === 'prediction_created' || action === 'prediction_updated') return 'predictions'
  if (action === 'result_updated') return 'results'
  if (action === 'leader_changed' || action === 'second_changed') return 'classification'
  if (action.includes('season') || action.includes('round')) return 'rounds'
  return 'other'
}

export function isFeedActivity(item) {
  const action = typeof item === 'string' ? item : item?.action
  if (!action || action === 'signed_in') return false
  if (/point|pont|score|position|rank/i.test(action) && action !== 'leader_changed' && action !== 'second_changed') return false
  return FEED_ACTIONS.has(action)
}

export function parseMatchName(value = '') {
  const parts = String(value).split(/\s+x\s+/i)
  if (parts.length !== 2) return null
  const home = parts[0]?.trim()
  const away = parts[1]?.trim()
  if (!home || !away) return null
  return { home, away }
}

export function activityText(item) {
  const actor = item.profiles?.display_name || 'Alguém'
  const metadata = item.metadata || {}
  switch (item.action) {
    case 'prediction_created': return `${actor} enviou um palpite em ${metadata.match_name || 'uma partida'}.`
    case 'prediction_updated': return `${actor} atualizou o palpite em ${metadata.match_name || 'uma partida'}.`
    case 'round_created': return `${metadata.round_name || 'Uma rodada'} foi aberta no bolão.`
    case 'round_started': return `${metadata.round_name || 'Uma rodada'} começou.`
    case 'round_finished': return `${metadata.round_name || 'Uma rodada'} foi encerrada.`
    case 'result_updated': return `Resultado registrado em ${metadata.match_name || 'uma partida'}${metadata.result ? `: ${metadata.result}` : ''}.`
    case 'season_created': return `A temporada ${metadata.season_name || ''} foi criada.`.replace(/\s+\./, '.')
    case 'season_activated': return `A temporada ${metadata.season_name || ''} começou no bolão.`.replace(/\s+\./, '.')
    case 'season_deleted': return `A temporada ${metadata.season_name || ''} foi excluída.`.replace(/\s+\./, '.')
    case 'round_deleted': return `${metadata.round_name || 'Uma rodada'} foi excluída.`
    case 'leader_changed': return `${actor} assumiu o 1º lugar.`
    case 'second_changed': return `${actor} assumiu a 2ª posição.`
    default: return 'Uma atividade foi registrada no bolão.'
  }
}

export function activityTone(action = '') {
  if (action === 'prediction_created' || action === 'prediction_updated') return 'purple'
  if (action === 'result_updated') return 'green'
  if (action === 'leader_changed' || action === 'second_changed') return 'gold'
  if (action === 'season_deleted' || action === 'round_deleted') return 'red'
  if (action.includes('season') || action.includes('round')) return 'blue'
  return 'neutral'
}
