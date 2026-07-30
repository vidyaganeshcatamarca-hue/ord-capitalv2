import { Component, ErrorInfo, ReactNode } from 'react'
import { t } from '@/locales/i18n'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1A1A1A',
          color: '#FFFFFF',
          padding: '24px',
          fontFamily: 'Inter, sans-serif',
          textAlign: 'center'
        }}>
          <div style={{
            background: '#2D2D2D',
            padding: '40px 32px',
            borderRadius: '16px',
            maxWidth: '480px',
            border: '1px solid rgba(255, 107, 107, 0.2)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>⚠️</span>
            <h1 style={{ fontSize: '22px', margin: '0 0 12px 0', fontFamily: 'Outfit, sans-serif', fontWeight: 'bold' }}>
              {t('error_boundary_title')}
            </h1>
            <p style={{ fontSize: '14px', color: '#A0A0A0', lineHeight: '1.6', margin: '0 0 24px 0' }}>
              {t('error_boundary_desc')}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'var(--mint, var(--mint, #00B127))',
                color: '#1A1A1A',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              {t('btn_reload_app')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
