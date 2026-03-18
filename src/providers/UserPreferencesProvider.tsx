import storage from '@/services/local-storage.service'
import { TNotificationStyle } from '@/types'
import { createContext, useContext, useState } from 'react'

type TUserPreferencesContext = {
  notificationListStyle: TNotificationStyle
  updateNotificationListStyle: (style: TNotificationStyle) => void
  messageNotificationsEnabled: boolean
  updateMessageNotificationsEnabled: (enabled: boolean) => void

  muteMedia: boolean
  updateMuteMedia: (mute: boolean) => void
}

const UserPreferencesContext = createContext<TUserPreferencesContext | undefined>(undefined)

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider')
  }
  return context
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [notificationListStyle, setNotificationListStyle] = useState(
    storage.getNotificationListStyle()
  )
  const [messageNotificationsEnabled, setMessageNotificationsEnabled] = useState(
    storage.getMessageNotificationsEnabled()
  )
  const [muteMedia, setMuteMedia] = useState(true)

  const updateNotificationListStyle = (style: TNotificationStyle) => {
    setNotificationListStyle(style)
    storage.setNotificationListStyle(style)
  }

  const updateMessageNotificationsEnabled = (enabled: boolean) => {
    setMessageNotificationsEnabled(enabled)
    storage.setMessageNotificationsEnabled(enabled)
  }

  return (
    <UserPreferencesContext.Provider
      value={{
        notificationListStyle,
        updateNotificationListStyle,
        messageNotificationsEnabled,
        updateMessageNotificationsEnabled,
        muteMedia,
        updateMuteMedia: setMuteMedia
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  )
}
