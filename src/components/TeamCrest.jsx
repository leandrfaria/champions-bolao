import { useEffect, useState } from 'react'
import { getTeamInitials, getTeamLogo, getTeamSlug } from '../config/teamLogos'

export default function TeamCrest({ team, size = 'medium', className = '' }) {
  const logo = getTeamLogo(team)
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [logo, team])

  return (
    <span className={`team-crest team-crest-${size} team-crest-club-${getTeamSlug(team)} ${className}`.trim()} aria-hidden="true">
      {logo && !failed ? (
        <img
          src={logo}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{getTeamInitials(team)}</span>
      )}
    </span>
  )
}
