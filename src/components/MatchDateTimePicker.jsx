import { useEffect, useMemo, useState } from 'react'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatSelectedDate(value) {
  const date = parseLocalDate(value)
  if (!date) return 'Selecionar data'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date).replace('.', '')
}

function monthLabel(date) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3.1 1.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function MatchDateTimePicker({ date, time, onDateChange, onTimeChange }) {
  const selectedDate = parseLocalDate(date)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [cursor, setCursor] = useState(() => selectedDate || new Date())

  useEffect(() => {
    if (selectedDate) setCursor(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [date])

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const previousLast = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate()
    const cells = []

    for (let i = first.getDay() - 1; i >= 0; i -= 1) {
      const value = new Date(cursor.getFullYear(), cursor.getMonth() - 1, previousLast - i)
      cells.push({ value, outside: true })
    }
    for (let day = 1; day <= last.getDate(); day += 1) {
      cells.push({ value: new Date(cursor.getFullYear(), cursor.getMonth(), day), outside: false })
    }
    let nextDay = 1
    while (cells.length % 7 !== 0 || cells.length < 42) {
      cells.push({ value: new Date(cursor.getFullYear(), cursor.getMonth() + 1, nextDay), outside: true })
      nextDay += 1
    }
    return cells
  }, [cursor])

  const [hour = '', minute = ''] = String(time || '').split(':')

  function updateTime(nextHour, nextMinute) {
    const h = String(Math.max(0, Math.min(23, Number(nextHour || 0)))).padStart(2, '0')
    const m = String(Math.max(0, Math.min(59, Number(nextMinute || 0)))).padStart(2, '0')
    onTimeChange(`${h}:${m}`)
  }

  return (
    <div className="match-datetime-picker">
      <button type="button" className={`match-datetime-control ${calendarOpen ? 'is-open' : ''}`} onClick={() => setCalendarOpen((value) => !value)} aria-expanded={calendarOpen}>
        <span className="match-datetime-icon"><CalendarIcon /></span>
        <span className="match-datetime-copy">
          <small>Data</small>
          <strong className={!date ? 'is-placeholder' : ''}>{formatSelectedDate(date)}</strong>
        </span>
        <span className="match-datetime-chevron">⌄</span>
      </button>

      <div className="match-datetime-control match-time-control">
        <span className="match-datetime-icon"><ClockIcon /></span>
        <span className="match-datetime-copy">
          <small>Horário</small>
          <span className="match-time-inputs">
            <select aria-label="Hora" value={hour} onChange={(event) => {
              const next = event.target.value
              if (!next) onTimeChange('')
              else updateTime(next, minute || 0)
            }}>
              <option value="">--</option>
              {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
            <b>:</b>
            <select aria-label="Minutos" value={minute} onChange={(event) => {
              const next = event.target.value
              if (!next && !hour) onTimeChange('')
              else updateTime(hour || 0, next || 0)
            }}>
              <option value="">--</option>
              {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </span>
        </span>
      </div>

      {calendarOpen && (
        <div className="match-calendar-panel">
          <div className="match-calendar-head">
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Mês anterior">‹</button>
            <strong>{monthLabel(cursor)}</strong>
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Próximo mês">›</button>
          </div>
          <div className="match-calendar-weekdays">
            {WEEKDAYS.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
          </div>
          <div className="match-calendar-grid">
            {days.map(({ value, outside }) => {
              const valueKey = toDateValue(value)
              const todayKey = toDateValue(new Date())
              const selected = valueKey === date
              const today = valueKey === todayKey
              return (
                <button
                  type="button"
                  key={valueKey}
                  className={`${outside ? 'is-outside' : ''} ${selected ? 'is-selected' : ''} ${today ? 'is-today' : ''}`.trim()}
                  onClick={() => {
                    onDateChange(valueKey)
                    setCursor(new Date(value.getFullYear(), value.getMonth(), 1))
                    setCalendarOpen(false)
                  }}
                >
                  {value.getDate()}
                </button>
              )
            })}
          </div>
          <div className="match-calendar-actions">
            <button type="button" onClick={() => onDateChange('')}>Limpar</button>
            <button type="button" onClick={() => {
              const today = new Date()
              onDateChange(toDateValue(today))
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
              setCalendarOpen(false)
            }}>Hoje</button>
          </div>
        </div>
      )}
    </div>
  )
}
