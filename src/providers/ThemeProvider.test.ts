import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const bootstrapScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
assert.ok(bootstrapScript, 'The initial theme must be applied before React loads')

function loadInitialTheme(
  savedSetting: string | null,
  systemIsDark: boolean,
  storageBlocked = false
) {
  const classes = new Set<string>()
  const style = { colorScheme: '' }
  const chromeColors = ['', '']

  runInNewContext(bootstrapScript!, {
    localStorage: {
      getItem(key: string) {
        if (storageBlocked) throw new Error('Storage unavailable')
        assert.equal(key, 'themeSetting')
        return savedSetting
      }
    },
    window: {
      matchMedia(query: string) {
        assert.equal(query, '(prefers-color-scheme: dark)')
        return { matches: systemIsDark }
      }
    },
    document: {
      documentElement: {
        classList: { add: (value: string) => classes.add(value) },
        style
      },
      querySelectorAll(selector: string) {
        assert.equal(selector, 'meta[name="theme-color"]')
        return chromeColors.map((_, index) => ({
          setAttribute(name: string, value: string) {
            assert.equal(name, 'content')
            chromeColors[index] = value
          }
        }))
      }
    }
  })

  return { classes: [...classes], colorScheme: style.colorScheme, chromeColors }
}

function assertInitialTheme(
  setting: string | null,
  systemIsDark: boolean,
  expected: 'light' | 'dark'
) {
  assert.deepEqual(loadInitialTheme(setting, systemIsDark), {
    classes: [expected],
    colorScheme: expected,
    chromeColors: Array(2).fill(expected === 'dark' ? '#171717' : '#FFFFFF')
  })
}

test('fresh installs follow the system before React loads', () => {
  assertInitialTheme(null, false, 'light')
  assertInitialTheme(null, true, 'dark')
})

test('saved light and dark preferences override the system on reload', () => {
  assertInitialTheme('light', true, 'light')
  assertInitialTheme('dark', false, 'dark')
})

test('system mode resolves the current preference on every load', () => {
  assertInitialTheme('system', false, 'light')
  assertInitialTheme('system', true, 'dark')
})

test('invalid saved preferences fall back to the system', () => {
  assertInitialTheme('invalid', false, 'light')
  assertInitialTheme('', true, 'dark')
})

test('the initial theme still follows the system when storage is blocked', () => {
  assert.equal(loadInitialTheme(null, true, true).colorScheme, 'dark')
  assert.equal(loadInitialTheme(null, false, true).colorScheme, 'light')
})
