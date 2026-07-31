import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import { PROJECT_ICONS } from '@/constants/emojiToLucide'
import './ProyectoFormModal.css'

interface ProyectoFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function ProyectoFormModal({ isOpen, onClose, onSuccess }: ProyectoFormModalProps) {
  const { showToast } = useToast()
  const [nombre, setNombre] = useState('')
  const [meta, setMeta] = useState('')
  const [fecha, setFecha] = useState('')
  const [icono, setIcono] = useState('Target')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setNombre('')
      setMeta('')
      setFecha('')
      setIcono('Target')
      setError(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) {
      setError(t('proyecto_form_nombre_requerido'))
      return
    }
    const metaNum = Number(meta)
    if (!meta || isNaN(metaNum) || metaNum <= 0) {
      setError(t('proyecto_form_meta_requerida'))
      return
    }

    setLoading(true)
    try {
      const params: Record<string, any> = {
        p_nombre: nombre.trim(),
        p_presupuesto_meta: metaNum,
        p_icono: icono,
      }
      if (fecha) params.p_fecha_objetivo = fecha

      const { error: rpcError } = await supabase.rpc('fn_crear_proyecto_compartido', params)
      if (rpcError) throw rpcError

      showToast(t('proyecto_crear_success'), 'success')
      haptics.success()
      onSuccess?.()
      onClose()
    } catch (err: any) {
      setError(parseError(err))
      haptics.error()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="proyecto-form-overlay" onClick={onClose}>
      <form className="proyecto-form-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="proyecto-form-header">
          <h2 className="font-display">{t('proyecto_form_titulo')}</h2>
          <button type="button" className="proyecto-form-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="proyecto-form-body">
          <div className="proyecto-form-group">
            <label>{t('proyecto_nombre_label')}</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={t('proyecto_form_nombre_placeholder')}
              autoFocus
            />
          </div>

          <div className="proyecto-form-group">
            <label>{t('proyecto_meta_label')}</label>
            <input
              type="number"
              inputMode="decimal"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              placeholder="0"
              step="0.01"
              min="0"
            />
          </div>

          <div className="proyecto-form-group">
            <label>{t('proyecto_form_fecha_label')}</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <div className="proyecto-form-group">
            <label>{t('proyecto_form_icono_label')}</label>
            <div className="proyecto-form-iconos">
              {PROJECT_ICONS.map((icon) => (
                <button
                  type="button"
                  key={icon}
                  className={`proyecto-form-icono-btn ${icono === icon ? 'active' : ''}`}
                  onClick={() => setIcono(icon)}
                  aria-label={icon}
                >
                  <CategoryIcon name={icon} size={24} />
                </button>
              ))}
            </div>
          </div>

          {error && <div className="proyecto-form-error">{error}</div>}
        </div>

        <footer className="proyecto-form-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            {t('hogar_saldar_cancelar')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <span className="proyecto-form-spinner" /> : t('proyecto_crear_btn')}
          </button>
        </footer>
      </form>
    </div>
  )
}
