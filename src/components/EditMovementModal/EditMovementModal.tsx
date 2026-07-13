import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import './EditMovementModal.css'

interface EditMovementModalProps {
  movement: {
    p_caja_id: number
    fecha: string
    tipo: string
    monto: number
    nombre_categoria: string
    nombre_billetera: string
    detalle: string | null
    billetera_origen_id?: number | null
    billetera_destino_id?: number | null
    estructura_egreso_id?: number | null
    cuenta_ingreso_id?: number | null
    tarjeta_id?: number | null
    cuotas_totales?: number | null
  }
  onClose: () => void
  onSuccess: () => void
}

interface Billetera {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
}

interface Tarjeta {
  tarjeta_id: number
  nombre_tarjeta: string
  estado_config: string
}

interface Hijo {
  estructura_id: number
  nombre_cuenta: string
}

interface Rubro {
  estructura_id: number
  nombre_cuenta: string
  hijos?: Hijo[]
}

interface FuenteIngreso {
  producto_id: number
  nombre: string
}

export function EditMovementModal({ movement, onClose, onSuccess }: EditMovementModalProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const usesIncomeCategory = movement.tipo === 'income'
  const usesExpenseCategory = !['income', 'transfer', 'opening'].includes(movement.tipo)

  // Form states — use null/empty as "not yet set" sentinel
  const [fecha, setFecha] = useState('')
  const [monto, setMonto] = useState('0')
  const [origenTipo, setOrigenTipo] = useState<'billetera' | 'tarjeta'>('billetera')
  const [origenId, setOrigenId] = useState<number | null>(null)
  const [billeteraDestinoId, setBilleteraDestinoId] = useState<number | null>(null)
  const [estructuraEgresoId, setEstructuraEgresoId] = useState<number | null>(null)
  const [cuentaIngresoId, setCuentaIngresoId] = useState<number | null>(null)
  const [detalle, setDetalle] = useState('')

  // Options states
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([])
  const [categoriasEgreso, setCategoriasEgreso] = useState<{ id: number; label: string }[]>([])
  const [fuentesIngreso, setFuentesIngreso] = useState<FuenteIngreso[]>([])

  // Load options lists AND initialize form values atomically after data is ready
  const fetchOptions = useCallback(async () => {
    try {
      setLoadingData(true)
      const [billeterasRes, rubrosRes, ingresosRes, tarjetasRes] = await Promise.all([
        rpc<Billetera[]>('fn_obtener_billeteras_activas').catch(() => [] as Billetera[]),
        rpc<Rubro[]>('fn_obtener_arbol_categorias').catch(() => [] as Rubro[]),
        rpc<FuenteIngreso[]>('fn_listar_categorias_ingreso').catch(() => [] as FuenteIngreso[]),
        rpc<Tarjeta[]>('fn_reporte_mapa_tarjetas').catch(() => [] as Tarjeta[]),
      ])

      const billeterasLoaded = billeterasRes || []
      const ingresosLoaded = ingresosRes || []
      const tarjetasLoaded = tarjetasRes || []

      // Flatten categories for simpler select input
      const flatCats: { id: number; label: string }[] = []
      if (rubrosRes) {
        rubrosRes.forEach(rubro => {
          const hijos = rubro.hijos || []
          if (hijos.length === 0) {
            flatCats.push({ id: rubro.estructura_id, label: t(rubro.nombre_cuenta) })
          } else {
            hijos.forEach(hijo => {
              flatCats.push({
                id: hijo.estructura_id,
                label: `${t(rubro.nombre_cuenta)} › ${t(hijo.nombre_cuenta)}`
              })
            })
          }
        })
      }

      setBilleteras(billeterasLoaded)
      setTarjetas(tarjetasLoaded)
      setFuentesIngreso(ingresosLoaded)
      setCategoriasEgreso(flatCats)

      // ── Initialize form values using freshly loaded data ──
      setFecha(movement.fecha)
      setMonto(Math.abs(movement.monto).toString())
      setDetalle(movement.detalle || '')

      // 1. Origen: Billetera o Tarjeta
      if (movement.tarjeta_id) {
        setOrigenTipo('tarjeta')
        setOrigenId(Number(movement.tarjeta_id))
      } else {
        setOrigenTipo('billetera')
        const wId = movement.billetera_origen_id
          ? Number(movement.billetera_origen_id)
          : billeterasLoaded.find(b => b.nombre === movement.nombre_billetera)?.billetera_id ?? null
        setOrigenId(wId)
      }

      // 2. Billetera Destino
      if (movement.billetera_destino_id) {
        setBilleteraDestinoId(Number(movement.billetera_destino_id))
      }

      // 3. Fuente de Ingreso: prefer stored ID, fallback to name match in loaded list
      if (movement.tipo === 'income') {
        if (movement.cuenta_ingreso_id) {
          setCuentaIngresoId(Number(movement.cuenta_ingreso_id))
        } else {
          const foundFuente = ingresosLoaded.find(f => f.nombre === movement.nombre_categoria)
          if (foundFuente) setCuentaIngresoId(foundFuente.producto_id)
        }
      }

      // 4. Categoría de Egreso: prefer stored ID, fallback to label match
      if (usesExpenseCategory) {
        if (movement.estructura_egreso_id) {
          setEstructuraEgresoId(Number(movement.estructura_egreso_id))
        } else {
          const cleanName = movement.nombre_categoria
          const foundCat = flatCats.find(c => c.label === cleanName || c.label.endsWith(` › ${cleanName}`))
          if (foundCat) setEstructuraEgresoId(foundCat.id)
        }
      }

    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoadingData(false)
    }
  }, [movement, showToast])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const montoNum = parseFloat(monto)
    if (isNaN(montoNum) || montoNum <= 0) {
      showToast('Por favor, ingresa un importe válido mayor a cero.', 'error')
      return
    }

    if (!origenId) {
      showToast('Por favor, selecciona un origen.', 'error')
      return
    }

    if (movement.tipo === 'transfer' && !billeteraDestinoId) {
      showToast('Por favor, selecciona una cuenta destino.', 'error')
      return
    }

    if (movement.tipo === 'transfer' && origenTipo === 'billetera' && origenId === billeteraDestinoId) {
      showToast('Las cuentas de origen y destino no pueden ser iguales.', 'error')
      return
    }

    setLoading(true)
    try {
      let valIngreso = 0
      let valEgreso = 0

      if (movement.tipo === 'income' || movement.tipo === 'opening') {
        valIngreso = montoNum
      } else if (movement.tipo === 'expense' || movement.tipo === 'transfer' || movement.tipo === 'pago_tarjeta') {
        valEgreso = montoNum
      } else if (movement.tipo === 'adjustment') {
        if (movement.monto >= 0) {
          valIngreso = montoNum
        } else {
          valEgreso = montoNum
        }
      }

      await rpc('fn_editar_movimiento_caja', {
        p_caja_id: movement.p_caja_id,
        p_nueva_fecha: fecha,
        p_nuevo_valor_ingreso: valIngreso,
        p_nuevo_valor_egreso: valEgreso,
        p_billetera_origen_id: origenTipo === 'billetera' ? origenId : null,
        p_billetera_destino_id: movement.tipo === 'transfer' ? billeteraDestinoId : null,
        p_estructura_egreso_id: usesExpenseCategory ? estructuraEgresoId : null,
        p_cuenta_ingreso_id: usesIncomeCategory ? cuentaIngresoId : null,
        p_nuevo_detalle: detalle.trim() || null,
        p_nueva_descripcion: null, // Remove observations and leave it null
        p_tarjeta_id: origenTipo === 'tarjeta' ? origenId : null
      })

      showToast(t('edit_movement_success'), 'success')
      onSuccess()
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const getTipoLabel = () => {
    switch (movement.tipo) {
      case 'expense': return 'Egreso 📤'
      case 'income': return 'Ingreso 📥'
      case 'transfer': return 'Transferencia 🔄'
      case 'opening': return 'Saldo Inicial 🏁'
      case 'adjustment': return 'Ajuste de Saldo ⚖️'
      default: return movement.tipo
    }
  }

  return (
    <>
      <div className="edit-movement-overlay" onClick={onClose} />
      <div className="edit-movement-modal">
        <div className="edit-movement-header">
          <h3 className="font-display">✏️ {t('edit_movement_title')}</h3>
          <button className="edit-movement-close" onClick={onClose}>✕</button>
        </div>

        {loadingData ? (
          <div className="edit-movement-loading">
            <div className="spinner" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="edit-movement-form">
            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="edit-movement-type-badge mb-3">
                Tipo: <strong>{getTipoLabel()}</strong>
              </div>
              {movement.cuotas_totales && movement.cuotas_totales > 1 && (
                <div className="edit-movement-type-badge mb-3" style={{ background: 'rgba(255, 107, 107, 0.15)', color: 'var(--coral)' }}>
                  Cuotas: <strong>{movement.cuotas_totales}</strong>
                </div>
              )}
            </div>

            {/* Fecha */}
            <div className="form-group mb-3">
              <label className="edit-movement-label">{t('edit_movement_date')}</label>
              <input
                type="date"
                className="form-control"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* Importe / Monto */}
            <div className="form-group mb-3">
              <label className="edit-movement-label">{t('edit_movement_amount')}</label>
              <input
                type="number"
                step="any"
                className="form-control font-mono"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* Cuenta / Tarjeta Origen */}
            <div className="form-group mb-3">
              <label className="edit-movement-label">Origen (Cuenta o Tarjeta)</label>
              <select
                className="form-control"
                value={origenId ? `${origenTipo}-${origenId}` : ''}
                onChange={e => {
                  const val = e.target.value
                  if (val) {
                    const [tipo, id] = val.split('-')
                    setOrigenTipo(tipo as 'billetera' | 'tarjeta')
                    setOrigenId(Number(id))
                  } else {
                    setOrigenId(null)
                  }
                }}
                required
                disabled={loading}
              >
                <option value="">Selecciona origen...</option>
                <optgroup label="Billeteras">
                  {billeteras.map(b => (
                    <option key={`billetera-${b.billetera_id}`} value={`billetera-${b.billetera_id}`}>
                      {b.nombre} ({b.moneda})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Tarjetas de Crédito">
                  {tarjetas.map(t => (
                    <option key={`tarjeta-${t.tarjeta_id}`} value={`tarjeta-${t.tarjeta_id}`}>
                      💳 {t.nombre_tarjeta}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Cuenta Destino (Solo Transferencia) */}
            {movement.tipo === 'transfer' && (
              <div className="form-group mb-3">
                <label className="edit-movement-label">{t('edit_movement_destination')}</label>
                <select
                  className="form-control"
                  value={billeteraDestinoId || ''}
                  onChange={e => setBilleteraDestinoId(e.target.value ? Number(e.target.value) : null)}
                  required
                  disabled={loading}
                >
                  <option value="">Selecciona destino</option>
                  {billeteras.map(b => (
                    <option key={b.billetera_id} value={b.billetera_id}>
                      {b.nombre} ({b.moneda})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Categoría (Solo Egreso) */}
            {usesExpenseCategory && (
              <div className="form-group mb-3">
                <label className="edit-movement-label">{t('edit_movement_category')}</label>
                <select
                  className="form-control"
                  value={estructuraEgresoId || ''}
                  onChange={e => setEstructuraEgresoId(e.target.value ? Number(e.target.value) : null)}
                  required
                  disabled={loading}
                >
                  <option value="">Selecciona categoría</option>
                  {categoriasEgreso.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Fuente de Ingresos (Solo Ingreso) */}
            {usesIncomeCategory && (
              <div className="form-group mb-3">
                <label className="edit-movement-label">{t('edit_movement_source')}</label>
                <select
                  className="form-control"
                  value={cuentaIngresoId || ''}
                  onChange={e => setCuentaIngresoId(e.target.value ? Number(e.target.value) : null)}
                  disabled={loading}
                >
                  <option value="">Selecciona fuente (opcional)</option>
                  {fuentesIngreso.map(f => (
                    <option key={f.producto_id} value={f.producto_id}>
                      {f.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Nota */}
            <div className="form-group mb-4">
              <label className="edit-movement-label">Nota (opcional)</label>
              <input
                type="text"
                className="form-control"
                value={detalle}
                onChange={e => setDetalle(e.target.value)}
                placeholder="Ej: Compra de supermercado mensual"
                disabled={loading}
                enterKeyHint="done"
              />
            </div>

            <div className="edit-movement-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Guardando...' : t('edit_movement_save_btn')}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
