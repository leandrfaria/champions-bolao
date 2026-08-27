import { useEffect, useState } from 'react'
import TeamCrest from '../components/TeamCrest'
import TrophyIcon from '../components/TrophyIcon'
import { supabase } from '../lib/supabase'

function RuleIcon({ name }) {
  const icons = {
    calendar: <><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 3v5M16 3v5M4 10h16"/></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    chart: <><path d="M4 20V10M10 20V5M16 20v-8M22 20H2"/></>,
    send: <><path d="m3 11 18-8-8 18-2-7-8-3Z"/><path d="m11 14 4-4"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c.4-4 2.4-6 6-6s5.6 2 6 6"/><path d="M16 6a3 3 0 0 1 0 6M18 14c2 .7 3 2.7 3 6"/></>,
    trophy: <><path d="M7 4h10v5c0 4-2 7-5 8-3-1-5-4-5-8V4Z"/><path d="M7 6H3v2c0 3 2 5 5 5M17 6h4v2c0 3-2 5-5 5M12 17v3M8 21h8"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{icons[name] || icons.check}</svg>
}

const FLOW = [
  { number: '01', icon: 'calendar', title: 'Rodada abre', text: 'Os jogos e horários da rodada ficam disponíveis.' },
  { number: '02', icon: 'edit', title: 'Faça seu palpite', text: 'Informe o placar e salve antes do início da partida.' },
  { number: '03', icon: 'lock', title: 'Jogo começa', text: 'O palpite é bloqueado e não pode mais ser alterado.' },
  { number: '04', icon: 'chart', title: 'Pontuação atualiza', text: 'Com o resultado registrado, o sistema calcula os pontos.' },
]

const SCORE_EXAMPLES = [
  {
    points: '0 pts', tone: 'zero', home: 'Real Madrid', away: 'Liverpool', result: [1, 2], prediction: [2, 1],
    label: 'Não pontuou', text: 'O vencedor previsto estava incorreto.',
  },
  {
    points: '+1 pt', tone: 'winner', home: 'Barcelona', away: 'Inter', result: [2, 1], prediction: [3, 0],
    label: 'Acertou o vencedor', text: 'Você acertou quem venceu, mas não o placar.',
  },
  {
    points: '+3 pts', tone: 'exact', home: 'Bayern de Munique', away: 'Arsenal', result: [2, 0], prediction: [2, 0],
    label: 'Placar exato', text: 'Você acertou o vencedor e o placar exato.',
  },
]

function ScoreExample({ example }) {
  return (
    <article className={`about-score-example ${example.tone}`}>
      <span className="about-score-points">{example.points}</span>
      <div className="about-score-match">
        <div><TeamCrest team={example.home} size="medium" /><strong>{example.home}</strong></div>
        <div className="about-score-result"><small>Resultado real</small><b>{example.result[0]} <span>×</span> {example.result[1]}</b></div>
        <div className="away"><TeamCrest team={example.away} size="medium" /><strong>{example.away}</strong></div>
      </div>
      <div className="about-score-prediction"><span>Seu palpite</span><strong>{example.prediction[0]} <i>×</i> {example.prediction[1]}</strong></div>
      <div className="about-score-verdict"><b>{example.label}</b><p>{example.text}</p></div>
    </article>
  )
}

function RegulationItem({ title, subtitle, children, open = false }) {
  return (
    <details className="about-regulation-item" open={open}>
      <summary><div><strong>{title}</strong><span>{subtitle}</span></div><i>⌄</i></summary>
      <div className="about-regulation-body">{children}</div>
    </details>
  )
}

function RegulationItems({ firstOpen = false }) {
  return (
    <>
      <RegulationItem title="Desempate" subtitle="Critérios usados para definir posições." open={firstOpen}>
        <ol>
          <li><strong>Pontuação total.</strong></li>
          <li><strong>Placares exatos acertados.</strong></li>
          <li><strong>Vencedores acertados.</strong></li>
        </ol>
        <p>Um placar exato em um jogo com vencedor também conta como vencedor acertado. Em placares de empate, não existe vencedor para contabilizar nesse terceiro critério.</p>
        <p>Se os três critérios forem iguais, os participantes permanecem empatados.</p>
      </RegulationItem>
      <RegulationItem title="Prorrogação" subtitle="Como partidas com 120 minutos são tratadas.">
        <p>Quando houver prorrogação, vale o placar ao fim dos <strong>120 minutos</strong>. Disputa de pênaltis não entra no placar do bolão.</p>
      </RegulationItem>
      <RegulationItem title="Escolha dos jogos" subtitle="Quais partidas entram nas rodadas.">
        <p>Na fase de liga, são <strong>6 jogos por rodada</strong>. Duas pessoas ficam responsáveis pelas escolhas e cada uma seleciona 3 partidas.</p>
        <p>A ordem dos responsáveis é definida pelo grupo e não fica travada no sistema. Se alguém não definir seus 3 jogos até <strong>6 horas antes da partida</strong>, as escolhas daquela pessoa são definidas por sorteio.</p>
      </RegulationItem>
      <RegulationItem title="Entrada e premiação" subtitle="Como funciona a participação financeira.">
        <p>O Pix de entrada é de <strong>R$ 50</strong>, feito no início da Champions. É preciso ter pago para começar a apostar.</p>
        <p>Quem terminar em último paga mais <strong>R$ 10</strong> diretamente ao vencedor.</p>
        <p>O site não processa pagamentos; essa parte continua sendo um combinado do grupo.</p>
      </RegulationItem>
      <RegulationItem title="Regras do sistema" subtitle="Privacidade, prazo e participantes.">
        <ul>
          <li>O administrador também não pode ver palpites secretos antes da hora.</li>
          <li>O bloqueio considera o horário salvo no banco, e não o relógio do dispositivo.</li>
          <li>Depois que o resultado é informado, os pontos são calculados automaticamente.</li>
          <li>Não existe quantidade fixa de participantes; novos usuários entram normalmente no bolão.</li>
        </ul>
      </RegulationItem>
    </>
  )
}

export default function AboutPage() {
  const [participantCount, setParticipantCount] = useState(null)
  const [season, setSeason] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('seasons').select('*').eq('is_active', true).maybeSingle(),
    ]).then(([profileResult, seasonResult]) => {
      if (!active) return
      if (profileResult.error) setError(profileResult.error.message)
      else if (typeof profileResult.count === 'number') setParticipantCount(profileResult.count)
      if (seasonResult.error) setError(seasonResult.error.message)
      else setSeason(seasonResult.data || null)
    })
    return () => { active = false }
  }, [])

  return (
    <div className="page-wrap about-hub sports-surface">
      <header className="about-page-header">
        <span className="sports-eyebrow">Regulamento</span>
        <h1>Sobre o bolão</h1>
        <p>Entenda como funcionam os palpites, a pontuação e as regras da disputa.</p>
      </header>

      {error && <div className="form-error">{error}</div>}

      <div className="about-layout">
        <main className="about-main">
          <section className="about-section about-flow-section">
            <span className="about-section-kicker">Como funciona</span>
            <div className="about-flow">
              {FLOW.map((step, index) => (
                <div className="about-flow-wrap" key={step.number}>
                  <article className="about-flow-step">
                    <div className="about-flow-top"><span>{step.number}</span><i><RuleIcon name={step.icon} /></i></div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </article>
                  {index < FLOW.length - 1 && <span className="about-flow-arrow">→</span>}
                </div>
              ))}
            </div>
          </section>

          <section className="about-section about-points-section">
            <div className="about-section-heading">
              <div><span className="about-section-kicker">Como você pontua</span><h2>Três resultados possíveis</h2></div>
              <p>Acertar o placar exato vale 3 pontos no total: 1 pelo resultado correto e +2 pelo placar.</p>
            </div>
            <div className="about-score-grid">
              {SCORE_EXAMPLES.map((example) => <ScoreExample key={example.points} example={example} />)}
            </div>
          </section>

          <div className="about-two-column">
            <section className="about-section about-secret-section">
              <span className="about-section-kicker">Palpites secretos</span>
              <div className="about-secret-content">
                <div className="about-lock-orbit"><RuleIcon name="lock" /></div>
                <div>
                  <h2>Seu placar fica protegido</h2>
                  <p><strong>Antes do início:</strong> os demais podem saber que você enviou um palpite, mas não conseguem ver o placar.</p>
                  <p><strong>No início da partida:</strong> o palpite é bloqueado e não pode mais ser criado ou alterado.</p>
                  <p><strong>Depois do início:</strong> os palpites daquela partida podem ser revelados conforme a regra atual do sistema.</p>
                </div>
              </div>
            </section>

            <section className="about-section about-cycle-section">
              <span className="about-section-kicker">Ciclo do palpite</span>
              <div className="about-cycle">
                <div><i><RuleIcon name="calendar" /></i><strong>Aberto</strong><span>Pode criar ou editar.</span></div>
                <div><i><RuleIcon name="send" /></i><strong>Enviado</strong><span>Palpite salvo.</span></div>
                <div><i><RuleIcon name="lock" /></i><strong>Bloqueado</strong><span>Prazo encerrado.</span></div>
                <div className="done"><i><RuleIcon name="check" /></i><strong>Finalizado</strong><span>Pontos calculados.</span></div>
              </div>
            </section>
          </div>

          <section className="about-regulation-panel about-regulation-mobile">
            <span className="about-section-kicker">Regulamento completo</span>
            <RegulationItems />
          </section>
        </main>

        <aside className="about-side">
          <section className="about-numbers-panel">
            <div className="about-side-title"><TrophyIcon size={20} /><span>Nosso bolão em números</span></div>
            <div className="about-number-row">
              <i><RuleIcon name="users" /></i>
              <div><strong>Participantes</strong><span>Concorrendo ao título</span></div>
              <b>{participantCount ?? '—'}</b>
            </div>
            <div className="about-number-row">
              <i><RuleIcon name="calendar" /></i>
              <div><strong>Temporada</strong><span>Champions League</span></div>
              <b>{season?.name || '—'}</b>
            </div>
          </section>

          <section className="about-regulation-panel about-regulation-desktop">
            <span className="about-section-kicker">Regulamento completo</span>
            <RegulationItems firstOpen />
          </section>
        </aside>
      </div>
    </div>
  )
}
