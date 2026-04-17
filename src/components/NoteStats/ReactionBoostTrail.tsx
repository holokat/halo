import type { CSSProperties } from 'react'

type TParticle = {
  glyph: string
  className: string
  x: number
  y: number
  size: number
  delay: number
  duration: number
}

const BASE_PARTICLES: TParticle[] = [
  {
    glyph: '❤',
    className: 'text-primary/95',
    x: -20,
    y: -34,
    size: 11,
    delay: 0,
    duration: 980
  },
  {
    glyph: '✦',
    className: 'text-foreground/75',
    x: -6,
    y: -40,
    size: 10,
    delay: 160,
    duration: 900
  },
  {
    glyph: '❤',
    className: 'text-primary/80',
    x: 16,
    y: -30,
    size: 10,
    delay: 90,
    duration: 1040
  },
  {
    glyph: '✦',
    className: 'text-primary/70',
    x: 24,
    y: -14,
    size: 9,
    delay: 240,
    duration: 940
  },
  {
    glyph: '❤',
    className: 'text-foreground/70',
    x: -24,
    y: -12,
    size: 9,
    delay: 320,
    duration: 1020
  }
]

const EXTRA_PARTICLES: TParticle[] = [
  {
    glyph: '✦',
    className: 'text-primary/85',
    x: 32,
    y: -42,
    size: 8,
    delay: 60,
    duration: 860
  },
  {
    glyph: '❤',
    className: 'text-primary/75',
    x: -32,
    y: -40,
    size: 8,
    delay: 200,
    duration: 900
  },
  {
    glyph: '✦',
    className: 'text-foreground/70',
    x: 34,
    y: -6,
    size: 8,
    delay: 140,
    duration: 820
  }
]

export default function ReactionBoostTrail({ intensity = 0 }: { intensity?: number }) {
  const particleScale = 1 + intensity * 0.65
  const distanceScale = 1 + intensity * 0.9
  const durationScale = 1 - intensity * 0.22
  const particles = intensity >= 0.48 ? BASE_PARTICLES.concat(EXTRA_PARTICLES) : BASE_PARTICLES
  const auraSize = 26 + intensity * 18
  const auraStyle = {
    width: `${auraSize}px`,
    height: `${auraSize}px`,
    '--reaction-charge-aura-start-scale': `${0.72 + intensity * 0.12}`,
    '--reaction-charge-aura-end-scale': `${1.18 + intensity * 0.45}`,
    '--reaction-charge-aura-opacity': `${0.18 + intensity * 0.18}`,
    '--reaction-charge-aura-duration': `${Math.round(780 - intensity * 160)}ms`
  } as CSSProperties

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-visible motion-reduce:hidden"
    >
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-md opacity-0 animate-reaction-charge-aura"
        style={auraStyle}
      />

      {particles.map((particle, index) => (
        <span
          key={`${particle.glyph}-${index}`}
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 animate-reaction-charge-float ${particle.className}`}
          style={
            {
              '--reaction-charge-x': `${Math.round(particle.x * distanceScale)}px`,
              '--reaction-charge-y': `${Math.round(particle.y * distanceScale)}px`,
              '--reaction-charge-start-scale': `${0.52 + intensity * 0.2}`,
              '--reaction-charge-end-scale': `${0.98 + intensity * 0.5}`,
              '--reaction-charge-peak-opacity': `${0.84 + intensity * 0.14}`,
              animationDelay: `${particle.delay}ms`,
              animationDuration: `${Math.round(Math.max(620, particle.duration * durationScale))}ms`,
              fontSize: `${particle.size * particleScale}px`
            } as CSSProperties
          }
        >
          {particle.glyph}
        </span>
      ))}
    </span>
  )
}
