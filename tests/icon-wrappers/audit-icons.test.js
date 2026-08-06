import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function run() {
  const fixturePath = path.join(projectRoot, 'src', '__icon_audit_option_fixture.tsx')
  fs.writeFileSync(fixturePath, '<option><CategoryIcon name="Tag" /></option>\n')

  try {
    const result = spawnSync(process.execPath, ['tests/icon-wrappers/audit-icons.mjs'], {
      cwd: projectRoot,
      encoding: 'utf8',
    })
    const output = `${result.stdout}${result.stderr}`

    assert.notEqual(result.status, 0, 'The icon audit must reject wrapper components inside <option> elements.')
    assert.match(output, /Component wrapper nested inside <option>/)
  } finally {
    fs.rmSync(fixturePath, { force: true })
  }

  console.log('PASS icon audit: wrapper components inside options are rejected')
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) run()
