import Image from '@/components/Image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { createPollOption, normalizePollOptions } from '@/lib/poll'
import { normalizeUrl } from '@/lib/url'
import { TPollCreateData } from '@/types'
import dayjs from 'dayjs'
import { ChevronDown, ChevronUp, Eraser, ImageUp, Trash2, X } from 'lucide-react'
import { Dispatch, SetStateAction, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Uploader from './Uploader'

export default function PollEditor({
  pollCreateData,
  setPollCreateData,
  setIsPoll
}: {
  pollCreateData: TPollCreateData
  setPollCreateData: Dispatch<SetStateAction<TPollCreateData>>
  setIsPoll: Dispatch<SetStateAction<boolean>>
}) {
  const { t } = useTranslation()
  const [isMultipleChoice, setIsMultipleChoice] = useState(pollCreateData.isMultipleChoice)
  const [options, setOptions] = useState(() => normalizePollOptions(pollCreateData.options))
  const [endsAt, setEndsAt] = useState(
    pollCreateData.endsAt ? dayjs(pollCreateData.endsAt * 1000).format('YYYY-MM-DDTHH:mm') : ''
  )
  const [relayUrls, setRelayUrls] = useState(pollCreateData.relays.join(', '))
  const [showAdvanced, setShowAdvanced] = useState(() => pollCreateData.relays.length > 0)

  useEffect(() => {
    setPollCreateData({
      isMultipleChoice,
      options,
      endsAt: endsAt ? dayjs(endsAt).startOf('minute').unix() : undefined,
      relays: relayUrls
        ? relayUrls
            .split(',')
            .map((url) => normalizeUrl(url.trim()))
            .filter(Boolean)
        : []
    })
  }, [isMultipleChoice, options, endsAt, relayUrls])

  const handleAddOption = () => {
    setOptions([...options, createPollOption()])
  }

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index))
    }
  }

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options]
    newOptions[index] = { ...newOptions[index], label: value }
    setOptions(newOptions)
  }

  const handleOptionImageUpload = (index: number, image: string) => {
    setOptions((prev) =>
      prev.map((option, optionIndex) =>
        optionIndex === index ? { ...option, image } : option
      )
    )
  }

  const handleRemoveOptionImage = (index: number) => {
    setOptions((prev) =>
      prev.map((option, optionIndex) => {
        if (optionIndex !== index) return option

        const { image: _image, ...nextOption } = option
        return nextOption
      })
    )
  }

  return (
    <div className="space-y-4 border rounded-lg p-3">
      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={option.id} className="flex gap-2">
            {option.image && (
              <Image
                image={{ url: option.image }}
                alt={option.label}
                className="h-full w-full object-cover"
                classNames={{ wrapper: 'size-10 shrink-0 rounded-md border bg-muted/30' }}
                hideIfError
              />
            )}
            <Input
              value={option.label}
              onChange={(e) => handleOptionChange(index, e.target.value)}
              placeholder={t('Option {{number}}', { number: index + 1 })}
            />
            <Uploader onUploadSuccess={({ url }) => handleOptionImageUpload(index, url)}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={
                  option.image
                    ? t('Replace option image')
                    : t('Add option image')
                }
              >
                <ImageUp />
              </Button>
            </Uploader>
            {option.image && (
              <Button
                type="button"
                variant="ghost-destructive"
                size="icon"
                onClick={() => handleRemoveOptionImage(index)}
                title={t('Remove option image')}
              >
                <Trash2 />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost-destructive"
              size="icon"
              onClick={() => handleRemoveOption(index)}
              disabled={options.length <= 2}
              title={t('Remove option')}
            >
              <X />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={handleAddOption}>
          {t('Add Option')}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="multiple-choice" className="text-sm">
            {t('Allow multiple choices')}
          </Label>
          <Switch
            id="multiple-choice"
            checked={isMultipleChoice}
            onCheckedChange={setIsMultipleChoice}
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Input
            id="ends-at"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            aria-label={t('End Date (optional)')}
            className="h-9 min-w-0 max-w-[220px]"
          />
          <Button
            type="button"
            variant="ghost-destructive"
            size="icon"
            onClick={() => setEndsAt('')}
            disabled={!endsAt}
            title={t('Clear end date')}
          >
            <Eraser />
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="link"
          className="h-auto w-fit p-0 text-xs text-muted-foreground"
          onClick={() => setShowAdvanced((prev) => !prev)}
        >
          {showAdvanced ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
          {t('Advanced')}
        </Button>

        {showAdvanced && (
          <div className="grid gap-2 rounded-md border border-dashed border-border/70 p-3">
            <Label htmlFor="relay-urls" className="text-xs text-muted-foreground">
              {t('Relay URLs (optional, comma-separated)')}
            </Label>
            <Input
              id="relay-urls"
              value={relayUrls}
              onChange={(e) => setRelayUrls(e.target.value)}
              placeholder="wss://relay1.com, wss://relay2.com"
            />
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Button variant="ghost-destructive" className="w-full" onClick={() => setIsPoll(false)}>
          {t('Remove poll')}
        </Button>
      </div>
    </div>
  )
}
