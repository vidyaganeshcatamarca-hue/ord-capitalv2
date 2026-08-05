#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const sourceRoot = path.resolve('src')
const exceptions = new Set(['components/bcg/BCGScatterPlot.tsx'])
const findings = []

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(fullPath)
    else if (entry.name.endsWith('.tsx')) inspect(fullPath)
  }
}

function isOptionExpression(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText() === 'option') return true
  }
  return false
}

function containsRenderedIcono(node) {
  let hasPropertyAccess = false
  let hasJsx = false
  const visit = (child) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) hasJsx = true
    if (ts.isPropertyAccessExpression(child) && child.name.text === 'icono') hasPropertyAccess = true
    ts.forEachChild(child, visit)
  }
  visit(node)
  return hasPropertyAccess && !hasJsx
}

function inspect(filePath) {
  const relativePath = path.relative(sourceRoot, filePath).replaceAll(path.sep, '/')
  if (exceptions.has(relativePath)) return

  const source = fs.readFileSync(filePath, 'utf8')
  const ast = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node) => {
    if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent) && !isOptionExpression(node) && containsRenderedIcono(node.expression)) {
      const { line, character } = ast.getLineAndCharacterOfPosition(node.getStart())
      findings.push(`${relativePath}:${line + 1}:${character + 1} ${node.getText(ast)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
}

walk(sourceRoot)

if (findings.length > 0) {
  console.error('Unapproved raw .icono JSX render sites:')
  console.error(findings.join('\n'))
  process.exit(1)
}

console.log('PASS icon audit: no unapproved raw .icono JSX render sites')
