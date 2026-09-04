import { useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from '../components/EmptyState'
import Loading from '../components/Loading'
import PageHeader from '../components/PageHeader'
import TrophyIcon from '../components/TrophyIcon'
import UserAvatar from '../components/UserAvatar'
import { supabase } from '../lib/supabase'

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

export default function RoulettePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [season, setSeason] = useState(null)
  const [rounds, setRounds] = useState([])
  const [profiles, setProfiles] = useState([])
  const [excludedIds, setExcludedIds] = useState(new Set())
  const [draws, setDraws] = useState([])
  const [selectedRoundId, setSelectedRoundId] = useState('')
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
      const [{ data: seasonData, error: seasonError }, { data: profileData, error: profileError }, { data: exclusionData, error: exclusionError }, { data: drawData, error: drawError }] = await Promise.all([
        supabase.from('seasons').select('*').eq('is_active', true).maybeSingle(),
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('roulette_exclusions').select('user_id'),
        supabase.from('roulette_draws').select('*, rounds(name, sort_order, season_id)').order('created_at', { ascending: false }).limit(30),
      ])
      const firstError = seasonError || profileError || exclusionError || drawError
      if (firstError) throw firstError

      let roundData = []
      if (seasonData) {
        const { data, error: roundError } = await supabase
          .from('rounds')
          .select('*')
          .eq('season_id', seasonData.id)
          .order('sort_order', { ascending: true })
        if (roundError) throw roundError
        roundData = data || []
      }

      if (!mountedRef.current) return
      setSeason(seasonData || null)
      setProfiles(profileData || [])
      setExcludedIds(new Set((exclusionData || []).map((item) => item.user_id)))
      setDraws(drawData || [])
      setRounds(roundData)
      setSelectedRoundId((current) => current && roundData.some((round) => round.id === current) ? current : '')
    } catch (loadError) {
      if (mountedRef.current) setError(loadError.message || 'Não foi possível carregar o sorteio.')
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
  const excluded = useMemo(() => profiles.filter((profile) => excludedIds.has(profile.id)), [profiles, excludedIds])
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const roundMap = useMemo(() => new Map(rounds.map((round) => [round.id, round])), [rounds])
  const selectedRound = roundMap.get(selectedRoundId) || null

  async function spin() {
    if (spinning || !selectedRoundId) return
    if (available.length < 2) {
      setError('Não há dois participantes disponíveis. Redefina os participantes da roleta na Administração.')
      return
    }

    setSpinning(true)
    setSpinStep('preparing')
    setError('')
    setMessage('')
    setWinners([])

    try {
      const { data, error: spinError } = await supabase.rpc('spin_round_roulette', { p_round_id: selectedRoundId })
      if (spinError) throw spinError
      const result = Array.isArray(data) ? data[0] : data
      if (!result) throw new Error('A roleta não retornou um resultado.')

      const nextWinners = [
        makeProfile(result.first_user_id, result.first_display_name, result.first_avatar_path),
        makeProfile(result.second_user_id, result.second_display_name, result.second_avatar_path),
      ]
      const firstIndex = Math.max(0, available.findIndex((profile) => profile.id === result.first_user_id))
      const secondIndex = Math.max(0, available.findIndex((profile) => profile.id === result.second_user_id))

      setSpinStep('first')
      setWheelDuration(2250)
      const firstRotation = targetRotation(wheelRotation, firstIndex, available.length, 5)
      requestAnimationFrame(() => setWheelRotation(firstRotation))
      await wait(2320)
      if (!mountedRef.current) return

      setWinners([nextWinners[0]])
      setSpinStep('first-revealed')
      await wait(650)
      if (!mountedRef.current) return

      setSpinStep('second')
      setWheelDuration(1850)
      const secondRotation = targetRotation(firstRotation, secondIndex, available.length, 4)
      requestAnimationFrame(() => setWheelRotation(secondRotation))
      await wait(1920)
      if (!mountedRef.current) return

      setWinners(nextWinners)
      setSpinStep('done')
      await wait(450)
      if (!mountedRef.current) return

      setSpinning(false)
      setMessage(`${result.first_display_name} e ${result.second_display_name} foram escolhidos para definir os jogos de ${result.round_name}.`)
      await load(false)
    } catch (spinError) {
      if (!mountedRef.current) return
      setSpinning(false)
      setSpinStep('idle')
      setWinners([])
      setError(spinError.message || 'Não foi possível girar a roleta.')
    }
  }

  if (loading) return <Loading label="Preparando a roleta..." />

  return (
    <div className="page-wrap roulette-page sports-surface">
      <PageHeader
        eyebrow="Escolha dos jogos"
        title="Sorteio"
        description="Defina quem será responsável por escolher os jogos de cada rodada."
      />

      {error && <div className="form-error roulette-flash">{error}</div>}
      {message && <div className="form-success roulette-flash">{message}</div>}

      {!season ? (
        <EmptyState title="Nenhuma temporada ativa" text="Ative uma temporada para realizar o sorteio das rodadas." />
      ) : (
        <>
          <section className="roulette-control-panel">
            <div className="roulette-season-copy">
              <span className="eyebrow">{season.name}</span>
              <h2>Quem escolhe os próximos jogos?</h2>
              <p>Cada giro seleciona duas pessoas em sequência. Depois de escolhidas, elas saem da roleta até a redefinição feita pela Administração.</p>
            </div>

            <div className="roulette-round-control">
              <label>
                <span>Vincular resultado à rodada</span>
                <select value={selectedRoundId} onChange={(event) => { setSelectedRoundId(event.target.value); setWinners([]); setMessage(''); setSpinStep('idle') }} disabled={spinning}>
                  <option value="">Selecione uma rodada</option>
                  {rounds.map((round) => <option key={round.id} value={round.id}>{String(round.sort_order).padStart(2, '0')} · {round.name}</option>)}
                </select>
              </label>
              <div className="roulette-pool-stats">
                <span><strong>{available.length}</strong> disponíveis</span>
                <span><strong>{excluded.length}</strong> já sorteados</span>
              </div>
              <button className="primary-button roulette-spin-button" type="button" onClick={spin} disabled={spinning || !selectedRoundId || available.length < 2}>
                <span className="roulette-spin-icon">✦</span>
                {spinning ? (spinStep === 'second' ? 'Sorteando 2º nome...' : 'Sorteando 1º nome...') : 'Girar roleta'}
              </button>
              <p className="roulette-admin-note">Área exclusiva do administrador. Os participantes recebem o resultado pelo feed de Atividades.</p>
            </div>
          </section>

          <section className={`roulette-stage ${spinning ? 'is-spinning' : ''} step-${spinStep}`} aria-live="polite">
            <div className="roulette-wheel-shell">
              <div className="roulette-pointer" aria-hidden="true"><span>▼</span><small>{spinStep === 'second' ? '2º nome' : '1º nome'}</small></div>
              <div
                className="roulette-wheel"
                style={{ '--roulette-rotation': `${wheelRotation}deg`, '--roulette-duration': `${wheelDuration}ms` }}
              >
                {available.map((profile, index, list) => (
                  <div
                    className="roulette-wheel-person"
                    key={profile.id}
                    style={{ '--roulette-angle': `${(360 / Math.max(list.length, 1)) * index}deg` }}
                  >
                    <UserAvatar profile={profile} size="small" interactive={false} />
                  </div>
                ))}
                <div className="roulette-wheel-center">
                  <TrophyIcon size={35} />
                  <span>{spinStep === 'second' ? '2º nome' : spinStep === 'done' ? 'definidos' : '1º nome'}</span>
                </div>
              </div>
            </div>

            <div className="roulette-result-area">
              <span className="eyebrow">{spinning ? 'Definindo responsáveis...' : winners.length ? 'Escolhidos' : selectedRound ? selectedRound.name : 'Aguardando rodada'}</span>
              <div className="roulette-winner-slots">
                {[0, 1].map((slot) => {
                  const profile = winners[slot]
                  const arriving = Boolean(profile) && ((slot === 0 && spinStep === 'first-revealed') || (slot === 1 && spinStep === 'done'))
                  return (
                    <div className={`roulette-winner-card ${profile ? 'has-profile' : ''} ${arriving ? 'is-arriving' : ''}`} key={slot}>
                      <span className="roulette-slot-number">{slot + 1}º</span>
                      {profile ? <UserAvatar profile={profile} size="xl" interactive={!spinning} /> : <div className="roulette-winner-placeholder">?</div>}
                      <strong>{profile?.display_name || (slot === 0 ? '1º escolhido' : '2º escolhido')}</strong>
                      <small>{profile ? 'Escolhe 3 jogos' : slot === 0 && spinning ? 'A roleta está decidindo...' : slot === 1 && winners[0] ? 'Próximo sorteio...' : 'Aguardando sorteio'}</small>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="roulette-pool-section">
            <div className="sports-section-heading">
              <div><span>Participantes</span><h2>Na roleta agora</h2></div>
            </div>
            {available.length ? (
              <div className="roulette-available-list">
                {available.map((profile) => <div key={profile.id}><UserAvatar profile={profile} size="tiny" /><strong>{profile.display_name}</strong></div>)}
              </div>
            ) : <div className="roulette-empty-pool">Todos os participantes já foram sorteados. Redefina a roleta pela Administração.</div>}
          </section>

          <section className="roulette-history-section">
            <div className="sports-section-heading">
              <div><span>Registro</span><h2>Últimos sorteios</h2></div>
            </div>
            {draws.length ? (
              <div className="roulette-history-list">
                {draws.map((draw) => {
                  const first = profileMap.get(draw.first_user_id) || makeProfile(draw.first_user_id, draw.first_display_name, draw.first_avatar_path)
                  const second = profileMap.get(draw.second_user_id) || makeProfile(draw.second_user_id, draw.second_display_name, draw.second_avatar_path)
                  const round = draw.rounds || roundMap.get(draw.round_id)
                  return (
                    <article key={draw.id}>
                      <div className="roulette-history-round"><strong>{round?.name || 'Rodada'}</strong><span>{formatDate(draw.created_at)}</span></div>
                      <div className="roulette-history-winners">
                        <span><UserAvatar profile={first} size="tiny" /><b>{first.display_name}</b></span>
                        <i>+</i>
                        <span><UserAvatar profile={second} size="tiny" /><b>{second.display_name}</b></span>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : <div className="roulette-history-empty">Nenhum sorteio realizado ainda.</div>}
          </section>
        </>
      )}
    </div>
  )
}
