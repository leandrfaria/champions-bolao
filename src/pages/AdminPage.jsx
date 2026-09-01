import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import AdminModal from '../components/AdminModal'
import Loading from '../components/Loading'
import NavIcon from '../components/NavIcon'
import PageHeader from '../components/PageHeader'
import TeamCrest from '../components/TeamCrest'
import TeamPicker from '../components/TeamPicker'
import TrophyIcon from '../components/TrophyIcon'
import UserAvatar, { clearAvatarCache } from '../components/UserAvatar'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDateTime, hasResult, isLocked, localDateTimeValue } from '../lib/utils'

const TABS = [
  ['overview', 'Visão geral'],
  ['rounds', 'Rodadas e jogos'],
  ['results', 'Resultados'],
  ['participants', 'Participantes'],
]

const emptySeason = { name: 'Champions League 2026/27' }
const emptyRound = { name: '', stage: 'Fase de liga', sort_order: 1, season_id: '' }
const emptyMatch = { home_team: '', away_team: '', match_date: '', match_time: '', round_id: '', selected_by_user_id: '' }

function sanitizeScore(value) {
  if (value === '') return ''
  if (!/^\d{1,2}$/.test(value)) return null
  const number = Number(value)
  if (number < 0 || number > 99) return null
  return value
}

async function prepareAvatarFile(file) {
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const next = new Image()
      next.onload = () => resolve(next)
      next.onerror = () => reject(new Error('Não foi possível processar a imagem selecionada.'))
      next.src = sourceUrl
    })

    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const side = Math.min(width, height)
    // A small, consistent crop avoids avatars where the person looks tiny inside the circle.
    // Keep a slight upward bias on portrait photos so face + shirt remain visible.
    const cropSide = side * 0.98
    const sx = Math.max(0, (width - cropSide) / 2)
    const portraitOffset = height > width ? (height - cropSide) * 0.18 : (height - cropSide) / 2
    const sy = Math.max(0, Math.min(height - cropSide, portraitOffset))
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const context = canvas.getContext('2d')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, sx, sy, cropSide, cropSide, 0, 0, 1024, 1024)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.96))
    if (!blob) throw new Error('Não foi possível preparar a imagem.')
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'avatar'}.webp`, { type: 'image/webp' })
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

function dateKey(value) {
  if (!value) return 'sem-data'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type) => parts.find((part) => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function formatDayTitle(value) {
  if (!value) return 'Data não definida'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function formatTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function formatRoundPeriod(roundMatches = []) {
  const list = [...roundMatches].filter((match) => match.kickoff_at).sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
  if (!list.length) return 'Sem datas'
  const first = new Date(list[0].kickoff_at)
  const last = new Date(list.at(-1).kickoff_at)
  const fmt = (date, includeMonth = true) => new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', ...(includeMonth ? { month: 'short' } : {}), timeZone: 'America/Sao_Paulo',
  }).format(date).replace('.', '')
  if (dateKey(first) === dateKey(last)) return fmt(first)
  const sameMonth = new Intl.DateTimeFormat('pt-BR', { month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(first) === new Intl.DateTimeFormat('pt-BR', { month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(last)
  return sameMonth ? `${fmt(first, false)}–${fmt(last)}` : `${fmt(first)} – ${fmt(last)}`
}

function roundState(round, roundMatches) {
  if (round?.closed_at) return 'finished'
  if (!roundMatches.length) return 'future'
  if (roundMatches.some((match) => isLocked(match) || hasResult(match))) return 'progress'
  return 'open'
}

const ROUND_STATE = {
  future: { label: 'FUTURA', tone: 'muted' },
  open: { label: 'ABERTA', tone: 'open' },
  progress: { label: 'EM ANDAMENTO', tone: 'progress' },
  finished: { label: 'FINALIZADA', tone: 'finished' },
}

function matchState(match) {
  if (hasResult(match)) return { label: 'FINALIZADO', tone: 'finished' }
  if (isLocked(match)) return { label: 'AGUARDANDO RESULTADO', tone: 'attention' }
  return { label: 'PALPITES ABERTOS', tone: 'open' }
}

function AdminStatus({ tone, children }) {
  return <span className={`admin-status admin-status-${tone}`}>{children}</span>
}

function Icon({ type }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    match: <><circle cx="12" cy="12" r="8"/><path d="m9 8 3-2 3 2 1 4-4 3-4-3zM12 15v5M8 12 4 15M16 12l4 3"/></>,
    result: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6M16 5c2 0 3 1.3 3 3s-1 3-3 3M17 14c2.4.6 3.7 2.5 4 6"/></>,
    alert: <><path d="m12 3 9 17H3z"/><path d="M12 9v4M12 17h.01"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/></>,
    dots: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type] || paths.calendar}</g></svg>
}

export default function AdminPage() {
  const { isAdmin, loading: authLoading, profile: currentProfile, refreshProfile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab = TABS.some(([value]) => value === tabParam) ? tabParam : 'overview'

  const [loading, setLoading] = useState(true)
  const [seasons, setSeasons] = useState([])
  const [rounds, setRounds] = useState([])
  const [matches, setMatches] = useState([])
  const [participants, setParticipants] = useState([])
  const [presence, setPresence] = useState([])
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [selectedRoundId, setSelectedRoundId] = useState('')
  const [resultFilter, setResultFilter] = useState('pending')
  const [resultForms, setResultForms] = useState({})
  const [seasonDialog, setSeasonDialog] = useState(null)
  const [roundDialog, setRoundDialog] = useState(null)
  const [matchDialog, setMatchDialog] = useState(null)
  const [matchSaved, setMatchSaved] = useState(false)
  const [resultDialog, setResultDialog] = useState(null)
  const [avatarDialog, setAvatarDialog] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const [seasonRes, roundRes, matchRes, profileRes] = await Promise.all([
      supabase.from('seasons').select('*').order('created_at', { ascending: false }),
      supabase.from('rounds').select('*, seasons(name)').order('sort_order'),
      supabase.from('matches').select('*, rounds(name, stage, season_id, closed_at)').order('kickoff_at', { ascending: true }),
      supabase.from('profiles').select('*').order('display_name'),
    ])
    const firstError = seasonRes.error || roundRes.error || matchRes.error || profileRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const seasonData = seasonRes.data || []
    const roundData = roundRes.data || []
    const matchData = matchRes.data || []
    const profileData = profileRes.data || []
    setSeasons(seasonData)
    setRounds(roundData)
    setMatches(matchData)
    setParticipants(profileData)

    const ids = matchData.map((match) => match.id)
    if (ids.length) {
      const presenceRes = await supabase.rpc('get_prediction_presence', { p_match_ids: ids })
      if (presenceRes.error) setError(presenceRes.error.message)
      else setPresence(presenceRes.data || [])
    } else {
      setPresence([])
    }

    setSelectedSeasonId((current) => {
      if (current && seasonData.some((season) => season.id === current)) return current
      return seasonData.find((season) => season.is_active)?.id || seasonData[0]?.id || ''
    })

    const resultState = {}
    matchData.forEach((match) => {
      resultState[match.id] = {
        home_score: match.home_score == null ? '' : String(match.home_score),
        away_score: match.away_score == null ? '' : String(match.away_score),
      }
    })
    setResultForms(resultState)
    setLoading(false)
  }

  useEffect(() => { if (isAdmin) load() }, [isAdmin])
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }, [avatarPreview])

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || null
  const activeSeason = seasons.find((season) => season.is_active) || null
  useEffect(() => {
    if (tab === 'overview' && activeSeason?.id && selectedSeasonId !== activeSeason.id) setSelectedSeasonId(activeSeason.id)
  }, [tab, activeSeason?.id, selectedSeasonId])
  const seasonRounds = useMemo(() => rounds.filter((round) => round.season_id === selectedSeasonId).sort((a, b) => a.sort_order - b.sort_order), [rounds, selectedSeasonId])
  const seasonMatches = useMemo(() => matches.filter((match) => match.rounds?.season_id === selectedSeasonId), [matches, selectedSeasonId])
  const matchesByRound = useMemo(() => {
    const map = new Map()
    seasonRounds.forEach((round) => map.set(round.id, []))
    seasonMatches.forEach((match) => {
      if (!map.has(match.round_id)) map.set(match.round_id, [])
      map.get(match.round_id).push(match)
    })
    map.forEach((list) => list.sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at)))
    return map
  }, [seasonRounds, seasonMatches])

  useEffect(() => {
    if (!seasonRounds.length) {
      setSelectedRoundId('')
      return
    }
    if (selectedRoundId && seasonRounds.some((round) => round.id === selectedRoundId)) return
    const operational = seasonRounds.find((round) => !round.closed_at) || seasonRounds.at(-1)
    setSelectedRoundId(operational?.id || seasonRounds[0].id)
  }, [selectedSeasonId, seasonRounds, selectedRoundId])

  const selectedRound = seasonRounds.find((round) => round.id === selectedRoundId) || null
  const selectedRoundMatches = selectedRound ? (matchesByRound.get(selectedRound.id) || []) : []
  const currentRound = seasonRounds.find((round) => !round.closed_at) || seasonRounds.at(-1) || null
  const currentRoundMatches = currentRound ? (matchesByRound.get(currentRound.id) || []) : []
  const currentMatchIds = new Set(currentRoundMatches.map((match) => match.id))
  const currentPresence = presence.filter((item) => currentMatchIds.has(item.match_id))
  const predictionsSent = currentPresence.filter((item) => item.has_predicted).length
  const predictionsPossible = participants.length * currentRoundMatches.length
  const pendingResults = seasonMatches.filter((match) => isLocked(match) && !hasResult(match))
  const finalizedResults = seasonMatches.filter(hasResult).sort((a, b) => new Date(b.kickoff_at) - new Date(a.kickoff_at))
  const openCurrentMatches = currentRoundMatches.filter((match) => !isLocked(match) && !hasResult(match))
  const openIds = new Set(openCurrentMatches.map((match) => match.id))
  const openSent = presence.filter((item) => openIds.has(item.match_id) && item.has_predicted).length
  const openPossible = participants.length * openCurrentMatches.length
  const missingPredictions = Math.max(0, openPossible - openSent)

  const recentRounds = [...seasonRounds].sort((a, b) => b.sort_order - a.sort_order).slice(0, 8)
  const attention = []
  if (pendingResults.length) attention.push({ type: 'result', title: `${pendingResults.length} ${pendingResults.length === 1 ? 'partida aguarda' : 'partidas aguardam'} resultado`, text: 'Registre os placares finais para atualizar a classificação.', action: 'Registrar resultados', tab: 'results' })
  const emptyRoundTarget = seasonRounds.find((round) => !round.closed_at && (matchesByRound.get(round.id) || []).length === 0)
  if (emptyRoundTarget) attention.push({ type: 'round', title: `${emptyRoundTarget.name} ainda não possui jogos`, text: 'Adicione as partidas para liberar os palpites da rodada.', action: `Gerenciar ${emptyRoundTarget.name}`, tab: 'rounds', roundId: emptyRoundTarget.id })
  if (missingPredictions > 0 && openCurrentMatches.length) attention.push({ type: 'prediction', title: `${missingPredictions} ${missingPredictions === 1 ? 'palpite ainda não foi enviado' : 'palpites ainda não foram enviados'}`, text: `Considerando os ${openCurrentMatches.length} jogos ainda abertos da ${currentRound?.name || 'rodada atual'}.`, action: 'Ver rodada', tab: 'rounds', roundId: currentRound?.id })
  const closeReady = seasonRounds.find((round) => !round.closed_at && (matchesByRound.get(round.id) || []).length > 0 && (matchesByRound.get(round.id) || []).every(hasResult))
  if (closeReady) attention.push({ type: 'round', title: `${closeReady.name} está pronta para encerrar`, text: 'Todos os resultados já foram registrados.', action: 'Encerrar rodada', tab: 'rounds', roundId: closeReady.id })

  const knownTeams = useMemo(() => [...new Set(matches.flatMap((match) => [match.home_team, match.away_team]).filter(Boolean))].sort(), [matches])

  if (authLoading) return <Loading />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  if (loading) return <Loading label="Abrindo administração..." />

  function flash(text) {
    setMessage(text)
    setError('')
    window.setTimeout(() => setMessage(''), 3200)
  }

  function goTab(nextTab, roundId) {
    setSearchParams({ tab: nextTab })
    if (roundId) setSelectedRoundId(roundId)
  }

  function openSeasonCreate() {
    setSeasonDialog({ mode: 'create', form: { ...emptySeason } })
  }

  function openSeasonEdit(season) {
    setSeasonDialog({ mode: 'edit', season, form: { name: season.name } })
  }

  async function saveSeason(event) {
    event.preventDefault()
    const name = seasonDialog?.form?.name?.trim()
    if (!name) return setError('Informe o nome da temporada.')
    setBusy(true)
    const response = seasonDialog.mode === 'edit'
      ? await supabase.from('seasons').update({ name }).eq('id', seasonDialog.season.id)
      : await supabase.from('seasons').insert({ name, is_active: seasons.length === 0 })
    setBusy(false)
    if (response.error) return setError(response.error.message)
    setSeasonDialog(null)
    flash(seasonDialog.mode === 'edit' ? 'Temporada atualizada.' : 'Temporada criada.')
    load()
  }

  async function activateSeason(id) {
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('set_active_season', { p_season_id: id })
    setBusy(false)
    if (rpcError) return setError(rpcError.message)
    setSelectedSeasonId(id)
    flash('Temporada ativa atualizada.')
    load()
  }

  function askDeleteSeason(season) {
    setConfirm({
      tone: 'danger', title: `Excluir ${season.name}?`, eyebrow: 'Ação irreversível',
      text: 'Isso apaga todas as rodadas, jogos e palpites ligados a essa temporada. As estatísticas calculadas a partir desses dados também serão removidas.',
      confirmLabel: 'Excluir temporada',
      action: async () => {
        const { error: deleteError } = await supabase.from('seasons').delete().eq('id', season.id)
        if (deleteError) throw deleteError
        flash('Temporada excluída e estatísticas redefinidas.')
      },
    })
  }

  function openRoundCreate() {
    const nextOrder = seasonRounds.length ? Math.max(...seasonRounds.map((round) => round.sort_order)) + 1 : 1
    setRoundDialog({ mode: 'create', form: { ...emptyRound, season_id: selectedSeasonId, sort_order: nextOrder } })
  }

  function openRoundEdit(round) {
    setRoundDialog({ mode: 'edit', round, form: { season_id: round.season_id, name: round.name, stage: round.stage, sort_order: round.sort_order } })
  }

  async function saveRound(event) {
    event.preventDefault()
    const form = roundDialog.form
    if (!form.season_id || !form.name.trim() || !form.stage.trim()) return setError('Preencha os dados da rodada.')
    setBusy(true)
    const payload = { season_id: form.season_id, name: form.name.trim(), stage: form.stage.trim(), sort_order: Number(form.sort_order) }
    const response = roundDialog.mode === 'edit'
      ? await supabase.from('rounds').update(payload).eq('id', roundDialog.round.id)
      : await supabase.from('rounds').insert(payload).select('id').single()
    setBusy(false)
    if (response.error) return setError(response.error.message)
    const newId = roundDialog.mode === 'create' ? response.data?.id : roundDialog.round.id
    setRoundDialog(null)
    if (newId) setSelectedRoundId(newId)
    flash(roundDialog.mode === 'edit' ? 'Rodada atualizada.' : 'Rodada criada.')
    load()
  }

  function askCloseRound(round) {
    const list = matchesByRound.get(round.id) || []
    if (!list.length || !list.every(hasResult)) {
      setError('A rodada só pode ser encerrada depois que todos os jogos tiverem resultado.')
      return
    }
    setConfirm({
      title: `Encerrar ${round.name}?`, eyebrow: 'Confirmação administrativa', tone: 'danger',
      text: 'Todos os jogos já possuem resultado. Ao encerrar, a rodada passa a ficar marcada como finalizada na Administração.',
      confirmLabel: 'Encerrar rodada',
      action: async () => {
        const { error: updateError } = await supabase.from('rounds').update({ closed_at: new Date().toISOString() }).eq('id', round.id)
        if (updateError) throw updateError
        flash(`${round.name} encerrada.`)
      },
    })
  }

  function openMatchCreate(roundId = selectedRoundId) {
    const target = seasonRounds.find((round) => round.id === roundId)
    if (!target) return setError('Crie ou selecione uma rodada antes de adicionar jogos.')
    if (target.closed_at) return setError('Não é possível adicionar jogos a uma rodada encerrada.')
    setMatchSaved(false)
    setMatchDialog({ mode: 'create', form: { ...emptyMatch, round_id: target.id } })
  }

  function openMatchEdit(match) {
    const local = localDateTimeValue(match.kickoff_at).split('T')
    setMatchSaved(false)
    setMatchDialog({
      mode: 'edit', match,
      form: { round_id: match.round_id, home_team: match.home_team, away_team: match.away_team, match_date: local[0] || '', match_time: (local[1] || '').slice(0, 5), selected_by_user_id: match.selected_by_user_id || '' },
    })
  }

  function predictionCount(matchId) {
    return presence.filter((item) => item.match_id === matchId && item.has_predicted).length
  }

  async function saveMatch(event) {
    event.preventDefault()
    const form = matchDialog.form
    if (!form.round_id || !form.home_team.trim() || !form.away_team.trim() || !form.match_date || !form.match_time || !form.selected_by_user_id) return setError('Preencha todos os dados do jogo, incluindo quem escolheu a partida.')
    const startDate = new Date(`${form.match_date}T${form.match_time}`)
    if (Number.isNaN(startDate.getTime())) return setError('Informe uma data e horário válidos.')
    const targetRound = rounds.find((round) => round.id === form.round_id)
    if (targetRound?.closed_at) return setError('A rodada selecionada já foi encerrada.')
    const payload = { round_id: form.round_id, home_team: form.home_team.trim(), away_team: form.away_team.trim(), kickoff_at: startDate.toISOString(), selected_by_user_id: form.selected_by_user_id }
    setBusy(true)
    const response = matchDialog.mode === 'edit'
      ? await supabase.from('matches').update(payload).eq('id', matchDialog.match.id)
      : await supabase.from('matches').insert(payload)
    setBusy(false)
    if (response.error) return setError(response.error.message)
    if (matchDialog.mode === 'create') {
      setMatchSaved(true)
      setMatchDialog((current) => ({ ...current, form: { ...emptyMatch, round_id: current.form.round_id, selected_by_user_id: current.form.selected_by_user_id } }))
      flash('Jogo adicionado com sucesso.')
      await load()
    } else {
      setMatchDialog(null)
      flash('Jogo atualizado.')
      load()
    }
  }

  function updateResultField(matchId, field, rawValue) {
    const next = sanitizeScore(rawValue)
    if (next === null) return
    setResultForms((current) => ({ ...current, [matchId]: { ...(current[matchId] || { home_score: '', away_score: '' }), [field]: next } }))
  }

  async function persistResult(match, values) {
    if (values.home_score === '' || values.away_score === '') throw new Error('Informe os dois placares antes de salvar o resultado.')
    const { error: updateError } = await supabase.from('matches').update({ home_score: Number(values.home_score), away_score: Number(values.away_score) }).eq('id', match.id)
    if (updateError) throw updateError
  }

  async function savePendingResult(match) {
    try {
      setBusy(true)
      await persistResult(match, resultForms[match.id] || { home_score: '', away_score: '' })
      setBusy(false)
      flash('Resultado registrado com sucesso. Pontuação recalculada.')
      load()
    } catch (resultError) {
      setBusy(false)
      setError(resultError.message)
    }
  }

  function openResultEdit(match) {
    setResultDialog({ match, values: { home_score: String(match.home_score), away_score: String(match.away_score) } })
  }

  async function saveEditedResult() {
    try {
      setBusy(true)
      await persistResult(resultDialog.match, resultDialog.values)
      setBusy(false)
      setResultDialog(null)
      flash('Resultado alterado. A classificação e os pontos foram recalculados.')
      load()
    } catch (resultError) {
      setBusy(false)
      setError(resultError.message)
    }
  }

  function askClearResult(match) {
    setResultDialog(null)
    setConfirm({
      tone: 'danger', eyebrow: 'Ação sensível', title: 'Remover resultado?',
      text: 'A partida voltará a ficar sem resultado e os pontos derivados dela deixarão de aparecer até um novo placar ser registrado.',
      confirmLabel: 'Remover resultado',
      action: async () => {
        const { error: updateError } = await supabase.from('matches').update({ home_score: null, away_score: null }).eq('id', match.id)
        if (updateError) throw updateError
        flash('Resultado removido.')
      },
    })
  }

  function openAvatar(participant) {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(null)
    setAvatarPreview('')
    setAvatarError('')
    setAvatarDialog(participant)
  }

  async function chooseAvatar(file) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setAvatarError('Use uma imagem JPG, PNG ou WebP.')
    if (file.size > 5 * 1024 * 1024) return setAvatarError('A foto precisa ter no máximo 5 MB.')
    setAvatarBusy(true)
    setAvatarError('')
    try {
      const prepared = await prepareAvatarFile(file)
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarFile(prepared)
      setAvatarPreview(URL.createObjectURL(prepared))
    } catch (imageError) {
      setAvatarError(imageError.message || 'Não foi possível preparar a foto.')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function saveAvatar() {
    if (!avatarDialog || !avatarFile || avatarBusy) return
    setAvatarBusy(true)
    setAvatarError('')
    const participant = avatarDialog
    const extension = avatarFile.type === 'image/png' ? 'png' : avatarFile.type === 'image/webp' ? 'webp' : 'jpg'
    const objectPath = `${participant.id}/${crypto.randomUUID()}.${extension}`
    const oldPath = participant.avatar_path

    try {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(objectPath, avatarFile, { cacheControl: '3600', contentType: avatarFile.type, upsert: false })
      if (uploadError) throw uploadError

      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_path: objectPath })
        .eq('id', participant.id)
        .select('*')
        .single()

      if (updateError) {
        await supabase.storage.from('avatars').remove([objectPath])
        throw updateError
      }
      if (!updatedProfile?.avatar_path) {
        await supabase.storage.from('avatars').remove([objectPath])
        throw new Error('A foto foi enviada, mas o perfil não confirmou a gravação. Execute o upgrade-v1.9.sql no Supabase.')
      }

      clearAvatarCache(oldPath)
      clearAvatarCache(objectPath)
      setParticipants((current) => current.map((item) => item.id === participant.id ? updatedProfile : item))
      if (oldPath && oldPath !== objectPath) {
        const { error: removeError } = await supabase.storage.from('avatars').remove([oldPath])
        if (removeError) console.warn('Não foi possível remover a foto anterior:', removeError.message)
      }
      if (participant.id === currentProfile?.id) await refreshProfile()
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarPreview('')
      setAvatarFile(null)
      setAvatarDialog(null)
      flash(`Foto de ${participant.display_name} atualizada.`)
      await load()
    } catch (saveError) {
      setAvatarError(saveError.message || 'Não foi possível salvar a foto.')
    } finally {
      setAvatarBusy(false)
    }
  }

  function askRemoveAvatar(participant) {
    setAvatarDialog(null)
    setConfirm({
      tone: 'danger', eyebrow: 'Foto do participante', title: `Remover foto de ${participant.display_name}?`,
      text: 'O avatar voltará a usar as iniciais do participante.', confirmLabel: 'Remover foto',
      action: async () => {
        const oldPath = participant.avatar_path
        const { error: updateError } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', participant.id)
        if (updateError) throw updateError
        clearAvatarCache(oldPath)
        if (oldPath) await supabase.storage.from('avatars').remove([oldPath])
        if (participant.id === currentProfile?.id) await refreshProfile()
        flash(`Foto de ${participant.display_name} removida.`)
      },
    })
  }

  function askClearActivities() {
    setConfirm({
      tone: 'danger',
      eyebrow: 'Atividades',
      title: 'Limpar todas as atividades?',
      text: 'Tudo que aparece na timeline de Atividades será limpo. Novos acontecimentos voltarão a aparecer normalmente depois disso.',
      confirmLabel: 'Limpar atividades',
      action: async () => {
        const { error: clearError } = await supabase.rpc('clear_activity_feed')
        if (clearError) throw clearError
        flash('Atividades limpas.')
      },
    })
  }

  async function runConfirm() {
    if (!confirm?.action) return
    try {
      setBusy(true)
      await confirm.action()
      setBusy(false)
      setConfirm(null)
      load()
    } catch (confirmError) {
      setBusy(false)
      setError(confirmError.message)
    }
  }

  const tabActions = tab === 'overview'
    ? <><button className="admin-danger-link admin-clear-activities" type="button" onClick={askClearActivities}>Limpar atividades</button><button className="admin-quiet-button" type="button" onClick={openSeasonCreate}><Icon type="plus" /> Nova temporada</button></>
    : tab === 'rounds'
      ? <><button className="admin-quiet-button" type="button" onClick={openRoundCreate} disabled={!selectedSeasonId}><Icon type="plus" /> Nova rodada</button><button className="primary-button admin-header-primary" type="button" onClick={() => openMatchCreate()} disabled={!selectedRound}><Icon type="plus" /> Adicionar jogo</button></>
      : null

  return (
    <div className="page-wrap admin-workspace sports-surface">
      <header className="admin-mobile-header">
        <div>
          <span className="eyebrow">Área administrativa</span>
          <h1>Administração</h1>
          <p>{activeSeason?.name || 'Nenhuma temporada ativa'}</p>
        </div>
        <details className="admin-mobile-actions-menu">
          <summary aria-label="Mais ações administrativas"><Icon type="dots" /></summary>
          <div>
            <button type="button" onClick={openSeasonCreate}><Icon type="plus" /> Nova temporada</button>
            <button className="danger" type="button" onClick={askClearActivities}>Limpar atividades</button>
          </div>
        </details>
      </header>

      <PageHeader
        eyebrow="Área administrativa"
        title="Administração"
        description="Gerencie a competição, rodadas, jogos e participantes."
        actions={tabActions}
      />

      <nav className="admin-tabs" aria-label="Seções da administração">
        {TABS.map(([value, label]) => (
          <button key={value} className={tab === value ? 'active' : ''} type="button" onClick={() => goTab(value)}>
            <span className="admin-tab-label-desktop">{label}</span>
            <span className="admin-tab-label-mobile">{value === 'rounds' ? 'Rodadas' : label}</span>
          </button>
        ))}
      </nav>

      {(message || error) && <div className={error ? 'form-error admin-flash' : 'form-success admin-flash'}>{error || message}</div>}

      {tab === 'overview' && (
        <div className="admin-overview">
          {!activeSeason ? (
            <section className="admin-empty admin-empty-main">
              <TrophyIcon size={42} />
              <h2>Nenhuma temporada ativa</h2>
              <p>Crie a primeira temporada para começar a organizar rodadas e partidas.</p>
              <button className="primary-button" type="button" onClick={openSeasonCreate}>Criar temporada</button>
            </section>
          ) : (
            <>
              <section className="admin-overview-summary">
                <div className="admin-mobile-overview-round">
                  <div>
                    <span>Rodada atual</span>
                    <strong>{currentRound?.name || 'Nenhuma rodada'}</strong>
                    <small>{currentRound?.stage || 'Crie uma rodada para começar'}</small>
                  </div>
                  {currentRound && (() => { const state = ROUND_STATE[roundState(currentRound, currentRoundMatches)]; return <AdminStatus tone={state.tone}>{state.label}</AdminStatus> })()}
                </div>
                <div className="admin-mobile-overview-metrics">
                  <div><strong>{currentRoundMatches.length}</strong><span>{currentRoundMatches.length === 1 ? 'Jogo' : 'Jogos'}</span></div>
                  <div><strong>{predictionsPossible ? `${predictionsSent}/${predictionsPossible}` : '—'}</strong><span>Palpites</span></div>
                  <div><strong>{pendingResults.length}</strong><span>Resultados pendentes</span></div>
                  <div><strong>{participants.length}</strong><span>Participantes</span></div>
                </div>

                <div className="admin-overview-season">
                  <div className="admin-season-icon"><TrophyIcon size={24} /></div>
                  <div>
                    <span>Temporada ativa</span>
                    <h2>{activeSeason.name}</h2>
                    <small>{currentRound ? `${currentRound.name} · ${currentRound.stage}` : 'Nenhuma rodada em andamento'}</small>
                  </div>
                  <AdminStatus tone="finished">ATIVA</AdminStatus>
                </div>

                <div className="admin-overview-core-metrics">
                  <div>
                    <span>Rodada atual</span>
                    <strong>{currentRound?.name || '—'}</strong>
                    <small>{currentRoundMatches.length ? `${currentRoundMatches.length} ${currentRoundMatches.length === 1 ? 'jogo' : 'jogos'}` : 'Sem jogos'}</small>
                  </div>
                  <div>
                    <span>Palpites enviados</span>
                    <strong>{predictionsPossible ? `${predictionsSent}/${predictionsPossible}` : '—'}</strong>
                    <small>{predictionsPossible ? 'na rodada atual' : 'sem rodada ativa'}</small>
                  </div>
                  <div>
                    <span>Aguardando resultado</span>
                    <strong>{pendingResults.length}</strong>
                    <small>{pendingResults.length ? 'ação necessária' : 'nenhum pendente'}</small>
                  </div>
                  <div>
                    <span>Participantes</span>
                    <strong>{participants.length}</strong>
                    <small>cadastrados</small>
                  </div>
                </div>

                <div className="admin-overview-season-actions">
                  {seasons.length > 1 && (
                    <details className="admin-season-switcher">
                      <summary>Temporadas</summary>
                      <div>
                        {seasons.map((season) => (
                          <div key={season.id}>
                            <button type="button" onClick={() => { setSelectedSeasonId(season.id); if (!season.is_active) activateSeason(season.id) }}>
                              <span>{season.name}</span><small>{season.is_active ? 'Ativa' : 'Tornar ativa'}</small>
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  <details className="admin-context-menu">
                    <summary aria-label="Opções da temporada"><Icon type="dots" /></summary>
                    <div>
                      <button type="button" onClick={() => openSeasonEdit(activeSeason)}>Editar temporada</button>
                      <button className="danger" type="button" onClick={() => askDeleteSeason(activeSeason)}>Excluir temporada</button>
                    </div>
                  </details>
                </div>
              </section>

              <section className="admin-overview-commandbar" aria-label="Ações rápidas">
                <div><span className="eyebrow">Ações rápidas</span><p>O que você precisa operar agora?</p></div>
                <div className="admin-command-actions">
                  <button type="button" onClick={() => goTab('rounds', currentRound?.id)}><Icon type="calendar" /><span>Gerenciar rodada</span></button>
                  <button type="button" onClick={() => { goTab('rounds', currentRound?.id); window.setTimeout(() => openMatchCreate(currentRound?.id), 0) }}><Icon type="plus" /><span>Adicionar jogo</span></button>
                  <button type="button" onClick={() => goTab('results')}><Icon type="result" /><span>Registrar resultados</span>{pendingResults.length > 0 && <b>{pendingResults.length}</b>}</button>
                </div>
              </section>

              <section className="admin-attention-panel admin-attention-panel-wide">
                <div className="admin-section-title"><div><span className="eyebrow">Operação</span><h2>Precisa da sua atenção</h2></div><span className="admin-title-icon"><Icon type="alert" /></span></div>
                {attention.length ? (
                  <div className="admin-attention-list">
                    {attention.slice(0, 3).map((item, index) => (
                      <div className={`admin-attention-item ${item.type}`} key={`${item.title}-${index}`}>
                        <span className="attention-dot" />
                        <div><strong>{item.title}</strong><p>{item.text}</p></div>
                        <button type="button" onClick={() => {
                          goTab(item.tab, item.roundId)
                          if (item.action === 'Encerrar rodada') window.setTimeout(() => askCloseRound(closeReady), 0)
                        }}>{item.action}</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="admin-all-good"><span>✓</span><div><strong>Tudo certo por enquanto</strong><p>Não há nenhuma ação administrativa pendente.</p></div></div>
                )}
              </section>

              <section className="admin-recent-rounds">
                <div className="admin-section-title"><div><span className="eyebrow">Temporada</span><h2>Rodadas recentes</h2></div><button className="text-button" type="button" onClick={() => goTab('rounds')}>Gerenciar todas →</button></div>
                {recentRounds.length ? (
                  <div className="admin-round-table">
                    <div className="admin-round-table-head"><span>Rodada</span><span>Período</span><span>Fase</span><span>Jogos</span><span>Status</span><span /></div>
                    {recentRounds.map((round) => {
                      const list = matchesByRound.get(round.id) || []
                      const state = ROUND_STATE[roundState(round, list)]
                      return (
                        <div className="admin-round-table-row" key={round.id}>
                          <strong>{String(round.sort_order).padStart(2, '0')} · {round.name}</strong>
                          <span>{formatRoundPeriod(list)}</span>
                          <span>{round.stage}</span>
                          <span>{list.length}</span>
                          <span><AdminStatus tone={state.tone}>{state.label}</AdminStatus></span>
                          <button type="button" onClick={() => goTab('rounds', round.id)}>Gerenciar →</button>
                        </div>
                      )
                    })}
                  </div>
                ) : <div className="admin-empty"><h3>Nenhuma rodada cadastrada</h3><p>Crie a primeira rodada para começar a organizar a temporada.</p><button className="secondary-button" type="button" onClick={() => { setSelectedSeasonId(activeSeason.id); goTab('rounds'); window.setTimeout(openRoundCreate, 0) }}>Criar rodada</button></div>}
              </section>
            </>
          )}
        </div>
      )}

      {tab === 'rounds' && (
        <div className="admin-rounds-workspace">
          {!seasons.length ? (
            <div className="admin-empty admin-empty-main"><h2>Nenhuma temporada</h2><p>Crie uma temporada antes de cadastrar rodadas e jogos.</p><button className="primary-button" type="button" onClick={openSeasonCreate}>Nova temporada</button></div>
          ) : (
            <>
              <section className="admin-workspace-toolbar">
                <label><span>Temporada</span><select value={selectedSeasonId} onChange={(event) => setSelectedSeasonId(event.target.value)}>{seasons.map((season) => <option value={season.id} key={season.id}>{season.name}{season.is_active ? ' · ativa' : ''}</option>)}</select></label>
                {selectedSeason?.is_active && <AdminStatus tone="finished">ATIVA</AdminStatus>}
                <div className="admin-round-chips" aria-label="Selecionar rodada">
                  {seasonRounds.map((round) => <button key={round.id} className={round.id === selectedRoundId ? 'active' : ''} type="button" onClick={() => setSelectedRoundId(round.id)}>{String(round.sort_order).padStart(2, '0')}</button>)}
                  <button className="add" type="button" onClick={openRoundCreate} aria-label="Nova rodada">+</button>
                </div>
              </section>

              {!selectedRound ? (
                <div className="admin-empty admin-empty-main"><h2>Nenhuma rodada cadastrada</h2><p>Crie a primeira rodada desta temporada para adicionar os jogos.</p><button className="primary-button" type="button" onClick={openRoundCreate}>Criar rodada</button></div>
              ) : (
                <>
                  <section className="admin-round-detail-head">
                    <div className="admin-round-number">{String(selectedRound.sort_order).padStart(2, '0')}</div>
                    <div className="admin-round-detail-copy"><span className="eyebrow">Rodada selecionada</span><h2>{selectedRound.name}</h2><p>{selectedRound.stage}</p></div>
                    <div className="admin-round-detail-metrics">
                      <div><span>Datas</span><strong>{formatRoundPeriod(selectedRoundMatches)}</strong></div>
                      <div><span>Fase</span><strong>{selectedRound.stage}</strong></div>
                      <div><span>Status</span>{(() => { const state = ROUND_STATE[roundState(selectedRound, selectedRoundMatches)]; return <AdminStatus tone={state.tone}>{state.label}</AdminStatus> })()}</div>
                      <div><span>Jogos</span><strong>{selectedRoundMatches.length}</strong></div>
                    </div>
                    <div className="admin-round-detail-actions">
                      <button className="secondary-button" type="button" onClick={() => openMatchCreate(selectedRound.id)} disabled={Boolean(selectedRound.closed_at)}>+ Adicionar jogo</button>
                      <button className="admin-quiet-button" type="button" onClick={() => openRoundEdit(selectedRound)} disabled={Boolean(selectedRound.closed_at)}><Icon type="edit" /> Editar rodada</button>
                      {!selectedRound.closed_at && <button className="admin-danger-link" type="button" onClick={() => askCloseRound(selectedRound)} disabled={!selectedRoundMatches.length || !selectedRoundMatches.every(hasResult)}>Encerrar rodada</button>}
                    </div>
                  </section>

                  {selectedRoundMatches.length ? (
                    <section className="admin-games-by-date">
                      {[...new Map(selectedRoundMatches.map((match) => [dateKey(match.kickoff_at), match])).keys()].map((key) => {
                        const dayMatches = selectedRoundMatches.filter((match) => dateKey(match.kickoff_at) === key)
                        return (
                          <div className="admin-game-day" key={key}>
                            <h3>{formatDayTitle(dayMatches[0]?.kickoff_at)}</h3>
                            <div>
                              {dayMatches.map((match) => {
                                const state = matchState(match)
                                const count = predictionCount(match.id)
                                return (
                                  <article className="admin-game-row" key={match.id}>
                                    <time>{formatTime(match.kickoff_at)}</time>
                                    <div className="admin-game-team home"><TeamCrest team={match.home_team} size="small" /><strong>{match.home_team}</strong></div>
                                    <span className="admin-game-versus">×</span>
                                    <div className="admin-game-team"><TeamCrest team={match.away_team} size="small" /><strong>{match.away_team}</strong></div>
                                    <div className="admin-game-state"><AdminStatus tone={state.tone}>{state.label}</AdminStatus><small>{count} {count === 1 ? 'palpite' : 'palpites'}</small></div>
                                    <button className="mini-action" type="button" onClick={() => openMatchEdit(match)} disabled={isLocked(match) || Boolean(selectedRound.closed_at)}>Editar</button>
                                  </article>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </section>
                  ) : (
                    <div className="admin-empty"><div className="admin-empty-icon"><Icon type="match" /></div><h3>Rodada sem jogos</h3><p>Adicione as partidas e os horários para liberar os palpites.</p><button className="primary-button" type="button" onClick={() => openMatchCreate(selectedRound.id)}>Adicionar primeiro jogo</button></div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'results' && (
        <div className="admin-results-workspace">
          <section className="admin-workspace-toolbar results-toolbar">
            <label><span>Temporada</span><select value={selectedSeasonId} onChange={(event) => setSelectedSeasonId(event.target.value)}>{seasons.map((season) => <option value={season.id} key={season.id}>{season.name}{season.is_active ? ' · ativa' : ''}</option>)}</select></label>
            <div className="admin-segmented"><button type="button" className={resultFilter === 'pending' ? 'active' : ''} onClick={() => setResultFilter('pending')}>Aguardando resultado <b>{pendingResults.length}</b></button><button type="button" className={resultFilter === 'finished' ? 'active' : ''} onClick={() => setResultFilter('finished')}>Finalizados <b>{finalizedResults.length}</b></button></div>
          </section>

          <details className="admin-mobile-result-rule">
            <summary><span>ⓘ</span><strong>Qual placar registrar?</strong><i>⌄</i></summary>
            <p><b>90 min</b> sem prorrogação · <b>120 min</b> com prorrogação · pênaltis não contam.</p>
          </details>

          <section className="admin-result-rule">
            <span className="admin-rule-icon">90'</span>
            <div><strong>Qual placar registrar?</strong><p><b>Sem prorrogação:</b> placar após 90 minutos. <b>Com prorrogação:</b> placar após 120 minutos. <b>Pênaltis não entram no placar.</b></p></div>
          </section>

          {resultFilter === 'pending' ? (
            pendingResults.length ? (
              <div className="admin-result-list">
                {pendingResults.map((match) => {
                  const values = resultForms[match.id] || { home_score: '', away_score: '' }
                  return (
                    <article className="admin-result-row" key={match.id}>
                      <div className="admin-result-meta"><span>{formatDateTime(match.kickoff_at)}</span><small>{match.rounds?.name}</small></div>
                      <div className="admin-result-team home"><TeamCrest team={match.home_team} size="medium" /><strong>{match.home_team}</strong></div>
                      <div className="admin-score-entry"><input inputMode="numeric" maxLength="2" value={values.home_score} onChange={(event) => updateResultField(match.id, 'home_score', event.target.value)} aria-label={`Gols de ${match.home_team}`} /><span>×</span><input inputMode="numeric" maxLength="2" value={values.away_score} onChange={(event) => updateResultField(match.id, 'away_score', event.target.value)} aria-label={`Gols de ${match.away_team}`} /></div>
                      <div className="admin-result-team"><TeamCrest team={match.away_team} size="medium" /><strong>{match.away_team}</strong></div>
                      <AdminStatus tone="attention">AGUARDANDO RESULTADO</AdminStatus>
                      <button className="primary-button compact" type="button" disabled={busy || values.home_score === '' || values.away_score === ''} onClick={() => savePendingResult(match)}>Salvar resultado</button>
                    </article>
                  )
                })}
              </div>
            ) : <div className="admin-empty"><span className="admin-empty-check">✓</span><h3>Nenhum resultado pendente</h3><p>Todos os jogos que já começaram possuem resultado registrado.</p></div>
          ) : (
            finalizedResults.length ? (
              <div className="admin-result-list finalized">
                {finalizedResults.map((match) => (
                  <article className="admin-result-row" key={match.id}>
                    <div className="admin-result-meta"><span>{formatDateTime(match.kickoff_at)}</span><small>{match.rounds?.name}</small></div>
                    <div className="admin-result-team home"><TeamCrest team={match.home_team} size="medium" /><strong>{match.home_team}</strong></div>
                    <div className="admin-final-score"><strong>{match.home_score}</strong><span>×</span><strong>{match.away_score}</strong></div>
                    <div className="admin-result-team"><TeamCrest team={match.away_team} size="medium" /><strong>{match.away_team}</strong></div>
                    <AdminStatus tone="finished">FINALIZADO</AdminStatus>
                    <button className="secondary-button compact" type="button" onClick={() => openResultEdit(match)}>Alterar resultado</button>
                  </article>
                ))}
              </div>
            ) : <div className="admin-empty"><h3>Nenhum resultado finalizado</h3><p>Os resultados registrados aparecerão aqui.</p></div>
          )}
        </div>
      )}

      {tab === 'participants' && (
        <div className="admin-participants-workspace">
          <section className="admin-participants-head"><div><span className="eyebrow">Equipe do bolão</span><h2>Participantes</h2><p>{participants.length} {participants.length === 1 ? 'participante cadastrado' : 'participantes cadastrados'}</p></div><div className="admin-participant-note">Novos usuários continuam sendo criados pelo painel de Authentication do Supabase.</div></section>
          {participants.length ? (
            <div className="admin-participant-table">
              <div className="admin-participant-table-head"><span>Participante</span><span>Função</span><span>Foto</span><span /></div>
              {participants.map((participant) => (
                <div className="admin-participant-row" key={participant.id}>
                  <div className="admin-participant-person"><UserAvatar profile={participant} size="medium" /><div><strong>{participant.display_name}</strong><small className="admin-participant-label-desktop">{participant.id === currentProfile?.id ? 'Você' : 'Participante'}</small>{participant.id === currentProfile?.id && <small className="admin-participant-label-mobile">Você</small>}</div></div>
                  <span>{participant.role === 'admin' ? 'Administrador · jogador' : 'Jogador'}</span>
                  <span>{participant.avatar_path ? 'Foto cadastrada' : 'Usando iniciais'}</span>
                  <button className="secondary-button compact" type="button" onClick={() => openAvatar(participant)}>{participant.avatar_path ? 'Alterar foto' : 'Adicionar foto'}</button>
                </div>
              ))}
            </div>
          ) : <div className="admin-empty"><h3>Nenhum participante</h3><p>Crie usuários no Supabase para que eles apareçam aqui.</p></div>}
        </div>
      )}

      {tab === 'rounds' && selectedRound && !selectedRound.closed_at && (
        <button className="admin-mobile-context-cta" type="button" onClick={() => openMatchCreate(selectedRound.id)}>+ Adicionar jogo</button>
      )}

      {seasonDialog && (
        <AdminModal title={seasonDialog.mode === 'edit' ? 'Editar temporada' : 'Nova temporada'} eyebrow="Temporada" onClose={() => setSeasonDialog(null)} footer={<><button className="secondary-button" type="button" onClick={() => setSeasonDialog(null)}>Cancelar</button><button className="primary-button" type="submit" form="season-admin-form" disabled={busy}>{busy ? 'Salvando...' : seasonDialog.mode === 'edit' ? 'Salvar alterações' : 'Criar temporada'}</button></>}>
          <form id="season-admin-form" onSubmit={saveSeason}><label className="field"><span>Nome da temporada</span><input autoFocus value={seasonDialog.form.name} onChange={(event) => setSeasonDialog({ ...seasonDialog, form: { ...seasonDialog.form, name: event.target.value } })} placeholder="Champions League 2026/27" /></label>{seasonDialog.mode === 'create' && <p className="admin-form-note">Se esta for a primeira temporada do projeto, ela será ativada automaticamente.</p>}</form>
        </AdminModal>
      )}

      {roundDialog && (
        <AdminModal title={roundDialog.mode === 'edit' ? 'Editar rodada' : 'Nova rodada'} eyebrow="Estrutura da competição" onClose={() => setRoundDialog(null)} footer={<><button className="secondary-button" type="button" onClick={() => setRoundDialog(null)}>Cancelar</button><button className="primary-button" type="submit" form="round-admin-form" disabled={busy}>{busy ? 'Salvando...' : roundDialog.mode === 'edit' ? 'Salvar rodada' : 'Criar rodada'}</button></>}>
          <form id="round-admin-form" onSubmit={saveRound} className="admin-modal-form">
            <label className="field"><span>Temporada</span><select value={roundDialog.form.season_id} onChange={(event) => setRoundDialog({ ...roundDialog, form: { ...roundDialog.form, season_id: event.target.value } })}>{seasons.map((season) => <option value={season.id} key={season.id}>{season.name}</option>)}</select></label>
            <label className="field"><span>Nome da rodada</span><input value={roundDialog.form.name} onChange={(event) => setRoundDialog({ ...roundDialog, form: { ...roundDialog.form, name: event.target.value } })} placeholder="Rodada 05" /></label>
            <div className="field-grid"><label className="field"><span>Fase</span><input value={roundDialog.form.stage} onChange={(event) => setRoundDialog({ ...roundDialog, form: { ...roundDialog.form, stage: event.target.value } })} /></label><label className="field"><span>Ordem</span><input type="number" min="1" value={roundDialog.form.sort_order} onChange={(event) => setRoundDialog({ ...roundDialog, form: { ...roundDialog.form, sort_order: event.target.value } })} /></label></div>
          </form>
        </AdminModal>
      )}

      {matchDialog && (
        <AdminModal wide title={matchDialog.mode === 'edit' ? 'Editar jogo' : 'Adicionar jogo'} eyebrow={matchDialog.mode === 'edit' ? 'Partida cadastrada' : selectedRound?.name || 'Nova partida'} onClose={() => setMatchDialog(null)} footer={matchSaved ? <><button className="secondary-button" type="button" onClick={() => setMatchSaved(false)}>Adicionar outro</button><button className="primary-button" type="button" onClick={() => setMatchDialog(null)}>Concluir</button></> : <><button className="secondary-button" type="button" onClick={() => setMatchDialog(null)}>Cancelar</button><button className="primary-button" type="submit" form="match-admin-form" disabled={busy}>{busy ? 'Salvando...' : matchDialog.mode === 'edit' ? 'Salvar alterações' : 'Adicionar jogo'}</button></>}>
          {matchSaved ? (
            <div className="admin-success-state"><span>✓</span><h3>Jogo adicionado com sucesso</h3><p>Você pode cadastrar outra partida na mesma rodada ou concluir.</p></div>
          ) : (
            <form id="match-admin-form" onSubmit={saveMatch} className="admin-modal-form match-form-modern">
              <label className="field"><span>Rodada</span><select value={matchDialog.form.round_id} disabled={matchDialog.mode === 'edit' && predictionCount(matchDialog.match.id) > 0} onChange={(event) => setMatchDialog({ ...matchDialog, form: { ...matchDialog.form, round_id: event.target.value } })}>{seasonRounds.filter((round) => !round.closed_at).map((round) => <option value={round.id} key={round.id}>{round.name} · {round.stage}</option>)}</select></label>
              <div className="field-grid team-grid"><TeamPicker label="Mandante" value={matchDialog.form.home_team} onChange={(value) => setMatchDialog({ ...matchDialog, form: { ...matchDialog.form, home_team: value } })} knownTeams={knownTeams} disabled={matchDialog.mode === 'edit' && predictionCount(matchDialog.match.id) > 0} /><TeamPicker label="Visitante" value={matchDialog.form.away_team} onChange={(value) => setMatchDialog({ ...matchDialog, form: { ...matchDialog.form, away_team: value } })} knownTeams={knownTeams} disabled={matchDialog.mode === 'edit' && predictionCount(matchDialog.match.id) > 0} /></div>
              <label className="field match-picked-by-field"><span>Escolhido por</span><select value={matchDialog.form.selected_by_user_id} onChange={(event) => setMatchDialog({ ...matchDialog, form: { ...matchDialog.form, selected_by_user_id: event.target.value } })}><option value="">Selecione o participante</option>{participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.display_name}</option>)}</select><small>Participante responsável por escolher esta partida para a rodada.</small></label>
              <div className="datetime-composer"><label className="date-time-field"><span className="date-time-icon">▦</span><div><small>Data</small><input type="date" value={matchDialog.form.match_date} onChange={(event) => setMatchDialog({ ...matchDialog, form: { ...matchDialog.form, match_date: event.target.value } })} /></div></label><label className="date-time-field"><span className="date-time-icon clock-icon">◷</span><div><small>Horário</small><input type="time" value={matchDialog.form.match_time} onChange={(event) => setMatchDialog({ ...matchDialog, form: { ...matchDialog.form, match_time: event.target.value } })} /></div></label></div>
              {matchDialog.mode === 'edit' && predictionCount(matchDialog.match.id) > 0 && <div className="admin-inline-warning">Já existem {predictionCount(matchDialog.match.id)} palpites neste jogo. Clubes e rodada ficam bloqueados para evitar associar palpites a outro confronto; data e horário ainda podem ser corrigidos antes do início.</div>}
              <div className="admin-match-preview"><span>Prévia</span><div><TeamCrest team={matchDialog.form.home_team} size="medium" /><strong>{matchDialog.form.home_team || 'Mandante'}</strong><i>×</i><strong>{matchDialog.form.away_team || 'Visitante'}</strong><TeamCrest team={matchDialog.form.away_team} size="medium" /></div><small>{matchDialog.form.match_date || 'Data'} · {matchDialog.form.match_time || 'Horário'}</small>{matchDialog.form.selected_by_user_id && <small className="admin-match-picked-preview">Escolhido por <b>{participants.find((participant) => participant.id === matchDialog.form.selected_by_user_id)?.display_name || 'Participante'}</b></small>}</div>
            </form>
          )}
        </AdminModal>
      )}

      {resultDialog && (
        <AdminModal title="Alterar resultado" eyebrow={`${resultDialog.match.rounds?.name || ''} · ${formatDateTime(resultDialog.match.kickoff_at)}`} onClose={() => setResultDialog(null)} footer={<><button className="admin-danger-link" type="button" onClick={() => askClearResult(resultDialog.match)}>Remover resultado</button><span className="admin-modal-footer-spacer" /><button className="secondary-button" type="button" onClick={() => setResultDialog(null)}>Cancelar</button><button className="primary-button" type="button" disabled={busy || resultDialog.values.home_score === '' || resultDialog.values.away_score === ''} onClick={saveEditedResult}>Confirmar alteração</button></>}>
          <div className="admin-result-edit-warning"><strong>Alterar resultado?</strong><p>A classificação e os pontos serão recalculados usando o novo placar.</p></div>
          <div className="admin-result-edit-match"><div><TeamCrest team={resultDialog.match.home_team} size="large" /><strong>{resultDialog.match.home_team}</strong></div><div className="admin-score-entry large"><input inputMode="numeric" maxLength="2" value={resultDialog.values.home_score} onChange={(event) => { const value = sanitizeScore(event.target.value); if (value !== null) setResultDialog({ ...resultDialog, values: { ...resultDialog.values, home_score: value } }) }} /><span>×</span><input inputMode="numeric" maxLength="2" value={resultDialog.values.away_score} onChange={(event) => { const value = sanitizeScore(event.target.value); if (value !== null) setResultDialog({ ...resultDialog, values: { ...resultDialog.values, away_score: value } }) }} /></div><div><TeamCrest team={resultDialog.match.away_team} size="large" /><strong>{resultDialog.match.away_team}</strong></div></div>
        </AdminModal>
      )}

      {avatarDialog && (
        <AdminModal title="Gerenciar foto do participante" eyebrow="Participantes" onClose={() => setAvatarDialog(null)} footer={<><button className="secondary-button" type="button" onClick={() => setAvatarDialog(null)}>Cancelar</button>{avatarDialog.avatar_path && <button className="admin-danger-link" type="button" onClick={() => askRemoveAvatar(avatarDialog)}>Remover foto</button>}<button className="primary-button" type="button" disabled={!avatarFile || avatarBusy} onClick={saveAvatar}>{avatarBusy ? 'Salvando...' : 'Salvar foto'}</button></>}>
          <div className="admin-avatar-editor"><div className="admin-avatar-preview">{avatarPreview ? <img src={avatarPreview} alt="Prévia da nova foto" /> : <UserAvatar profile={avatarDialog} size="admin" interactive={false} />}</div><div><h3>{avatarDialog.display_name}</h3><p>A foto será exibida para os participantes do bolão.</p><label className="secondary-button upload-photo-button"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseAvatar(event.target.files?.[0])} />Selecionar imagem</label><small>JPG, PNG ou WebP · até 5 MB</small></div></div>{avatarError && <div className="form-error admin-avatar-error">{avatarError}</div>}
        </AdminModal>
      )}

      {confirm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirm(null) }}>
          <div className="confirm-modal" role="dialog" aria-modal="true">
            <div className="confirm-icon"><TrophyIcon size={28} /></div>
            <span className="eyebrow">{confirm.eyebrow}</span>
            <h2>{confirm.title}</h2>
            <p>{confirm.text}</p>
            {confirm.tone === 'danger' && <div className="confirm-warning"><strong>Confirme antes de continuar.</strong></div>}
            <div className="confirm-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setConfirm(null)}>Cancelar</button><button className={confirm.tone === 'danger' ? 'danger-button' : 'primary-button'} type="button" disabled={busy} onClick={runConfirm}>{busy ? 'Processando...' : confirm.confirmLabel}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
