import { Button } from '@/components/ui/button'
import { usePaymentsEnabled } from '@/providers/PaymentsEnabledProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useZap } from '@/providers/ZapProvider'
import client from '@/services/client.service'
import lightning from '@/services/lightning.service'
import { getLightningAddressFromProfile } from '@/lib/lightning'
import { cn } from '@/lib/utils'
import { calculateChargeZapAmount, fireChargeZapConfetti, playZapSound } from './messages-page.utils'
import {
  Loader,
  PlugZap,
  Zap
} from 'lucide-react'
import { MouseEvent, TouchEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import ZapDialog from '@/components/ZapDialog'

export function DirectMessageZapActions({ pubkey }: { pubkey: string }) {
  const { paymentsEnabled } = usePaymentsEnabled()
  const { chargeZapEnabled, quickZap, isWalletConnected } = useZap()

  if (!paymentsEnabled) {
    return null
  }

  const showChargeZap = isWalletConnected && chargeZapEnabled && quickZap

  return (
    <div className="relative flex shrink-0 items-center gap-1 overflow-visible">
      {showChargeZap && <DirectMessageChargeZapButton pubkey={pubkey} />}
      <DirectMessageZapButton pubkey={pubkey} />
    </div>
  )
}

function DirectMessageZapButton({ pubkey: recipientPubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { checkLogin, pubkey } = useNostr()
  const { defaultZapSats, defaultZapComment, quickZap, zapSound, isWalletConnected } = useZap()
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const [openZapDialog, setOpenZapDialog] = useState(false)
  const [isPendingQuickZap, setIsPendingQuickZap] = useState(false)
  const [disable, setDisable] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressRef = useRef(false)

  useEffect(() => {
    let isMounted = true
    setDisable(true)

    void client.fetchProfile(recipientPubkey).then((profile) => {
      if (!isMounted || !profile) return
      if (pubkey === profile.pubkey) return
      const lightningAddress = getLightningAddressFromProfile(profile)
      if (lightningAddress) {
        setDisable(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [pubkey, recipientPubkey])

  const handleZap = async () => {
    try {
      if (!pubkey) {
        throw new Error('You need to be logged in to zap')
      }
      if (isPendingQuickZap) return

      playZapSound(zapSound, isWalletConnected)

      setIsPendingQuickZap(true)
      await lightning.zap(pubkey, recipientPubkey, defaultZapSats, defaultZapComment)
    } catch (error) {
      toast.error(`${t('Zap failed')}: ${(error as Error).message}`)
    } finally {
      setIsPendingQuickZap(false)
    }
  }

  const handleClickStart = (event: MouseEvent | TouchEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable) return

    isLongPressRef.current = false

    if ('touches' in event) {
      const touch = event.touches[0]
      setTouchStart({ x: touch.clientX, y: touch.clientY })
    }

    if (quickZap) {
      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true
        checkLogin(() => {
          setOpenZapDialog(true)
        })
      }, 500)
    }
  }

  const handleClickEnd = (event: MouseEvent | TouchEvent) => {
    event.stopPropagation()
    event.preventDefault()

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    if (disable) return

    if ('touches' in event) {
      setTouchStart(null)
      if (!touchStart) return
      const touch = event.changedTouches[0]
      const diffX = Math.abs(touch.clientX - touchStart.x)
      const diffY = Math.abs(touch.clientY - touchStart.y)
      if (diffX > 10 || diffY > 10) return
    }

    if (!quickZap) {
      checkLogin(() => {
        setOpenZapDialog(true)
      })
    } else if (!isLongPressRef.current) {
      checkLogin(() => handleZap())
    }

    isLongPressRef.current = false
  }

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
          disable
            ? 'cursor-not-allowed text-muted-foreground/40'
            : 'text-muted-foreground hover:text-primary',
          isPendingQuickZap && 'text-primary'
        )}
        title={t('Zap')}
        aria-label={t('Zap')}
        aria-busy={isPendingQuickZap}
        disabled={disable || isPendingQuickZap}
        onMouseDown={handleClickStart}
        onMouseUp={handleClickEnd}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleClickStart}
        onTouchEnd={handleClickEnd}
      >
        <Zap className={cn(isPendingQuickZap && 'fill-primary animate-pulse')} />
      </button>
      <ZapDialog open={openZapDialog} setOpen={setOpenZapDialog} pubkey={recipientPubkey} />
    </>
  )
}

function DirectMessageChargeZapButton({ pubkey: recipientPubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { checkLogin, pubkey } = useNostr()
  const { chargeZapLimit, zapSound, isWalletConnected } = useZap()
  const [isCharging, setIsCharging] = useState(false)
  const [chargeAmount, setChargeAmount] = useState(0)
  const [zapping, setZapping] = useState(false)
  const [disable, setDisable] = useState(true)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const chargeStartTimeRef = useRef<number>(0)
  const chargeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isTouchDeviceRef = useRef(false)

  useEffect(() => {
    let isMounted = true
    setDisable(true)

    void client.fetchProfile(recipientPubkey).then((profile) => {
      if (!isMounted || !profile) return
      if (pubkey === profile.pubkey) return
      const lightningAddress = getLightningAddressFromProfile(profile)
      if (lightningAddress) {
        setDisable(false)
      }
    })

    return () => {
      isMounted = false
      if (chargeIntervalRef.current) {
        clearInterval(chargeIntervalRef.current)
      }
    }
  }, [pubkey, recipientPubkey])

  const startCharging = () => {
    setIsCharging(true)
    setChargeAmount(0)
    chargeStartTimeRef.current = Date.now()

    chargeIntervalRef.current = setInterval(() => {
      const duration = Date.now() - chargeStartTimeRef.current
      const amount = calculateChargeZapAmount(duration, chargeZapLimit)
      setChargeAmount(amount)

      if (amount >= chargeZapLimit && chargeIntervalRef.current) {
        clearInterval(chargeIntervalRef.current)
      }
    }, 50)
  }

  const stopCharging = async () => {
    if (chargeIntervalRef.current) {
      clearInterval(chargeIntervalRef.current)
      chargeIntervalRef.current = null
    }

    const finalAmount = chargeAmount
    setIsCharging(false)
    setChargeAmount(0)

    if (finalAmount === 0 || !buttonRef.current) {
      return
    }

    fireChargeZapConfetti(buttonRef.current, finalAmount, chargeZapLimit)

    try {
      if (!pubkey) {
        throw new Error('You need to be logged in to zap')
      }

      playZapSound(zapSound, isWalletConnected)

      setZapping(true)
      const zapResult = await lightning.zap(pubkey, recipientPubkey, finalAmount, '')

      if (!zapResult) {
        return
      }

      toast.success(t('Zap sent successfully', { defaultValue: 'Zap sent successfully' }))
    } catch (error) {
      toast.error(`${t('Zap failed')}: ${(error as Error).message}`)
    } finally {
      setZapping(false)
    }
  }

  const handleMouseDown = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable || zapping) return

    isTouchDeviceRef.current = false
    checkLogin(() => startCharging())
  }

  const handleMouseUp = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable || zapping || isTouchDeviceRef.current) return

    void stopCharging()
  }

  const handleMouseLeave = () => {
    if (isCharging && !isTouchDeviceRef.current) {
      if (chargeIntervalRef.current) {
        clearInterval(chargeIntervalRef.current)
        chargeIntervalRef.current = null
      }
      setIsCharging(false)
      setChargeAmount(0)
    }
  }

  const handleTouchStart = (event: TouchEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable || zapping) return

    isTouchDeviceRef.current = true
    const touch = event.touches[0]
    setTouchStart({ x: touch.clientX, y: touch.clientY })

    checkLogin(() => startCharging())
  }

  const handleTouchEnd = (event: TouchEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (disable || zapping || !touchStart) return

    const touch = event.changedTouches[0]
    const diffX = Math.abs(touch.clientX - touchStart.x)
    const diffY = Math.abs(touch.clientY - touchStart.y)
    setTouchStart(null)

    if (diffX > 10 || diffY > 10) {
      if (chargeIntervalRef.current) {
        clearInterval(chargeIntervalRef.current)
        chargeIntervalRef.current = null
      }
      setIsCharging(false)
      setChargeAmount(0)
      return
    }

    void stopCharging()
  }

  return (
    <div className="relative shrink-0 overflow-visible">
      {isCharging && (
        <div className="absolute -top-8 left-1/2 z-20 -translate-x-1/2 rounded-md bg-yellow-400 px-2 py-1 text-xs font-bold text-black whitespace-nowrap animate-pulse">
          {chargeAmount} {t('Sats')}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          'flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-full px-2 transition-colors',
          disable
            ? 'cursor-not-allowed text-muted-foreground/40'
            : 'text-muted-foreground hover:text-yellow-400',
          (isCharging || zapping) && 'text-yellow-400'
        )}
        title={t('Charge Zap')}
        aria-label={t('Charge Zap')}
        aria-live="polite"
        disabled={disable || zapping}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {zapping ? (
          <Loader className="animate-spin" />
        ) : (
          <>
            <PlugZap className={cn(isCharging && 'fill-yellow-400')} />
            {isCharging && (
              <span className="text-[11px] font-semibold tabular-nums leading-none">
                {chargeAmount}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  )
}
