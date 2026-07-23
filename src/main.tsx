import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
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
