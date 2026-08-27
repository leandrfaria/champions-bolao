import { useMemo, useState } from 'react'
import TeamCrest from './TeamCrest'
import { TEAM_CATALOG } from '../config/teamLogos'

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export default function TeamPicker({ label, value, onChange, knownTeams = [], disabled = false, placeholder = 'Buscar clube...' }) {
  const [focused, setFocused] = useState(false)
  const options = useMemo(() => {
    const seen = new Set()
    return [
      ...TEAM_CATALOG.map((team) => team.name),
      ...knownTeams.filter(Boolean),
    ].filter((name) => {
      const key = normalize(name)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [knownTeams])

  const query = normalize(value)
  const filtered = options
    .filter((name) => !query || normalize(name).includes(query))
    .slice(0, 8)

  return (
    <label className={`field team-picker ${disabled ? 'is-disabled' : ''}`.trim()}>
      <span>{label}</span>
      <div className="team-picker-input">
        <TeamCrest team={value} size="small" />
        <input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {focused && !disabled && filtered.length > 0 && (
        <div className="team-picker-menu">
          {filtered.map((name) => (
            <button type="button" key={name} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(name); setFocused(false) }}>
              <TeamCrest team={name} size="small" />
              <span>{name}</span>
            </button>
          ))}
        </div>
      )}
    </label>
  )
}
