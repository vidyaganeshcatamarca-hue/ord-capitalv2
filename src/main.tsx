import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Aplica el tamaño de fuente desde localStorage antes de montar React.
// Default 'mediano' (--font-scale: 1.0) si no hay valor guardado.
;(() => {
  const VALID = ['chico', 'mediano', 'grande', 'gigante']
  let stored: string | null = null
  try { stored = window.localStorage.getItem('tamanio_fuente') } catch { /* ignore */ }
  const value = stored && (VALID as string[]).includes(stored) ? stored : 'mediano'
  document.documentElement.setAttribute('data-font-size', value)
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Bloquea el context menu globalmente (long-press en Chrome Android dispara
// "Buscar con Google"). Esto evita que aparezca la lupa de Google Search y
// el menu nativo de seleccion. Se excluyen inputs/textareas para que el
// usuario pueda seguir corrigiendo texto.
document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement | null
  if (!target) return
  const tag = target.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
  e.preventDefault()
}, { capture: true })

// Register PWA Service Worker (solo en produccion, no en dev)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => console.log('ServiceWorker registered with scope:', reg.scope),
      (err) => console.error('ServiceWorker registration failed:', err)
    )

    // Cuando un nuevo SW toma el control (post skipWaiting + clients.claim),
    // recargar la pagina para que el usuario vea la version nueva.
    let isReloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isReloading) return
      isReloading = true
      console.log('PWA: nuevo Service Worker activo, recargando…')
      window.location.reload()
    })
  })
}
