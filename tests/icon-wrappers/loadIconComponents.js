import { buildSync } from 'esbuild'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)

export function loadIconComponents(relativePath) {
  const result = buildSync({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'lucide-react'],
    write: false,
  })

  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}
