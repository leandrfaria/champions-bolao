import { createContext, useContext } from 'react'

export const ParticipantProfileContext = createContext(null)

export function useParticipantProfile() {
  return useContext(ParticipantProfileContext)
}
