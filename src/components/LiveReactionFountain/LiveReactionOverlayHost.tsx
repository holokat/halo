import Emoji from '@/components/Emoji'
import { TLiveReactionFountainVisual } from '@/lib/live-reaction-fountain'
import { Heart } from 'lucide-react'
import { CSSProperties } from 'react'

export type TLiveReactionOverlayParticle = {
  id: string
  visual: TLiveReactionFountainVisual
  durationMs: number
  swayPx: number
  risePx: number
  startOffsetPx: number
  endRotationDeg: number
  startRotationDeg: number
  scale: number
}

export function LiveReactionOverlayHost({
  particles
}: {
  particles: TLiveReactionOverlayParticle[]
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70] overflow-hidden motion-reduce:hidden"
    >
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] right-3 h-80 w-40 sm:bottom-8 sm:right-6 sm:h-96 sm:w-48">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute bottom-0 right-0 animate-live-reaction-fountain-float"
            style={
              {
                animationDuration: `${particle.durationMs}ms`,
                '--live-reaction-start-x': `${particle.startOffsetPx}px`,
                '--live-reaction-rise': `${particle.risePx}px`,
                '--live-reaction-sway': `${particle.swayPx}px`,
                '--live-reaction-start-rotate': `${particle.startRotationDeg}deg`,
                '--live-reaction-end-rotate': `${particle.endRotationDeg}deg`
              } as CSSProperties
            }
          >
            <div
              className="animate-live-reaction-fountain-wiggle rounded-full border border-white/15 bg-card/80 p-2 shadow-xl backdrop-blur-sm"
              style={
                {
                  transform: `scale(${particle.scale})`
                } as CSSProperties
              }
            >
              {particle.visual.kind === 'heart' ? (
                <Heart className="size-7 fill-red-400 text-red-400 drop-shadow-sm" />
              ) : (
                <Emoji
                  emoji={particle.visual.emoji}
                  classNames={{
                    img: 'size-7 drop-shadow-sm',
                    text: 'text-3xl leading-none'
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
