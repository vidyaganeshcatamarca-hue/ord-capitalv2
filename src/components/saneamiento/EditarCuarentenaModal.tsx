import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'
import type { CuarentenaMovementType } from './BandejaCuarentena'

const MOVEMENT_TYPE_KEYS: CuarentenaMovementType[] = ['expense', 'income', 'transfer', 'card_expense']

export interface EditarCuarentenaPayload {
  tipo: CuarentenaMovementType
  monto: number
  destination_amount: number | null
  billetera_id: number | null
  billetera_destino_id: number | null
  tarjeta_id: number | null
  estructura_egreso_id: number | null
  cuenta_ingreso_id: number | null
  moneda: string | null
  cuotas: number | null
  fecha: string
  detalle: string | null
}

interface EditarCuarentenaModalProps {
  item: CuarentenaItem
  isOpen: boolean
  onClose: () => void
  onGuardar: (payload: EditarCuarentenaPayload) => void
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

interface TarjetaOption {
  tarjeta_id: number
  nombre_tarjeta: string
}

interface IngresoOption {
  producto_id: number
  nombre: string
  icono: string | null
}

/** Number as an input value string, or empty for null/undefined. */
function numberValue(value: number | null | undefined): string {
  return value == null ? '' : String(value)
}

/** Parses an input value into a positive number, or null when unusable. */
function positiveOrNull(raw: string): number | null {
  const parsed = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Full editor for a quarantine row. All four voice movement types share this
 * form: the visible fields follow the selected type and are re-validated on
 * submit, so switching type never lets a required field slip through.
 */
export function EditarCuarentenaModal({ item, isOpen, onClose, onGuardar }: EditarCuarentenaModalProps) {
  const { showToast } = useToast()

  const [tipo, setTipo] = useState<CuarentenaMovementType>(
    item.tipo === 'income' || item.tipo === 'transfer' || item.tipo === 'card_expense'
      ? item.tipo
      : 'expense'
  )
  const [monto, setMonto] = useState<string>(numberValue(item.monto))
  const [fecha, setFecha] = useState<string>(item.fecha || '')
  const [detalle, setDetalle] = useState<string>(item.detalle || '')
  const [estructuraId, setEstructuraId] = useState<string>(numberValue(item.estructura_egreso_id))
  const [billeteraId, setBilleteraId] = useState<string>(numberValue(item.billetera_id))
  const [billeteraDestinoId, setBilleteraDestinoId] = useState<string>(numberValue(item.billetera_destino_id))
  const [tarjetaId, setTarjetaId] = useState<string>(numberValue(item.tarjeta_id))
  const [cuentaIngresoId, setCuentaIngresoId] = useState<string>(numberValue(item.cuenta_ingreso_id))
  const [destinationAmount, setDestinationAmount] = useState<string>(numberValue(item.destination_amount))
  const [moneda, setMoneda] = useState<string>(item.moneda || 'ARS')
  const [cuotas, setCuotas] = useState<string>(numberValue(item.cuotas ?? 1))

  const [categorias, setCategorias] = useState<CategoriaOption[]>([])
  const [billeteras, setBilleteras] = useState<BilleteraOption[]>([])
  const [tarjetas, setTarjetas] = useState<TarjetaOption[]>([])
  const [ingresos, setIngresos] = useState<IngresoOption[]>([])
  const [loadingLists, setLoadingLists] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    const load = async () => {
      setLoadingLists(true)
      try {
        const [catRes, bilRes, tarRes, ingRes] = await Promise.all([
          rpc<any[]>('fn_obtener_arbol_categorias').catch(() => []),
          rpc<BilleteraOption[]>('fn_obtener_billeteras_activas').catch(() => []),
          rpc<TarjetaOption[]>('fn_reporte_mapa_tarjetas').catch(() => []),
          rpc<IngresoOption[]>('fn_listar_categorias_ingreso').catch(() => []),
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
        setTarjetas(tarRes || [])
        setIngresos(ingRes || [])
      } catch (err: any) {
        showToast(parseError(err), 'error')
      } finally {
        setLoadingLists(false)
      }
    }
    load()
  }, [isOpen, showToast])

  const billeteraMoneda = useMemo(
    () => billeteras.find((b) => String(b.billetera_id) === billeteraId)?.moneda ?? null,
    [billeteras, billeteraId]
  )
  const billeteraDestinoMoneda = useMemo(
    () => billeteras.find((b) => String(b.billetera_id) === billeteraDestinoId)?.moneda ?? null,
    [billeteras, billeteraDestinoId]
  )
  const crossCurrency = !!billeteraMoneda && !!billeteraDestinoMoneda && billeteraMoneda !== billeteraDestinoMoneda

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const numericMonto = positiveOrNull(monto)
    if (!numericMonto) {
      showToast(t('saneamiento_error_monto_invalido'), 'error')
      return
    }
    if ((tipo === 'expense' || tipo === 'card_expense') && !estructuraId) {
      showToast(t('saneamiento_error_categoria_requerida'), 'error')
      return
    }
    if ((tipo === 'expense' || tipo === 'transfer') && !billeteraId) {
      showToast(t('saneamiento_error_billetera_requerida'), 'error')
      return
    }
    if ((tipo === 'income' || tipo === 'transfer') && !billeteraDestinoId) {
      showToast(t('saneamiento_error_billetera_destino_requerida'), 'error')
      return
    }
    if (tipo === 'card_expense' && !tarjetaId) {
      showToast(t('saneamiento_error_tarjeta_requerida'), 'error')
      return
    }
    if (tipo === 'income' && !cuentaIngresoId) {
      showToast(t('saneamiento_error_cuenta_ingreso_requerida'), 'error')
      return
    }

    const numericDestination = positiveOrNull(destinationAmount)
    if (tipo === 'transfer' && crossCurrency && !numericDestination) {
      showToast(t('cuarentena_error_destination_amount'), 'error')
      return
    }

    onGuardar({
      tipo,
      monto: numericMonto,
      destination_amount: tipo === 'transfer' ? numericDestination : null,
      billetera_id: tipo === 'income' ? null : billeteraId ? Number(billeteraId) : null,
      billetera_destino_id:
        tipo === 'income' || tipo === 'transfer'
          ? billeteraDestinoId
            ? Number(billeteraDestinoId)
            : null
          : null,
      tarjeta_id: tipo === 'card_expense' && tarjetaId ? Number(tarjetaId) : null,
      estructura_egreso_id:
        tipo === 'expense' || tipo === 'card_expense'
          ? estructuraId
            ? Number(estructuraId)
            : null
          : null,
      cuenta_ingreso_id: tipo === 'income' && cuentaIngresoId ? Number(cuentaIngresoId) : null,
      moneda: tipo === 'card_expense' ? moneda : null,
      cuotas: tipo === 'card_expense' ? Math.max(1, parseInt(cuotas, 10) || 1) : null,
      fecha,
      detalle: detalle || null,
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
            <label>{t('cuarentena_tipo_label')}</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as CuarentenaMovementType)}>
              {MOVEMENT_TYPE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`cuarentena_tipo_${key}`)}
                </option>
              ))}
            </select>
          </div>

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

          {(tipo === 'expense' || tipo === 'card_expense') && (
            <div className="form-group">
              <label>{t('saneamiento_categoria')}</label>
              {loadingLists ? (
                <div className="spinner-sm" />
              ) : (
                <select value={estructuraId} onChange={(e) => setEstructuraId(e.target.value)}>
                  <option value="">{t('saneamiento_seleccionar_categoria')}</option>
                  {categorias.map((c) => (
                    <option key={c.estructura_id} value={c.estructura_id}>
                      {c.icono} {c.nombre_cuenta}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {(tipo === 'expense' || tipo === 'transfer') && (
            <div className="form-group">
              <label>{t('saneamiento_billetera')}</label>
              {loadingLists ? (
                <div className="spinner-sm" />
              ) : (
                <select value={billeteraId} onChange={(e) => setBilleteraId(e.target.value)}>
                  <option value="">{t('saneamiento_seleccionar_billetera')}</option>
                  {billeteras.map((b) => (
                    <option key={b.billetera_id} value={b.billetera_id}>
                      {t(b.nombre)} ({b.moneda}) — {formatCurrency(b.saldo_actual, b.moneda)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {(tipo === 'income' || tipo === 'transfer') && (
            <div className="form-group">
              <label>{t('cuarentena_campo_billetera_destino')}</label>
              {loadingLists ? (
                <div className="spinner-sm" />
              ) : (
                <select value={billeteraDestinoId} onChange={(e) => setBilleteraDestinoId(e.target.value)}>
                  <option value="">{t('saneamiento_seleccionar_billetera')}</option>
                  {billeteras.map((b) => (
                    <option key={b.billetera_id} value={b.billetera_id}>
                      {t(b.nombre)} ({b.moneda}) — {formatCurrency(b.saldo_actual, b.moneda)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {tipo === 'transfer' && (
            <div className="form-group">
              <label>{t('cuarentena_campo_destination_amount')}</label>
              <input
                type="number"
                step="0.01"
                value={destinationAmount}
                onChange={(e) => setDestinationAmount(e.target.value)}
                placeholder={crossCurrency ? t('cuarentena_destination_requerido') : undefined}
              />
            </div>
          )}

          {tipo === 'card_expense' && (
            <>
              <div className="form-group">
                <label>{t('cuarentena_campo_tarjeta')}</label>
                {loadingLists ? (
                  <div className="spinner-sm" />
                ) : (
                  <select value={tarjetaId} onChange={(e) => setTarjetaId(e.target.value)}>
                    <option value="">{t('cuarentena_seleccionar_tarjeta')}</option>
                    {tarjetas.map((tarjeta) => (
                      <option key={tarjeta.tarjeta_id} value={tarjeta.tarjeta_id}>
                        {tarjeta.nombre_tarjeta}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label>{t('cuarentena_moneda')}</label>
                <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              <div className="form-group">
                <label>{t('cuarentena_cuotas')}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cuotas}
                  onChange={(e) => setCuotas(e.target.value)}
                />
              </div>
            </>
          )}

          {tipo === 'income' && (
            <div className="form-group">
              <label>{t('cuarentena_campo_cuenta_ingreso')}</label>
              {loadingLists ? (
                <div className="spinner-sm" />
              ) : (
                <select value={cuentaIngresoId} onChange={(e) => setCuentaIngresoId(e.target.value)}>
                  <option value="">{t('cuarentena_seleccionar_cuenta_ingreso')}</option>
                  {ingresos.map((ingreso) => (
                    <option key={ingreso.producto_id} value={ingreso.producto_id}>
                      {ingreso.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="form-group">
            <label>{t('saneamiento_fecha')}</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
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
