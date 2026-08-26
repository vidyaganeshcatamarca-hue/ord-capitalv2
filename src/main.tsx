import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Sequential session counter for debugging — increments on every page load.
;(() => {
  const KEY = '__session_seq__'
  let seq = 1
  try {
    const prev = parseInt(sessionStorage.getItem(KEY) || '0', 10)
    seq = (isNaN(prev) ? 0 : prev) + 1
    sessionStorage.setItem(KEY, String(seq))
  } catch { /* ignore */ }
  ;(window as any).__SESSION_SEQ__ = seq
})()

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

// ============================================
// Bloqueo de orientacion horizontal en movil
// Estrategia:
//   1) JS: intenta screen.orientation.lock('portrait') (funciona en nativo/Capacitor y HTTPS)
//   2) CSS fallback: overlay full-screen cuando @media (orientation: landscape) + max-height
// ============================================

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  // Heuristica: dispositivos moviles tienen ancho chico en portrait.
  // Combinamos userAgent + ancho de ventana.
  const ua = navigator.userAgent || ''
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) <= 500
  return isMobileUA || isSmallScreen
}

function injectOrientationLockOverlay(): void {
  if (document.getElementById('orientation-lock-overlay')) return
  const overlay = document.createElement('div')
  overlay.id = 'orientation-lock-overlay'
  overlay.className = 'orientation-lock-overlay'
  overlay.setAttribute('role', 'alertdialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Por favor, rota tu dispositivo')
  overlay.innerHTML = `
    <div class="orientation-lock-icon" aria-hidden="true">📱</div>
    <h2>Por favor, rotá tu dispositivo</h2>
    <p>Esta app está optimizada para vista vertical. Poné tu celular en posición vertical para continuar.</p>
  `
  document.body.appendChild(overlay)
}

async function tryLockPortrait(): Promise<void> {
  if (!isMobileDevice()) return
  // Intentar lock nativo (Capacitor, navegadores HTTPS modernos)
  const orientation = (screen as any).orientation
  if (orientation && typeof orientation.lock === 'function') {
    try {
      await orientation.lock('portrait')
      console.log('[Orientation] lock portrait OK')
    } catch (err) {
      console.warn('[Orientation] lock portrait no soportado, usando CSS fallback:', err)
      injectOrientationLockOverlay()
    }
  } else {
    injectOrientationLockOverlay()
  }
}

// Intentar lock al cargar (puede fallar sin gesto del usuario — los browsers lo requieren).
// Si falla, el CSS overlay muestra el mensaje.
// Tambien re-intentar en cualquier interaccion del usuario.
if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') {
    tryLockPortrait()
  } else {
    window.addEventListener('load', () => tryLockPortrait())
  }
  // Reintentar al primer user gesture (gesture required por spec de Screen Orientation API)
  const retryOnGesture = () => {
    tryLockPortrait()
    if (document.getElementById('orientation-lock-overlay')) {
      // Si el overlay ya no aparece, removemos los listeners
      window.removeEventListener('touchstart', retryOnGesture)
      window.removeEventListener('click', retryOnGesture)
    }
  }
  window.addEventListener('touchstart', retryOnGesture, { passive: true, once: true })
  window.addEventListener('click', retryOnGesture, { once: true })
}
