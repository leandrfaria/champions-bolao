export function formatDeadline(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value)).replace('.', '')
}

export function formatRoundLabel(round) {
  const name = String(round?.name || '').trim()
  const stage = String(round?.stage || '').trim()
  if (!name) return 'Rodada atual'
  if (stage && name.toLocaleLowerCase('pt-BR').startsWith(stage.toLocaleLowerCase('pt-BR'))) {
    const remaining = name.slice(stage.length).replace(/^\s*[-–—|·:]\s*/, '').trim()
    if (remaining) return /\brodada\b/i.test(remaining) ? remaining : `Rodada ${remaining}`
    return 'Rodada atual'
  }
  const withoutPhasePrefix = name.replace(/^fase\b[^-–—|·:]*[-–—|·:]\s*/i, '').trim()
  if (!withoutPhasePrefix) return 'Rodada atual'
  return /\brodada\b/i.test(withoutPhasePrefix) ? withoutPhasePrefix : `Rodada ${withoutPhasePrefix}`
}

export function formatRelativeActivity(value) {
  if (!value) return 'agora'
  const diffMs = Date.now() - new Date(value).getTime()
  const diffMin = Math.max(0, Math.round(diffMs / 60000))
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `há ${diffHr} ${diffHr === 1 ? 'hora' : 'horas'}`
  const diffDay = Math.round(diffHr / 24)
  return `há ${diffDay} ${diffDay === 1 ? 'dia' : 'dias'}`
}

export function activitySummary(item) {
  const metadata = item.metadata || {}
  const actor = item.profiles?.display_name || 'Participante'
  const match = metadata.match_name || 'uma partida'
  const round = metadata.round_name || 'Rodada'
  const season = metadata.season_name || 'Temporada'

  switch (item.action) {
    case 'prediction_created': return { title: `${actor} enviou um palpite`, detail: match }
    case 'prediction_updated': return { title: `${actor} atualizou um palpite`, detail: match }
    case 'result_updated': return { title: 'Resultado registrado', detail: `${match}${metadata.result ? ` · ${metadata.result}` : ''}` }
    case 'round_created': return { title: 'Rodada aberta', detail: round }
    case 'round_started': return { title: 'Rodada iniciada', detail: round }
    case 'round_finished': return { title: 'Rodada encerrada', detail: round }
    case 'round_deleted': return { title: 'Rodada removida', detail: round }
    case 'roulette_spun': {
      const names = Array.isArray(metadata.selected_names) ? metadata.selected_names.filter(Boolean) : []
      return { title: 'Sorteio realizado', detail: names.length ? names.join(' · ') : round }
    }
    case 'season_created': return { title: 'Temporada criada', detail: season }
    case 'season_activated': return { title: 'Temporada iniciada', detail: season }
    case 'season_deleted': return { title: 'Temporada removida', detail: season }
    case 'leader_changed': return { title: 'Mudança na liderança', detail: `${actor} assumiu o 1º lugar` }
    case 'second_changed': return { title: 'Mudança na classificação', detail: `${actor} assumiu a 2ª posição` }
    default: return { title: 'Atividade registrada', detail: '' }
  }
}

export function getActivityLabel(category) {
  if (category === 'predictions') return 'Palpite'
  if (category === 'results') return 'Resultado'
  if (category === 'classification') return 'Classificação'
  if (category === 'rounds') return 'Competição'
  return 'Atividade'
}

export function progressValue(done, total) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}
