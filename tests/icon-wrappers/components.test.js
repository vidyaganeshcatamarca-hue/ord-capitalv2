import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadIconComponents } from './loadIconComponents.js'

const categoryModule = '../../src/components/CategoryIcon/CategoryIcon.tsx'
const walletModule = '../../src/components/WalletIcon/WalletIcon.tsx'
const proyectoModule = '../../src/components/ProyectoIcon/ProyectoIcon.tsx'

function markup(Component, props) {
  return renderToStaticMarkup(React.createElement(Component, props))
}

export function run() {
  const { CategoryIcon } = loadIconComponents(categoryModule)
  const { WalletIcon } = loadIconComponents(walletModule)
  const { ProyectoIcon } = loadIconComponents(proyectoModule)

  assert.match(markup(CategoryIcon, { name: 'Church', size: 24 }), /lucide-church/)
  assert.match(markup(CategoryIcon, { name: null, size: 24 }), /lucide-tag/)
  assert.match(markup(CategoryIcon, { name: 'UnknownXyz', size: 24 }), /lucide-tag/)
  assert.match(markup(CategoryIcon, { name: 'M', size: 24 }), /<span[^>]*>M<\/span>/)
  assert.match(markup(CategoryIcon, { name: '💳', size: 24 }), /<span[^>]*>💳<\/span>/)

  assert.match(markup(WalletIcon, { size: 24 }), /lucide-wallet/)
  assert.match(markup(WalletIcon, { name: '  ', size: 24 }), /lucide-wallet/)
  assert.match(markup(WalletIcon, { name: 'M', size: 24 }), /<span[^>]*>M<\/span>/)
  assert.match(markup(WalletIcon, { name: 'Landmark', size: 24 }), /lucide-landmark/)

  assert.match(markup(ProyectoIcon, { size: 24 }), /lucide-folder-kanban/)
  assert.match(markup(ProyectoIcon, { name: '  ', size: 24 }), /lucide-folder-kanban/)
  assert.match(markup(ProyectoIcon, { name: '🏠', size: 24 }), /<span[^>]*>🏠<\/span>/)
  assert.match(markup(ProyectoIcon, { name: 'Target', size: 24 }), /lucide-target/)

  console.log('PASS icon wrappers: 13 behavioral assertions')
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) run()
