import { createContext, useContext, useState, ReactNode, useCallback } from 'react'
import { CircleCheck, CircleX, TriangleAlert, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'
type ToastPlacement = 'bottom' | 'center'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
  /** Viewport position: 'center' while onboarding (a bottom toast covered the
      CTA buttons and stalled the flow); 'bottom' everywhere else. */
  setToastPlacement: (placement: ToastPlacement) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

const ICONS: Record<ToastType, React.ComponentType<{ size?: number; color?: string }>> = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [placement, setPlacement] = useState<ToastPlacement>('bottom')

  const setToastPlacement = useCallback((next: ToastPlacement) => {
    setPlacement(next)
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = crypto.randomUUID()
    setToasts(prev => {
      const next = [...prev, { id, message, type }]
      if (next.length > 3) {
        return next.slice(1)
      }
      return next
    })
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4500)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, setToastPlacement }}>
      {children}
      <div className={`toast-container${placement === 'center' ? ' toast-center' : ''}`}>
        {toasts.map(toast => {
          const Icon = ICONS[toast.type]
          return (
            <div key={toast.id} className={`toast ${toast.type}`}>
              {Icon && <Icon size={20} />}
              <span>{toast.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
