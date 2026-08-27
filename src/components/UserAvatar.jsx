import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useParticipantProfile } from '../context/ParticipantProfileContext'

const signedUrlCache = new Map()
const CACHE_MS = 45 * 60 * 1000

export async function getAvatarUrl(path) {
  if (!path) return null
  const cached = signedUrlCache.get(path)
  if (cached && cached.expiresAt > Date.now()) return cached.url

  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60)
  if (error) throw error
  const url = data?.signedUrl || null
  if (url) signedUrlCache.set(path, { url, expiresAt: Date.now() + CACHE_MS })
  return url
}

export function clearAvatarCache(path) {
  if (path) signedUrlCache.delete(path)
}

export default function UserAvatar({ profile, size = '', className = '', alt, interactive = true }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const [preview, setPreview] = useState(null)
  const avatarRef = useRef(null)
  const participantProfile = useParticipantProfile()
  const displayName = profile?.display_name || 'Jogador'
  const path = profile?.avatar_path || null
  const canOpen = Boolean(interactive && profile?.id && participantProfile?.openParticipant)

  useEffect(() => {
    let active = true
    setFailed(false)
    setUrl(null)
    setPreview(null)

    if (!path) return () => { active = false }

    getAvatarUrl(path)
      .then((nextUrl) => { if (active) setUrl(nextUrl) })
      .catch(() => { if (active) setFailed(true) })

    return () => { active = false }
  }, [path])

  const classes = ['avatar', size, className, canOpen ? 'avatar-interactive' : ''].filter(Boolean).join(' ')
  const hasPhoto = Boolean(url && !failed)

  function openProfile(event) {
    if (!canOpen) return
    event.stopPropagation()
    participantProfile.openParticipant(profile)
  }

  function handleKeyDown(event) {
    if (!canOpen || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    event.stopPropagation()
    participantProfile.openParticipant(profile)
  }

  function showPreview() {
    if (!hasPhoto || !avatarRef.current || typeof window === 'undefined') return
    const rect = avatarRef.current.getBoundingClientRect()
    const width = 156
    const height = 178
    const margin = 12
    const left = Math.max(width / 2 + 8, Math.min(window.innerWidth - width / 2 - 8, rect.left + rect.width / 2))
    const placeBelow = rect.top < height + margin + 8
    const top = placeBelow ? rect.bottom + margin : rect.top - height - margin
    setPreview({ left, top, below: placeBelow })
  }

  return (
    <>
      <span
        ref={avatarRef}
        className={classes}
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onClick={openProfile}
        onKeyDown={handleKeyDown}
        onMouseEnter={showPreview}
        onMouseLeave={() => setPreview(null)}
        onFocus={showPreview}
        onBlur={() => setPreview(null)}
        aria-label={canOpen ? `Abrir perfil de ${displayName}` : displayName}
      >
        <span className="avatar-media">
          {hasPhoto ? (
            <img src={url} alt={alt || `Foto de ${displayName}`} onError={() => setFailed(true)} />
          ) : (
            <span className="avatar-fallback" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
      </span>
      {hasPhoto && preview && typeof document !== 'undefined' && createPortal(
        <span
          className={`avatar-photo-tooltip portal ${preview.below ? 'below' : ''}`}
          style={{ left: `${preview.left}px`, top: `${preview.top}px` }}
          aria-hidden="true"
        >
          <img src={url} alt="" />
          <small>{displayName}</small>
        </span>,
        document.body,
      )}
    </>
  )
}
