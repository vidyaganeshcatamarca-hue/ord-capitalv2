import { useMemo } from 'react'
import { fechaLocalISO } from '@/lib/format'
import { t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { montoMoneda } from './formato'
import type { CuotaInput } from './types'
import './prestamos.css'

/**
 * A row of the schedule editor. `clave` is a stable React key only: it never
 * travels to the backend.
 */
export interface FilaCuota {
  clave: string
  fecha: string
  monto: string
  interes: string
}

let contador = 0
function claveNueva(): string {
  contador += 1
  return `cuota-${contador}`
}

/** An empty row, one month after `desde` (or after today). */
export function nuevaFilaCuota(desde?: string): FilaCuota {
  const base = desde ? new Date(`${desde}T12:00:00`) : new Date()
  if (desde) base.setMonth(base.getMonth() + 1)
  else base.setDate(base.getDate() + 30)
  return { clave: claveNueva(), fecha: fechaLocalISO(base), monto: '', interes: '' }
}

export function filaDesdeCuota(fecha: string, monto: number, interes: number | null): FilaCuota {
  return {
    clave: claveNueva(),
    fecha,
    monto: String(monto),
    interes: interes === null || interes === undefined ? '' : String(interes),
  }
}

/**
 * The `p_cuotas` payload, or `null`.
 *
 * Only rows with a date and a positive amount are sent, and `interes_componente`
 * travels only when the user typed it: a missing interest portion is "unknown",
 * which is not the same as a zero-interest installment.
 */
export function construirCuotas(filas: FilaCuota[]): CuotaInput[] | null {
  const validas = filas.filter((f) => f.fecha.trim() !== '' && Number(f.monto) > 0)
  if (validas.length === 0) return null
  return validas.map((fila) => {
    const item: CuotaInput = {
      fecha_vencimiento: fila.fecha,
      monto_cuota: Number(fila.monto),
    }
    const interes = fila.interes.trim() === '' ? null : Number(fila.interes)
    if (interes !== null && Number.isFinite(interes) && interes >= 0) {
      item.interes_componente = interes
    }
    return item
  })
}

interface CuotasEditorProps {
  filas: FilaCuota[]
  moneda: string
  onChange: (filas: FilaCuota[]) => void
}

/**
 * Installments with real dates (S6): the user types the schedule, nothing here
 * projects one. The running total is shown so a typo is visible before saving.
 */
export function CuotasEditor({ filas, moneda, onChange }: CuotasEditorProps) {
  const total = useMemo(
    () =>
      filas
        .filter((f) => Number(f.monto) > 0)
        .reduce((acc, f) => acc + Number(f.monto), 0),
    [filas],
  )

  const cambiar = (clave: string, campo: keyof FilaCuota, valor: string) => {
    onChange(filas.map((fila) => (fila.clave === clave ? { ...fila, [campo]: valor } : fila)))
  }

  return (
    <div className="prestamos-cuotas-editor">
      <div className="prestamos-cuotas-editor-head">
        <span>{t('prestamos_detalle_cuotas')}</span>
        <span className="prestamos-field-hint">
          {t('prestamos_alta_cuotas_suma', { total: montoMoneda(total, moneda) })}
        </span>
      </div>

      {filas.map((fila, indice) => (
        <div key={fila.clave} className="prestamos-cuota-edit">
          <div className="prestamos-cuota-edit-head">
            <span className="prestamos-cuota-edit-num">
              {t('prestamos_detalle_cuota', { n: indice + 1 })}
            </span>
            {filas.length > 1 && (
              <button
                type="button"
                className="prestamos-cuota-edit-quitar"
                onClick={() => {
                  haptics.light()
                  onChange(filas.filter((f) => f.clave !== fila.clave))
                }}
              >
                {t('prestamos_alta_cuota_quitar')}
              </button>
            )}
          </div>
          <div className="prestamos-field-row">
            <div className="prestamos-field">
              <label htmlFor={`prestamo-cuota-fecha-${fila.clave}`}>
                {t('prestamos_alta_cuota_fecha')}
              </label>
              <input
                id={`prestamo-cuota-fecha-${fila.clave}`}
                type="date"
                value={fila.fecha}
                onChange={(e) => cambiar(fila.clave, 'fecha', e.target.value)}
              />
            </div>
            <div className="prestamos-field">
              <label htmlFor={`prestamo-cuota-monto-${fila.clave}`}>
                {t('prestamos_alta_cuota_monto')}
              </label>
              <input
                id={`prestamo-cuota-monto-${fila.clave}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={fila.monto}
                onChange={(e) => cambiar(fila.clave, 'monto', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="prestamos-field">
            <label htmlFor={`prestamo-cuota-interes-${fila.clave}`}>
              {t('prestamos_alta_cuota_interes')}
            </label>
            <input
              id={`prestamo-cuota-interes-${fila.clave}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={fila.interes}
              onChange={(e) => cambiar(fila.clave, 'interes', e.target.value)}
              placeholder="—"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          haptics.light()
          onChange([...filas, nuevaFilaCuota(filas[filas.length - 1]?.fecha)])
        }}
      >
        {t('prestamos_alta_cuota_agregar')}
      </button>
    </div>
  )
}
