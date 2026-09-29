import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import { filterUserEditableCategories, isUserEditableCategory } from '@/lib/categoryFilters'
import { isLikelyLucideName } from '@/components/CategoryIcon/CategoryIcon'
import type { CuarentenaItem } from '@/pages/Saneamiento/SaneamientoPage'
import type { CuarentenaMovementType } from './BandejaCuarentena'
import './EditarCuarentenaModal.css'

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

interface CategoriaHijoOption {
  estructura_id: number
  nombre: string
  icono: string
}

interface CategoriaGrupoOption {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  hijos: CategoriaHijoOption[]
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

  const [categorias, setCategorias] = useState<CategoriaGrupoOption[]>([])
  const [expandedRubro, setExpandedRubro] = useState<string | null>(null)
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
        // Same category rules as AddMovementModal: system categories are never
        // user-editable, and icon names from the icon library are not valid
        // text for a native <option>, so they fall back to the parent's icon.
        const editable = filterUserEditableCategories(catRes ?? []).map((r) => ({
          ...r,
          hijos: (r.hijos ?? []).filter((h: any) => isUserEditableCategory(h)),
        }))
        const resolveIcono = (raw: unknown, fallback: string): string => {
          const value = typeof raw === 'string' ? raw.trim() : ''
          return value !== '' && !isLikelyLucideName(value) ? value : fallback
        }
        // Hierarchical groups: a parent with children becomes a native
        // <optgroup> (its label, not selectable), children are the options
        // and childless parents stay selectable on their own.
        const grupos: CategoriaGrupoOption[] = editable.map((r) => {
          const parentIcono = resolveIcono(r.icono, '📁')
          return {
            estructura_id: r.estructura_id,
            // Seed categories store an i18n key as the name (same as
            // AddMovementModal): translate on display, pass user names
            // through unchanged.
            nombre_cuenta: t(r.nombre_cuenta),
            icono: parentIcono,
            hijos: (r.hijos ?? []).map((h: any) => ({
              estructura_id: h.estructura_id,
              nombre: t(h.nombre_cuenta),
              icono: resolveIcono(h.icono, parentIcono),
            })),
          }
        })
        setCategorias(grupos)
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

  // When the edited movement points at a child, open its group so the
  // current selection is visible without an extra tap.
  useEffect(() => {
    if (!isOpen || !estructuraId) return
    const parent = categorias.find((g) =>
      (g.hijos ?? []).some((h) => String(h.estructura_id) === estructuraId)
    )
    if (parent) setExpandedRubro(String(parent.estructura_id))
  }, [isOpen, estructuraId, categorias])

  const billeteraMoneda = useMemo(
    () => billeteras.find((b) => String(b.billetera_id) === billeteraId)?.moneda ?? null,
    [billeteras, billeteraId]
  )
  const billeteraDestinoMoneda = useMemo(
    () => billeteras.find((b) => String(b.billetera_id) === billeteraDestinoId)?.moneda ?? null,
    [billeteras, billeteraDestinoId]
  )
  const crossCurrency = !!billeteraMoneda && !!billeteraDestinoMoneda && billeteraMoneda !== billeteraDestinoMoneda

  // Same balance rule as AddMovementModal: a wallet cannot end up negative,
  // so expense and transfer origin wallets must cover the amount.
  const montoFormNum = parseFloat(monto) || 0
  const requiereSaldoSuficiente = tipo === 'expense' || tipo === 'transfer'
  const billeterasOrigen = useMemo(
    () =>
      billeteras.filter(
        (b) => !(requiereSaldoSuficiente && montoFormNum > 0 && b.saldo_actual < montoFormNum)
      ),
    [billeteras, requiereSaldoSuficiente, montoFormNum]
  )

  // Defensive reset: if the prefilled wallet is no longer valid (deleted or
  // insufficient balance for the edited amount), clear it so the submit
  // validation asks for a valid one instead of sending a stale id.
  useEffect(() => {
    // The wallet lists load on open: the reset must wait for them, or the
    // first pass runs against an empty list and drops a valid prefilled
    // wallet before the data even arrives.
    if (loadingLists || !requiereSaldoSuficiente || !billeteraId) return
    const sel = billeterasOrigen.find((b) => String(b.billetera_id) === billeteraId)
    if (!sel) setBilleteraId('')
  }, [loadingLists, requiereSaldoSuficiente, billeteraId, billeterasOrigen])

  // Suggest the destination amount from the day's USD rate when editing a
  // cross-currency transfer leaves it empty (buying or selling USD).
  // It is only a hint: the user can (and may need to) override the value.
  useEffect(() => {
    if (!crossCurrency || !montoFormNum) return
    if ((parseFloat(destinationAmount) || 0) > 0) return
    let cancelled = false
    rpc<number>('fn_obtener_cotizacion_usd')
      .catch(() => null)
      .then((cotizacion) => {
        if (cancelled || !cotizacion || cotizacion <= 0) return
        // Rate is stored per the user's default currency: it converts
        // between that currency and USD. Pass through other pairs unchanged.
        const baseAUsd =
          billeteraMoneda === 'USD'
            ? montoFormNum
            : billeteraMoneda === 'ARS'
              ? montoFormNum / cotizacion
              : null
        if (baseAUsd === null) return
        let sugerencia: number
        if (billeteraDestinoMoneda === 'USD') sugerencia = baseAUsd
        else if (billeteraDestinoMoneda === 'ARS') sugerencia = baseAUsd * cotizacion
        else return
        setDestinationAmount(sugerencia.toFixed(2))
      })
    return () => {
      cancelled = true
    }
  }, [crossCurrency, montoFormNum, destinationAmount, billeteraMoneda, billeteraDestinoMoneda])

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
                <div className="ec-categorias-tree">
                  {categorias.length === 0 && (
                    <div className="ec-tree-empty">{t('saneamiento_seleccionar_categoria')}</div>
                  )}
                  {categorias.map((g) => {
                    const isGroup = g.hijos.length > 0
                    const isExpanded = expandedRubro === String(g.estructura_id)
                    return (
                      <div key={g.estructura_id} className="home-filter-rubro-group">
                        <div className="home-filter-rubro-row">
                          {isGroup ? (
                            // A parent with children is a heading, never a
                            // selectable leaf: expenses must point at a real
                            // subaccount (its own selection is the child).
                            <div className="home-filter-rubro-btn is-heading">
                              <span className="home-filter-rubro-icon">{g.icono}</span>
                              <span className="home-filter-rubro-name">{g.nombre_cuenta}</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={`home-filter-rubro-btn${Number(estructuraId) === g.estructura_id ? ' is-selected' : ''}`}
                              onClick={() => setEstructuraId(String(g.estructura_id))}
                            >
                              <span className="home-filter-rubro-icon">{g.icono}</span>
                              <span className="home-filter-rubro-name">{g.nombre_cuenta}</span>
                            </button>
                          )}
                          {isGroup && (
                            <button
                              type="button"
                              className="home-filter-expand-btn"
                              onClick={() => setExpandedRubro(isExpanded ? null : String(g.estructura_id))}
                              aria-label={isExpanded ? t('btn_collapse') : t('btn_expand')}
                            >
                              {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                        </div>
                        {isGroup && isExpanded && (
                          <div className="home-filter-children">
                            {g.hijos.map((h) => (
                              <button
                                key={h.estructura_id}
                                type="button"
                                className={`home-filter-child-btn${Number(estructuraId) === h.estructura_id ? ' is-selected' : ''}`}
                                onClick={() => setEstructuraId(String(h.estructura_id))}
                              >
                                <span className="home-filter-rubro-icon">{h.icono}</span>
                                <span>{h.nombre}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
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
                  {billeterasOrigen.map((b) => (
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
                  {/* The placeholder is the field's title, not one more source:
                      hidden keeps it out of the open dropdown while it stays
                      the select's display until the user picks one. */}
                  <option value="" disabled hidden>{t('cuarentena_seleccionar_cuenta_ingreso')}</option>
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
