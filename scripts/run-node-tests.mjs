import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const testFilePatterns = ['.test.ts', '.spec.ts', '.test.tsx', '.spec.tsx']
const sourceDirectories = ['src']

function isTestFile(filePath) {
  return testFilePatterns.some((suffix) => filePath.endsWith(suffix))
}

function walk(directory) {
  if (!fs.existsSync(directory)) {
    return []
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      return walk(fullPath)
    }

    return entry.isFile() && isTestFile(fullPath) ? [fullPath] : []
  })
}

function findAllTests() {
  return sourceDirectories.flatMap((directory) => walk(directory)).sort()
}

function findRelatedTests(files) {
  const candidates = new Set()

  for (const file of files) {
    if (isTestFile(file) && fs.existsSync(file)) {
      candidates.add(file)
      continue
    }

    const extension = path.extname(file)
    if (!extension) {
      continue
    }

    const stem = file.slice(0, -extension.length)
    for (const suffix of testFilePatterns) {
      const candidate = `${stem}${suffix}`
      if (fs.existsSync(candidate)) {
        candidates.add(candidate)
      }
    }
  }

  return [...candidates].sort()
}

const mode = process.argv[2]
const fileArgs = process.argv.slice(3)

const testsToRun =
  mode === 'related'
    ? findRelatedTests(fileArgs)
    : findAllTests()

if (!testsToRun.length) {
  console.log('No regression tests to run.')
  process.exit(0)
}

execFileSync(process.execPath, ['--import', 'tsx', '--test', ...testsToRun], {
  stdio: 'inherit'
})
