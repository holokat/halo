import PostEditor from '@/components/PostEditor'
import { POST_BUTTON_STYLE } from '@/constants'
import { cn } from '@/lib/utils'
import { useCompactSidebar } from '@/providers/CompactSidebarProvider'
import { usePostButtonStyle } from '@/providers/PostButtonStyleProvider'
import { useNostr } from '@/providers/NostrProvider'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function PostButton() {
  const { t } = useTranslation()
  const { checkLogin } = useNostr()
  const [open, setOpen] = useState(false)
  const { compactSidebar } = useCompactSidebar()
  const { postButtonStyle } = usePostButtonStyle()
  const isOutlined = postButtonStyle === POST_BUTTON_STYLE.OUTLINED

  return (
    <div className="pt-4">
      <SidebarItem
        title={t('New Note')}
        description={t('Post')}
        onClick={(e) => {
          e.stopPropagation()
          checkLogin(() => {
            setOpen(true)
          })
        }}
        variant="default"
        className={cn(
          "gap-2",
          isOutlined
            ? "border-2 border-primary text-primary-foreground bg-transparent hover:bg-primary/10"
            : "bg-primary",
          compactSidebar ? "" : "xl:justify-center"
        )}
      >
        <Plus strokeWidth={1.8} />
      </SidebarItem>
      <PostEditor open={open} setOpen={setOpen} />
    </div>
  )
}
