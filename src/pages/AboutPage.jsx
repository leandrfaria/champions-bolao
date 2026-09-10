import { useEffect, useMemo, useState } from 'react'
import TeamCrest from '../components/TeamCrest'
import TrophyIcon from '../components/TrophyIcon'
import { supabase } from '../lib/supabase'

const ENTRY_FEE = 50
const LAST_PLACE_FEE = 10

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
    coins: <><ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></>,
    timer: <><circle cx="12" cy="13" r="7"/><path d="M12 13V9"/><path d="m12 13 3 2"/><path d="M9 3h6"/><path d="M12 3v3"/></>,
    medal: <><circle cx="12" cy="8" r="4"/><path d="M9.5 12 8 21l4-2 4 2-1.5-9"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{icons[name] || icons.check}</svg>
}

const FLOW_STEPS = [
  { number: '01', icon: 'calendar', title: 'Rodada abre', text: 'Os jogos e horários da rodada ficam disponíveis.' },
  { number: '02', icon: 'edit', title: 'Faça seu palpite', text: 'Informe o placar e salve antes do início da partida.' },
  { number: '03', icon: 'lock', title: 'Jogo começa', text: 'O palpite é bloqueado e não pode mais ser alterado.' },
  { number: '04', icon: 'chart', title: 'Pontuação atualiza', text: 'Com o resultado registrado, o sistema calcula os pontos.' },
]

const SCORE_EXAMPLES = [
  {
    points: '0 pts', tone: 'danger', home: 'Real Madrid', away: 'Liverpool', result: '1x2', prediction: '2x1',
    verdict: 'Não pontuou', summary: '0 pts',
  },
  {
    points: '+1 pt', tone: 'warning', home: 'Barcelona', away: 'Inter', result: '2x1', prediction: '3x0',
    verdict: 'Vencedor', summary: '+1 pt',
  },
  {
    points: '+3 pts', tone: 'success', home: 'Bayern de Munique', away: 'Arsenal', result: '2x0', prediction: '2x0',
    verdict: 'Placar exato', summary: '+3 pts',
  },
]

const PREDICTION_STATES = [
  { icon: 'calendar', title: 'Aberto', text: 'Pode criar ou editar.' },
  { icon: 'send', title: 'Enviado', text: 'Palpite salvo.' },
  { icon: 'lock', title: 'Bloqueado', text: 'Partida começou.' },
  { icon: 'check', title: 'Finalizado', text: 'Resultado e pontos calculados.' },
]

const RULE_HIGHLIGHTS = [
  {
    icon: 'trophy',
    title: 'Pontuação',
    lines: ['1 ponto pelo vencedor', '+2 pontos pelo placar exato', 'Total de 3 pontos.'],
  },
  {
    icon: 'timer',
    title: 'Prorrogação',
    lines: ['Resultado considerado após 120 minutos', 'Disputa por pênaltis não entra no placar do bolão.'],
  },
  {
    icon: 'users',
    title: 'Desempate',
    lines: ['1. Pontuação total.', '2. Placares exatos acertados', '3. Vencedores acertados'],
  },
  {
    icon: 'coins',
    title: 'Entrada e premiação',
    lines: [`R$ ${ENTRY_FEE} de entrada.`, 'Premiação: 1º lugar 70%, 2º lugar 20% e 3º lugar 10%.', `Último colocado paga R$ ${LAST_PLACE_FEE} adicional ao 1º colocado.`],
  },
]

const REGULATION_ITEMS = [
  {
    icon: 'users',
    title: 'Desempate',
    subtitle: 'Critérios usados para definir posições.',
    content: (
      <>
        <ol>
          <li><strong>Pontuação total.</strong></li>
          <li><strong>Placares exatos acertados.</strong></li>
          <li><strong>Vencedores acertados.</strong></li>
        </ol>
        <p>Quando os três critérios forem iguais, os participantes permanecem empatados.</p>
      </>
    ),
  },
  {
    icon: 'calendar',
    title: 'Escolha dos jogos',
    subtitle: 'Quais jogos entram no bolão e como são definidos.',
    content: (
      <>
        <p>Na fase de liga, cada rodada possui <strong>6 jogos</strong>. A escolha das partidas segue a dinâmica atual do grupo.</p>
        <p>Se alguém não definir seus jogos dentro do prazo combinado, o critério de sorteio continua valendo conforme a regra atual do bolão.</p>
      </>
    ),
  },
  {
    icon: 'timer',
    title: 'Prazo dos palpites',
    subtitle: 'Até quando é possível enviar ou editar.',
    content: (
      <>
        <p>O palpite pode ser criado ou editado enquanto a partida estiver aberta.</p>
        <p>No início do jogo, o sistema bloqueia o envio e qualquer alteração passa a ficar indisponível.</p>
      </>
    ),
  },
  {
    icon: 'chart',
    title: 'Resultados',
    subtitle: 'Como e quando os placares entram no sistema.',
    content: (
      <>
        <p>Depois que o resultado é registrado, os pontos são calculados automaticamente com base no placar final considerado pelo bolão.</p>
      </>
    ),
  },
  {
    icon: 'medal',
    title: 'Prorrogação',
    subtitle: 'Como partidas estendidas são consideradas.',
    content: (
      <>
        <p>Quando houver prorrogação, vale o placar ao fim dos <strong>120 minutos</strong>. Disputa de pênaltis não entra no placar da competição.</p>
      </>
    ),
  },
  {
    icon: 'coins',
    title: 'Entrada e premiação',
    subtitle: 'Valores, pagamento e regra do último colocado.',
    content: (
      <>
        <p>O Pix de entrada é de <strong>R$ {ENTRY_FEE}</strong>, feito no início da Champions.</p>
        <p>A premiação é dividida de forma explícita: <strong>1º lugar leva 70%</strong>, <strong>2º lugar leva 20%</strong> e <strong>3º lugar leva 10%</strong> do valor destinado ao pódio.</p>
        <p>Quem terminar em último paga mais <strong>R$ {LAST_PLACE_FEE}</strong> diretamente ao 1º colocado.</p>
      </>
    ),
  },
  {
    icon: 'lock',
    title: 'Palpites secretos',
    subtitle: 'Como funciona a privacidade dos palpites.',
    content: (
      <>
        <p>Antes do início da partida, os demais participantes conseguem saber apenas que você enviou um palpite, mas não o placar.</p>
        <p>Quando a regra atual permitir, os palpites são liberados e podem ser visualizados normalmente.</p>
      </>
    ),
  },
]

function RegulationAccordionItem({ item, defaultOpen = false }) {
  return (
    <details className="about-v2-accordion-item" open={defaultOpen}>
      <summary>
        <div className="about-v2-accordion-icon"><RuleIcon name={item.icon} /></div>
        <div className="about-v2-accordion-copy">
          <strong>{item.title}</strong>
          <span>{item.subtitle}</span>
        </div>
        <i>⌄</i>
      </summary>
      <div className="about-v2-accordion-body">{item.content}</div>
    </details>
  )
}

function ScoreCard({ example }) {
  return (
    <article className={`about-v2-score-card ${example.tone}`}>
      <span className="about-v2-score-chip">{example.points}</span>
      <div className="about-v2-score-match">
        <div className="about-v2-score-team">
          <TeamCrest team={example.home} size="medium" />
          <strong>{example.home}</strong>
        </div>
        <div className="about-v2-score-result">
          <small>Resultado</small>
          <b>{example.result}</b>
        </div>
        <div className="about-v2-score-team away">
          <TeamCrest team={example.away} size="medium" />
          <strong>{example.away}</strong>
        </div>
      </div>
      <div className="about-v2-score-prediction">
        <span>Seu palpite</span>
        <strong>{example.prediction}</strong>
      </div>
      <div className="about-v2-score-verdict">
        <b>{example.verdict}</b>
        <span>{example.summary}</span>
      </div>
    </article>
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

  const heroStats = useMemo(() => ([
    { icon: 'users', value: participantCount ?? '—', label: 'participantes' },
    { icon: 'calendar', value: season?.name || '—', label: 'temporada atual' },
    { icon: 'coins', value: `R$ ${ENTRY_FEE}`, label: 'entrada' },
  ]), [participantCount, season])

  const numberCards = useMemo(() => ([
    { icon: 'users', value: participantCount ?? '—', label: 'participantes' },
    { icon: 'calendar', value: season?.name || '—', label: 'temporada atual' },
    { icon: 'coins', value: `R$ ${ENTRY_FEE}`, label: 'Entrada' },
    { icon: 'trophy', value: `R$ ${LAST_PLACE_FEE}`, label: 'Último colocado' },
  ]), [participantCount, season])

  return (
    <div className="page-wrap about-v2-page sports-surface">
      <header className="about-v2-hero">
        <div className="about-v2-hero-copy">
          <span className="sports-eyebrow">Regulamento</span>
          <h1>Sobre o bolão</h1>
          <p>Entenda como funcionam os palpites, a pontuação e as regras da disputa.</p>
        </div>

        <div className="about-v2-hero-visual" aria-hidden="true">
          <div className="about-v2-trophy-shape"><TrophyIcon size={74} /></div>
        </div>

        <section className="about-v2-hero-stats" aria-label="Resumo do bolão">
          {heroStats.map((item) => (
            <article className="about-v2-hero-stat" key={item.label}>
              <i><RuleIcon name={item.icon} /></i>
              <div>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            </article>
          ))}
        </section>
      </header>

      {error && <div className="form-error">{error}</div>}

      <section className="about-v2-section">
        <div className="about-v2-section-head">
          <div>
            <h2>Como funciona</h2>
            <p>Do início da rodada ao resultado final, tudo acontece em 4 etapas.</p>
          </div>
        </div>
        <div className="about-v2-flow-grid">
          {FLOW_STEPS.map((step, index) => (
            <div className="about-v2-flow-item-wrap" key={step.number}>
              <article className="about-v2-flow-card">
                <div className="about-v2-flow-top">
                  <span>{step.number}</span>
                  <i><RuleIcon name={step.icon} /></i>
                </div>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </article>
              {index < FLOW_STEPS.length - 1 && <span className="about-v2-flow-arrow">→</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="about-v2-section">
        <div className="about-v2-section-head score">
          <div>
            <h2>Como você pontua</h2>
            <p>Três resultados possíveis. Acertar o placar exato vale 3 pontos no total: 1 pelo resultado correto e +2 pelo placar.</p>
          </div>
        </div>
        <div className="about-v2-score-grid">
          {SCORE_EXAMPLES.map((example) => <ScoreCard key={example.points} example={example} />)}
        </div>
      </section>

      <div className="about-v2-two-column">
        <section className="about-v2-section about-v2-secret-card">
          <div className="about-v2-section-head compact">
            <div>
              <span className="about-v2-kicker">Palpites secretos</span>
              <h2>Seu placar fica protegido</h2>
            </div>
          </div>
          <div className="about-v2-secret-body">
            <div className="about-v2-secret-lock"><RuleIcon name="lock" /></div>
            <p>Antes do início da partida, os demais participantes podem saber apenas que você enviou um palpite, mas não o placar. Quando a regra permitir, os palpites são liberados.</p>
          </div>
        </section>

        <section className="about-v2-section about-v2-cycle-card">
          <div className="about-v2-section-head compact">
            <div>
              <span className="about-v2-kicker">Ciclo do palpite</span>
              <h2>Cada jogo segue o mesmo fluxo</h2>
            </div>
          </div>
          <div className="about-v2-cycle-grid">
            {PREDICTION_STATES.map((state, index) => (
              <div className={`about-v2-cycle-step ${index === PREDICTION_STATES.length - 1 ? 'done' : ''}`} key={state.title}>
                <i><RuleIcon name={state.icon} /></i>
                <strong>{state.title}</strong>
                <span>{state.text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="about-v2-section">
        <div className="about-v2-section-head compact">
          <div>
            <h2>Nosso bolão em números</h2>
            <p>Veja um resumo da nossa competição atual.</p>
          </div>
        </div>
        <div className="about-v2-numbers-grid">
          {numberCards.map((item) => (
            <article className="about-v2-number-card" key={item.label}>
              <i><RuleIcon name={item.icon} /></i>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="about-v2-section">
        <div className="about-v2-section-head compact">
          <div>
            <h2>Regras principais</h2>
            <p>As informações mais importantes para você jogar.</p>
          </div>
        </div>
        <div className="about-v2-rules-grid">
          {RULE_HIGHLIGHTS.map((rule) => (
            <article className="about-v2-rule-card" key={rule.title}>
              <div className="about-v2-rule-icon"><RuleIcon name={rule.icon} /></div>
              <div>
                <h3>{rule.title}</h3>
                <ul>
                  {rule.lines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-v2-section about-v2-regulation-section">
        <div className="about-v2-section-head compact">
          <div>
            <h2>Regulamento completo</h2>
            <p>Clique nos tópicos abaixo para ver todos os detalhes.</p>
          </div>
        </div>
        <div className="about-v2-accordion-list">
          {REGULATION_ITEMS.map((item, index) => <RegulationAccordionItem item={item} key={item.title} defaultOpen={index === 0} />)}
        </div>
      </section>
    </div>
  )
}
