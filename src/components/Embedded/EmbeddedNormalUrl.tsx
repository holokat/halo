export function EmbeddedNormalUrl({ url }: { url: string }) {
  return (
    <a
      className="text-primary hover:underline break-all [overflow-wrap:anywhere]"
      href={url}
      target="_blank"
      onClick={(e) => e.stopPropagation()}
      rel="noreferrer"
    >
      {url}
    </a>
  )
}
