import type { CSSProperties } from 'react'

type TParticle = {
  x: number
  y: number
  size: number
  className: string
  delay: number
}

const BASE_PARTICLES: TParticle[] = [
  { x: 0, y: -22, size: 8, className: 'rounded-full bg-primary/90', delay: 0 },
  { x: 17, y: -14, size: 6, className: 'rotate-45 rounded-sm bg-primary/70', delay: 30 },
  { x: 22, y: 2, size: 6, className: 'rounded-full bg-foreground/70', delay: 50 },
  { x: 14, y: 16, size: 8, className: 'rounded-full bg-primary/60', delay: 80 },
  { x: 0, y: 20, size: 6, className: 'rounded-full bg-foreground/60', delay: 110 },
  { x: -15, y: 15, size: 6, className: 'rotate-45 rounded-sm bg-primary/75', delay: 70 },
  { x: -22, y: 0, size: 8, className: 'rounded-full bg-primary/80', delay: 40 },
  { x: -16, y: -14, size: 6, className: 'rounded-full bg-foreground/70', delay: 20 }
]

const EXTRA_PARTICLES: TParticle[] = [
  { x: 28, y: -24, size: 5, className: 'rounded-full bg-primary/75', delay: 60 },
  { x: 30, y: 18, size: 5, className: 'rotate-45 rounded-sm bg-foreground/65', delay: 95 },
  { x: -30, y: 20, size: 5, className: 'rounded-full bg-primary/70', delay: 75 },
  { x: -28, y: -24, size: 5, className: 'rotate-45 rounded-sm bg-primary/65', delay: 45 }
]

export default function ReactionBurst({ intensity = 0 }: { intensity?: number }) {
  const particleScale = 1 + intensity * 0.6
  const distanceScale = 1 + intensity * 0.9
  const particles = intensity >= 0.52 ? BASE_PARTICLES.concat(EXTRA_PARTICLES) : BASE_PARTICLES
  const ringSize = 24 + intensity * 20
  const particleDuration = Math.round(Math.max(520, 650 - intensity * 140))
  const ringDuration = Math.round(Math.max(400, 500 - intensity * 80))

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-visible motion-reduce:hidden"
    >
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/35 opacity-0 animate-reaction-burst-ring"
        style={
          {
            width: `${ringSize}px`,
            height: `${ringSize}px`,
            animationDuration: `${ringDuration}ms`,
            '--reaction-burst-ring-start-scale': `${0.45 + intensity * 0.05}`,
            '--reaction-burst-ring-end-scale': `${1.55 + intensity * 0.7}`,
            '--reaction-burst-ring-opacity': `${0.55 + intensity * 0.12}`
          } as CSSProperties
        }
      />

      {particles.map((particle, index) => (
        <span
          key={index}
          className={`absolute left-1/2 top-1/2 block opacity-0 animate-reaction-burst-particle ${particle.className}`}
          style={
            {
              width: `${particle.size * particleScale}px`,
              height: `${particle.size * particleScale}px`,
              '--reaction-burst-x': `${Math.round(particle.x * distanceScale)}px`,
              '--reaction-burst-y': `${Math.round(particle.y * distanceScale)}px`,
              '--reaction-burst-start-scale': `${0.32 + intensity * 0.08}`,
              '--reaction-burst-end-scale': `${0.88 + intensity * 0.42}`,
              animationDelay: `${particle.delay}ms`,
              animationDuration: `${particleDuration}ms`
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
