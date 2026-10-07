import { Button } from '@/components/ui/button'
import { useTheme } from '@/providers/ThemeProvider'
import { IconMoon as Moon } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconMoon'
import { IconSun as Sun } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconSun'
import { IconAppearanceLightMode as SunMoon } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconAppearanceLightMode'
import { useTranslation } from 'react-i18next'

export default function ThemeToggle() {
  const { t } = useTranslation()
  const { themeSetting, setThemeSetting } = useTheme()

  return (
    <>
      {themeSetting === 'system' ? (
        <Button
          variant="ghost"
          size="titlebar-icon"
          onClick={() => setThemeSetting('light')}
          title={t('switch to light theme')}
        >
          <SunMoon />
        </Button>
      ) : themeSetting === 'light' ? (
        <Button
          variant="ghost"
          size="titlebar-icon"
          onClick={() => setThemeSetting('dark')}
          title={t('switch to dark theme')}
        >
          <Sun />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="titlebar-icon"
          onClick={() => setThemeSetting('system')}
          title={t('switch to system theme')}
        >
          <Moon />
        </Button>
      )}
    </>
  )
}
