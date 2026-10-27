import { useState } from 'react'
import '../styles/about-editorial.css'

const ENTRY_FEE = 50
const LAST_PLACE_FEE = 10

function RuleIcon({ name, size = 20 }) {
  const paths = {
    calendar: <><rect x="4" y="6" width="16" height="15" rx="2" /><path d="M8 3v6M16 3v6M4 11h16" /></>,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    chart: <><path d="M4 20V10M10 20V5M16 20v-8M22 20H2" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c.4-4 2.4-6 6-6s5.6 2 6 6M16 6a3 3 0 0 1 0 6M18 14c2 .7 3 2.7 3 6" /></>,
    trophy: <><path d="M7 4h10v5c0 4-2 7-5 8-3-1-5-4-5-8V4Z" /><path d="M7 6H3v2c0 3 2 5 5 5M17 6h4v2c0 3-2 5-5 5M12 17v3M8 21h8" /></>,
    coins: <><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
    timer: <><circle cx="12" cy="13" r="7" /><path d="M12 13V9m0 4 3 2M9 3h6m-3 0v3" /></>,
    medal: <><circle cx="12" cy="8" r="4" /><path d="M9.5 12 8 21l4-2 4 2-1.5-9" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  }
  return <svg className="about-guide-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.check}</svg>
}

function Chevron({ expanded }) {
  return <svg className={`about-guide-chevron${expanded ? ' is-expanded' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}

const STEPS = [
  { icon: 'edit', title: 'Escolha seu placar', description: 'Envie seu palpite antes do início da partida.' },
  { icon: 'users', title: 'Acompanhe os jogos', description: 'Depois do início, os palpites dos participantes ficam disponíveis para consulta.' },
  { icon: 'trophy', title: 'Dispute a liderança', description: 'Os resultados oficiais definem os pontos e a classificação.' },
]

const SCORING = [
  { points: '0', label: 'Errou', tone: 'miss', result: '2 × 0', prediction: '1 × 1', explanation: 'O desfecho previsto não corresponde ao resultado oficial.' },
  { points: '1', label: 'Acertou o desfecho', tone: 'outcome', result: '1 × 1', prediction: '2 × 2', explanation: 'Acertou vitória do mandante, do visitante ou empate, sem placar exato.' },
  { points: '3', label: 'Placar exato', tone: 'exact', result: '2 × 1', prediction: '2 × 1', explanation: 'Acertou os gols das duas equipes. São 3 pontos no total.' },
]

const ESSENTIAL_RULES = [
  { icon: 'timer', title: 'Prazo', text: 'É possível enviar ou editar enquanto a partida estiver aberta. No kickoff, o palpite é bloqueado.' },
  { icon: 'lock', title: 'Sigilo', text: 'Antes do início, os demais participantes veem apenas se um palpite foi enviado, não o placar.' },
  { icon: 'chart', title: 'Desempate', text: 'Pontos totais, depois placares exatos e vencedores acertados. Se tudo empatar, a posição é compartilhada.' },
  { icon: 'check', title: 'Prorrogação e pênaltis', text: 'Vale o placar após 90 minutos ou, havendo prorrogação, após 120. Pênaltis não entram no placar do bolão.' },
]

const REGULATION = [
  {
    id: 'picks', icon: 'calendar', title: 'Palpites e prazos', subtitle: 'Envio, edição e bloqueio por partida.',
    content: <><p>O palpite pode ser criado ou editado enquanto a partida estiver aberta. O prazo é individual para cada jogo.</p><p>No horário de início da partida, o sistema bloqueia novos palpites e alterações.</p></>,
  },
  {
    id: 'rounds', icon: 'users', title: 'Jogos, rodadas e sorteio dos responsáveis', subtitle: 'Escolha das partidas e regra vigente do grupo.',
    content: <><p>Na fase de liga, cada rodada possui <strong>6 jogos</strong>. A escolha das partidas segue a dinâmica atual do grupo.</p><p>Se alguém não definir seus jogos dentro do prazo combinado, continua valendo o critério de sorteio vigente no bolão.</p></>,
  },
  {
    id: 'points', icon: 'trophy', title: 'Pontuação e desempate', subtitle: 'Como os pontos são atribuídos e as posições definidas.',
    content: <><ul><li><strong>3 pontos</strong> pelo placar exato, no total.</li><li><strong>1 ponto</strong> por acertar o desfecho — vitória do mandante, vitória do visitante ou empate — sem acertar o placar exato.</li><li><strong>0 pontos</strong> quando o desfecho previsto estiver incorreto.</li></ul><p>Em caso de empate na classificação, os critérios são: pontos totais, placares exatos e vencedores acertados, nessa ordem. Se os três forem iguais, os participantes permanecem empatados.</p></>,
  },
  {
    id: 'results', icon: 'chart', title: 'Resultados e prorrogação', subtitle: 'Placar oficial considerado pelo bolão.',
    content: <><p>Sem prorrogação, considera-se o placar ao fim dos 90 minutos. Se houver prorrogação, vale o placar ao fim dos 120 minutos.</p><p>A disputa por pênaltis não entra no placar do bolão. Os pontos são calculados depois que o resultado oficial é registrado.</p></>,
  },
  {
    id: 'entry', icon: 'coins', title: 'Entrada e premiação', subtitle: 'Valores e distribuição vigentes.',
    content: <><p>A entrada é de <strong>R$ {ENTRY_FEE}</strong>, paga no início da Champions.</p><p>Do valor destinado ao pódio, a premiação é distribuída em <strong>70%</strong> para o primeiro lugar, <strong>20%</strong> para o segundo e <strong>10%</strong> para o terceiro.</p><p>O último colocado paga <strong>R$ {LAST_PLACE_FEE} adicionais</strong> diretamente ao primeiro colocado.</p></>,
  },
  {
    id: 'privacy', icon: 'lock', title: 'Privacidade dos palpites', subtitle: 'Quando os placares ficam visíveis.',
    content: <><p>Antes do início da partida, os outros participantes podem ver apenas se um palpite foi enviado; o placar permanece protegido.</p><p>Depois do início, os palpites são liberados para consulta conforme o funcionamento atual do sistema.</p></>,
  },
]

function ScoreExample({ item }) {
  return (
    <article className={`about-guide-score-example tone-${item.tone}`}>
      <header><span>{item.points}</span><div><strong>{item.label}</strong><small>{item.points} {item.points === '1' ? 'ponto' : 'pontos'}</small></div></header>
      <div className="about-guide-score-values">
        <div><span>Resultado oficial</span><strong>{item.result}</strong></div>
        <i aria-hidden="true" />
        <div><span>Seu palpite</span><strong>{item.prediction}</strong></div>
      </div>
      <p>{item.explanation}</p>
    </article>
  )
}

function RegulationItem({ item, expanded, onToggle }) {
  const panelId = `about-guide-panel-${item.id}`
  const triggerId = `about-guide-trigger-${item.id}`
  return (
    <article className={`about-guide-accordion${expanded ? ' is-open' : ''}`}>
      <h3>
        <button id={triggerId} type="button" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
          <span className="about-guide-accordion-icon"><RuleIcon name={item.icon} size={18} /></span>
          <span className="about-guide-accordion-title"><strong>{item.title}</strong><small>{item.subtitle}</small></span>
          <Chevron expanded={expanded} />
        </button>
      </h3>
      <div id={panelId} className="about-guide-accordion-panel" role="region" aria-labelledby={triggerId} aria-hidden={!expanded}>
        <div className="about-guide-accordion-content">{item.content}</div>
      </div>
    </article>
  )
}

export default function AboutPage() {
  const [expandedTopics, setExpandedTopics] = useState(() => new Set())
  const allExpanded = expandedTopics.size === REGULATION.length

  function toggleTopic(id) {
    setExpandedTopics((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllTopics() {
    setExpandedTopics(allExpanded ? new Set() : new Set(REGULATION.map((item) => item.id)))
  }

  return (
    <div className="page-wrap about-guide-page">
      <header className="round-explorer-header about-guide-header">
        <div className="round-explorer-heading">
          <span>CHAMPIONS LEAGUE</span>
          <h1>Sobre o bolão</h1>
          <p>Tudo o que você precisa saber para participar da competição.</p>
        </div>
      </header>

      <nav className="about-guide-nav" aria-label="Navegação desta página">
        <a href="#como-funciona">Como funciona</a>
        <a href="#pontuacao">Pontuação</a>
        <a href="#regras">Regras</a>
        <a href="#regulamento">Regulamento</a>
      </nav>

      <div className="about-guide-content">
        <section className="about-guide-section about-guide-how" id="como-funciona" aria-labelledby="about-how-title">
          <header className="about-guide-section-heading"><span>O formato</span><h2 id="about-how-title">Como funciona</h2></header>
          <ol className="about-guide-steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="about-guide-step-index">0{index + 1}</span>
                <span className="about-guide-step-icon"><RuleIcon name={step.icon} size={19} /></span>
                <div><h3>{step.title}</h3><p>{step.description}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="about-guide-section about-guide-scoring" id="pontuacao" aria-labelledby="about-score-title">
          <header className="about-guide-section-heading">
            <span>O placar define a pontuação</span>
            <h2 id="about-score-title">Como funciona a pontuação</h2>
            <p>Um ponto pelo desfecho correto. Se o placar for exato, valem 3 pontos no total.</p>
          </header>
          <div className="about-guide-score-grid">{SCORING.map((item) => <ScoreExample item={item} key={item.tone} />)}</div>
        </section>

        <section className="about-guide-section about-guide-rules" id="regras" aria-labelledby="about-rules-title">
          <header className="about-guide-section-heading"><span>O essencial</span><h2 id="about-rules-title">Regras essenciais</h2></header>
          <div className="about-guide-essential-grid">
            {ESSENTIAL_RULES.map((rule) => (
              <article className="about-guide-essential" key={rule.title}>
                <span><RuleIcon name={rule.icon} size={18} /></span>
                <div><h3>{rule.title}</h3><p>{rule.text}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="about-guide-section about-guide-regulation" id="regulamento" aria-labelledby="about-regulation-title">
          <header className="about-guide-section-heading about-guide-regulation-heading">
            <div><span>Consulta por assunto</span><h2 id="about-regulation-title">Regulamento completo</h2></div>
            <button type="button" className="about-guide-expand-all" onClick={toggleAllTopics} aria-pressed={allExpanded}>{allExpanded ? 'Recolher todos' : 'Expandir todos'}</button>
          </header>
          <div className="about-guide-accordion-list">
            {REGULATION.map((item) => <RegulationItem key={item.id} item={item} expanded={expandedTopics.has(item.id)} onToggle={() => toggleTopic(item.id)} />)}
          </div>
        </section>
      </div>
    </div>
  )
}
