// tests/walletModalSheet.test.js
// Bug 8 (owner, 2026-10-19): the BilleterasPage create/edit wallet modals are
// bottom sheets with overflow:hidden — content taller than the sheet cut the
// action buttons off (no scroll anywhere). The scrollable-footer CSS contract
// lives in .wallet-modal-sheet (.wallet-modal-body scrolls, .wallet-modal-actions
// stays fixed). These modals must USE that structure.
// Run: node --test tests/walletModalSheet.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PAGE = path.join(__dirname, '..', 'src', 'pages', 'Billeteras', 'BilleterasPage.tsx')

function modalBlock(marker) {
  const source = fs.readFileSync(PAGE, 'utf-8')
  const start = source.indexOf(marker)
  assert.ok(start !== -1, `${marker} must exist`)
  return source.slice(start, start + 9000)
}

test('create-wallet modal uses the scrollable sheet body + fixed actions footer (bug 8)', () => {
  const block = modalBlock('MODAL: NUEVA CUENTA')
  const blockEnd = block.indexOf('MODAL: EDITAR CUENTA')
  const create = block.slice(0, blockEnd === -1 ? 9000 : blockEnd)
  assert.match(create, /className="modal-content-wrap"/, 'the form must carry modal-content-wrap')
  assert.match(create, /className="wallet-modal-body"/, 'the scrollable fields must live in wallet-modal-body')
  assert.match(create, /className="wallet-modal-actions"/, 'the buttons must live in the fixed wallet-modal-actions footer')
})

test('edit-wallet modal uses the same scrollable structure (bug 8)', () => {
  const block = modalBlock('MODAL: EDITAR CUENTA')
  const end = block.indexOf('MODAL: DETALLE DE BILLETERA')
  const edit = block.slice(0, end === -1 ? 9000 : end)
  assert.match(edit, /className="modal-content-wrap"/)
  assert.match(edit, /className="wallet-modal-body"/)
  assert.match(edit, /className="wallet-modal-actions"/)
})