// src/components/gastos-recurrentes/GastoRecurrenteFormModal.tsx
// Alta y edición de un gasto recurrente. Sigue el patrón de overlay de
// src/components/recordatorios/RecordatorioFormModal.tsx (no hay modal genérico).
// Requisitos: R-GR-01..R-GR-04, R-GR-17, R-GR-35 (PRD §32.5).

import { useEffect, useState } from 'react'
import { t } from '@/locales/i18n'
import { RecurrenciaEditor } from './RecurrenciaEditor'
import { CategoriaPicker } from '@/components/CategoriaPicker/CategoriaPicker'
import { ToggleSwitch } from '@/components/configuracion/ToggleSwitch'
import { MODOS_CON_TARJETA } from '@/lib/gastosRecurrentes'
import type {
  GastoRecurrenteInput,
  GastoRecurrenteRow,
  ModoRecurrencia,
} from '@/lib/gastosRecurrentes'

export interface RubroOpcion {
  estructura_id: number
  nombre_cuenta: string
  icono: string
  hijos: Array<{ estructura_id: number; nombre: string; icono: string }>
}

export interface BilleteraOpcion {
  billetera_id: number
  nombre: string
  moneda: string
}

/** Tarjetas activas, como las trae fn_reporte_mapa_tarjetas. */
export interface TarjetaOpcion {
  tarjeta_id: number
  nombre_tarjeta: string
}

interface Props {
  mode: 'create' | 'edit'
  initial?: GastoRecurrenteRow | null
  rubros: RubroOpcion[]
  billeteras: BilleteraOpcion[]
  tarjetas: TarjetaOpcion[]
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: GastoRecurrenteInput) => void
}

export function GastoRecurrenteFormModal({
  mode, initial, rubros, billeteras, tarjetas, saving, error, onClose, onSubmit,
}: Props) {
  const [estructuraId, setEstructuraId] = useState<number | null>(initial?.estructura_egreso_id ?? null)
  const [billeteraId, setBilleteraId] = useState<number | null>(initial?.billetera_defecto_id ?? null)
  const [nombre, setNombre] = useState<string>(initial?.nombre_categoria ?? initial?.nombre ?? '')
  const [monto, setMonto] = useState<string>(initial?.monto_base != null ? String(initial.monto_base) : '')
  const [modo, setModo] = useState<ModoRecurrencia>(initial?.modo ?? 'mensual')
  const [diasSemana, setDiasSemana] = useState<number[]>(initial?.dias_semana ?? [])
  const [diasMes, setDiasMes] = useState<number[]>(initial?.dias_mes ?? (initial?.dia_del_mes ? [initial.dia_del_mes] : []))
  const [fechasAnio, setFechasAnio] = useState<number[]>(initial?.fechas_anio ?? [])
  // Origen del pago: billetera o tarjeta, nunca los dos (mismo contrato que la base).
  const [origen, setOrigen] = useState<'billetera' | 'tarjeta'>(initial?.tarjeta_id != null ? 'tarjeta' : 'billetera')
  const [tarjetaId, setTarjetaId] = useState<number | null>(initial?.tarjeta_id ?? null)
  const [esUsd, setEsUsd] = useState<boolean>(initial?.es_usd ?? false)
  const [fechaUnica, setFechaUnica] = useState<string>(initial?.fecha_unica ?? '')
  const [fechaFin, setFechaFin] = useState<string>(initial?.fecha_fin ?? '')
  const [formaError, setFormaError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Una sola fuente de pago: elegir una despeja la otra y sus exclusivos. */
  useEffect(() => {
    if (origen === 'tarjeta') {
      setBilleteraId(null)
      // Con tarjeta solo hay mensual: un cargo unico va por el modal de gasto manual.
      if (!MODOS_CON_TARJETA.includes(modo)) setModo('mensual')
    } else {
      setTarjetaId(null)
      setEsUsd(false)
    }
  }, [origen, modo])

  /**
   * La misma forma que valida la base, adelantada en el cliente para no ir y volver.
   * Con tarjeta NO se elige día: el día es el del cierre de la tarjeta y la
   * ocurrencia se propone 3 días antes (ver fn_generar_recurrentes_hoy).
   */
  const conTarjeta = origen === 'tarjeta'
  const validarForma = (): string | null => {
    // Origen primero: es el dato sin el que no hay gasto posible, y el orden de
    // los mensajes sigue el orden de los campos del formulario.
    if (origen === 'tarjeta' && tarjetaId == null) {
      return t('recurrentes_error_tarjeta')
    }
    if (!conTarjeta && billeteraId == null) {
      return t('recurrentes_error_billetera')
    }
    if (!conTarjeta) {
      if (modo === 'semanal' && diasSemana.length < 1) {
        return t('recurrentes_error_semanal')
      }
      if (modo === 'mensual' && diasMes.length < 1) {
        return t('recurrentes_error_mensual')
      }
    }
    if (modo === 'anual' && fechasAnio.length < 1) {
      return t('recurrentes_error_anual')
    }
    if (modo === 'unica' && !fechaUnica) {
      return t('recurrentes_error_unica_fecha')
    }
    if (fechaFin && fechaUnica && fechaFin < fechaUnica) {
      return t('recurrentes_error_fecha_fin')
    }
    return null
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const forma = validarForma()
    setFormaError(forma)
    if (forma) return

    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setFormaError(t('recurrentes_error_monto'))
      return
    }

    onSubmit({
      estructura_egreso_id: estructuraId,
      nombre_custom: nombre.trim() || null,
      monto_base: montoNum,
      // El monto de un recurrente es SIEMPRE fijo: si cambió, se corrige la
      // ocurrencia en cuarentena. No hay opción de promedio histórico.
      tipo_variabilidad: 'fijo',
      // Origen mutuamente excluyente: el CHECK de la tabla tambien lo defiende.
      billetera_defecto_id: origen === 'billetera' ? billeteraId : null,
      tarjeta_id: origen === 'tarjeta' ? tarjetaId : null,
      es_usd: origen === 'tarjeta' ? esUsd : false,
      modo,
      // Con tarjeta no hay día: lo define el cierre de la tarjeta.
      dias_semana: !conTarjeta && modo === 'semanal' ? diasSemana : null,
      dias_mes: !conTarjeta && modo === 'mensual' ? diasMes : null,
      fechas_anio: modo === 'anual' ? fechasAnio : null,
      fecha_unica: modo === 'unica' ? fechaUnica : null,
      // Única vez: la ocurrencia es una sola, no hay vigencia que fijar.
      fecha_fin: modo === 'unica' ? null : fechaFin || null,
      // Transición: la fase 2 del esquema elimina estas dos columnas.
      dia_del_mes: !conTarjeta && modo === 'mensual' && diasMes.length ? diasMes[0] : null,
      frecuencia: modo === 'anual' || modo === 'unica' ? 'anual' : 'mensual',
    })
  }

  return (
    <div className="recur-overlay" role="dialog" aria-modal="true" aria-labelledby="recur-modal-title" onClick={onClose}>
      <div className="recur-modal" onClick={e => e.stopPropagation()}>
        <header className="recur-modal-head">
          <h2 id="recur-modal-title">
            {mode === 'create' ? t('recurrentes_nuevo') : t('recurrentes_editar')}
          </h2>
          <button type="button" className="recur-close" onClick={onClose} aria-label={t('btn_cancel')}>✕</button>
        </header>

        <form onSubmit={handleSubmit} className="recur-form">
          <div className="recur-field">
            <span>{t('recurrentes_campo_categoria')}</span>
            {/* Mismo selector que usa la cuarentena (CategoriaPicker): árbol con
                jerarquía, padre con hijos no elegible, iconos reales. */}
            <CategoriaPicker
              categorias={rubros}
              value={estructuraId}
              onChange={id => setEstructuraId(Number(id))}
              placeholder={t('recurrentes_elegir_categoria')}
              title={t('recurrentes_campo_categoria')}
            />
          </div>

          <label className="recur-field">
            <span>{t('recurrentes_campo_nombre')}</span>
            <input
              className="recur-input"
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder={t('recurrentes_campo_nombre_placeholder')}
              maxLength={80}
            />
          </label>

          <label className="recur-field">
            <span>{t('recurrentes_campo_monto')}</span>
            <input
              className="recur-input"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              required
            />
          </label>

          {/* Con que se paga: billetera o tarjeta, como el modal de movimiento
              manual. Nunca los dos: el CHECK de la tabla tambien lo defiende. */}
          <div className="recur-field">
            <span>{t('recurrentes_origen_label')}</span>
            <div className="recur-modo recur-origen" role="radiogroup" aria-label={t('recurrentes_origen_label')}>
              <button
                type="button"
                role="radio"
                aria-checked={origen === 'billetera'}
                className={`recur-modo-btn${origen === 'billetera' ? ' is-active' : ''}`}
                onClick={() => setOrigen('billetera')}
              >
                {t('recurrentes_origen_billetera')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={origen === 'tarjeta'}
                className={`recur-modo-btn${origen === 'tarjeta' ? ' is-active' : ''}`}
                onClick={() => setOrigen('tarjeta')}
              >
                {t('recurrentes_origen_tarjeta')}
              </button>
            </div>
          </div>

          {origen === 'billetera' ? (
            <label className="recur-field">
              <span>{t('recurrentes_campo_billetera')}</span>
              {/* Siempre hay billetera: no existe el recurrente sin origen. */}
              <select
                className="recur-input"
                value={billeteraId ?? ''}
                onChange={e => setBilleteraId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="" disabled>{t('recurrentes_elegir_billetera')}</option>
                {billeteras.map(b => (
                  <option key={b.billetera_id} value={b.billetera_id}>
                    {/* El nombre puede ser una clave i18n (billetera semilla «efectivo»). */}
                    {t(b.nombre)} ({b.moneda})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="recur-field">
                <span>{t('recurrentes_campo_tarjeta')}</span>
                <select
                  className="recur-input"
                  value={tarjetaId ?? ''}
                  onChange={e => setTarjetaId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t('recurrentes_elegir_tarjeta')}</option>
                  {tarjetas.map(tj => (
                    <option key={tj.tarjeta_id} value={tj.tarjeta_id}>
                      {tj.nombre_tarjeta}
                    </option>
                  ))}
                </select>
              </label>
              {/* El interruptor es el ToggleSwitch de la app, no un checkbox:
                  el reset global de index.css (input { -webkit-appearance:
                  none }) borra el tilde nativo y el control se veía apagado
                  aunque el estado fuera true. */}
              <div className="recur-check">
                <ToggleSwitch checked={esUsd} onChange={setEsUsd} size="sm" />
                <span>{t('recurrentes_es_usd')}</span>
              </div>
              {/* El aviso no es decorativo: explica por que no hay campo día
                  ni cuotas (siempre 1, es una suscripción). Vive en el editor
                  de recurrencia, junto al bloque mensual; acá no se repite. */}
            </>
          )}

          <RecurrenciaEditor
            modo={modo}
            diasSemana={diasSemana}
            diasMes={diasMes}
            fechasAnio={fechasAnio}
            fechaUnica={fechaUnica}
            fechaFin={fechaFin}
            conTarjeta={conTarjeta}
            onModo={setModo}
            onDiasSemana={setDiasSemana}
            onDiasMes={setDiasMes}
            onFechasAnio={setFechasAnio}
            onFechaUnica={setFechaUnica}
            onFechaFin={setFechaFin}
            error={formaError}
          />

          {error && <p className="recur-error" role="alert">{error}</p>}

          <footer className="recur-modal-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              {t('btn_cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('recurrentes_guardando') : t('recurrentes_guardar')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
