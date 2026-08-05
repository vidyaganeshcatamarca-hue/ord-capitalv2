import assert from 'node:assert/strict'

import { category_keys } from '../src/locales/es.ts'
import { sortCategoriesByTranslatedName } from '../src/lib/categorySorting.ts'

const translate = (key) => category_keys[key] ?? key

const parents = [
  { estructura_id: 1, nombre_cuenta: 'cat_clothing' },
  { estructura_id: 2, nombre_cuenta: 'cat_home_cleaning' },
]

const children = [
  { estructura_id: 3, nombre_cuenta: 'cat_clothing' },
  { estructura_id: 4, nombre_cuenta: 'cat_home_cleaning' },
]

const keySortedParentIds = [...parents]
  .sort((a, b) => a.nombre_cuenta.localeCompare(b.nombre_cuenta))
  .map(({ estructura_id }) => estructura_id)

const translatedParentIds = sortCategoriesByTranslatedName(parents, translate)
  .map(({ estructura_id }) => estructura_id)

const translatedChildIds = sortCategoriesByTranslatedName(children, translate)
  .map(({ estructura_id }) => estructura_id)

assert.deepEqual(keySortedParentIds, [1, 2], 'fixtures must show key order')
assert.deepEqual(translatedParentIds, [2, 1], 'parents sort by translated labels')
assert.deepEqual(translatedChildIds, [4, 3], 'children sort by translated labels')
assert.ok(
  translate(parents[1].nombre_cuenta).localeCompare(translate(parents[0].nombre_cuenta), 'es', { sensitivity: 'base' }) < 0,
  'translated labels must differ from key order'
)

console.log('Category translation sort regression test passed')
