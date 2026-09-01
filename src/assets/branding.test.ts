import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = process.cwd()

function readProjectFile(filePath: string) {
  return readFileSync(path.join(projectRoot, filePath), 'utf8')
}

test('the runtime uses Halo artwork instead of the legacy X21 asset family', () => {
  const logoSource = readProjectFile('src/assets/Logo.tsx')
  const iconSource = readProjectFile('src/assets/Icon.tsx')
  const runtimeAssetReferences = [
    readProjectFile('index.html'),
    readProjectFile('public/manifest.webmanifest'),
    readProjectFile('src/components/QrCode/index.tsx'),
    readProjectFile('vite.config.ts')
  ].join('\n')

  assert.match(logoSource, /import HaloMark from '@\/components\/HaloMark'/)
  assert.match(logoSource, /<HaloMark\b/)
  assert.match(iconSource, /export \{ default \} from '\.\/Logo'/)
  assert.doesNotMatch(
    runtimeAssetReferences,
    /(?:logo-(?:dark|light)|favicon|pwa-monochrome)\.svg/
  )

  for (const requiredAsset of [
    'public/halo-app-icon.png',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'src/components/HaloMark/index.tsx'
  ]) {
    assert.ok(existsSync(path.join(projectRoot, requiredAsset)), `Missing ${requiredAsset}`)
  }
})
