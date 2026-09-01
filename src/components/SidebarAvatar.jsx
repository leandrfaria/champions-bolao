import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getAvatarUrl } from './UserAvatar'
import { useParticipantProfile } from '../context/ParticipantProfileContext'

export default function SidebarAvatar({ profile }) {
  const [avatarPath, setAvatarPath] = useState(profile?.avatar_path || null)
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const participantProfile = useParticipantProfile()
  const displayName = profile?.display_name || 'Jogador'

  useEffect(() => {
    let active = true
    const initialPath = profile?.avatar_path || null
    setAvatarPath(initialPath)

    if (!profile?.id) return () => { active = false }

    supabase
      .from('profiles')
      .select('avatar_path')
      .eq('id', profile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error) return
        setAvatarPath(data?.avatar_path || null)
      })

    return () => { active = false }
  }, [profile?.id, profile?.avatar_path])

  useEffect(() => {
    let active = true
    setUrl(null)
    setFailed(false)

    if (!avatarPath) return () => { active = false }

    getAvatarUrl(avatarPath)
      .then((nextUrl) => {
        if (active) setUrl(nextUrl)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => { active = false }
  }, [avatarPath])

  function openProfile(event) {
    event.stopPropagation()
    if (profile?.id) participantProfile?.openParticipant?.(profile)
  }

  return (
    <button
      type="button"
      className="sidebar-profile-avatar"
      onClick={openProfile}
      aria-label={`Abrir perfil de ${displayName}`}
      title={displayName}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={`Foto de ${displayName}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
      )}
    </button>
  )
}
