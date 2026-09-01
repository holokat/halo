import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

const VERTEX_SHADER = `
  attribute vec4 aParticle;
  attribute vec2 aMeta;

  uniform float uAspect;
  uniform float uHover;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec2 uRotation;

  varying float vAlpha;

  vec3 rotateX(vec3 point, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return vec3(
      point.x,
      cosine * point.y - sine * point.z,
      sine * point.y + cosine * point.z
    );
  }

  vec3 rotateY(vec3 point, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return vec3(
      cosine * point.x + sine * point.z,
      point.y,
      -sine * point.x + cosine * point.z
    );
  }

  vec3 rotateZ(vec3 point, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return vec3(
      cosine * point.x - sine * point.y,
      sine * point.x + cosine * point.y,
      point.z
    );
  }

  void main() {
    float angle = aParticle.x + uTime * mix(0.025, 0.11, aMeta.y) * (0.75 + aParticle.w * 0.35);
    float wave = sin(angle * 5.0 + aParticle.w * 12.0 + uTime * 0.75);
    float scatter = uHover * mix(0.012, 0.17, aMeta.y) * wave;
    float radius = 0.70 + aParticle.y + scatter;
    float depth = aParticle.z + uHover * aMeta.y * cos(angle * 3.0 + uTime) * 0.055;

    vec3 position = vec3(cos(angle) * radius, sin(angle) * radius, depth);
    position = rotateX(position, uRotation.x);
    position = rotateY(position, uRotation.y);
    position = rotateZ(position, -0.19 + uPointer.x * uHover * 0.035);

    float perspective = 3.1 / (3.1 - position.z);
    vec2 projected = position.xy * perspective;
    projected.x /= max(uAspect, 0.001);

    vec2 pointerPosition = vec2(uPointer.x / max(uAspect, 0.001), -uPointer.y) * 0.68;
    float pointerDistance = length(projected - pointerPosition);
    float pointerInfluence = exp(-pointerDistance * pointerDistance * 8.0) * uHover;
    projected += (pointerPosition - projected) * pointerInfluence * mix(0.025, 0.075, aMeta.y);

    float shimmer = 0.72 + 0.28 * sin(aParticle.w * 18.0 + uTime * 1.35 + angle * 2.0);
    float depthLight = smoothstep(-0.55, 0.55, position.z);
    vAlpha = mix(0.68, 0.98, shimmer) * mix(0.8, 1.0, depthLight);
    vAlpha *= mix(1.0, 0.42 + uHover * 0.35 + pointerInfluence * 0.35, aMeta.y);

    gl_PointSize = (mix(1.0, 1.48, aParticle.w) + aMeta.y * 0.12 + pointerInfluence * 0.4) * uPixelRatio;
    gl_Position = vec4(projected * 1.08, position.z * 0.08, 1.0);
  }
`

const FRAGMENT_SHADER = `
  precision mediump float;

  uniform vec3 uColor;

  varying float vAlpha;

  void main() {
    float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
    float particle = 1.0 - smoothstep(0.12, 0.5, distanceFromCenter);
    gl_FragColor = vec4(uColor, particle * vAlpha);
  }
`

const CORE_PARTICLE_COUNT = 320
const DUST_PARTICLE_COUNT = 96
const PARTICLE_STRIDE = 6

function createSeededRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function createParticleData() {
  const random = createSeededRandom(0x48414c4f)
  const particleCount = CORE_PARTICLE_COUNT + DUST_PARTICLE_COUNT
  const data = new Float32Array(particleCount * PARTICLE_STRIDE)

  for (let index = 0; index < particleCount; index += 1) {
    const isDust = index >= CORE_PARTICLE_COUNT
    const coreIndex = isDust ? index - CORE_PARTICLE_COUNT : index
    const segmentCount = isDust ? DUST_PARTICLE_COUNT : CORE_PARTICLE_COUNT
    const offset = index * PARTICLE_STRIDE
    const angleJitter = (random() - 0.5) * (isDust ? 0.15 : 0.035)
    const spread = isDust ? 0.16 : 0.026

    data[offset] = (coreIndex / segmentCount) * Math.PI * 2 + angleJitter
    data[offset + 1] = (random() - 0.5) * spread
    data[offset + 2] = (random() - 0.5) * (isDust ? 0.13 : 0.026)
    data[offset + 3] = random()
    data[offset + 4] = random()
    data[offset + 5] = isDust ? 1 : 0
  }

  return data
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }

  return shader
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)

  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader)
    if (fragmentShader) gl.deleteShader(fragmentShader)
    return null
  }

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    return null
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }

  return program
}

function parseComputedColor(color: string, darkTheme: boolean): [number, number, number] {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number)
  if (!channels || channels.length < 3 || channels.some((channel) => Number.isNaN(channel))) {
    return darkTheme ? [0.98, 0.98, 0.98] : [0.04, 0.04, 0.04]
  }

  return [channels[0] / 255, channels[1] / 255, channels[2] / 255]
}

export default function HaloMark({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [webglReady, setWebglReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      depth: false,
      premultipliedAlpha: true,
      powerPreference: 'low-power'
    })
    if (!gl) return

    const program = createProgram(gl)
    const particleBuffer = gl.createBuffer()
    if (!program || !particleBuffer) {
      if (program) gl.deleteProgram(program)
      if (particleBuffer) gl.deleteBuffer(particleBuffer)
      return
    }

    const particleData = createParticleData()
    const particleCount = particleData.length / PARTICLE_STRIDE
    const particleLocation = gl.getAttribLocation(program, 'aParticle')
    const metaLocation = gl.getAttribLocation(program, 'aMeta')
    const aspectLocation = gl.getUniformLocation(program, 'uAspect')
    const colorLocation = gl.getUniformLocation(program, 'uColor')
    const hoverLocation = gl.getUniformLocation(program, 'uHover')
    const pixelRatioLocation = gl.getUniformLocation(program, 'uPixelRatio')
    const pointerLocation = gl.getUniformLocation(program, 'uPointer')
    const rotationLocation = gl.getUniformLocation(program, 'uRotation')
    const timeLocation = gl.getUniformLocation(program, 'uTime')

    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STATIC_DRAW)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
    gl.useProgram(program)

    let frameId: number | null = null
    let isVisible = true
    let hasRendered = false
    let colorNeedsUpdate = true
    let foregroundColor: [number, number, number] = [1, 1, 1]
    let pointerX = 0
    let pointerY = 0
    let targetPointerX = 0
    let targetPointerY = 0
    let hover = 0
    let targetHover = 0
    let pixelRatio = 1
    const startedAt = performance.now()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect()
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(bounds.width * pixelRatio))
      const height = Math.max(1, Math.round(bounds.height * pixelRatio))

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    const updateForegroundColor = () => {
      if (!colorNeedsUpdate) return
      foregroundColor = parseComputedColor(
        window.getComputedStyle(canvas).color,
        document.documentElement.classList.contains('dark')
      )
      colorNeedsUpdate = false
    }

    const draw = (timestamp: number) => {
      frameId = null
      resizeCanvas()
      updateForegroundColor()

      if (reducedMotion.matches) {
        pointerX = targetPointerX
        pointerY = targetPointerY
        hover = targetHover
      } else {
        pointerX += (targetPointerX - pointerX) * 0.055
        pointerY += (targetPointerY - pointerY) * 0.055
        hover += (targetHover - hover) * 0.065
      }

      const elapsed = reducedMotion.matches ? 0 : (timestamp - startedAt) / 1000
      const tilt = 1.02 + Math.sin(elapsed * 0.24) * 0.035 + pointerY * hover * 0.12
      const turn = Math.sin(elapsed * 0.19) * 0.065 + pointerX * hover * 0.16

      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer)
      gl.enableVertexAttribArray(particleLocation)
      gl.vertexAttribPointer(
        particleLocation,
        4,
        gl.FLOAT,
        false,
        PARTICLE_STRIDE * Float32Array.BYTES_PER_ELEMENT,
        0
      )
      gl.enableVertexAttribArray(metaLocation)
      gl.vertexAttribPointer(
        metaLocation,
        2,
        gl.FLOAT,
        false,
        PARTICLE_STRIDE * Float32Array.BYTES_PER_ELEMENT,
        4 * Float32Array.BYTES_PER_ELEMENT
      )

      gl.uniform1f(aspectLocation, canvas.width / canvas.height)
      gl.uniform3f(colorLocation, foregroundColor[0], foregroundColor[1], foregroundColor[2])
      gl.uniform1f(hoverLocation, hover)
      gl.uniform1f(pixelRatioLocation, pixelRatio)
      gl.uniform2f(pointerLocation, pointerX, pointerY)
      gl.uniform2f(rotationLocation, tilt, turn)
      gl.uniform1f(timeLocation, elapsed)
      gl.drawArrays(gl.POINTS, 0, particleCount)

      if (!hasRendered) {
        hasRendered = true
        setWebglReady(true)
      }

      if (!reducedMotion.matches && isVisible && !document.hidden) {
        frameId = window.requestAnimationFrame(draw)
      }
    }

    const requestDraw = () => {
      if (frameId === null && isVisible && !document.hidden) {
        frameId = window.requestAnimationFrame(draw)
      }
    }

    const handlePointerEnter = () => {
      targetHover = 1
      requestDraw()
    }

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      targetPointerX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2
      targetPointerY = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2
      requestDraw()
    }

    const handlePointerLeave = () => {
      targetHover = 0
      targetPointerX = 0
      targetPointerY = 0
      requestDraw()
    }

    const handleVisibilityChange = () => {
      if (document.hidden && frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      } else {
        requestDraw()
      }
    }

    const handleMotionPreferenceChange = () => requestDraw()
    const resizeObserver = new ResizeObserver(requestDraw)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting
      if (!isVisible && frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      } else {
        requestDraw()
      }
    })
    const themeObserver = new MutationObserver(() => {
      colorNeedsUpdate = true
      requestDraw()
    })

    canvas.addEventListener('pointerenter', handlePointerEnter)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerleave', handlePointerLeave)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    reducedMotion.addEventListener('change', handleMotionPreferenceChange)
    resizeObserver.observe(canvas)
    intersectionObserver.observe(canvas)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })
    requestDraw()

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      canvas.removeEventListener('pointerenter', handlePointerEnter)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      reducedMotion.removeEventListener('change', handleMotionPreferenceChange)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      themeObserver.disconnect()
      gl.deleteBuffer(particleBuffer)
      gl.deleteProgram(program)
    }
  }, [])

  return (
    <span className={cn('relative block size-12 shrink-0 text-foreground', className)}>
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        className={cn('absolute inset-0 size-full', webglReady && 'opacity-0')}
      >
        <ellipse
          cx="32"
          cy="32"
          rx="23"
          ry="9"
          fill="none"
          stroke="currentColor"
          strokeDasharray="1 2.4"
          strokeLinecap="round"
          strokeWidth="1.5"
          transform="rotate(-11 32 32)"
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn(
          'absolute inset-0 size-full opacity-0 transition-opacity duration-150',
          webglReady && 'opacity-100'
        )}
      />
    </span>
  )
}
