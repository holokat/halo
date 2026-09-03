import PostEditor from '@/components/PostEditor'
import { useNostr } from '@/providers/NostrProvider'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function PostButton() {
  const { t } = useTranslation()
  const { checkLogin } = useNostr()
  const [open, setOpen] = useState(false)

  return (
    <>
      <SidebarItem
        title={t('New note')}
        className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
        onClick={(event) => {
          event.stopPropagation()
          checkLogin(() => setOpen(true))
        }}
      >
        <Plus />
      </SidebarItem>
      <PostEditor open={open} setOpen={setOpen} />
    </>
  )
}
