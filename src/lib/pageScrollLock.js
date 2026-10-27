const activeLocks = new Map()
let lockId = 0
let originalStyles = null
let lockedScrollPosition = null
let positionWasFrozen = false

const bodyProperties = ['overflow', 'position', 'top', 'left', 'right', 'width']
const rootProperties = ['overflow', 'overscrollBehavior', 'scrollBehavior']
const blockedScrollKeys = new Set([' ', 'Spacebar', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'])

function captureStyles() {
  return {
    root: Object.fromEntries(rootProperties.map((property) => [property, document.documentElement.style[property]])),
    body: Object.fromEntries(bodyProperties.map((property) => [property, document.body.style[property]])),
  }
}

function restoreStyles() {
  if (!originalStyles) return
  rootProperties.forEach((property) => { document.documentElement.style[property] = originalStyles.root[property] })
  bodyProperties.forEach((property) => { document.body.style[property] = originalStyles.body[property] })
}

function isAllowedOverlayTarget(target) {
  return [...activeLocks.values()].some((lock) => {
    if (!lock.getAllowedElements) return false
    return lock.getAllowedElements().some((element) => element && (element === target || element.contains(target)))
  })
}

function onWheel(event) {
  const hasOverlayScrollBoundary = [...activeLocks.values()].some((lock) => lock.getAllowedElements)
  if (hasOverlayScrollBoundary && !isAllowedOverlayTarget(event.target) && event.cancelable) event.preventDefault()
}

function onTouchMove(event) {
  const hasOverlayScrollBoundary = [...activeLocks.values()].some((lock) => lock.getAllowedElements)
  if (hasOverlayScrollBoundary && !isAllowedOverlayTarget(event.target) && event.cancelable) event.preventDefault()
}

function onKeyDown(event) {
  const hasOverlayScrollBoundary = [...activeLocks.values()].some((lock) => lock.getAllowedElements)
  if (!hasOverlayScrollBoundary || !blockedScrollKeys.has(event.key)) return
  if (!isAllowedOverlayTarget(document.activeElement) && event.cancelable) event.preventDefault()
}

function installInputGuards() {
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
  window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  window.addEventListener('keydown', onKeyDown, { capture: true })
}

function removeInputGuards() {
  window.removeEventListener('wheel', onWheel, true)
  window.removeEventListener('touchmove', onTouchMove, true)
  window.removeEventListener('keydown', onKeyDown, true)
}

function applyActiveLocks() {
  const needsFixedPosition = positionWasFrozen || [...activeLocks.values()].some((lock) => lock.freezePosition)

  // The documentElement is the scrollingElement in desktop Chromium/Safari.
  // Hiding overflow on body alone does not lock that scrollport.
  document.documentElement.style.overflow = 'hidden'
  document.documentElement.style.overscrollBehavior = 'none'
  document.documentElement.style.scrollBehavior = 'auto'
  document.body.style.overflow = 'hidden'

  if (needsFixedPosition && lockedScrollPosition) {
    positionWasFrozen = true
    document.body.style.position = 'fixed'
    document.body.style.top = `${-lockedScrollPosition.y}px`
    document.body.style.left = `${-lockedScrollPosition.x}px`
    document.body.style.right = 'auto'
    document.body.style.width = '100%'
  } else if (originalStyles) {
    bodyProperties.filter((property) => property !== 'overflow').forEach((property) => {
      document.body.style[property] = originalStyles.body[property]
    })
  }
}

/**
 * Coordinates nested overlay locks. `getAllowedElements` opts an overlay into
 * internal scrolling while wheel/touch/keyboard input outside it is blocked.
 */
export function acquirePageScrollLock({ freezePosition = false, getAllowedElements } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}

  if (!activeLocks.size) {
    originalStyles = captureStyles()
    lockedScrollPosition = { x: window.scrollX, y: window.scrollY }
    positionWasFrozen = false
    installInputGuards()
  }

  const id = ++lockId
  activeLocks.set(id, { freezePosition, getAllowedElements })
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
    removeInputGuards()
    restoreStyles()
    originalStyles = null
    lockedScrollPosition = null
    positionWasFrozen = false

    if (restorePosition) {
      const restoredScrollBehavior = document.documentElement.style.scrollBehavior
      document.documentElement.style.scrollBehavior = 'auto'
      window.scrollTo(restorePosition.x, restorePosition.y)
      document.documentElement.style.scrollBehavior = restoredScrollBehavior
    }
  }
}
