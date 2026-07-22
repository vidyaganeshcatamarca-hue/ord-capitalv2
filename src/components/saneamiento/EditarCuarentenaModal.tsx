import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'

interface EditarCuarentenaModalProps {
  item: CuarentenaItem
  isOpen: boolean
  onClose: () => void
  onGuardar: (payload: {
    monto: number
    estructura_egreso_id: number
    fecha: string
    billetera_id: number
    detalle: string
  }) => void
}

interface CategoriaOption {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  es_padre: boolean
}

interface BilleteraOption {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
}

export function EditarCuarentenaModal({ item, isOpen, onClose, onGuardar }: EditarCuarentenaModalProps) {
  const { showToast } = useToast()

  const [monto, setMonto] = useState<string>(String(item.monto))
  const [estructuraId, setEstructuraId] = useState<string>(item.estructura_egreso_id ? String(item.estructura_egreso_id) : '')
  const [fecha, setFecha] = useState<string>(item.fecha)
  const [billeteraId, setBilleteraId] = useState<string>(item.billetera_id ? String(item.billetera_id) : '')
  const [detalle, setDetalle] = useState<string>(item.detalle || '')

  const [categorias, setCategorias] = useState<CategoriaOption[]>([])
  const [billeteras, setBilleteras] = useState<BilleteraOption[]>([])
  const [loadingLists, setLoadingLists] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    const load = async () => {
      setLoadingLists(true)
      try {
        const [catRes, bilRes] = await Promise.all([
          rpc<any[]>('fn_obtener_arbol_categorias'),
          rpc<BilleteraOption[]>('fn_obtener_billeteras_activas'),
        ])
        const flat: CategoriaOption[] = []
        const walk = (nodes: any[]) => {
          nodes.forEach((n) => {
            if (!n.es_padre) {
              flat.push({
                estructura_id: n.estructura_id,
                nombre_cuenta: n.nombre_cuenta,
                icono: n.icono,
                es_padre: false,
              })
            }
            if (n.hijos && n.hijos.length) walk(n.hijos)
          })
        }
        walk(catRes || [])
        setCategorias(flat)
        setBilleteras(bilRes || [])
      } catch (err: any) {
        showToast(parseError(err), 'error')
      } finally {
        setLoadingLists(false)
      }
    }
    load()
  }, [isOpen, showToast])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numericMonto = parseFloat(monto.replace(',', '.'))
    if (!numericMonto || numericMonto <= 0) {
      showToast(t('saneamiento_error_monto_invalido'), 'error')
      return
    }
    if (!estructuraId) {
      showToast(t('saneamiento_error_categoria_requerida'), 'error')
      return
    }
    if (!billeteraId) {
      showToast(t('saneamiento_error_billetera_requerida'), 'error')
      return
    }
    onGuardar({
      monto: numericMonto,
      estructura_egreso_id: Number(estructuraId),
      fecha,
      billetera_id: Number(billeteraId),
      detalle,
    })
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('saneamiento_editar_titulo')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="saneamiento-form">
          <div className="form-group">
            <label>{t('saneamiento_monto')}</label>
            <input
              type="number"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>{t('saneamiento_categoria')}</label>
            {loadingLists ? (
              <div className="spinner-sm" />
            ) : (
              <select value={estructuraId} onChange={(e) => setEstructuraId(e.target.value)} required>
                <option value="">{t('saneamiento_seleccionar_categoria')}</option>
                {categorias.map((c) => (
                  <option key={c.estructura_id} value={c.estructura_id}>
                    {c.icono} {c.nombre_cuenta}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>{t('saneamiento_fecha')}</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>

          <div className="form-group">
            <label>{t('saneamiento_billetera')}</label>
            {loadingLists ? (
              <div className="spinner-sm" />
            ) : (
              <select value={billeteraId} onChange={(e) => setBilleteraId(e.target.value)} required>
                <option value="">{t('saneamiento_seleccionar_billetera')}</option>
                {billeteras.map((b) => (
                  <option key={b.billetera_id} value={b.billetera_id}>
                    {t(b.nombre)} ({b.moneda}) — {formatCurrency(b.saldo_actual, b.moneda)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>{t('saneamiento_nota')}</label>
            <input
              type="text"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder={t('saneamiento_nota_placeholder')}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('saneamiento_cancelar')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('saneamiento_guardar_cambios')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
