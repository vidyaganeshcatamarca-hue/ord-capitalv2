import { useCallback, useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { haptics } from '@/lib/haptics'
import { numero, type VinculoFila } from './types'
import { montoONoCalculable } from './formato'
import './prestamos.css'

/**
 * The three Vinculos questions (S17).
 *
 * Asked ONLY when the user asks for a Vinculos suggestion: this component is
 * mounted by a button, never by the loan form. Every question is multi-select and
 * the user may select none, so "no selection" always means 0 points, never a
 * penalty. Weights are fixed by the approved spec: 3, 3 and 5.
 *
 * Nothing here writes a loan or moves money: it stores the answers and the
 * backend recomputes the per-creditor score.
 */
const PREGUNTAS = [
  { criterio: 1, peso: 3, clave: 'prestamos_vinculos_p1' },
  { criterio: 2, peso: 3, clave: 'prestamos_vinculos_p2' },
  { criterio: 3, peso: 5, clave: 'prestamos_vinculos_p3' },
] as const

interface VinculosCuestionarioProps {
  onAplicado: () => void
  onCerrar: () => void
}

export function VinculosCuestionario({ onAplicado, onCerrar }: VinculosCuestionarioProps) {
  // Los saldos que acompañan a cada persona usan el formato de la región.
  useFormatRevision()
  const { showToast } = useToast()

  const [filas, setFilas] = useState<VinculoFila[]>([])
  const [seleccion, setSeleccion] = useState<Record<number, number[]>>({})
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await rpc<VinculoFila[]>('fn_saneamiento_vinculos_preguntas')
      const lista = Array.isArray(data) ? data : []
      setFilas(lista)
      // Las respuestas anteriores vuelven marcadas: re-preguntar es editable.
      const previo: Record<number, number[]> = {}
      for (const fila of lista) {
        const criterios: number[] = []
        if (fila.criterio_1) criterios.push(1)
        if (fila.criterio_2) criterios.push(2)
        if (fila.criterio_3) criterios.push(3)
        previo[fila.prestamo_id] = criterios
      }
      setSeleccion(previo)
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setCargando(false)
    }
  }, [showToast])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const alternar = (prestamoId: number, criterio: number) => {
    haptics.light()
    setSeleccion((previo) => {
      const actuales = previo[prestamoId] ?? []
      const siguientes = actuales.includes(criterio)
        ? actuales.filter((c) => c !== criterio)
        : [...actuales, criterio]
      return { ...previo, [prestamoId]: siguientes }
    })
  }

  const aplicar = async () => {
    setGuardando(true)
    try {
      const respuestas = filas.map((fila) => ({
        prestamo_id: fila.prestamo_id,
        criterios: seleccion[fila.prestamo_id] ?? [],
      }))
      await rpc('fn_saneamiento_vinculos_responder', { p_respuestas: respuestas })
      haptics.success()
      showToast(t('prestamos_vinculos_guardado'), 'success')
      onAplicado()
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="prestamos-vinculos" aria-label={t('prestamos_vinculos_titulo')}>
      <header className="prestamos-vinculos-head">
        <h3 className="font-display">{t('prestamos_vinculos_titulo')}</h3>
        <button type="button" className="prestamos-modal-close" onClick={onCerrar} aria-label={t('prestamos_vinculos_cerrar')}>
          ×
        </button>
      </header>

      {cargando ? (
        <div className="prestamos-loading-mini">
          <div className="spinner" />
        </div>
      ) : filas.length === 0 ? (
        <p className="prestamos-hint">{t('prestamos_vinculos_sin_personas')}</p>
      ) : (
        <>
          <p className="prestamos-hint">{t('prestamos_vinculos_intro')}</p>

          {PREGUNTAS.map((pregunta) => (
            <div key={pregunta.criterio} className="prestamos-pregunta">
              <p className="prestamos-pregunta-texto" id={`pregunta-${pregunta.criterio}`}>
                {t(pregunta.clave)}
              </p>
              <span className="prestamos-pregunta-peso">
                {t('prestamos_vinculos_peso', { peso: pregunta.peso })}
              </span>
              <div
                className="prestamos-chips"
                role="group"
                aria-labelledby={`pregunta-${pregunta.criterio}`}
              >
                {filas.map((fila) => {
                  const activo = (seleccion[fila.prestamo_id] ?? []).includes(pregunta.criterio)
                  return (
                    <button
                      key={`${pregunta.criterio}-${fila.prestamo_id}`}
                      type="button"
                      className={`prestamos-chip ${activo ? 'is-activo' : ''}`}
                      aria-pressed={activo}
                      aria-label={`${t(pregunta.clave)} — ${fila.contraparte}`}
                      onClick={() => alternar(fila.prestamo_id, pregunta.criterio)}
                    >
                      {fila.contraparte}
                      <span className="prestamos-chip-sub">
                        {montoONoCalculable(numero(fila.saldo_pendiente), fila.moneda)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="prestamos-vinculos-actions">
            <button type="button" className="btn btn-secondary" onClick={onCerrar}>
              {t('btn_cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void aplicar()} disabled={guardando}>
              {guardando ? t('prestamos_vinculos_aplicando') : t('prestamos_vinculos_aplicar')}
            </button>
          </div>
        </>
      )}

      <p className="prestamos-nota">{t('prestamos_vinculos_ayuda')}</p>
    </section>
  )
}
