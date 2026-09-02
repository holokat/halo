import SettingsListItem from '@/components/SettingsListItem'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import {
  toBackupSettings,
  toFeedsSettings,
  toKeysSettings,
  toPostSettings,
  toRelaySettings,
  toScheduledPostsSettings
} from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { Cloud, Clock3, KeyRound, PencilLine, Rss, Server } from 'lucide-react'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

type TSettingsGroup = 'account-security' | 'advanced'

const SettingsGroupPage = forwardRef(
  ({ index, group }: { index?: number; group: TSettingsGroup }, ref) => {
    const { t } = useTranslation()
    const { push } = useSecondaryPage()
    const isAccountSecurity = group === 'account-security'
    const title = isAccountSecurity
      ? t('Account & security', { defaultValue: 'Account & security' })
      : t('Advanced')

    return (
      <SecondaryPageLayout ref={ref} index={index} title={title}>
        <div className="space-y-7 px-4 py-5">
          <p className="max-w-lg text-sm leading-6 text-muted-foreground">
            {isAccountSecurity
              ? t('Manage account access and keep a recoverable copy of your settings.', {
                  defaultValue:
                    'Manage account access and keep a recoverable copy of your settings.'
                })
              : t(
                  'Controls for experienced users who need custom network or publishing behavior.',
                  {
                    defaultValue:
                      'Controls for experienced users who need custom network or publishing behavior.'
                  }
                )}
          </p>

          <div className="space-y-1 rounded-3xl border border-border/70 bg-card/50 p-1.5">
            {isAccountSecurity ? (
              <>
                <SettingsListItem
                  icon={<KeyRound />}
                  label={t('Keys')}
                  description={t('Review your public key and signing setup', {
                    defaultValue: 'Review your public key and signing setup'
                  })}
                  onClick={() => push(toKeysSettings())}
                />
                <SettingsListItem
                  icon={<Cloud />}
                  label={t('Backup & sync', { defaultValue: 'Backup & sync' })}
                  description={t('Export or restore your Halo settings', {
                    defaultValue: 'Export or restore your Halo settings'
                  })}
                  onClick={() => push(toBackupSettings())}
                />
              </>
            ) : (
              <>
                <SettingsListItem
                  icon={<Server />}
                  label={t('Network')}
                  description={t('Manage relay connections and delivery', {
                    defaultValue: 'Manage relay connections and delivery'
                  })}
                  onClick={() => push(toRelaySettings())}
                />
                <SettingsListItem
                  icon={<PencilLine />}
                  label={t('Publishing')}
                  description={t('Set defaults used when publishing notes', {
                    defaultValue: 'Set defaults used when publishing notes'
                  })}
                  onClick={() => push(toPostSettings())}
                />
                <SettingsListItem
                  icon={<Rss />}
                  label={t('Specialist feeds', { defaultValue: 'Specialist feeds' })}
                  description={t('Manage interests, news sources, and relay bookmarks', {
                    defaultValue: 'Manage interests, news sources, and relay bookmarks'
                  })}
                  onClick={() => push(toFeedsSettings())}
                />
                <SettingsListItem
                  icon={<Clock3 />}
                  label={t('Scheduled posts', { defaultValue: 'Scheduled posts' })}
                  description={t('Review notes scheduled for later', {
                    defaultValue: 'Review notes scheduled for later'
                  })}
                  onClick={() => push(toScheduledPostsSettings())}
                />
              </>
            )}
          </div>
        </div>
      </SecondaryPageLayout>
    )
  }
)

SettingsGroupPage.displayName = 'SettingsGroupPage'

export default SettingsGroupPage
