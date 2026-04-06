import Content from '@/components/Content'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useMessages } from '@/providers/MessagesProvider'
import dmMediaService, { buildEncryptedDmFileTags, createEncryptedDmFilePayload } from '@/services/dm-media.service'
import mediaUpload, { UPLOAD_ABORTED_ERROR_MSG } from '@/services/media-upload.service'
import {
  ArrowUp,
  Loader,
  Mic,
  Plus,
  Square,
  X
} from 'lucide-react'
import {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  TComposerAttachment,
  TUploadProgressItem,
  TSpeechRecognitionLike,
  VOICE_WAVE_BAR_COUNT,
  formatVoiceDuration,
  revokeBlobUrl
} from './messages-page.utils'

export function ConversationComposer({
  recipientPubkeys,
  subject,
  replyToId,
  placeholder,
  submitLabel,
  onSent
}: {
  recipientPubkeys: string[]
  subject?: string
  replyToId?: string
  placeholder: string
  submitLabel: string
  onSent?: () => void
}) {
  const { t } = useTranslation()
  const { sendMessage } = useMessages()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const attachmentsRef = useRef<TComposerAttachment[]>([])
  const speechRecognitionRef = useRef<TSpeechRecognitionLike | null>(null)
  const speechFinalTranscriptRef = useRef('')
  const speechInterimTranscriptRef = useRef('')
  const speechTickerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speechStartedAtRef = useRef<number | null>(null)
  const speechHasCompletedRef = useRef(false)
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [attachments, setAttachments] = useState<TComposerAttachment[]>([])
  const [uploadProgresses, setUploadProgresses] = useState<TUploadProgressItem[]>([])
  const [isSpeechRecording, setIsSpeechRecording] = useState(false)
  const [isSpeechTranscribing, setIsSpeechTranscribing] = useState(false)
  const [speechElapsedMs, setSpeechElapsedMs] = useState(0)
  const isSpeechBusy = isSpeechRecording || isSpeechTranscribing
  const canSend =
    !isSending &&
    !isSpeechBusy &&
    uploadProgresses.length === 0 &&
    (!!content.trim() || attachments.length > 0)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(
    () => () => {
      attachmentsRef.current.forEach((attachment) => revokeBlobUrl(attachment.previewUrl))
    },
    []
  )

  const stopSpeechTicker = () => {
    if (speechTickerRef.current) {
      clearInterval(speechTickerRef.current)
      speechTickerRef.current = null
    }
  }

  const cleanupSpeechRecognition = () => {
    const recognition = speechRecognitionRef.current
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
    }
    speechRecognitionRef.current = null
  }

  const appendSpeechToComposer = (rawTranscript: string) => {
    const transcript = rawTranscript.replace(/\s+/g, ' ').trim()
    if (!transcript) {
      return
    }

    setContent((current) => {
      if (!current.trim()) {
        return transcript
      }

      const needsSeparator = !/[\s\n]$/.test(current)
      return `${current}${needsSeparator ? ' ' : ''}${transcript}`
    })

    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      textarea.focus()
      const endPosition = textarea.value.length
      textarea.setSelectionRange(endPosition, endPosition)
    })
  }

  const completeSpeechRecognition = () => {
    if (speechHasCompletedRef.current) {
      return
    }

    speechHasCompletedRef.current = true
    stopSpeechTicker()
    setIsSpeechRecording(false)
    setIsSpeechTranscribing(false)

    const combinedTranscript = [speechFinalTranscriptRef.current, speechInterimTranscriptRef.current]
      .join(' ')
      .trim()

    cleanupSpeechRecognition()
    appendSpeechToComposer(combinedTranscript)
  }

  const stopSpeechRecognition = () => {
    const recognition = speechRecognitionRef.current
    if (!recognition) {
      return
    }

    setIsSpeechRecording(false)
    setIsSpeechTranscribing(true)
    stopSpeechTicker()
    recognition.stop()
  }

  const handleVoiceInputToggle = () => {
    if (isSending) {
      return
    }

    if (isSpeechRecording) {
      stopSpeechRecognition()
      return
    }

    if (isSpeechTranscribing) {
      return
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: new () => TSpeechRecognitionLike
      webkitSpeechRecognition?: new () => TSpeechRecognitionLike
    }
    const SpeechRecognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      toast.error(
        t('Voice input is not supported by this browser.', {
          defaultValue: 'Voice input is not supported by this browser.'
        })
      )
      return
    }

    try {
      const recognition = new SpeechRecognitionCtor()

      speechHasCompletedRef.current = false
      speechFinalTranscriptRef.current = ''
      speechInterimTranscriptRef.current = ''
      speechStartedAtRef.current = Date.now()
      setSpeechElapsedMs(0)

      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.lang = navigator.language || 'en-US'

      recognition.onresult = (event) => {
        let interimTranscript = ''
        let finalTranscript = speechFinalTranscriptRef.current

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          const transcript = result?.[0]?.transcript?.trim()

          if (!transcript) {
            continue
          }

          if (result.isFinal) {
            finalTranscript = `${finalTranscript} ${transcript}`.trim()
          } else {
            interimTranscript = `${interimTranscript} ${transcript}`.trim()
          }
        }

        speechFinalTranscriptRef.current = finalTranscript
        speechInterimTranscriptRef.current = interimTranscript
      }

      recognition.onerror = ({ error }) => {
        if (error && error !== 'aborted' && error !== 'no-speech') {
          const message =
            error === 'not-allowed' || error === 'service-not-allowed'
              ? t('Microphone permission is blocked.', {
                  defaultValue: 'Microphone permission is blocked.'
                })
              : t('Voice input failed. Please try again.', {
                  defaultValue: 'Voice input failed. Please try again.'
                })
          toast.error(message)
        }
      }

      recognition.onend = () => {
        completeSpeechRecognition()
      }

      recognition.start()
      speechRecognitionRef.current = recognition
      setIsSpeechRecording(true)
      setIsSpeechTranscribing(false)

      speechTickerRef.current = setInterval(() => {
        const startedAt = speechStartedAtRef.current
        if (!startedAt) {
          return
        }
        setSpeechElapsedMs(Date.now() - startedAt)
      }, 150)
    } catch (error) {
      cleanupSpeechRecognition()
      stopSpeechTicker()
      setIsSpeechRecording(false)
      setIsSpeechTranscribing(false)
      toast.error(
        error instanceof Error
          ? error.message
          : t('Could not start voice input.', {
              defaultValue: 'Could not start voice input.'
            })
      )
    }
  }

  useEffect(
    () => () => {
      stopSpeechTicker()
      const recognition = speechRecognitionRef.current
      if (recognition) {
        recognition.onresult = null
        recognition.onerror = null
        recognition.onend = null
        recognition.abort()
      }
      speechRecognitionRef.current = null
    },
    []
  )

  const handleUploadStart = (file: File, cancel: () => void) => {
    setUploadProgresses((current) => [...current, { file, progress: 0, cancel }])
  }

  const handleUploadProgress = (file: File, progress: number) => {
    setUploadProgresses((current) =>
      current.map((item) => (item.file === file ? { ...item, progress } : item))
    )
  }

  const handleUploadEnd = (file: File) => {
    setUploadProgresses((current) => current.filter((item) => item.file !== file))
  }

  const handleEncryptedUploadSuccess = ({
    url,
    fileTags,
    previewUrl,
    previewType
  }: {
    url: string
    fileTags: string[][]
    previewUrl: string
    previewType?: string
  }) => {
    setAttachments((current) => {
      if (current.some((attachment) => attachment.url === url)) {
        revokeBlobUrl(previewUrl)
        return current
      }

      return [...current, { url, previewUrl, previewType, mode: 'encrypted', fileTags }]
    })
  }

  const handleLegacyUploadSuccess = ({
    url,
    previewUrl,
    previewType,
    imetaTag
  }: {
    url: string
    previewUrl: string
    previewType?: string
    imetaTag?: string[]
  }) => {
    setAttachments((current) => {
      if (current.some((attachment) => attachment.url === url)) {
        revokeBlobUrl(previewUrl)
        return current
      }

      return [...current, { url, previewUrl, previewType, mode: 'legacy', imetaTag }]
    })
  }

  const uploadAttachmentFiles = async (files: File[]) => {
    if (!files.length || isSending) return

    const abortControllerMap = new Map<File, AbortController>()

    files.forEach((file) => {
      const abortController = new AbortController()
      abortControllerMap.set(file, abortController)
      handleUploadStart(file, () => abortController.abort())
    })

    for (const file of files) {
      try {
        const abortController = abortControllerMap.get(file)
        const encryptedPayload = await createEncryptedDmFilePayload(file)
        const result = await mediaUpload.upload(encryptedPayload.encryptedFile, {
          onProgress: (progress) => handleUploadProgress(file, progress),
          signal: abortController?.signal,
          skipImageConversion: true
        })
        handleEncryptedUploadSuccess({
          url: result.url,
          fileTags: buildEncryptedDmFileTags(encryptedPayload),
          previewUrl: URL.createObjectURL(file),
          previewType: file.type
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message === UPLOAD_ABORTED_ERROR_MSG) {
          continue
        }

        const abortController = abortControllerMap.get(file)

        try {
          handleUploadProgress(file, 0)
          const fallbackResult = await mediaUpload.upload(file, {
            onProgress: (progress) => handleUploadProgress(file, progress),
            signal: abortController?.signal
          })
          handleLegacyUploadSuccess({
            url: fallbackResult.url,
            previewUrl: URL.createObjectURL(file),
            previewType: file.type,
            imetaTag: mediaUpload.getImetaTagByUrl(fallbackResult.url)
          })
          toast.warning(
            t(
              'Your media host rejected encrypted file upload, so this attachment was sent in compatibility mode.',
              {
                defaultValue:
                  'Your media host rejected encrypted file upload, so this attachment was sent in compatibility mode.'
              }
            )
          )
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)

          if (fallbackMessage !== UPLOAD_ABORTED_ERROR_MSG) {
            toast.error(`${t('Failed to upload file')}: ${fallbackMessage}`)
          }
        }
      } finally {
        handleUploadEnd(file)
      }
    }
  }

  const handleTextareaPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file)

    if (!imageFiles.length) return

    event.preventDefault()
    void uploadAttachmentFiles(imageFiles)
  }

  const handleTextareaKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      return
    }

    event.preventDefault()
    if (canSend) {
      void handleSend()
    }
  }

  const handleAttachmentInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) {
      return
    }

    void uploadAttachmentFiles(files)
  }

  const handleRemoveAttachment = (url: string) => {
    setAttachments((current) => {
      const attachmentToRemove = current.find((attachment) => attachment.url === url)
      if (attachmentToRemove) {
        revokeBlobUrl(attachmentToRemove.previewUrl)
      }
      return current.filter((attachment) => attachment.url !== url)
    })
  }

  const handleSend = async () => {
    const trimmedContent = content.trim()
    if (
      (!trimmedContent && attachments.length === 0) ||
      isSending ||
      isSpeechBusy ||
      uploadProgresses.length > 0
    ) {
      return
    }

    setIsSending(true)

    try {
      if (trimmedContent) {
        await sendMessage(recipientPubkeys, trimmedContent, { replyToId, subject })
      }

      for (const attachment of attachments) {
        if (attachment.mode === 'encrypted') {
          await sendMessage(recipientPubkeys, attachment.url, {
            replyToId,
            subject,
            kind: 15,
            additionalTags: attachment.fileTags
          })
        } else {
          await sendMessage(recipientPubkeys, attachment.url, {
            replyToId,
            subject,
            additionalTags: attachment.imetaTag ? [attachment.imetaTag] : undefined
          })
        }
      }

      setContent('')
      setAttachments((current) => {
        current.forEach((attachment) => revokeBlobUrl(attachment.previewUrl))
        return []
      })
      onSent?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to send message')
      toast.error(message)
    } finally {
      setIsSending(false)
    }
  }

  const waveformPhase = Math.floor(speechElapsedMs / 120)

  const renderAttachmentPreview = (attachment: TComposerAttachment) => {
    if (attachment.previewUrl?.startsWith('blob:')) {
      if (attachment.previewType?.startsWith('image/')) {
        return (
          <img
            src={attachment.previewUrl}
            alt={t('Attachment preview')}
            className="max-h-[180px] max-w-[220px] rounded-md object-cover pr-6"
          />
        )
      }

      if (attachment.previewType?.startsWith('video/')) {
        return (
          <video
            src={attachment.previewUrl}
            className="max-h-[180px] max-w-[220px] rounded-md pr-6"
            controls
            playsInline
            muted
          />
        )
      }

      if (attachment.previewType?.startsWith('audio/')) {
        return <audio src={attachment.previewUrl} className="max-w-[220px] pr-6" controls />
      }
    }

    return (
      <Content
        content={attachment.previewUrl || attachment.url}
        className="max-w-[220px] pr-6 text-sm"
        mustLoadMedia
        compactMedia
      />
    )
  }

  return (
    <div className="space-y-3">
      {(attachments.length > 0 || uploadProgresses.length > 0) && (
        <div className="space-y-2">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.url}
                  className="relative rounded-xl border bg-background px-2 py-2"
                >
                  <button
                    type="button"
                    className="absolute right-1 top-1 z-10 inline-flex size-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:text-foreground"
                    aria-label={t('Remove attachment')}
                    title={t('Remove attachment')}
                    onClick={() => handleRemoveAttachment(attachment.url)}
                  >
                    <X className="size-4" />
                  </button>
                  {renderAttachmentPreview(attachment)}
                </div>
              ))}
            </div>
          )}

          {uploadProgresses.length > 0 &&
            uploadProgresses.map(({ file, progress, cancel }, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
              >
                <Loader className="size-4 animate-spin text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{file.name || t('Uploading...')}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
                  onClick={cancel}
                  aria-label={t('Cancel upload')}
                  title={t('Cancel upload')}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
        </div>
      )}

      <div
        className="relative overflow-hidden border bg-card/95 shadow-sm"
        style={{ borderRadius: 'var(--card-radius, 8px)' }}
      >
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          onPaste={handleTextareaPaste}
          placeholder={placeholder}
          className="min-h-[104px] max-h-[220px] resize-none overflow-y-auto scrollbar-dm-input border-0 bg-transparent px-4 pt-3 pb-12 text-sm shadow-none focus-visible:ring-0 scroll-pb-12"
          style={{ borderRadius: 'var(--card-radius, 8px)' }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*"
            className="hidden"
            onChange={handleAttachmentInputChange}
          />
          <button
            type="button"
            className="pointer-events-auto inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label={t('Attach media')}
            title={t('Attach media')}
            disabled={isSending || isSpeechBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="size-4" />
          </button>
          {isSpeechRecording && (
            <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3 rounded-full border border-border/60 bg-background/95 px-3 py-1.5 shadow-sm">
              <div className="relative flex min-w-0 flex-1 items-center">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
                <div className="relative flex w-full items-center justify-between gap-0.5">
                  {Array.from({ length: VOICE_WAVE_BAR_COUNT }).map((_, index) => {
                    const isPulse =
                      (waveformPhase + index * 3) % 17 === 0 || (waveformPhase + index * 5) % 29 === 0
                    const height = isPulse ? 13 : 5 + ((waveformPhase + index) % 3)

                    return (
                      <span
                        key={index}
                        className="w-[2px] rounded-full bg-foreground/85"
                        style={{ height: `${height}px` }}
                      />
                    )
                  })}
                </div>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatVoiceDuration(speechElapsedMs)}
              </span>
            </div>
          )}
          {isSpeechTranscribing && (
            <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border/60 bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              <Loader className="size-3.5 animate-spin" />
              <span className="truncate">
                {t('Transcribing speech...', { defaultValue: 'Transcribing speech...' })}
              </span>
            </div>
          )}
          <div className="pointer-events-auto ml-auto flex items-center gap-2">
            <button
              type="button"
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-full border transition-colors',
                isSpeechRecording
                  ? 'border-transparent bg-foreground text-background hover:bg-foreground/90'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                isSpeechTranscribing && 'cursor-not-allowed opacity-50'
              )}
              onClick={handleVoiceInputToggle}
              disabled={isSpeechTranscribing || isSending}
              aria-label={
                isSpeechRecording
                  ? t('Stop voice input', { defaultValue: 'Stop voice input' })
                  : t('Start voice input', { defaultValue: 'Start voice input' })
              }
              title={
                isSpeechRecording
                  ? t('Stop voice input', { defaultValue: 'Stop voice input' })
                  : t('Start voice input', { defaultValue: 'Start voice input' })
              }
            >
              {isSpeechRecording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-3.5" />}
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-full shadow-sm transition-colors',
                canSend
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground'
              )}
              onClick={handleSend}
              disabled={!canSend}
              aria-label={isSending ? t('Sending...') : submitLabel}
              title={isSending ? t('Sending...') : submitLabel}
            >
              {isSending ? <Loader className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
