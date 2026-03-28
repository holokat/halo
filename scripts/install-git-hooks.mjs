import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git'

try {
  const repoRoot = execFileSync(gitCommand, ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8'
  }).trim()

  const preCommitHook = path.join(repoRoot, '.githooks', 'pre-commit')
  if (fs.existsSync(preCommitHook)) {
    fs.chmodSync(preCommitHook, 0o755)
  }

  execFileSync(gitCommand, ['config', 'core.hooksPath', '.githooks'], {
    cwd: repoRoot,
    stdio: 'inherit'
  })

  console.log('Git hooks are configured for this checkout.')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`Skipping git hook installation: ${message}`)
}
