import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = process.cwd()

function readProjectFile(filePath: string) {
  return readFileSync(path.join(projectRoot, filePath), 'utf8')
}

test('default reading surfaces omit expert-only feed and relay controls', () => {
  const defaultSurfaceSources = [
    readProjectFile('src/components/SearchBar/index.tsx'),
    readProjectFile('src/pages/secondary/NoteListPage/index.tsx'),
    readProjectFile('src/components/NoteStats/index.tsx')
  ].join('\n')

  assert.doesNotMatch(defaultSurfaceSources, /Save feed/)
  assert.doesNotMatch(defaultSurfaceSources, /SeenOnButton/)
})

test('floating navigation hugs its controls below an exactly centered reading column', () => {
  const shellSource = readProjectFile('src/page-manager/layout.tsx')
  const bottomNavigationSource = readProjectFile('src/components/BottomNavigationBar/index.tsx')
  const accountMenuSource = readProjectFile('src/components/MobileTopNavMenuButton/index.tsx')

  assert.match(shellSource, /justify-center/)
  assert.match(shellSource, /max-w-\[736px\]/)
  assert.equal(shellSource.match(/<BottomNavigationBar \/>/g)?.length, 2)
  assert.doesNotMatch(shellSource, /<Sidebar \/>|<aside/)
  assert.match(bottomNavigationSource, /w-fit max-w-\[calc\(100%-2rem\)\]/)
  assert.match(bottomNavigationSource, /flex items-center gap-1 p-1\.5/)
  assert.doesNotMatch(bottomNavigationSource, /grid-cols-4/)
  assert.doesNotMatch(accountMenuSource, /CircleUserRound/)
})

test('invite links wait for account restoration before choosing an onboarding flow', () => {
  const inviteHandlerSource = readProjectFile('src/components/InviteHandler/index.tsx')

  assert.match(inviteHandlerSource, /const isInitialized = nostr\?\.isInitialized \?\? false/)
  assert.match(inviteHandlerSource, /if \(!isInitialized \|\| hasProcessedInvite\.current\) return/)
})

test('widget runtime is removed while News relay preferences migrate safely', () => {
  const constantsSource = readProjectFile('src/constants.ts')
  const storageSource = readProjectFile('src/services/local-storage.service.ts')
  const routesSource = readProjectFile('src/routes.tsx')

  assert.match(constantsSource, /NEWS_FEED_RELAYS: 'newsFeedRelays'/)
  assert.doesNotMatch(constantsSource, /NEWS_WIDGET_RELAYS|ENABLED_WIDGETS|WIDGET_HEIGHTS/)
  assert.match(storageSource, /LEGACY_NEWS_RELAYS_STORAGE_KEY/)
  assert.match(storageSource, /this\.setJson\(StorageKey\.NEWS_FEED_RELAYS/)
  assert.match(storageSource, /removeStorageItem\(LEGACY_NEWS_RELAYS_STORAGE_KEY\)/)
  assert.match(routesSource, /path: '\/settings\/widgets'.*group="advanced"/)

  for (const removedSource of [
    'src/components/Donation/index.tsx',
    'src/components/IconPicker/index.tsx',
    'src/components/IconPickerDialog/index.tsx',
    'src/components/TrendingNotes/CompactTrendingNotes.tsx'
  ]) {
    assert.equal(
      existsSync(path.join(projectRoot, removedSource)),
      false,
      `${removedSource} remains`
    )
  }
})
