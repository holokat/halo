type TWorkerCommand =
  | {
      type: 'configure'
      nextRunAtMs: number | null
      heartbeatMs?: number
    }
  | {
      type: 'stop'
    }

type TWorkerTick = {
  type: 'tick'
  atMs: number
  reason: 'schedule' | 'heartbeat'
}

let scheduledTimeoutId: ReturnType<typeof setTimeout> | null = null
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null
let heartbeatMs = 30_000

const clearScheduledTimeout = () => {
  if (scheduledTimeoutId !== null) {
    clearTimeout(scheduledTimeoutId)
    scheduledTimeoutId = null
  }
}

const clearHeartbeatInterval = () => {
  if (heartbeatIntervalId !== null) {
    clearInterval(heartbeatIntervalId)
    heartbeatIntervalId = null
  }
}

const emitTick = (reason: TWorkerTick['reason']) => {
  postMessage({
    type: 'tick',
    atMs: Date.now(),
    reason
  } satisfies TWorkerTick)
}

const ensureHeartbeat = () => {
  clearHeartbeatInterval()

  if (heartbeatMs <= 0) return
  heartbeatIntervalId = setInterval(() => {
    emitTick('heartbeat')
  }, heartbeatMs)
}

const scheduleNextTick = (nextRunAtMs: number | null) => {
  clearScheduledTimeout()
  if (!nextRunAtMs) return

  const delay = Math.max(250, nextRunAtMs - Date.now())
  scheduledTimeoutId = setTimeout(() => {
    scheduledTimeoutId = null
    emitTick('schedule')
  }, delay)
}

self.onmessage = (event: MessageEvent<TWorkerCommand>) => {
  const data = event.data
  if (!data) return

  if (data.type === 'stop') {
    clearScheduledTimeout()
    clearHeartbeatInterval()
    return
  }

  const requestedHeartbeatMs = Number(data.heartbeatMs)
  if (Number.isFinite(requestedHeartbeatMs) && requestedHeartbeatMs > 0) {
    heartbeatMs = requestedHeartbeatMs
  }

  ensureHeartbeat()
  scheduleNextTick(data.nextRunAtMs)
}

export {}
