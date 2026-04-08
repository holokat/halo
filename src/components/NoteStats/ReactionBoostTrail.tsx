import type { CSSProperties } from 'react'

const PARTICLES = [
  {
    glyph: '❤',
    className: 'text-[11px] text-primary/95',
    x: '-20px',
    y: '-34px',
    delay: '0ms',
    duration: '980ms'
  },
  {
    glyph: '✦',
    className: 'text-[10px] text-foreground/75',
    x: '-6px',
    y: '-40px',
    delay: '160ms',
    duration: '900ms'
  },
  {
    glyph: '❤',
    className: 'text-[10px] text-primary/80',
    x: '16px',
    y: '-30px',
    delay: '90ms',
    duration: '1040ms'
  },
  {
    glyph: '✦',
    className: 'text-[9px] text-primary/70',
    x: '24px',
    y: '-14px',
    delay: '240ms',
    duration: '940ms'
  },
  {
    glyph: '❤',
    className: 'text-[9px] text-foreground/70',
    x: '-24px',
    y: '-12px',
    delay: '320ms',
    duration: '1020ms'
  }
] as const

export default function ReactionBoostTrail() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-visible motion-reduce:hidden"
    >
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 animate-reaction-charge-float ${particle.className}`}
          style={
            {
              '--reaction-charge-x': particle.x,
              '--reaction-charge-y': particle.y,
              animationDelay: particle.delay,
              animationDuration: particle.duration
            } as CSSProperties
          }
        >
          {particle.glyph}
        </span>
      ))}
    </span>
  )
}
