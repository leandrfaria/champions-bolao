import { useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from '../components/EmptyState'
import Loading from '../components/Loading'
import PageHeader from '../components/PageHeader'
import TrophyIcon from '../components/TrophyIcon'
import UserAvatar from '../components/UserAvatar'
import { supabase } from '../lib/supabase'
import '../styles/roulette-admin.css'

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value)).replace('.', '')
}

function makeProfile(id, displayName, avatarPath) {
  return { id, display_name: displayName || 'Participante', avatar_path: avatarPath || null }
}

function normalizeRotation(value) {
  return ((value % 360) + 360) % 360
}

function targetRotation(current, index, count, turns) {
  const step = 360 / Math.max(count, 1)
  const targetNormalized = normalizeRotation(360 - index * step)
  const currentNormalized = normalizeRotation(current)
  const delta = (targetNormalized - currentNormalized + 360) % 360
  return current + turns * 360 + delta
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getRoundPlayers(roundDraws, profileMap) {
  return roundDraws.flatMap((draw) => {
    const first = profileMap.get(draw.first_user_id) || makeProfile(draw.first_user_id, draw.first_display_name, draw.first_avatar_path)
    const second = draw.second_display_name
      ? (profileMap.get(draw.second_user_id) || makeProfile(draw.second_user_id, draw.second_display_name, draw.second_avatar_path))
      : null
    return [first, ...(second ? [second] : [])]
  }).slice(0, 2)
}

export default function RoulettePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [season, setSeason] = useState(null)
  const [rounds, setRounds] = useState([])
  const [profiles, setProfiles] = useState([])
  const [excludedIds, setExcludedIds] = useState(new Set())
  const [draws, setDraws] = useState([])
  const [selectedRoundId, setSelectedRoundId] = useState('')
  const [participantCount, setParticipantCount] = useState(2)
  const [spinning, setSpinning] = useState(false)
  const [spinStep, setSpinStep] = useState('idle')
  const [winners, setWinners] = useState([])
  const [wheelRotation, setWheelRotation] = useState(0)
  const [wheelDuration, setWheelDuration] = useState(0)
  const [message, setMessage] = useState('')
  const mountedRef = useRef(true)

  async function load(showLoader = true) {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const read = async (label, query) => {
        try {
          const { data, error: queryError } = await query.abortSignal(AbortSignal.timeout(15000))
          if (queryError) throw queryError
          return data
        } catch (queryError) {
          if (queryError.name === 'TimeoutError' || queryError.name === 'AbortError') {
            throw new Error(`${label}: a consulta excedeu 15 segundos. Verifique a conexão e tente novamente.`)
          }
          throw new Error(`${label}: ${queryError.message || 'não foi possível consultar os dados.'}`)
        }
      }
      const [seasonData, profileData, exclusionData, drawData] = await Promise.all([
        read('Temporada', supabase.from('seasons').select('*').eq('is_active', true).maybeSingle()),
        read('Participantes', supabase.from('profiles').select('*').order('display_name')),
        read('Disponibilidade da roleta', supabase.from('roulette_exclusions').select('user_id')),
        read('Histórico da roleta', supabase.from('roulette_draws').select('*, rounds(name, sort_order, season_id)').order('created_at', { ascending: false })),
      ])

      let roundData = []
      if (seasonData) {
        roundData = await read('Rodadas da temporada', supabase
          .from('rounds')
          .select('*')
          .eq('season_id', seasonData.id)
          .order('sort_order', { ascending: true })) || []
      }

      if (!mountedRef.current) return
      setSeason(seasonData || null)
      setProfiles(profileData || [])
      setExcludedIds(new Set((exclusionData || []).map((item) => item.user_id)))
      setDraws(drawData || [])
      setRounds(roundData)
      setSelectedRoundId((current) => current && roundData.some((round) => round.id === current) ? current : '')
    } catch (loadError) {
      if (mountedRef.current) {
        setError(loadError.message || 'Não foi possível carregar o sorteio.')
      }
    } finally {
      if (showLoader && mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    load()
    return () => { mountedRef.current = false }
  }, [])

  const available = useMemo(() => profiles.filter((profile) => !excludedIds.has(profile.id)), [profiles, excludedIds])
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const roundMap = useMemo(() => new Map(rounds.map((round) => [round.id, round])), [rounds])
  const selectedRound = roundMap.get(selectedRoundId) || null
  const selectedRoundDraws = useMemo(() => draws
    .filter((draw) => draw.round_id === selectedRoundId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)), [draws, selectedRoundId])
  const roundPlayers = useMemo(() => getRoundPlayers(selectedRoundDraws, profileMap), [selectedRoundDraws, profileMap])
  const assignedCount = roundPlayers.length
  const remainingSlots = Math.max(0, 2 - assignedCount)
  const canDrawOne = Boolean(selectedRoundId && remainingSlots > 0 && available.length >= 1)
  const canDrawTwo = Boolean(selectedRoundId && remainingSlots >= 2 && available.length >= 2)

  useEffect(() => {
    if (participantCount === 2 && !canDrawTwo && canDrawOne) setParticipantCount(1)
    else if (!canDrawOne && participantCount !== 1) setParticipantCount(1)
  }, [participantCount, canDrawOne, canDrawTwo])

  const status = assignedCount >= 2
    ? { label: 'Rodada concluída', detail: '2 de 2 definidos', tone: 'complete' }
    : assignedCount === 1
      ? { label: 'Rodada parcial', detail: '1 de 2 definidos', tone: 'partial' }
      : { label: 'Rodada vazia', detail: '0 de 2 definidos', tone: 'empty' }

  const groupedHistory = useMemo(() => {
    const groups = new Map()
    for (const draw of [...draws].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
      if (!groups.has(draw.round_id)) groups.set(draw.round_id, [])
      groups.get(draw.round_id).push(draw)
    }
    return [...groups.entries()]
      .map(([roundId, roundDraws]) => ({ roundId, draws: roundDraws, latest: roundDraws.at(-1)?.created_at }))
      .sort((a, b) => new Date(b.latest) - new Date(a.latest))
  }, [draws])

  async function spin() {
    if (spinning) return
    if (!selectedRoundId) {
      setError('Selecione uma rodada antes de girar a roleta.')
      return
    }
    if (!canDrawOne) {
      setError(assignedCount >= 2 ? 'Esta rodada já está completa.' : 'Não há participantes disponíveis para o sorteio.')
      return
    }
    if (participantCount === 2 && !canDrawTwo) {
      setError(remainingSlots < 2 ? 'Só resta 1 vaga para completar esta rodada.' : 'Só existe 1 participante elegível. Escolha “Sortear 1”.')
      return
    }

    const requestedCount = participantCount
    const startSlot = assignedCount
    setSpinning(true)
    setSpinStep('preparing')
    setError('')
    setMessage('')
    setWinners([])

    try {
      const { data, error: spinError } = await supabase.rpc('spin_round_roulette', {
        p_round_id: selectedRoundId,
        p_participant_count: requestedCount,
      })
      if (spinError) throw spinError
      const result = Array.isArray(data) ? data[0] : data
      if (!result) throw new Error('A roleta não retornou um resultado.')

      const nextWinners = [makeProfile(result.first_user_id, result.first_display_name, result.first_avatar_path)]
      if (result.second_display_name) nextWinners.push(makeProfile(result.second_user_id, result.second_display_name, result.second_avatar_path))

      const firstIndex = Math.max(0, available.findIndex((profile) => profile.id === result.first_user_id))
      const firstRotation = targetRotation(wheelRotation, firstIndex, available.length, 5)
      setSpinStep('first')
      setWheelDuration(2250)
      requestAnimationFrame(() => setWheelRotation(firstRotation))
      await wait(2320)
      if (!mountedRef.current) return

      setWinners([nextWinners[0]])
      setSpinStep('first-revealed')
      await wait(550)
      if (!mountedRef.current) return

      if (nextWinners.length === 2) {
        const secondIndex = Math.max(0, available.findIndex((profile) => profile.id === result.second_user_id))
        const secondRotation = targetRotation(firstRotation, secondIndex, available.length, 4)
        setSpinStep('second')
        setWheelDuration(1850)
        requestAnimationFrame(() => setWheelRotation(secondRotation))
        await wait(1920)
        if (!mountedRef.current) return
        setWinners(nextWinners)
      }

      setSpinStep('done')
      const names = nextWinners.map((profile) => profile.display_name)
      const completionMessage = remainingSlots === nextWinners.length
        ? `Rodada ${result.round_name} concluída: ${names.join(' e ')} ${names.length === 1 ? 'foi escolhido' : 'foram escolhidos'}.`
        : `${names.join(' e ')} ${names.length === 1 ? 'foi sorteado' : 'foram sorteados'} para a rodada ${result.round_name}. Ainda falta 1 participante para completá-la.`
      setMessage(completionMessage)
      await wait(350)
      if (!mountedRef.current) return
      await load(false)
      setWinners([])
      setSpinning(false)
    } catch (spinError) {
      if (!mountedRef.current) return
      setSpinning(false)
      setSpinStep('idle')
      setWinners([])
      setError(spinError.message || 'Não foi possível girar a roleta.')
    }
  }

  if (loading) return <Loading label="Preparando a roleta..." />

  const wheelStepLabel = spinStep === 'second' ? `${Math.min(2, assignedCount + 2)}º nome` : `${Math.min(2, assignedCount + 1)}º nome`

  return (
    <main className="page-wrap roulette-page sports-surface">
      <PageHeader eyebrow={season?.name || 'Área administrativa'} title="Sorteio" description="Defina quem escolhe os jogos de cada rodada." />

      {error && <div className="form-error roulette-flash" role="alert"><span>{error}</span><button className="secondary-button compact roulette-retry-button" type="button" onClick={() => load()} disabled={loading}>Tentar novamente</button></div>}
      {message && <div className="form-success roulette-flash" role="status">{message}</div>}

      {!season ? (
        <EmptyState title="Nenhuma temporada ativa" text="Ative uma temporada para realizar o sorteio das rodadas." />
      ) : (
        <>
          <section className="roulette-ops-panel" aria-label="Controle do sorteio">
            <label className="roulette-field">
              <span>Rodada</span>
              <select value={selectedRoundId} onChange={(event) => { setSelectedRoundId(event.target.value); setWinners([]); setMessage(''); setError(''); setSpinStep('idle'); setParticipantCount(2) }} disabled={spinning}>
                <option value="">Selecione uma rodada</option>
                {rounds.map((round) => <option key={round.id} value={round.id}>{String(round.sort_order).padStart(2, '0')} · {round.name}</option>)}
              </select>
            </label>

            <div className={`roulette-round-state tone-${status.tone}`} aria-live="polite">
              <span className="roulette-state-dot" />
              <div><strong>{selectedRound ? status.label : 'Aguardando rodada'}</strong><small>{selectedRound ? status.detail : 'Selecione uma rodada para continuar'}</small></div>
            </div>

            <fieldset className="roulette-count-field" disabled={!selectedRound || spinning || (!canDrawOne && !canDrawTwo)}>
              <legend>Quantidade neste giro</legend>
              <div className="roulette-count-options">
                <button type="button" className={participantCount === 1 ? 'is-active' : ''} aria-pressed={participantCount === 1} onClick={() => setParticipantCount(1)} disabled={!canDrawOne}>Sortear 1</button>
                <button type="button" className={participantCount === 2 ? 'is-active' : ''} aria-pressed={participantCount === 2} onClick={() => setParticipantCount(2)} disabled={!canDrawTwo}>Sortear 2</button>
              </div>
            </fieldset>

            <button className="primary-button roulette-spin-button" type="button" onClick={spin} disabled={spinning || !canDrawOne || (participantCount === 2 && !canDrawTwo)} aria-busy={spinning}>
              <span className="roulette-spin-icon" aria-hidden="true">✦</span>
              {spinning ? 'Girando...' : assignedCount === 1 ? 'Completar rodada' : 'Girar roleta'}
            </button>

            <div className="roulette-ops-metrics" aria-label="Resumo da roleta">
              <span><strong>{available.length}</strong> disponíveis</span>
              <span><strong>{excludedIds.size}</strong> sorteados no total</span>
              <span><strong>{assignedCount}/2</strong> nesta rodada</span>
              <span><strong>{remainingSlots}</strong> vagas restantes</span>
            </div>
            <p className="roulette-round-hint">
              {!selectedRound ? 'Escolha uma rodada para ver as vagas e iniciar o sorteio.' : assignedCount >= 2 ? 'Rodada já completa.' : available.length === 0 ? 'Não há participantes disponíveis; redefina a roleta na Administração.' : remainingSlots > 1 && available.length === 1 ? 'Há apenas 1 participante elegível: é possível sortear 1 agora e completar depois.' : `Falta${remainingSlots === 1 ? '' : 'm'} ${remainingSlots} participante${remainingSlots === 1 ? '' : 's'} para completar a rodada.`}
            </p>
          </section>

          <section className="roulette-console-grid" aria-label="Roleta e participantes escolhidos">
            <div className={`roulette-stage ${spinning ? 'is-spinning' : ''} step-${spinStep}`} aria-live="polite">
              <div className="roulette-wheel-shell">
                <div className="roulette-pointer" aria-hidden="true"><span>▼</span><small>{wheelStepLabel}</small></div>
                <div className="roulette-wheel" style={{ '--roulette-rotation': `${wheelRotation}deg`, '--roulette-duration': `${wheelDuration}ms` }}>
                  {available.map((profile, index, list) => (
                    <div className="roulette-wheel-person" key={profile.id} style={{ '--roulette-angle': `${(360 / Math.max(list.length, 1)) * index}deg` }}>
                      <UserAvatar profile={profile} size="small" interactive={false} />
                    </div>
                  ))}
                  <div className="roulette-wheel-center"><TrophyIcon size={35} /><span>{spinning ? wheelStepLabel : 'SORTEIO'}</span></div>
                </div>
              </div>
              <div className="roulette-wheel-caption"><span className="eyebrow">Roleta da temporada</span><strong>{available.length ? `${available.length} participantes elegíveis` : 'Pool sem participantes disponíveis'}</strong></div>
            </div>

            <section className="roulette-round-result" aria-label="Participantes definidos para a rodada">
              <header><div><span className="eyebrow">Resultado da rodada</span><h2>{selectedRound?.name || 'Selecione uma rodada'}</h2></div><span className={`roulette-result-count tone-${status.tone}`}>{assignedCount}/2</span></header>
              <div className="roulette-winner-slots">
                {[0, 1].map((slot) => {
                  const persisted = roundPlayers[slot]
                  const transient = slot >= assignedCount ? winners[slot - assignedCount] : null
                  const profile = persisted || transient
                  const isCurrent = Boolean(transient)
                  const isRevealing = spinning && isCurrent && ((spinStep === 'first-revealed' && (slot === assignedCount)) || spinStep === 'done' || spinStep === 'second')
                  return (
                    <div className={`roulette-winner-card ${profile ? 'has-profile' : ''}${isRevealing ? ' is-arriving' : ''}`} key={slot}>
                      <div className="roulette-slot-heading">
                        <span className="roulette-slot-number">{slot + 1}ª vaga</span>
                        <span className={`roulette-slot-state ${profile ? 'is-filled' : ''}`}>{profile ? 'Definido' : 'Em aberto'}</span>
                      </div>
                      <div className="roulette-slot-body">
                        {profile ? <UserAvatar profile={profile} size="large" interactive={!spinning} /> : <div className="roulette-winner-placeholder" aria-hidden="true">{slot + 1}</div>}
                        <div className="roulette-slot-copy"><strong>{profile?.display_name || 'Aguardando sorteio'}</strong><small>{profile ? (selectedRoundDraws.length > 1 ? `Sorteio ${selectedRoundDraws.findIndex((draw) => draw.first_user_id === profile.id || draw.second_user_id === profile.id) + 1} · ${slot + 1}º escolhido` : `${slot + 1}º escolhido`) : 'Vaga disponível nesta rodada'}</small></div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className={`roulette-status-note tone-${status.tone}`}>{status.label} · {status.detail}{selectedRound && remainingSlots > 0 ? ` · ${remainingSlots === 1 ? 'falta 1 participante' : 'faltam 2 participantes'}` : ''}</p>
            </section>
          </section>

          <section className="roulette-history-section">
            <div className="sports-section-heading"><div><span>Registro</span><h2>Histórico de sorteios</h2></div><small>{draws.length} giros</small></div>
            {groupedHistory.length ? (
              <div className="roulette-history-list">
                {groupedHistory.map(({ roundId, draws: roundDraws }) => {
                  const round = roundDraws[0]?.rounds || roundMap.get(roundId)
                  return <article className="roulette-history-round-group" key={roundId}>
                    <header><strong>{round?.name || 'Rodada'}</strong><span>{roundDraws.length === 1 ? '1 sorteio' : `${roundDraws.length} sorteios`}</span></header>
                    <div className="roulette-history-events">
                      {roundDraws.map((draw, index) => {
                        const first = profileMap.get(draw.first_user_id) || makeProfile(draw.first_user_id, draw.first_display_name, draw.first_avatar_path)
                        const second = draw.second_display_name ? (profileMap.get(draw.second_user_id) || makeProfile(draw.second_user_id, draw.second_display_name, draw.second_avatar_path)) : null
                        return <div className="roulette-history-event" key={draw.id}>
                          <span className="roulette-history-time">{formatDate(draw.created_at)}</span>
                          <span className="roulette-history-sequence">{roundDraws.length > 1 ? `${index + 1}º giro · ` : ''}{second ? 'Sorteados juntos' : 'Sorteio individual'}</span>
                          <div className="roulette-history-winners">
                            <span><UserAvatar profile={first} size="tiny" interactive={false} /><b>{first.display_name}</b></span>
                            {second && <><i aria-hidden="true">+</i><span><UserAvatar profile={second} size="tiny" interactive={false} /><b>{second.display_name}</b></span></>}
                          </div>
                        </div>
                      })}
                    </div>
                  </article>
                })}
              </div>
            ) : <div className="roulette-history-empty">Nenhum sorteio realizado ainda.</div>}
          </section>
        </>
      )}
    </main>
  )
}
