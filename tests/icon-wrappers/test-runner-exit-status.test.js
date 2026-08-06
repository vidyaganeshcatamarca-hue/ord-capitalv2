import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function run() {
  const result = spawnSync(process.execPath, ['tests/test_runner.js', 'icon-wrappers/runner-rejection'], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
  const output = `${result.stdout}${result.stderr}`

  assert.notEqual(result.status, 0, 'A rejected local suite must make the test runner fail.')
  assert.match(output, /intentional icon-wrapper rejection/)

  console.log('PASS test runner: rejected local suites exit non-zero')
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) run()
