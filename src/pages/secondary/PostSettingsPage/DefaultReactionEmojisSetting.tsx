import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  useDefaultReactionEmojis,
  DEFAULT_REACTION_EMOJIS
} from '@/providers/DefaultReactionEmojisProvider'
import EmojiPicker from '@/components/EmojiPicker'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TEmoji } from '@/types'
import Emoji from '@/components/Emoji'
import { X, RotateCcw } from 'lucide-react'

export default function DefaultReactionEmojisSetting() {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const {
    reactionOptionsEnabled,
    setReactionOptionsEnabled,
    defaultReactionEmojis,
    setDefaultReactionEmojis,
    resetToDefault
  } = useDefaultReactionEmojis()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const handleEmojiSelect = (emoji: string | TEmoji | undefined, e?: MouseEvent) => {
    if (!emoji) return
    e?.stopPropagation()

    const emojiStr = typeof emoji === 'string' ? emoji : `:${emoji.shortcode}:`

    if (editingIndex !== null) {
      // Replace existing emoji
      const newEmojis = [...defaultReactionEmojis]
      newEmojis[editingIndex] = emojiStr
      setDefaultReactionEmojis(newEmojis)
      setEditingIndex(null)
    } else {
      // Add new emoji (max 10)
      if (defaultReactionEmojis.length < 10) {
        setDefaultReactionEmojis([...defaultReactionEmojis, emojiStr])
      }
    }
    setIsPickerOpen(false)
  }

  const handleRemoveEmoji = (index: number) => {
    const newEmojis = defaultReactionEmojis.filter((_, i) => i !== index)
    setDefaultReactionEmojis(newEmojis)
  }

  const handleEditEmoji = (index: number) => {
    setEditingIndex(index)
    setIsPickerOpen(true)
  }

  const handleAddEmoji = () => {
    setEditingIndex(null)
    setIsPickerOpen(true)
  }

  const handleReset = () => {
    resetToDefault()
  }

  const isDefault =
    JSON.stringify(defaultReactionEmojis) === JSON.stringify(DEFAULT_REACTION_EMOJIS)

  const EmojiPickerWrapper = isSmallScreen ? Drawer : DropdownMenu
  const EmojiPickerTriggerWrapper = isSmallScreen ? DrawerTrigger : DropdownMenuTrigger
  const EmojiPickerContentWrapper = isSmallScreen ? DrawerContent : DropdownMenuContent

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-base font-normal">{t('Default Reaction Emojis')}</Label>
          <p className="text-sm text-muted-foreground">
            {t(
              'Enable reaction options to show emoji choices instead of sending a heart immediately.'
            )}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium">{t('Enable reaction options')}</div>
            <div className="text-xs text-muted-foreground">
              {t('When disabled, reacting to a note sends a heart right away.')}
            </div>
          </div>
          <Switch checked={reactionOptionsEnabled} onCheckedChange={setReactionOptionsEnabled} />
        </div>

        {reactionOptionsEnabled && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('Customize the emojis that appear in the quick-reaction bar on notes.')}
              </p>
              {!isDefault && (
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 gap-1">
                  <RotateCcw className="w-3 h-3" />
                  {t('Reset')}
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {defaultReactionEmojis.map((emoji, index) => (
                <EmojiPickerWrapper
                  key={index}
                  open={isPickerOpen && editingIndex === index}
                  onOpenChange={(open) => {
                    if (editingIndex === index) {
                      setIsPickerOpen(open)
                      if (!open) setEditingIndex(null)
                    }
                  }}
                >
                  <div className="relative group">
                    <EmojiPickerTriggerWrapper asChild>
                      <button
                        onClick={() => handleEditEmoji(index)}
                        className="w-12 h-12 border-2 rounded-lg flex items-center justify-center hover:border-primary transition-colors"
                        style={{ borderRadius: 'var(--button-radius, 8px)' }}
                      >
                        <Emoji
                          emoji={emoji}
                          classNames={{
                            img: 'size-7',
                            text: 'text-2xl'
                          }}
                        />
                      </button>
                    </EmojiPickerTriggerWrapper>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveEmoji(index)
                      }}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <EmojiPickerContentWrapper
                    {...(isSmallScreen ? {} : { side: 'top' as const, className: 'p-0 w-fit' })}
                  >
                    <EmojiPicker onEmojiClick={handleEmojiSelect} />
                  </EmojiPickerContentWrapper>
                </EmojiPickerWrapper>
              ))}

              {defaultReactionEmojis.length < 10 && (
                <EmojiPickerWrapper
                  open={isPickerOpen && editingIndex === null}
                  onOpenChange={(open) => {
                    if (editingIndex === null) {
                      setIsPickerOpen(open)
                    }
                  }}
                >
                  <EmojiPickerTriggerWrapper asChild>
                    <button
                      onClick={handleAddEmoji}
                      className="w-12 h-12 border-2 border-dashed rounded-lg flex items-center justify-center hover:border-primary transition-colors text-muted-foreground hover:text-foreground"
                      style={{ borderRadius: 'var(--button-radius, 8px)' }}
                    >
                      <span className="text-2xl">+</span>
                    </button>
                  </EmojiPickerTriggerWrapper>
                  <EmojiPickerContentWrapper
                    {...(isSmallScreen ? {} : { side: 'top' as const, className: 'p-0 w-fit' })}
                  >
                    <EmojiPicker onEmojiClick={handleEmojiSelect} />
                  </EmojiPickerContentWrapper>
                </EmojiPickerWrapper>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {t('Click an emoji to change it, or click the X to remove it. Maximum 10 emojis.')}
            </p>
          </>
        )}
      </div>
    </>
  )
}
