export default function ScorePicker({ value, onChange, disabled, ariaLabel }) {
  const rawValue = value === null || value === undefined ? '' : String(value)
  const parsed = rawValue === '' ? 0 : Number(rawValue)
  const score = Number.isFinite(parsed) ? Math.max(0, Math.min(99, parsed)) : 0

  function handleInput(event) {
    const next = event.target.value
    if (next === '') {
      onChange('')
      return
    }

    if (!/^\d{1,2}$/.test(next)) return
    onChange(String(Math.max(0, Math.min(99, Number(next)))))
  }

  return (
    <div className="score-picker" aria-label={ariaLabel}>
      <button type="button" onClick={() => onChange(String(Math.max(0, score - 1)))} disabled={disabled || score <= 0}>−</button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength="2"
        value={rawValue}
        disabled={disabled}
        onChange={handleInput}
        aria-label={ariaLabel}
      />
      <button type="button" onClick={() => onChange(String(Math.min(99, score + 1)))} disabled={disabled || score >= 99}>+</button>
    </div>
  )
}
