import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = process.cwd()

function readProjectFile(filePath: string) {
  return readFileSync(path.join(projectRoot, filePath), 'utf8')
}

test('remote signers use the relay pool that enforces HTTPS transport', () => {
  for (const signerPath of [
    'src/providers/NostrProvider/bunker.signer.ts',
    'src/providers/NostrProvider/nostrConnection.signer.ts'
  ]) {
    const signerSource = readProjectFile(signerPath)

    assert.match(signerSource, /private relayPool = new SmartPool\(\)/)
    assert.match(signerSource, /pool: this\.relayPool/)
  }
})
