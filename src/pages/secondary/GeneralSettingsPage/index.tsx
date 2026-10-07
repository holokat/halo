import Tabs from '@/components/Tabs'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DISTRACTION_FREE_MODE } from '@/constants'
import { LocalizedLanguageNames, TLanguage } from '@/i18n'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { useDisableAvatarAnimations } from '@/providers/DisableAvatarAnimationsProvider'
import { useDistractionFreeMode } from '@/providers/DistractionFreeModeProvider'
import { useLowBandwidthMode } from '@/providers/LowBandwidthModeProvider'
import { useReadsVisibility } from '@/providers/ReadsVisibilityProvider'
import { useRTL } from '@/providers/RTLProvider'
import { useTextOnlyMode } from '@/providers/TextOnlyModeProvider'
import { TDistractionFreeMode } from '@/types'
import { IconAlignmentRight } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconAlignmentRight'
import { IconBellActive } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconBellActive'
import { IconBellOff } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconBellOff'
import { IconBook } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconBook'
import { IconCheckmark1 } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconCheckmark1'
import { IconGlobe } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconGlobe'
import { IconTextBlock } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconTextBlock'
import { IconUser } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconUser'
import { IconWifiWeak } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconWifiWeak'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { SelectValue } from '@radix-ui/react-select'
import { forwardRef, ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

function getInitialTab() {
  const tab = new URLSearchParams(window.location.search).get('tab')
  return tab === 'display' ? tab : 'interface'
}

const GeneralSettingsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState(getInitialTab)
  const [language, setLanguage] = useState<TLanguage>(i18n.language as TLanguage)
  const { distractionFreeMode, setDistractionFreeMode } = useDistractionFreeMode()
  const { hideReadsInProfiles, setHideReadsInProfiles } = useReadsVisibility()
  const { isRTL, toggleRTL, showRTLToggle } = useRTL()
  const { textOnlyMode, setTextOnlyMode } = useTextOnlyMode()
  const { lowBandwidthMode, setLowBandwidthMode } = useLowBandwidthMode()
  const { disableAvatarAnimations, setDisableAvatarAnimations } = useDisableAvatarAnimations()
  const focusLabelId = useId()
  const focusDescriptionId = useId()

  const handleLanguageChange = (value: TLanguage) => {
    i18n.changeLanguage(value)
    setLanguage(value)
  }

  const tabDefinitions = [
    { value: 'interface', label: t('Interface') },
    { value: 'display', label: t('Display') }
  ]

  return (
    <SecondaryPageLayout ref={ref} index={index} title={t('Reading')}>
      <div className="mt-3">
        <Tabs tabs={tabDefinitions} value={activeTab} onTabChange={setActiveTab} threshold={0} />

        {activeTab === 'interface' && (
          <div className="space-y-6 px-4 py-5">
            <section className="space-y-2.5">
              <h2 className="px-1 text-xs font-medium text-muted-foreground">
                {t('Language and layout')}
              </h2>
              <div className="divide-y divide-border/50 rounded-2xl border border-border/70 bg-card/50">
                <SettingRow id="languages" label={t('Languages')} icon={<IconGlobe />}>
                  <Select value={language} onValueChange={handleLanguageChange}>
                    <SelectTrigger id="languages" className="h-10 w-36 sm:w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LocalizedLanguageNames).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
                {showRTLToggle && (
                  <SettingRow
                    id="rtl-mode"
                    label={t('Right-to-left layout')}
                    icon={<IconAlignmentRight />}
                  >
                    <Switch
                      id="rtl-mode"
                      className="relative before:absolute before:-inset-3"
                      checked={isRTL}
                      onCheckedChange={toggleRTL}
                    />
                  </SettingRow>
                )}
              </div>
            </section>

            <section className="space-y-2.5">
              <h2 className="px-1 text-xs font-medium text-muted-foreground">
                {t('Media and bandwidth')}
              </h2>
              <div className="divide-y divide-border/50 rounded-2xl border border-border/70 bg-card/50">
                <SettingRow
                  id="text-only-mode"
                  label={t('Text Only Mode')}
                  description={t('Replace images and videos with load links.')}
                  icon={<IconTextBlock />}
                >
                  <Switch
                    id="text-only-mode"
                    aria-labelledby="text-only-mode-label"
                    aria-describedby="text-only-mode-description"
                    className="relative before:absolute before:-inset-3"
                    checked={textOnlyMode}
                    onCheckedChange={setTextOnlyMode}
                  />
                </SettingRow>
                <SettingRow
                  id="slow-connection-mode"
                  label={t('Slow Connection Mode')}
                  description={t('Use only relay.damus.io and hide reactions.')}
                  icon={<IconWifiWeak />}
                >
                  <Switch
                    id="slow-connection-mode"
                    aria-labelledby="slow-connection-mode-label"
                    aria-describedby="slow-connection-mode-description"
                    className="relative before:absolute before:-inset-3"
                    checked={lowBandwidthMode}
                    onCheckedChange={setLowBandwidthMode}
                  />
                </SettingRow>
                <SettingRow
                  id="disable-avatar-animations"
                  label={t('Disable Avatar Animations')}
                  description={t('Pause profile GIFs. GIFs in notes keep playing.')}
                  icon={<IconUser />}
                >
                  <Switch
                    id="disable-avatar-animations"
                    aria-labelledby="disable-avatar-animations-label"
                    aria-describedby="disable-avatar-animations-description"
                    className="relative before:absolute before:-inset-3"
                    checked={disableAvatarAnimations}
                    onCheckedChange={setDisableAvatarAnimations}
                  />
                </SettingRow>
              </div>
            </section>

            <section className="space-y-2.5">
              <h2 id={focusLabelId} className="px-1 text-xs font-medium text-muted-foreground">
                {t('Distraction-Free Mode')}
              </h2>
              <div className="space-y-3 rounded-2xl border border-border/70 bg-card/50 p-3">
                <RadioGroup.Root
                  aria-labelledby={focusLabelId}
                  aria-describedby={focusDescriptionId}
                  orientation="horizontal"
                  value={distractionFreeMode}
                  onValueChange={(value: TDistractionFreeMode) => setDistractionFreeMode(value)}
                  className="grid grid-cols-2 gap-2"
                >
                  {[
                    {
                      value: DISTRACTION_FREE_MODE.DRAIN_MY_TIME,
                      label: t('Drain my time'),
                      Icon: IconBellActive
                    },
                    {
                      value: DISTRACTION_FREE_MODE.FOCUS_MODE,
                      label: t('Focus mode'),
                      Icon: IconBellOff
                    }
                  ].map(({ value, label, Icon }) => (
                    <RadioGroup.Item
                      key={value}
                      value={value}
                      className="group relative flex min-h-12 items-center justify-center gap-2 rounded-xl border border-foreground/10 bg-background/60 px-2 py-3 text-xs font-medium text-muted-foreground transition-[background-color,border-color,color,box-shadow,transform] hover:bg-muted/50 hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-primary/40 data-[state=checked]:bg-primary/5 data-[state=checked]:text-foreground data-[state=checked]:shadow-sm sm:text-sm"
                    >
                      <Icon
                        className="size-4 shrink-0 group-data-[state=checked]:text-primary"
                        aria-hidden="true"
                      />
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
                <p id={focusDescriptionId} className="px-1 text-xs leading-5 text-muted-foreground">
                  {distractionFreeMode === DISTRACTION_FREE_MODE.FOCUS_MODE
                    ? t(
                        'Hide badges, tab unread counts, and new-note prompts. Notifications still load.'
                      )
                    : t('Show badges, tab unread counts, and new-note prompts.')}
                </p>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'display' && (
          <div className="px-4 py-5">
            <div className="rounded-2xl border border-border/70 bg-card/50">
              <SettingRow
                id="show-reads-in-profiles"
                label={t('Show reads in profiles', { defaultValue: 'Show reads in profiles' })}
                icon={<IconBook />}
              >
                <Switch
                  id="show-reads-in-profiles"
                  className="relative before:absolute before:-inset-3"
                  checked={!hideReadsInProfiles}
                  onCheckedChange={(checked) => setHideReadsInProfiles(!checked)}
                />
              </SettingRow>
            </div>
          </div>
        )}
      </div>
    </SecondaryPageLayout>
  )
})
GeneralSettingsPage.displayName = 'GeneralSettingsPage'
export default GeneralSettingsPage

function SettingRow({
  id,
  label,
  description,
  icon,
  children
}: {
  id: string
  label: string
  description?: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Label
        htmlFor={id}
        className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-[18px]"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span id={`${id}-label`} className="block text-sm font-medium leading-5">
            {label}
          </span>
          {description && (
            <span
              id={`${id}-description`}
              className="mt-1 block text-xs font-normal leading-5 text-muted-foreground"
            >
              {description}
            </span>
          )}
        </span>
      </Label>
      <div className="flex min-h-10 shrink-0 items-center">{children}</div>
    </div>
  )
}
