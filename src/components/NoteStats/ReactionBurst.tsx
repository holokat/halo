import type { CSSProperties } from 'react'

const PARTICLES = [
  { x: '0px', y: '-22px', className: 'h-2 w-2 rounded-full bg-primary/90', delay: '0ms' },
  { x: '17px', y: '-14px', className: 'h-1.5 w-1.5 rotate-45 rounded-sm bg-primary/70', delay: '30ms' },
  { x: '22px', y: '2px', className: 'h-1.5 w-1.5 rounded-full bg-foreground/70', delay: '50ms' },
  { x: '14px', y: '16px', className: 'h-2 w-2 rounded-full bg-primary/60', delay: '80ms' },
  { x: '0px', y: '20px', className: 'h-1.5 w-1.5 rounded-full bg-foreground/60', delay: '110ms' },
  { x: '-15px', y: '15px', className: 'h-1.5 w-1.5 rotate-45 rounded-sm bg-primary/75', delay: '70ms' },
  { x: '-22px', y: '0px', className: 'h-2 w-2 rounded-full bg-primary/80', delay: '40ms' },
  { x: '-16px', y: '-14px', className: 'h-1.5 w-1.5 rounded-full bg-foreground/70', delay: '20ms' }
] as const

export default function ReactionBurst() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-visible motion-reduce:hidden"
    >
      <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/35 opacity-0 animate-reaction-burst-ring" />
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className={`absolute left-1/2 top-1/2 opacity-0 animate-reaction-burst-particle ${particle.className}`}
          style={
            {
              '--reaction-burst-x': particle.x,
              '--reaction-burst-y': particle.y,
              animationDelay: particle.delay
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
