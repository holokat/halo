import AboutInfoDialog from '@/components/AboutInfoDialog'
import SettingsListItem from '@/components/SettingsListItem'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import {
  toAccountSecuritySettings,
  toAdvancedSettings,
  toContentPrivacySettings,
  toGeneralSettings
} from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { BookOpen, Info, KeyRound, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

const SettingsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()

  return (
    <SecondaryPageLayout ref={ref} index={index} title={t('Settings')}>
      <div className="space-y-7 px-4 py-5">
        <p className="max-w-lg text-sm leading-6 text-muted-foreground">
          {t('Adjust how Halo reads, protects, and connects your account.', {
            defaultValue: 'Adjust how Halo reads, protects, and connects your account.'
          })}
        </p>

        <div className="space-y-1 rounded-3xl border border-border/70 bg-card/50 p-1.5">
          <SettingsListItem
            icon={<BookOpen />}
            label={t('Reading')}
            description={t('Language, bandwidth, and reading preferences', {
              defaultValue: 'Language, bandwidth, and reading preferences'
            })}
            onClick={() => push(toGeneralSettings())}
          />
          <SettingsListItem
            icon={<ShieldCheck />}
            label={t('Privacy & safety', { defaultValue: 'Privacy & safety' })}
            description={t('Muted content, media, and safety controls', {
              defaultValue: 'Muted content, media, and safety controls'
            })}
            onClick={() => push(toContentPrivacySettings())}
          />
          <SettingsListItem
            icon={<KeyRound />}
            label={t('Account & security', { defaultValue: 'Account & security' })}
            description={t('Keys, backups, and account protection', {
              defaultValue: 'Keys, backups, and account protection'
            })}
            onClick={() => push(toAccountSecuritySettings())}
          />
          <SettingsListItem
            icon={<SlidersHorizontal />}
            label={t('Advanced')}
            description={t('Network and publishing defaults', {
              defaultValue: 'Network and publishing defaults'
            })}
            onClick={() => push(toAdvancedSettings())}
          />
          <AboutInfoDialog>
            <SettingsListItem
              icon={<Info />}
              label={t('About')}
              description={t('Version and project information', {
                defaultValue: 'Version and project information'
              })}
              trailing={
                <span className="text-xs text-muted-foreground">
                  v{import.meta.env.APP_VERSION}
                </span>
              }
            />
          </AboutInfoDialog>
        </div>
      </div>
    </SecondaryPageLayout>
  )
})

SettingsPage.displayName = 'SettingsPage'

export default SettingsPage
