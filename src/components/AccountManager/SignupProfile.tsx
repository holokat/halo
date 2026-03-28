import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  buildInterestsFeedHashtags,
  createInterestsCustomFeed,
  INTEREST_CATEGORIES,
  TInterestCategoryId
} from '@/lib/custom-feed'
import { createProfileDraftEvent } from '@/lib/draft-event'
import { formatHandleValue } from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import Uploader from '@/components/PostEditor/Uploader'
import { generateImageByPubkey } from '@/lib/pubkey'
import { useNostr } from '@/providers/NostrProvider'
import vanityAddress from '@/services/vanity-address.service'
import { TCustomFeed } from '@/types'
import { getPublicKey, generateSecretKey } from 'nostr-tools'
import { nsecEncode, npubEncode } from 'nostr-tools/nip19'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  BriefcaseBusiness,
  ChartCandlestick,
  ChevronRight,
  Clapperboard,
  Cpu,
  FlaskConical,
  Gamepad2,
  HeartPulse,
  Landmark,
  Loader,
  Music4,
  Newspaper,
  PawPrint,
  Plane,
  Rocket,
  Trees,
  Trophy,
  Upload,
  User,
  UtensilsCrossed
} from 'lucide-react'

const INTEREST_ICON_MAP = {
  Newspaper,
  Trophy,
  Clapperboard,
  ChartCandlestick,
  BriefcaseBusiness,
  Landmark,
  FlaskConical,
  Rocket,
  Trees,
  Gamepad2,
  PawPrint,
  Cpu,
  Plane,
  UtensilsCrossed,
  Music4,
  HeartPulse
} as const

type SignupProfileStep = 'identity' | 'photo' | 'bio' | 'interests' | 'loading'

export type TSignupProfileResult = {
  pubkey: string
  keys: { nsec: string; npub: string }
  profile: { displayName: string; username: string }
  interestsFeed: TCustomFeed
}

function createSignupKeys() {
  const sk = generateSecretKey()
  const nsec = nsecEncode(sk)
  const pubkey = getPublicKey(sk)
  const npub = npubEncode(pubkey)

  return { pubkey, nsec, npub }
}

export default function SignupProfile({
  back,
  onProfileComplete,
  inviterPubkey
}: {
  back: () => void
  onProfileComplete: (result: TSignupProfileResult) => Promise<void> | void
  inviterPubkey?: string
}) {
  const { t } = useTranslation()
  const { nsecLogin, publish, updateProfileEvent } = useNostr()
  const [step, setStep] = useState<SignupProfileStep>('identity')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [about, setAbout] = useState('')
  const [avatar, setAvatar] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [selectedInterests, setSelectedInterests] = useState<TInterestCategoryId[]>([])
  const [hasCustomizedHandle, setHasCustomizedHandle] = useState(false)
  const [isPreparingAccount, setIsPreparingAccount] = useState(false)
  const [generatedKeys] = useState(createSignupKeys)
  const signupAccountReadyRef = useRef(false)
  const signupAccountPromiseRef = useRef<Promise<void> | null>(null)

  const ensureSignupAccountReady = useCallback(async () => {
    if (signupAccountReadyRef.current) {
      return
    }

    if (!signupAccountPromiseRef.current) {
      signupAccountPromiseRef.current = (async () => {
        setIsPreparingAccount(true)
        try {
          await nsecLogin(generatedKeys.nsec, '', true)
          await vanityAddress.registerSignupEligibility().catch((error) => {
            console.warn('Failed to register vanity eligibility during signup:', error)
          })

          signupAccountReadyRef.current = true

          // Let context consumers observe the new signer/account before follow-up onboarding work.
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
          })
        } finally {
          setIsPreparingAccount(false)
          if (!signupAccountReadyRef.current) {
            signupAccountPromiseRef.current = null
          }
        }
      })()
    }

    await signupAccountPromiseRef.current
  }, [generatedKeys.nsec, nsecLogin])

  const generatedAvatar = useMemo(() => {
    return generateImageByPubkey(generatedKeys.pubkey)
  }, [generatedKeys])

  const continueFromIdentity = () => {
    if (!displayName.trim()) {
      return
    }

    setStep('photo')
  }

  const toggleInterest = (interestId: TInterestCategoryId) => {
    setSelectedInterests((current) =>
      current.includes(interestId)
        ? current.filter((value) => value !== interestId)
        : [...current, interestId]
    )
  }

  const publishProfileInBackground = () => {
    const trimmedDisplayName = displayName.trim()
    const normalizedHandle = formatHandleValue(username)
    const trimmedAbout = about.trim()

    void (async () => {
      try {
        const profileContent: Record<string, unknown> = {}

        if (trimmedDisplayName) {
          profileContent.display_name = trimmedDisplayName
          profileContent.displayName = trimmedDisplayName
        }

        if (normalizedHandle || trimmedDisplayName) {
          profileContent.name = normalizedHandle || trimmedDisplayName
        }

        if (trimmedAbout) {
          profileContent.about = trimmedAbout
        }

        if (avatar) {
          profileContent.picture = avatar
        }

        if (inviterPubkey) {
          profileContent.joined_through = inviterPubkey
          profileContent.joined_at = Math.floor(Date.now() / 1000)
        }

        if (Object.keys(profileContent).length === 0) {
          return
        }

        const profileDraftEvent = createProfileDraftEvent(JSON.stringify(profileContent))
        const newProfileEvent = await publish(profileDraftEvent)
        await updateProfileEvent(newProfileEvent)
      } catch (error) {
        console.error('Failed to create profile:', error)
      }
    })()
  }

  const finishOnboarding = async () => {
    if (selectedInterests.length < 3 || isPreparingAccount) {
      return
    }

    const normalizedDisplayName = displayName.trim()
    const normalizedHandle = formatHandleValue(username)
    const interestsFeed = createInterestsCustomFeed(
      buildInterestsFeedHashtags(selectedInterests)
    )

    setStep('loading')
    try {
      await ensureSignupAccountReady()
      publishProfileInBackground()

      await onProfileComplete({
        pubkey: generatedKeys.pubkey,
        keys: { nsec: generatedKeys.nsec, npub: generatedKeys.npub },
        profile: {
          displayName: normalizedDisplayName,
          username: normalizedHandle
        },
        interestsFeed
      })
    } catch (error) {
      console.error('Failed to finish signup onboarding:', error)
      toast.error(
        t('Failed to create your account. Please try again.', {
          defaultValue: 'Failed to create your account. Please try again.'
        })
      )
      setStep('interests')
    }
  }

  const onAvatarUploadSuccess = ({ url }: { url: string }) => {
    setAvatar(url)
  }

  if (step === 'identity') {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300">
        <Button variant="ghost" onClick={back} className="w-fit text-muted-foreground -ml-2">
          ← {t('Back')}
        </Button>

        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold">What should we call you?</h2>
          <p className="text-sm text-muted-foreground">
            Pick a display name and a handle to get started.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="signup-displayname-input">{t('Display Name')}</Label>
            <Input
              id="signup-displayname-input"
              placeholder="Mr Bob"
              value={displayName}
              onChange={(event) => {
                const nextDisplayName = event.target.value
                setDisplayName(nextDisplayName)
                if (!hasCustomizedHandle) {
                  setUsername(formatHandleValue(nextDisplayName))
                }
              }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Nostr is nym-friendly, so this can be whatever you want people to call you.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="signup-handle-input">Handle</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">@</span>
              <Input
                id="signup-handle-input"
                placeholder="mrbob"
                value={username}
                onChange={(event) => {
                  setHasCustomizedHandle(true)
                  setUsername(formatHandleValue(event.target.value))
                }}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We prefill this from your display name, and you can change it any time.
            </p>
          </div>
        </div>

        <Button
          onClick={continueFromIdentity}
          disabled={!displayName.trim()}
          className="w-full mt-4"
          size="lg"
        >
          {t('Continue')}
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    )
  }

  if (step === 'photo') {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300">
        <Button
          variant="ghost"
          onClick={() => setStep('identity')}
          className="w-fit text-muted-foreground -ml-2"
        >
          ← {t('Back')}
        </Button>

        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold">Welcome, {displayName.trim()}!</h2>
          <p className="text-sm text-muted-foreground">
            Add a profile photo now, or skip and do it later.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 py-2">
          <Uploader
            beforeUpload={ensureSignupAccountReady}
            onUploadSuccess={onAvatarUploadSuccess}
            onUploadStart={() => setUploadingAvatar(true)}
            onUploadEnd={() => setUploadingAvatar(false)}
            className="group relative cursor-pointer"
          >
            <div className="relative size-28 overflow-hidden rounded-full border-[3px] border-border/80 bg-muted/20 shadow-sm transition-colors group-hover:border-primary/70">
              <Avatar className="size-full">
                <AvatarImage
                  src={avatar || generatedAvatar}
                  className="object-cover object-center"
                />
                <AvatarFallback className="bg-muted/30">
                  <User className="w-8 h-8 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              {uploadingAvatar || isPreparingAccount ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
                  <Loader className="animate-spin text-white" size={20} />
                </div>
              ) : (
                <div className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/35 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100">
                  <Upload className="text-white" size={20} />
                </div>
              )}
              {!avatar && !uploadingAvatar && !isPreparingAccount ? (
                <div className="absolute inset-x-0 bottom-0 bg-background/92 px-3 py-2 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-sm">
                  Add photo
                </div>
              ) : null}
            </div>
          </Uploader>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            Tap or click the image to upload a photo.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 pt-2">
          <Button onClick={() => setStep('bio')} className="w-full max-w-xs" size="lg">
            {t('Continue')}
          </Button>
          <Button
            variant="link"
            onClick={() => setStep('bio')}
            className="h-auto px-0 py-1 text-sm font-normal text-muted-foreground"
          >
            {t('Skip for now', { defaultValue: 'Skip for now' })}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'bio') {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300">
        <Button
          variant="ghost"
          onClick={() => setStep('photo')}
          className="w-fit text-muted-foreground -ml-2"
        >
          ← {t('Back')}
        </Button>

        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold">A preview of you</h2>
          <p className="text-sm text-muted-foreground">
            Write a short bio now, or skip and shape this later.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="signup-about-textarea">About you</Label>
          <Textarea
            id="signup-about-textarea"
            placeholder="Tell people what you are into..."
            className="h-28 resize-none"
            value={about}
            onChange={(event) => setAbout(event.target.value)}
          />
        </div>

        <Button onClick={() => setStep('interests')} className="w-full mt-4" size="lg">
          {t('Continue')}
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    )
  }

  if (step === 'interests') {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300">
        <Button
          variant="ghost"
          onClick={() => setStep('bio')}
          className="w-fit text-muted-foreground -ml-2"
        >
          ← {t('Back')}
        </Button>

        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold">Pick your interests</h2>
          <p className="text-sm text-muted-foreground">
            Choose a few topics to shape your first feed.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INTEREST_CATEGORIES.map((interest) => {
            const Icon = INTEREST_ICON_MAP[interest.icon as keyof typeof INTEREST_ICON_MAP]
            const selected = selectedInterests.includes(interest.id)

            return (
              <button
                key={interest.id}
                type="button"
                onClick={() => toggleInterest(interest.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-medium transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-muted/20 hover:bg-muted/40'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{interest.label}</span>
              </button>
            )
          })}
        </div>

        <p className="text-sm text-muted-foreground">
          Pick at least 3 interests to continue. You have selected {selectedInterests.length}.
        </p>

        <Button
          onClick={() => void finishOnboarding()}
          disabled={selectedInterests.length < 3}
          className="w-full mt-2"
          size="lg"
        >
          {t('Continue')}
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center animate-in fade-in duration-300">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Loader className="h-7 w-7 animate-spin text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Hold on tight, generating your first feed</h2>
        <p className="text-sm text-muted-foreground">
          We are shaping an Interests feed around what you picked.
        </p>
      </div>
    </div>
  )
}
