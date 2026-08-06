import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { loadIconComponents } from './loadIconComponents.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(testDirectory, '..', '..')

const components = {
  CategoryIcon: loadIconComponents('../../src/components/CategoryIcon/CategoryIcon.tsx').CategoryIcon,
  WalletIcon: loadIconComponents('../../src/components/WalletIcon/WalletIcon.tsx').WalletIcon,
  ProyectoIcon: loadIconComponents('../../src/components/ProyectoIcon/ProyectoIcon.tsx').ProyectoIcon,
}

function markup(Component, props) {
  return renderToStaticMarkup(React.createElement(Component, props))
}

function compiledSurfaceDescriptor(relativePath, componentName, propertyName) {
  const sourcePath = path.join(projectRoot, relativePath)
  const source = ts.createSourceFile(
    sourcePath,
    fs.readFileSync(sourcePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let descriptor

  function visit(node) {
    if (!ts.isJsxSelfClosingElement(node) || node.tagName.getText(source) !== componentName) {
      ts.forEachChild(node, visit)
      return
    }

    const nameAttribute = node.attributes.properties.find(
      (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'name',
    )
    const expression = nameAttribute?.initializer
    if (
      expression &&
      ts.isJsxExpression(expression) &&
      expression.expression &&
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === propertyName
    ) {
      descriptor = {
        componentName,
        propertyName,
        hasAriaHidden: node.attributes.properties.some(
          (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'aria-hidden',
        ),
      }
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  assert.ok(descriptor, `${relativePath} must route .${propertyName} through ${componentName}`)
  return descriptor
}

function renderCompiledSurface(descriptor, fixture, props = {}) {
  return markup(components[descriptor.componentName], {
    name: fixture[descriptor.propertyName],
    size: 20,
    ...props,
  })
}

export function run() {
  const homeWallet = compiledSurfaceDescriptor('src/pages/Home/HomePage.tsx', 'WalletIcon', 'icono')
  const homeCategory = compiledSurfaceDescriptor('src/pages/Home/HomePage.tsx', 'CategoryIcon', 'icono_categoria')
  const modalProject = compiledSurfaceDescriptor('src/components/AddMovementModal/AddMovementModal.tsx', 'ProyectoIcon', 'icono')
  const modalWallet = compiledSurfaceDescriptor('src/components/AddMovementModal/AddMovementModal.tsx', 'WalletIcon', 'icono')
  const familiaProject = compiledSurfaceDescriptor('src/pages/Familia/FamiliaPage.tsx', 'ProyectoIcon', 'icono')

  assert.match(renderCompiledSurface(homeWallet, { icono: 'Landmark' }), /lucide-landmark/)
  assert.match(renderCompiledSurface(homeCategory, { icono_categoria: '💳' }), /<span[^>]*>💳<\/span>/)
  assert.match(renderCompiledSurface(modalProject, { icono: 'Target' }), /lucide-target/)
  assert.match(renderCompiledSurface(modalWallet, { icono: 'S' }), /<span[^>]*>S<\/span>/)
  assert.equal(familiaProject.hasAriaHidden, true)
  assert.match(renderCompiledSurface(familiaProject, { icono: '🏠' }, { 'aria-hidden': true }), /aria-hidden="true"/)

  for (const [componentName, lucideName, legacyName] of [
    ['CategoryIcon', 'Church', 'M'],
    ['WalletIcon', 'Landmark', 'S'],
    ['ProyectoIcon', 'Target', '🏠'],
  ]) {
    const sharedProps = {
      className: `${componentName.toLowerCase()}-surface-icon`,
      style: { color: 'rebeccapurple', opacity: 0.5 },
    }

    for (const name of [lucideName, legacyName]) {
      const rendered = markup(components[componentName], { name, size: 20, ...sharedProps })
      assert.match(rendered, new RegExp(`class="[^"]*${sharedProps.className}[^"]*"`))
      assert.match(rendered, /style="[^"]*color:rebeccapurple[^"]*opacity:0.5[^"]*"/)
    }
  }

  console.log('PASS migrated surfaces: 18 runtime assertions')
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) run()
