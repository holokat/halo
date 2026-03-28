import { execFileSync } from 'node:child_process'
import path from 'node:path'

const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const stagedFiles = execFileSync(
  gitCommand,
  ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
  { encoding: 'utf8' }
)
  .split(/\r?\n/)
  .filter(Boolean)

const lintableExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx'])
const buildSensitiveFiles = new Set([
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'eslint.config.js',
  'tailwind.config.js',
  'postcss.config.js',
  'netlify.toml',
  'Dockerfile'
])

const lintTargets = stagedFiles.filter((file) => {
  if (file.startsWith('dist/') || file.startsWith('dev-dist/')) {
    return false
  }

  return lintableExtensions.has(path.extname(file))
})

const testTargets = stagedFiles.filter(
  (file) =>
    sourceExtensions.has(path.extname(file)) &&
    (file.startsWith('src/') || file.startsWith('scripts/'))
)

const shouldBuild = stagedFiles.some((file) => buildSensitiveFiles.has(file))

function run(command, args, label) {
  console.log(`\n> ${label}`)
  execFileSync(command, args, { stdio: 'inherit' })
}

if (!stagedFiles.length) {
  console.log('No staged files found. Skipping guardrails.')
  process.exit(0)
}

if (lintTargets.length) {
  run(npxCommand, ['eslint', '--max-warnings=0', ...lintTargets], 'Lint staged files')
} else {
  console.log('\n> Lint staged files')
  console.log('No staged JS/TS files to lint.')
}

if (testTargets.length) {
  run(
    process.execPath,
    ['./scripts/run-node-tests.mjs', 'related', ...testTargets],
    'Run related regression tests'
  )
} else {
  console.log('\n> Run related regression tests')
  console.log('No staged source files to test.')
}

run(npmCommand, ['run', 'typecheck'], 'Typecheck app')

if (shouldBuild) {
  run(npmCommand, ['run', 'build'], 'Build app (config-sensitive change detected)')
}
