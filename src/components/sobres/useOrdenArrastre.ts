import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { haptics } from '@/lib/haptics'
import type { Sobre } from './types'

/** Cuánto hay que mantener presionada una tarjeta antes de que empiece a moverse. */
const LARGO_PRESION = 350
/** Moverse más que esto antes de tiempo significa que el usuario quería scrollear. */
const TOLERANCIA = 10

interface Opciones {
  sobres: Sobre[]
  /** Persiste el orden elegido. Devuelve false si no se pudo guardar. */
  onPersistir: (sobreIds: number[]) => Promise<boolean>
}

/**
 * Orden por arrastre con presión sostenida, sin librerías: en móvil el primer
 * arrastre convierte la lista en orden manual (fn_sobres_reordenar pone
 * orden_manual = true). Se descarta el orden local cuando llegan datos nuevos
 * del servidor, que ya vienen ordenados.
 *
 * El cierre del arrastre se escucha en el documento: al capturar el puntero el
 * navegador emite lostpointercapture antes del pointerup, y ese pointerup ya no
 * apunta a la tarjeta, así que un handler montado solo en la tarjeta nunca ve
 * el final del gesto.
 */
export function useOrdenArrastre({ sobres, onPersistir }: Opciones) {
  const [orden, setOrden] = useState<number[] | null>(null)
  const [arrastrando, setArrastrando] = useState<number | null>(null)

  const contenedor = useRef<HTMLElement | null>(null)
  const timer = useRef<number | null>(null)
  const origen = useRef<{ id: number; x: number; y: number; pointerId: number; el: HTMLElement } | null>(null)
  const ordenRef = useRef<number[] | null>(null)
  const ignorarClick = useRef(false)
  /** Espejo del estado para que soltar no dependa de un closure que puede venir viejo. */
  const arrastrandoRef = useRef<number | null>(null)

  useEffect(() => {
    ordenRef.current = null
    setOrden(null)
  }, [sobres])

  const ordenados = useMemo(() => {
    if (orden === null) return sobres
    const porId = new Map(sobres.map((s) => [s.sobre_id, s]))
    const lista: Sobre[] = []
    for (const id of orden) {
      const sobre = porId.get(id)
      if (sobre) lista.push(sobre)
    }
    for (const sobre of sobres) {
      if (!orden.includes(sobre.sobre_id)) lista.push(sobre)
    }
    return lista
  }, [sobres, orden])

  const cancelarTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const iniciar = useCallback(
    (event: ReactPointerEvent, sobre: Sobre) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const el = event.currentTarget as HTMLElement
      origen.current = { id: sobre.sobre_id, x: event.clientX, y: event.clientY, pointerId: event.pointerId, el }
      cancelarTimer()
      const ids = sobres.map((s) => s.sobre_id)
      timer.current = window.setTimeout(() => {
        timer.current = null
        const actual = origen.current
        if (!actual) return
        ordenRef.current = ids
        arrastrandoRef.current = actual.id
        setOrden(ids)
        setArrastrando(actual.id)
        ignorarClick.current = true
        haptics.medium()
        try {
          actual.el.setPointerCapture(actual.pointerId)
        } catch {
          // Si no se puede capturar, el arrastre sigue por los eventos del documento.
        }
      }, LARGO_PRESION)
    },
    [sobres, cancelarTimer],
  )

  const mover = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const actual = origen.current
      if (!actual) return
      const idArrastrado = arrastrandoRef.current

      if (idArrastrado === null) {
        const lejos =
          Math.abs(event.clientX - actual.x) > TOLERANCIA || Math.abs(event.clientY - actual.y) > TOLERANCIA
        if (lejos) cancelarTimer()
        return
      }

      const nodos = contenedor.current?.querySelectorAll<HTMLElement>('[data-sobre-id]')
      if (!nodos || nodos.length === 0) return

      const lista = ordenRef.current ?? []
      const desde = lista.indexOf(idArrastrado)
      if (desde < 0) return

      // El objetivo es la tarjeta cuyo centro está más cerca del dedo: sirve en
      // una columna y también en la grilla de dos columnas del escritorio.
      let destino = desde
      let distancia = Number.POSITIVE_INFINITY
      nodos.forEach((nodo, indice) => {
        const caja = nodo.getBoundingClientRect()
        const dx = event.clientX - (caja.left + caja.width / 2)
        const dy = event.clientY - (caja.top + caja.height / 2)
        const d = dx * dx + dy * dy
        if (d < distancia) {
          distancia = d
          destino = indice
        }
      })
      if (destino === desde || destino < 0 || destino >= lista.length) return

      const siguiente = [...lista]
      const [movido] = siguiente.splice(desde, 1)
      siguiente.splice(destino, 0, movido)
      ordenRef.current = siguiente
      setOrden(siguiente)
      haptics.light()
    },
    [cancelarTimer],
  )

  const soltar = useCallback(async () => {
    cancelarTimer()
    const actual = origen.current
    origen.current = null
    if (actual) {
      try {
        if (actual.el.hasPointerCapture(actual.pointerId)) actual.el.releasePointerCapture(actual.pointerId)
      } catch {
        // La captura ya no estaba; no hay nada que liberar.
      }
    }

    const idArrastrado = arrastrandoRef.current
    arrastrandoRef.current = null
    if (idArrastrado === null) return

    const ids = ordenRef.current ?? []
    setArrastrando(null)
    if (ids.length < 2) return

    const guardado = await onPersistir(ids)
    if (!guardado) {
      ordenRef.current = null
      setOrden(null)
    }
    // El click de la tarjeta llega inmediatamente después del pointerup.
    window.setTimeout(() => {
      ignorarClick.current = false
    }, 0)
  }, [cancelarTimer, onPersistir])

  /**
   * Mientras hay un arrastre activo, el final del gesto se escucha en el
   * documento. Con la captura del puntero el navegador emite
   * lostpointercapture antes del pointerup y ese pointerup ya no llega a la
   * tarjeta; sin esto el arrastre nunca se cerraba ni se guardaba.
   */
  useEffect(() => {
    if (arrastrando === null) return

    const alSoltar = () => {
      void soltar()
    }
    const alMover = (event: PointerEvent) => {
      mover(event)
    }

    document.addEventListener('pointerup', alSoltar, true)
    document.addEventListener('pointercancel', alSoltar, true)
    document.addEventListener('pointermove', alMover, true)

    return () => {
      document.removeEventListener('pointerup', alSoltar, true)
      document.removeEventListener('pointercancel', alSoltar, true)
      document.removeEventListener('pointermove', alMover, true)
    }
  }, [arrastrando, soltar, mover])

  const propsItem = useCallback(
    (sobre: Sobre) => ({
      'data-sobre-id': sobre.sobre_id,
      className: `sobres-item${arrastrando === sobre.sobre_id ? ' sobres-item--arrastrando' : ''}`,
      onPointerDown: (event: ReactPointerEvent) => iniciar(event, sobre),
      onPointerMove: mover,
      onPointerUp: soltar,
      onPointerCancel: soltar,
      onClickCapture: (event: React.MouseEvent) => {
        if (!ignorarClick.current) return
        event.preventDefault()
        event.stopPropagation()
      },
    }),
    [arrastrando, iniciar, mover, soltar],
  )

  return { ordenados, arrastrando, contenedor, propsItem }
}
