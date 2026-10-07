import { usePageTheme } from '@/providers/PageThemeProvider'
import { useTheme } from '@/providers/ThemeProvider'
import type { TThemeSetting } from '@/types'
import { IconCheckmark1 } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconCheckmark1'
import { IconMoon } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconMoon'
import { IconStudioDisplay } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconStudioDisplay'
import { IconSun } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconSun'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

export default function ThemeSetting() {
  const { t } = useTranslation()
  const labelId = useId()
  const { themeSetting, setThemeSetting } = useTheme()
  const { setPageTheme } = usePageTheme()

  return (
    <div className="space-y-3 rounded-3xl border border-border/70 bg-card/50 p-3">
      <div id={labelId} className="px-1 pt-1 text-sm font-semibold">
        {t('Theme')}
      </div>
      <RadioGroup.Root
        aria-labelledby={labelId}
        orientation="horizontal"
        value={themeSetting}
        onValueChange={(value: TThemeSetting) => {
          setPageTheme('default')
          setThemeSetting(value)
        }}
        className="grid grid-cols-3 gap-2"
      >
        {(
          [
            { value: 'light', label: t('Light'), Icon: IconSun },
            { value: 'dark', label: t('Dark'), Icon: IconMoon },
            { value: 'system', label: t('System'), Icon: IconStudioDisplay }
          ] as const
        ).map(({ value, label, Icon }) => (
          <RadioGroup.Item
            key={value}
            value={value}
            className="group relative flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-foreground/10 bg-background/60 px-2 py-3 text-xs font-medium text-muted-foreground transition-[background-color,border-color,color,box-shadow,transform] hover:bg-muted/50 hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-primary/40 data-[state=checked]:bg-primary/5 data-[state=checked]:text-foreground data-[state=checked]:shadow-sm sm:gap-2 sm:text-sm"
          >
            <span className="shrink-0 transition-colors group-data-[state=checked]:text-primary">
              <Icon className="size-4 sm:size-5" aria-hidden="true" />
            </span>
            <span>{label}</span>
            <RadioGroup.Indicator
              className="absolute right-1 top-1 flex size-3 items-center justify-center rounded-full bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <IconCheckmark1 className="size-2" />
            </RadioGroup.Indicator>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  )
}
