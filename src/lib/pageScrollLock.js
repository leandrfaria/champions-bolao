const activeLocks = new Map()
let lockId = 0
let originalStyles = null
let lockedScrollPosition = null
let positionWasFrozen = false

const bodyProperties = ['overflow', 'position', 'top', 'left', 'right', 'width']

function captureStyles() {
  return {
    rootOverflow: document.documentElement.style.overflow,
    body: Object.fromEntries(bodyProperties.map((property) => [property, document.body.style[property]])),
  }
}

function restoreStyles() {
  if (!originalStyles) return
  document.documentElement.style.overflow = originalStyles.rootOverflow
  bodyProperties.forEach((property) => {
    document.body.style[property] = originalStyles.body[property]
  })
}

function applyActiveLocks() {
  const needsFixedPosition = positionWasFrozen || [...activeLocks.values()].some((lock) => lock.freezePosition)
  document.documentElement.style.overflow = needsFixedPosition ? 'hidden' : (originalStyles?.rootOverflow || '')
  document.body.style.overflow = 'hidden'

  if (needsFixedPosition && lockedScrollPosition) {
    positionWasFrozen = true
    document.body.style.position = 'fixed'
    document.body.style.top = `${-lockedScrollPosition.y}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
  } else if (originalStyles) {
    bodyProperties.filter((property) => property !== 'overflow').forEach((property) => {
      document.body.style[property] = originalStyles.body[property]
    })
  }
}

/** Coordinates overlay locks and can freeze the viewport for mobile Safari. */
export function acquirePageScrollLock({ freezePosition = false } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}

  if (!activeLocks.size) {
    originalStyles = captureStyles()
    lockedScrollPosition = { x: window.scrollX, y: window.scrollY }
    positionWasFrozen = false
  }

  const id = ++lockId
  activeLocks.set(id, { freezePosition })
  applyActiveLocks()

  let released = false
  return () => {
    if (released || !activeLocks.has(id)) return
    released = true
    activeLocks.delete(id)

    if (activeLocks.size) {
      applyActiveLocks()
      return
    }

    const restorePosition = positionWasFrozen ? lockedScrollPosition : null
    restoreStyles()
    originalStyles = null
    lockedScrollPosition = null
    positionWasFrozen = false

    if (restorePosition) window.scrollTo(restorePosition.x, restorePosition.y)
  }
}
