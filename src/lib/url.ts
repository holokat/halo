export function isWebsocketUrl(url: string): boolean {
  return /^wss?:\/\/.+$/.test(url)
}

// copy from nostr-tools/utils
export function normalizeUrl(url: string): string {
  try {
    if (url.indexOf('://') === -1) {
      if (url.startsWith('localhost:') || url.startsWith('localhost/')) {
        url = 'ws://' + url
      } else {
        url = 'wss://' + url
      }
    }
    const p = new URL(url)
    p.pathname = p.pathname.replace(/\/+/g, '/')
    if (p.pathname.endsWith('/')) p.pathname = p.pathname.slice(0, -1)
    if (p.protocol === 'https:') {
      p.protocol = 'wss:'
    } else if (p.protocol === 'http:') {
      p.protocol = 'ws:'
    }
    if ((p.port === '80' && p.protocol === 'ws:') || (p.port === '443' && p.protocol === 'wss:')) {
      p.port = ''
    }
    p.searchParams.sort()
    p.hash = ''
    return p.toString()
  } catch {
    console.error('Invalid URL:', url)
    return ''
  }
}

export function normalizeRelayConnectionUrl(
  url: string,
  pageProtocol = typeof window === 'undefined' ? undefined : window.location.protocol
): string {
  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl || !isWebsocketUrl(normalizedUrl) || isLocalNetworkUrl(normalizedUrl)) {
    return ''
  }
  if (pageProtocol !== 'https:' || !normalizedUrl.startsWith('ws://')) {
    return normalizedUrl
  }

  // HTTPS pages must never open insecure WebSockets.
  return normalizedUrl.replace(/^ws:/, 'wss:')
}

export function normalizeHttpUrl(url: string): string {
  try {
    if (url.indexOf('://') === -1) url = 'https://' + url
    const p = new URL(url)
    p.pathname = p.pathname.replace(/\/+/g, '/')
    if (p.pathname.endsWith('/')) p.pathname = p.pathname.slice(0, -1)
    if (p.protocol === 'wss:') {
      p.protocol = 'https:'
    } else if (p.protocol === 'ws:') {
      p.protocol = 'http:'
    }
    if (
      (p.port === '80' && p.protocol === 'http:') ||
      (p.port === '443' && p.protocol === 'https:')
    ) {
      p.port = ''
    }
    p.searchParams.sort()
    p.hash = ''
    return p.toString()
  } catch {
    console.error('Invalid URL:', url)
    return ''
  }
}

export function simplifyUrl(url: string): string {
  return url
    .replace('wss://', '')
    .replace('ws://', '')
    .replace('https://', '')
    .replace('http://', '')
    .replace(/\/$/, '')
}

function isLocalIpv4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

export function isLocalNetworkUrl(urlString: string): boolean {
  try {
    // URL canonicalizes short, integer, hexadecimal and octal IPv4 forms.
    const hostname = new URL(urlString).hostname.toLowerCase().replace(/\.$/, '')
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      (!hostname.includes('.') && !hostname.includes(':'))
    ) {
      return true
    }

    const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (ipv4) return isLocalIpv4(Number(ipv4[1]), Number(ipv4[2]))

    const ipv6 = hostname.replace(/^\[|\]$/g, '')
    if (ipv6.includes(':')) {
      if (ipv6 === '::' || ipv6 === '::1') return true
      const firstWord = parseInt(ipv6.split(':')[0] || '0', 16)
      if ((firstWord & 0xfe00) === 0xfc00 || (firstWord & 0xffc0) === 0xfe80) return true

      // URL serializes IPv4-mapped IPv6 addresses as two hexadecimal words.
      const mapped = ipv6.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/)
      if (mapped) {
        const high = parseInt(mapped[1], 16)
        return isLocalIpv4(high >> 8, high & 255)
      }
    }
    return false
  } catch {
    return false
  }
}

export function isImage(url: string) {
  try {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.svg']
    return imageExtensions.some((ext) => new URL(url).pathname.toLowerCase().endsWith(ext))
  } catch {
    return false
  }
}

export function isMedia(url: string) {
  try {
    const mediaExtensions = [
      '.mp4',
      '.webm',
      '.ogg',
      '.mov',
      '.mp3',
      '.wav',
      '.flac',
      '.aac',
      '.m4a',
      '.opus',
      '.wma'
    ]
    return mediaExtensions.some((ext) => new URL(url).pathname.toLowerCase().endsWith(ext))
  } catch {
    return false
  }
}
