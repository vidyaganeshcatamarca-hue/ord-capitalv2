// src/components/gastos-recurrentes/RecurrenciaEditor.tsx
// Editor de la forma de recurrencia: semanal (1..7 días), mensual (1..31 días
// del mes) y anual (1+ fechas). Requisitos R-GR-17 y R-GR-35 del PRD (§32.5).
// No hay tope de días: la base valida rango y deduplica.
// Con tarjeta no se elige día: manda el cierre de la tarjeta.

import { useMemo } from 'react'
import { t } from '@/locales/i18n'
import {
  MODOS_CON_TARJETA,
  RECURRENCIA_LIMITES,
  buildFechaAnual,
  diasDelMes,
  fechaVisible,
  parseFechaAnual,
  type ModoRecurrencia,
} from '@/lib/gastosRecurrentes'

const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7] as const
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

interface Props {
  modo: ModoRecurrencia
  diasSemana: number[]
  diasMes: number[]
  fechasAnio: number[]
  /** Fecha completa del modo `unica`, en ISO (YYYY-MM-DD). */
  fechaUnica: string
  /** Vigencia: vacía = se repite para siempre. */
  fechaFin: string
  /** true cuando el origen es una tarjeta: solo se ofrecen mensual y unica. */
  conTarjeta: boolean
  onModo: (modo: ModoRecurrencia) => void
  onDiasSemana: (dias: number[]) => void
  onDiasMes: (dias: number[]) => void
  onFechasAnio: (fechas: number[]) => void
  onFechaUnica: (fecha: string) => void
  onFechaFin: (fecha: string) => void
  error?: string | null
}

export function RecurrenciaEditor({
  modo, diasSemana, diasMes, fechasAnio, fechaUnica, fechaFin, conTarjeta,
  onModo, onDiasSemana, onDiasMes, onFechasAnio, onFechaUnica, onFechaFin, error,
}: Props) {
  const anioActual = new Date().getFullYear()
  // Con tarjeta una suscripción se cobra una vez por ciclo: semanal y anual no aplican.
  const modosVisibles: ModoRecurrencia[] = conTarjeta
    ? [...MODOS_CON_TARJETA]
    : ['semanal', 'mensual', 'anual', 'unica']

  const toggleDiaSemana = (dia: number) => {
    if (diasSemana.includes(dia)) {
      onDiasSemana(diasSemana.filter(d => d !== dia))
      return
    }
    onDiasSemana([...diasSemana, dia].sort((a, b) => a - b))
  }

  const agregarDiaMes = (valor: number) => {
    if (!Number.isInteger(valor) || valor < 1 || valor > 31) return
    if (diasMes.includes(valor)) return
    onDiasMes([...diasMes, valor].sort((a, b) => a - b))
  }

  const toggleFechaAnual = (mes: number, dia: number) => {
    const valor = buildFechaAnual(mes, dia)
    if (fechasAnio.includes(valor)) {
      onFechasAnio(fechasAnio.filter(f => f !== valor))
      return
    }
    onFechasAnio([...fechasAnio, valor].sort((a, b) => a - b))
  }

  return (
    <fieldset className="recur-fieldset">
      <legend className="recur-legend">{t('recurrentes_modo_label')}</legend>

      <div className="recur-modo" role="radiogroup" aria-label={t('recurrentes_modo_label')}>
        {modosVisibles.map(m => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modo === m}
            className={`recur-modo-btn${modo === m ? ' is-active' : ''}`}
            onClick={() => onModo(m)}
          >
            {t(`recurrentes_modo_${m}`)}
          </button>
        ))}
      </div>

      {modo === 'semanal' && (
        <div className="recur-block">
          <div className="recur-chips">
            {DIAS_SEMANA.map(d => (
              <button
                key={d}
                type="button"
                aria-pressed={diasSemana.includes(d)}
                className={`recur-chip${diasSemana.includes(d) ? ' is-active' : ''}`}
                onClick={() => toggleDiaSemana(d)}
              >
                {t(`recurrentes_dia_corto_${d}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Con tarjeta el día no se elige: lo manda el cierre de la tarjeta y la
          ocurrencia se propone 3 días antes. Por eso la sección mensual no
          aparece y el modal tampoco exige un día. */}
      {modo === 'mensual' && conTarjeta && (
        <div className="recur-block">
          <p className="recur-hint">{t('recurrentes_tarjeta_hint')}</p>
        </div>
      )}

      {modo === 'mensual' && !conTarjeta && (
        <MensualPicker dias={diasMes} onAdd={agregarDiaMes} onRemove={d => onDiasMes(diasMes.filter(x => x !== d))} />
      )}

      {modo === 'anual' && (
        <AnualPicker fechas={fechasAnio} anio={anioActual} onToggle={toggleFechaAnual} />
      )}

      {modo === 'unica' && (
        <div className="recur-block">
          <p className="recur-hint">{t('recurrentes_unica_hint')}</p>
          <div className="recur-field">
            <span>{t('recurrentes_campo_fecha_unica')}</span>
            {/* El input nativo de fecha se ve VACÍO en varios navegadores de
                Android: no sugiere nada y parece un campo roto. Se dibuja el
                texto nosotros y el nativo queda transparente encima, así el
                calendario lo sigue abriendo el sistema. */}
            <CampoFecha
              value={fechaUnica}
              min={hoyISO()}
              placeholder={t('recurrentes_elegir_fecha')}
              ariaLabel={t('recurrentes_campo_fecha_unica')}
              onChange={onFechaUnica}
            />
          </div>
        </div>
      )}

      {/* Vigencia: vacía = se repite para siempre. Al vencer, el motor pausa
          la recurrencia con motivo «vencida» (distinto de tu pausa manual).
          Única vez no tiene vigencia: la ocurrencia es una sola. */}
      {modo !== 'unica' && (
        <div className="recur-block">
          <div className="recur-field">
            <span>{t('recurrentes_campo_fecha_fin')}</span>
            <CampoFecha
              value={fechaFin}
              min={hoyISO()}
              placeholder={t('recurrentes_elegir_fecha')}
              ariaLabel={t('recurrentes_campo_fecha_fin')}
              onChange={onFechaFin}
            />
          </div>
          <p className="recur-hint">{t('recurrentes_vigencia_hint')}</p>
        </div>
      )}

      {error && <p className="recur-error" role="alert">{error}</p>}
    </fieldset>
  )
}

function MensualPicker({
  dias, onAdd, onRemove,
}: { dias: number[]; onAdd: (d: number) => void; onRemove: (d: number) => void }) {
  return (
    <div className="recur-block">
      <div className="recur-chips">
        {Array.from({ length: RECURRENCIA_LIMITES.diasMesMax }, (_, i) => i + 1).map(d => {
          const activo = dias.includes(d)
          return (
            <button
              key={d}
              type="button"
              aria-pressed={activo}
              className={`recur-chip recur-chip--num${activo ? ' is-active' : ''}`}
              onClick={() => (activo ? onRemove(d) : onAdd(d))}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AnualPicker({
  fechas, anio, onToggle,
}: { fechas: number[]; anio: number; onToggle: (mes: number, dia: number) => void }) {
  const ordenadas = useMemo(
    () => [...fechas].sort((a, b) => a - b).map(parseFechaAnual),
    [fechas],
  )

  return (
    <div className="recur-block">
      <p className="recur-hint">{t('recurrentes_anual_hint')}</p>

      {ordenadas.length > 0 && (
        <div className="recur-chips">
          {ordenadas.map(({ mes, dia }) => (
            <button
              key={buildFechaAnual(mes, dia)}
              type="button"
              className="recur-chip is-active"
              onClick={() => onToggle(mes, dia)}
              title={t('recurrentes_quitar_fecha')}
            >
              {t('recurrentes_fecha_corta', { dia, mes: t(`recurrentes_mes_${mes}`) })} ✕
            </button>
          ))}
        </div>
      )}

      <div className="recur-chips">
        {MESES.map(m => (
          <details key={m} className="recur-mes-detalle">
            <summary className="recur-chip recur-chip--mes">{t(`recurrentes_mes_${m}`)}</summary>
            <div className="recur-chips recur-chips--dias">
              {Array.from({ length: diasDelMes(anio, m) }, (_, i) => i + 1).map(d => {
                const activo = fechas.includes(buildFechaAnual(m, d))
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={activo}
                    className={`recur-chip recur-chip--num${activo ? ' is-active' : ''}`}
                    onClick={() => onToggle(m, d)}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

/**
 * Campo de fecha con placeholder visible.
 *
 * El `<input type="date">` nativo, cuando está vacío, no muestra ninguna pista
 * en varios navegadores de Android: queda un rectángulo vacío que parece roto.
 * Acá el texto lo pinta el componente (placeholder o la fecha ya elegida) y el
 * input nativo va transparente encima, ocupando toda la caja: el toque en
 * cualquier parte abre el calendario del sistema, que es lo que el usuario
 * espera. En escritorio, cualquier click dispara `showPicker()`.
 */
function CampoFecha({
  value, min, placeholder, ariaLabel, onChange,
}: {
  value: string
  min?: string
  placeholder: string
  ariaLabel: string
  onChange: (fecha: string) => void
}) {
  return (
    <label className="recur-date">
      <input
        className="recur-date-input"
        type="date"
        value={value}
        min={min}
        aria-label={ariaLabel}
        onChange={e => onChange(e.target.value)}
        onClick={e => {
          // showPicker() necesita un gesto del usuario: el click lo es.
          try { e.currentTarget.showPicker?.() } catch { /* el nativo se abre solo */ }
        }}
      />
      <span className={`recur-date-text${value ? ' is-set' : ''}`}>
        {value ? fechaVisible(value, t) : placeholder}
      </span>
      <span className="recur-date-icon" aria-hidden="true">📅</span>
    </label>
  )
}

/** Fecha de hoy en ISO (YYYY-MM-DD) para los `min` de los inputs de fecha. */
function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
