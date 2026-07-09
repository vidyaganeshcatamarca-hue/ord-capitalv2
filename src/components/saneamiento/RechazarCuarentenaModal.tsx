import { useState } from 'react'
import { t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'

interface RechazarCuarentenaModalProps {
  item: CuarentenaItem
  isOpen: boolean
  onClose: () => void
  onConfirmar: (motivo: string, nota: string) => void
}

const MOTIVOS = [
  { key: 'ya_cargado', label: 'saneamiento_rechazo_ya_cargado' },
  { key: 'duplicado', label: 'saneamiento_rechazo_duplicado' },
  { key: 'no_real', label: 'saneamiento_rechazo_no_real' },
  { key: 'otro', label: 'saneamiento_rechazo_otro' },
]

export function RechazarCuarentenaModal({ item, isOpen, onClose, onConfirmar }: RechazarCuarentenaModalProps) {
  const [motivo, setMotivo] = useState<string>('ya_cargado')
  const [nota, setNota] = useState<string>('')

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('saneamiento_rechazar_titulo')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="saneamiento-rechazar-body">
          <p className="text-muted" style={{ marginBottom: '16px' }}>
            {item.detalle || item.categoria_nombre || ''} — {formatCurrency(item.monto, 'ARS')}
          </p>

          <div className="form-group">
            <label>{t('saneamiento_rechazar_motivo')}</label>
            <div className="saneamiento-radio-group">
              {MOTIVOS.map((m) => (
                <label key={m.key} className="saneamiento-radio">
                  <input
                    type="radio"
                    name="motivo"
                    value={m.key}
                    checked={motivo === m.key}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                  <span>{t(m.label)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>{t('saneamiento_nota_opcional')}</label>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={t('saneamiento_nota_placeholder')}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('saneamiento_cancelar')}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => onConfirmar(motivo, nota)}>
            {t('saneamiento_confirmar_rechazo')}
          </button>
        </div>
      </div>
    </div>
  )
}
