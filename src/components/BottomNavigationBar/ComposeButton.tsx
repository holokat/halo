import PostEditor from '@/components/PostEditor'
import { useNostr } from '@/providers/NostrProvider'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function ComposeButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { checkLogin } = useNostr()
  const [open, setOpen] = useState(false)

  return (
    <>
      <BottomNavigationBarItem
        active={false}
        onClick={(e) => {
          e.stopPropagation()
          checkLogin(() => {
            setOpen(true)
          })
        }}
        className={className}
        aria-label={t('New note', { defaultValue: 'New note' })}
        title={t('New note', { defaultValue: 'New note' })}
      >
        <Plus className="!size-7" />
      </BottomNavigationBarItem>
      <PostEditor open={open} setOpen={setOpen} />
    </>
  )
}
