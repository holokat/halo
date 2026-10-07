import type { CSSProperties } from 'react'

export const floatingGlassSurfaceClassName =
  'relative isolate overflow-hidden border border-foreground/10 bg-background/80 shadow-[0_18px_48px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.14)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/[0.10] before:via-transparent before:to-black/[0.04] supports-[backdrop-filter]:bg-background/65 dark:before:from-white/[0.08] dark:before:to-black/[0.12]'

export const floatingGlassBackdropStyle: CSSProperties = {
  WebkitBackdropFilter: 'blur(var(--scroll-blur-current, 12px)) saturate(160%)',
  backdropFilter: 'blur(var(--scroll-blur-current, 12px)) saturate(160%)'
}
