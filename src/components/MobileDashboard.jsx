import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import HomeMatchRow from './HomeMatchRow'
import NavIcon from './NavIcon'
import UserAvatar from './UserAvatar'
import { activityCategory, activityTone, parseMatchName } from '../lib/activity'
import { activitySummary, formatDeadline, formatRelativeActivity, formatRoundLabel, getActivityLabel } from '../lib/dashboardPresentation'

function matchDayParts(value) {
  const date = new Date(value)
  const parts = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]))
}

function groupMatchesByDay(matches) {
  const sorted = [...matches].sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
  const groups = new Map()
  sorted.forEach((match) => {
    const parts = matchDayParts(match.kickoff_at)
    const key = `${parts.year}-${parts.month}-${parts.day}`
    if (!groups.has(key)) {
      const weekday = String(parts.weekday || '').replace(/-feira$/, '').toLocaleUpperCase('pt-BR')
      const month = String(parts.month || '').replace('.', '').toLocaleUpperCase('pt-BR')
      groups.set(key, { key, label: `${weekday} · ${parts.day} ${month}`, matches: [] })
    }
    groups.get(key).matches.push(match)
  })
  return [...groups.values()]
}

function kickoffTime(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function activityIconName(action) {
  if (action === 'prediction_created' || action === 'prediction_updated') return 'predictions'
  if (action === 'result_updated') return 'leaderboard'
  if (action === 'leader_changed' || action === 'second_changed') return 'podium'
  if (action === 'roulette_spun') return 'roulette'
  return 'rounds'
}

function uniqueRecentActivities(items) {
  const seenMatches = new Set()
  return items.filter((item) => {
    const matchName = String(item?.metadata?.match_name || '').trim()
    if (!matchName) return true
    const key = matchName.toLocaleLowerCase('pt-BR')
    if (seenMatches.has(key)) return false
    seenMatches.add(key)
    return true
  }).slice(0, 4)
}

function getActivityDetail(item, summary, matchName) {
  const matchInfo = parseMatchName(matchName)
  const activityDetail = matchInfo && matchName && summary.detail?.toLocaleLowerCase('pt-BR').startsWith(matchName.toLocaleLowerCase('pt-BR'))
    ? item.action === 'result_updated' && item.metadata?.result ? `Resultado oficial: ${item.metadata.result}` : ''
    : summary.detail
  return { activityDetail, matchInfo }
}

export default function MobileDashboard({
  season,
  round,
  roundProgress,
  currentMatches,
  ownPredictionMap,
  ownCount,
  completion,
  nextDeadline,
  presence,
  presenceStatus,
  profiles,
  savePrediction,
  titleRace,
  userId,
  myStanding,
  leader,
  gap,
  firstPlaceIsShared,
  logs,
}) {
  const matchGroups = useMemo(() => groupMatchesByDay(currentMatches), [currentMatches])
  const presenceByMatch = useMemo(() => {
    const grouped = new Map()
    presence.forEach((item) => {
      if (!grouped.has(item.match_id)) grouped.set(item.match_id, [])
      grouped.get(item.match_id).push(item)
    })
    return grouped
  }, [presence])
  const recentActivities = useMemo(() => uniqueRecentActivities(logs), [logs])
  const roundTitle = roundProgress.position && roundProgress.total
    ? `Rodada ${roundProgress.position} de ${roundProgress.total}`
    : formatRoundLabel(round)
  const completionLabel = `${ownCount}/${currentMatches.length} palpites enviados`

  return (
    <div className="home-v3-mobile">
      <header className="home-v3-matchday" aria-label="Contexto da competição">
        <div className="home-v3-matchday-main">
          <span className="home-v3-season">{season.name || 'UEFA Champions League'}</span>
          <h1>{roundTitle}</h1>
          {round.stage && <p className="home-v3-phase">{round.stage}</p>}
          <div className="home-v3-progress-line">
            <span>{completionLabel}</span>
            <span>{completion}%</span>
          </div>
          <div className="home-v3-progress-track" role="progressbar" aria-label="Progresso dos seus palpites na rodada" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}>
            <span style={{ width: `${completion}%` }} />
          </div>
        </div>
        <div className="home-v3-deadline">
          <span>Próximo prazo</span>
          <strong>{nextDeadline ? formatDeadline(nextDeadline.kickoff_at) : 'Encerrado'}</strong>
          {nextDeadline && <small>{nextDeadline.home_team} <i aria-hidden="true">×</i> {nextDeadline.away_team}</small>}
        </div>
      </header>

      <section className="home-v3-section home-v3-fixtures-section" aria-label="Rodada atual">
        <div className="home-v3-section-head">
          <h2>Rodada atual</h2>
          <Link to={`/rodadas/${round.id}`}>Ver rodada completa <span aria-hidden="true">→</span></Link>
        </div>
        {!currentMatches.length ? (
          <p className="home-v3-empty">Ainda não há partidas cadastradas nesta rodada.</p>
        ) : (
          <div className="home-v3-matchdays">
            {matchGroups.map((group) => (
              <section className="home-v3-matchday-group" key={group.key} aria-label={group.label}>
                <h3>{group.label}</h3>
                <div className="home-v3-matchday-list">
                  {group.matches.map((match) => (
                    <HomeMatchRow
                      key={match.id}
                      variant="mobile"
                      match={match}
                      ownPrediction={ownPredictionMap.get(match.id)}
                      presence={presenceByMatch.get(match.id) || []}
                      presenceStatus={presenceStatus}
                      profiles={profiles}
                      onSave={savePrediction}
                      kickoffTime={kickoffTime(match.kickoff_at)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="home-v3-section home-v3-leaderboard" aria-label="Corrida pelo título">
        <div className="home-v3-section-head">
          <h2>Corrida pelo título</h2>
          <Link to="/classificacao">Ver classificação <span aria-hidden="true">→</span></Link>
        </div>
        {!titleRace.length ? <p className="home-v3-empty">Nenhum participante na classificação.</p> : (
          <>
            <ol className="home-v3-rank-list">
              {titleRace.map((item) => (
                <li key={item.id} className={`home-v3-rank-row ${item.rank <= 3 ? `place-${item.rank}` : ''} ${item.id === userId ? 'is-user' : ''}`}>
                  <span className="home-v3-rank-position">{item.rank}º</span>
                  <UserAvatar profile={item} size="tiny" className="home-v3-rank-avatar" />
                  <span className="home-v3-rank-name" title={item.display_name}>
                    <span className="home-v3-rank-label">{item.display_name}</span>
                    {item.id === userId && <small>Você</small>}
                  </span>
                  <strong className="home-v3-rank-points">{item.points}<small> pts</small></strong>
                </li>
              ))}
            </ol>
            {myStanding && leader && (
              <p className="home-v3-rank-summary">
                {firstPlaceIsShared ? <><strong>{myStanding.rank}º · {myStanding.points} pts</strong> — liderança compartilhada</>
                  : myStanding.rank === 1 ? <><strong>Você lidera · {myStanding.points} pts</strong></>
                    : gap > 0 ? <><strong>{myStanding.rank}º · {myStanding.points} pts</strong> — {gap} {gap === 1 ? 'ponto' : 'pontos'} atrás do líder</>
                      : myStanding.points === leader.points ? <><strong>{myStanding.rank}º · {myStanding.points} pts</strong> — empatado nos pontos, atrás nos critérios</>
                        : <><strong>{myStanding.rank}º · {myStanding.points} pts</strong></>}
              </p>
            )}
          </>
        )}
      </section>

      <section className="home-v3-section home-v3-timeline" aria-label="Acontecimentos recentes">
        <div className="home-v3-section-head">
          <h2>Acontecimentos recentes</h2>
          <Link to="/atividades">Todas as atividades <span aria-hidden="true">→</span></Link>
        </div>
        {!recentActivities.length ? <p className="home-v3-empty">Nenhuma atividade recente.</p> : (
          <ol className="home-v3-timeline-list">
            {recentActivities.map((item) => {
              const category = activityCategory(item.action)
              const summary = activitySummary(item)
              const matchName = item?.metadata?.match_name || ''
              const { activityDetail, matchInfo } = getActivityDetail(item, summary, matchName)
              const tone = activityTone(item.action)
              return (
                <li className={`home-v3-timeline-item tone-${tone}`} key={item.id}>
                  <span className="home-v3-timeline-glyph"><NavIcon name={activityIconName(item.action)} size={15} /></span>
                  <div className="home-v3-timeline-copy">
                    <div className="home-v3-timeline-heading">
                      <span>{getActivityLabel(category)}</span>
                      <time dateTime={item.created_at}>{formatRelativeActivity(item.created_at)}</time>
                    </div>
                    <strong>{summary.title}</strong>
                    {activityDetail && <p>{activityDetail}</p>}
                    {matchInfo && <small>{matchInfo.home} <i aria-hidden="true">×</i> {matchInfo.away}</small>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
