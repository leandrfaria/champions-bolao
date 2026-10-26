import { useEffect, useId, useRef, useState } from 'react'
import '../styles/accessible-select.css'

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
    </svg>
  )
}

export default function AccessibleSelect({ value, options, onChange, ariaLabel, className = '' }) {
  const id = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [opensUp, setOpensUp] = useState(false)
  const [menuMaxHeight, setMenuMaxHeight] = useState('280px')
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return undefined
    function closeOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    function closeOnViewportChange() { setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange)
    }
  }, [open])

  useEffect(() => () => window.clearTimeout(typeaheadTimerRef.current), [])

  function openMenu(index = selectedIndex) {
    const rect = triggerRef.current?.getBoundingClientRect()
    const availableBelow = rect ? window.innerHeight - rect.bottom : window.innerHeight
    const viewportMax = window.innerWidth <= 760
      ? Math.min(260, window.innerHeight * .45)
      : Math.min(280, window.innerHeight * .55)
    const desiredHeight = Math.min(viewportMax, options.length * 42 + 8)
    const openAbove = Boolean(rect && availableBelow < desiredHeight && rect.top > availableBelow)
    const availableOnSide = rect ? (openAbove ? rect.top : availableBelow) : window.innerHeight
    setOpensUp(openAbove)
    setMenuMaxHeight(`${Math.max(48, Math.min(desiredHeight, availableOnSide - 14))}px`)
    setActiveIndex(Math.max(0, index))
    setOpen(true)
  }

  function selectOption(option) {
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      if (!open) openMenu(event.key === 'ArrowDown' ? selectedIndex : Math.max(0, selectedIndex - 1))
      else setActiveIndex((index) => (index + direction + options.length) % options.length)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const index = event.key === 'Home' ? 0 : options.length - 1
      if (!open) openMenu(index)
      else setActiveIndex(index)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) openMenu()
      else if (options[activeIndex]) selectOption(options[activeIndex])
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeaheadRef.current += event.key.toLocaleLowerCase()
      window.clearTimeout(typeaheadTimerRef.current)
      typeaheadTimerRef.current = window.setTimeout(() => { typeaheadRef.current = '' }, 650)
      const match = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(typeaheadRef.current))
      if (match >= 0) {
        if (!open) openMenu(match)
        else setActiveIndex(match)
      }
    }
  }

  return (
    <div className={`accessible-select ${className}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="accessible-select-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false)
        }}
      >
        <span>{selected?.label || ''}</span>
        <Chevron />
      </button>
      {open && (
        <div id={`${id}-listbox`} className={`accessible-select-listbox${opensUp ? ' opens-up' : ''}`} role="listbox" aria-label={ariaLabel} style={{ '--accessible-select-max-height': menuMaxHeight }}>
          {options.map((option, index) => (
            <div
              id={`${id}-option-${index}`}
              key={option.value}
              className={`accessible-select-option${index === selectedIndex ? ' is-selected' : ''}${index === activeIndex ? ' is-active' : ''}`}
              role="option"
              aria-selected={index === selectedIndex}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
            >
              <span>{option.label}</span>
              {index === selectedIndex && <span className="accessible-select-check" aria-hidden="true">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
