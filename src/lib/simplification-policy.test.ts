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

test('mobile navigation yields screen space while keeping primary actions available', () => {
  const shellSource = readProjectFile('src/page-manager/layout.tsx')
  const bottomNavigationSource = readProjectFile('src/components/BottomNavigationBar/index.tsx')
  const dynamicBlurSource = readProjectFile('src/hooks/useDynamicScrollBlur.ts')

  assert.match(shellSource, /<ScrollVisibilityProvider isSmallScreen>/)
  assert.match(bottomNavigationSource, /useOptionalScrollVisibility/)
  assert.match(
    bottomNavigationSource,
    /translate-y-\[calc\(100%\+env\(safe-area-inset-bottom\)\+0\.75rem\)\]/
  )
  assert.match(bottomNavigationSource, /pointer-events-none/)
  assert.doesNotMatch(bottomNavigationSource, /SlowConnectionButton/)
  assert.match(dynamicBlurSource, /requestAnimationFrame/)
  assert.match(dynamicBlurSource, /passive: true/)
})

test('mobile titlebar controls collapse into accessible glass icon buttons', () => {
  const feedButtonSource = readProjectFile('src/pages/primary/NoteListPage/FeedButton.tsx')
  const noteListPageSource = readProjectFile('src/pages/primary/NoteListPage/index.tsx')
  const explorePageSource = readProjectFile('src/pages/primary/ExplorePage/index.tsx')
  const glassButtonSource = readProjectFile('src/components/FloatingGlassButton/index.tsx')
  const mobileSearchSource = readProjectFile('src/components/MobileSearchButton/index.tsx')

  assert.match(noteListPageSource, /mobileFloatingTitlebar/)
  assert.match(explorePageSource, /mobileFloatingTitlebar/)
  assert.match(feedButtonSource, /<FloatingGlassButton/)
  assert.match(feedButtonSource, /aria-label=/)
  assert.match(feedButtonSource, /aria-expanded=/)
  assert.match(feedButtonSource, /<DrawerTitle className="sr-only">/)
  assert.match(mobileSearchSource, /<FloatingGlassButton aria-label=/)
  assert.match(mobileSearchSource, /mobileInlineResults/)
  assert.match(glassButtonSource, /size-11/)
  assert.match(glassButtonSource, /rounded-full/)
  assert.match(glassButtonSource, /backdrop-blur-\[16px\]/)
  assert.match(glassButtonSource, /active:scale-\[0\.96\]/)
  assert.doesNotMatch(glassButtonSource, /transition-all/)
})

test('new-posts control uses the shared glass surface without a visible text label', () => {
  const newNotesButtonSource = readProjectFile('src/components/NewNotesButton/index.tsx')
  const bottomNavigationSource = readProjectFile('src/components/BottomNavigationBar/index.tsx')
  const floatingGlassSource = readProjectFile('src/lib/floating-glass.ts')

  assert.match(newNotesButtonSource, /floatingGlassSurfaceClassName/)
  assert.match(bottomNavigationSource, /floatingGlassSurfaceClassName/)
  assert.match(newNotesButtonSource, /aria-label=\{newNotesLabel\}/)
  assert.match(newNotesButtonSource, /<ArrowUp/)
  assert.doesNotMatch(newNotesButtonSource, />\s*\{newNotesLabel\}\s*</)
  assert.doesNotMatch(newNotesButtonSource, /bg-primary|bg-orange|hover:bg-primary/)
  assert.match(floatingGlassSource, /backdropFilter/)
  assert.match(newNotesButtonSource, /active:scale-\[0\.96\]/)
})

test('photo viewer uses Central icons for every visible lightbox control', () => {
  const imageLightboxSource = readProjectFile('src/components/ImageWithLightbox/index.tsx')

  const lightboxSource = readProjectFile('src/components/icons/lightbox.tsx')
  assert.match(lightboxSource, /@central-icons-react\/round-outlined-radius-2-stroke-1\.5/)
  assert.match(lightboxSource, /iconPrev: \(\) => <IconChevronLeft/)
  assert.match(lightboxSource, /iconNext: \(\) => <IconChevronRight/)
  assert.match(lightboxSource, /iconZoomIn: \(\) => <IconZoomIn/)
  assert.match(lightboxSource, /iconZoomOut: \(\) => <IconZoomOut/)
  assert.match(lightboxSource, /iconClose: \(\) => <IconCrossLarge/)
  assert.match(imageLightboxSource, /render=\{lightboxRender\}/)
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
