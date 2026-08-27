import { useMemo, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { CategoryIcon } from '@/components/CategoryIcon/CategoryIcon'
import './MigrarCategoriaModal.css'

interface RubroOption {
  estructura_id: number
  nombre_cuenta: string
  icono?: string | null
  color?: string | null
  padre_id?: number | null
  hijos?: RubroOption[]
}

interface MigrarCategoriaModalProps {
  isOpen: boolean
  origen: RubroOption
  destinos: RubroOption[]
  onClose: () => void
  onMigrated: () => void
}

interface MigrarResponse {
  migrados_caja?: number
  migrados_presupuestos?: number
  migrados_recurrentes?: number
}

export function MigrarCategoriaModal({ isOpen, origen, destinos, onClose, onMigrated }: MigrarCategoriaModalProps) {
  const { showToast } = useToast()
  const [destinoId, setDestinoId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(false)

  const toggleExpanded = (id: number) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const handleConfirm = async () => {
    if (destinoId === null || destinoId === origen.estructura_id) return
    setLoading(true)
    try {
      const result = await rpc<MigrarResponse>('fn_migrar_y_eliminar_estructura_egreso', {
        p_estructura_id_origen: origen.estructura_id,
        p_estructura_id_destino: destinoId
      })
      const counts = (Array.isArray(result) ? result[0] : result) ?? {}
      const movs = counts.migrados_caja ?? 0
      const presup = counts.migrados_presupuestos ?? 0
      const recurs = counts.migrados_recurrentes ?? 0
      if (presup === 0 && recurs === 0) {
        showToast(t('success_category_migrated_caja', { count: movs }), 'success')
      } else {
        showToast(t('success_category_migrated_full', {
          movimientos: movs,
          presupuestos: presup,
          recurrentes: recurs
        }), 'success')
      }
      onMigrated()
      onClose()
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectHijo = (hijo: RubroOption) => {
    if (hijo.estructura_id === origen.estructura_id) return
    setDestinoId(hijo.estructura_id)
  }

  const handleSelectRubro = (rubro: RubroOption) => {
    if (rubro.estructura_id === origen.estructura_id) return
    if (rubro.hijos && rubro.hijos.length > 0) {
      toggleExpanded(rubro.estructura_id)
    } else {
      setDestinoId(rubro.estructura_id)
    }
  }

  if (!isOpen) return null

  return (
    <div className="migrate-modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="migrate-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="migrate-modal-title">{t('title_migrate_category')}</h3>
        <p className="migrate-modal-message">{t('confirm_migrate_category', { name: t(origen.nombre_cuenta) })}</p>

        <div className="cat-acordeon" role="listbox" aria-label={t('migrar_category_destino_label')}>
          {destinos.map(rubro => {
            const isOpen = !!expanded[rubro.estructura_id]
            const hijos = rubro.hijos ?? []
            const isSelectedRubro = destinoId === rubro.estructura_id
            return (
              <div key={rubro.estructura_id} className="cat-acordeon-rubro">
                <div
                  className="cat-acordeon-header"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: isSelectedRubro ? 'rgba(255, 255, 255, 0.06)' : undefined
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}
                    onClick={() => handleSelectRubro(rubro)}
                    role="option"
                    aria-selected={isSelectedRubro}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        backgroundColor: rubro.color || 'var(--surface-2)',
                        color: '#000000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <CategoryIcon name={rubro.icono || 'Tag'} size={18} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                      {t(rubro.nombre_cuenta)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {hijos.length > 0 && (
                      <span style={{ color: 'var(--text-3)', fontSize: '14px', marginRight: '6px' }}>
                        {isOpen ? '▾' : '▸'}
                      </span>
                    )}
                  </div>
                </div>

                {(isOpen || (hijos.length === 0 && isSelectedRubro)) && hijos.length > 0 && (
                  <div className="cat-acordeon-hijos">
                    {hijos.map(h => {
                      const isSelectedHijo = destinoId === h.estructura_id
                      return (
                        <button
                          key={h.estructura_id}
                          type="button"
                          className="cat-acordeon-hijo"
                          onClick={() => handleSelectHijo(h)}
                          aria-selected={isSelectedHijo}
                          style={isSelectedHijo ? { background: 'rgba(255, 255, 255, 0.10)' } : {}}
                        >
                          <span
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '6px',
                              backgroundColor: rubro.color || 'var(--surface-2)',
                              color: '#000000',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: '6px',
                              flexShrink: 0
                            }}
                          >
                            <CategoryIcon name={h.icono || 'Tag'} size={16} />
                          </span>
                          {t(h.nombre_cuenta)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="migrate-modal-actions">
          <button type="button" className="btn btn-ghost font-semibold" onClick={onClose} disabled={loading}>
            {t('btn_cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger font-semibold"
            onClick={handleConfirm}
            disabled={loading || destinoId === null || destinoId === origen.estructura_id}
          >
            {t('btn_migrate_and_delete')}
          </button>
        </div>
      </div>
    </div>
  )
}