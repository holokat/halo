export function EmptyState({
  text,
  className = ''
}: {
  text: string
  className?: string
}) {
  return (
    <div className={`rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground ${className}`.trim()}>
      {text}
    </div>
  )
}
