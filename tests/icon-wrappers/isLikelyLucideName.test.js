import assert from 'node:assert/strict'
import { loadIconComponents } from './loadIconComponents.js'

export function run() {
  const { isLikelyLucideName } = loadIconComponents('../../src/components/CategoryIcon/CategoryIcon.tsx')

  assert.equal(isLikelyLucideName('Church'), true)
  assert.equal(isLikelyLucideName('Church123'), true)
  assert.equal(isLikelyLucideName('M'), false)
  assert.equal(isLikelyLucideName('💳'), false)
  assert.equal(isLikelyLucideName('church'), false)
  assert.equal(isLikelyLucideName(''), false)
  assert.equal(isLikelyLucideName('   '), false)
  assert.equal(isLikelyLucideName(null), false)
  assert.equal(isLikelyLucideName(undefined), false)

  console.log('PASS isLikelyLucideName: 9 assertions')
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) run()
