// src/hooks/useCountUp.ts
// Hook que anima un numero desde su valor anterior hasta el target
// durante `duration` ms, con curva ease-out cubic. Se usa en el hero card
// del Home para que el monto del patrimonio "acelere" como un velocimetro
// de 0 al total cada vez que se monta la pantalla.
//
// Reglas:
// - En el PRIMER mount, anima desde 0 hasta el target (efecto velocimetro).
//   En renders subsiguientes con target cambiante, anima desde el valor
//   actual al nuevo target (transicion suave, no reset a 0).
// - Si `prefers-reduced-motion: reduce` esta activo, retorna el target
//   inmediatamente (sin animar).
// - Si duration <= 0 o NaN, retorna el target sin animar.

import { useEffect, useRef, useState } from 'react'

export interface UseCountUpOptions {
  /** Duracion total de la animacion en ms. Default: 1200. */
  duration?: number
  /** Funcion de easing. Default: easeOutCubic. */
  easing?: (t: number) => number
  /** Override manual de reduced-motion. Si no se pasa, detecta el media query. */
  reducedMotion?: boolean
}

export function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return 1 - Math.pow(1 - clamped, 3)
}

/**
 * Easing "velocimetro" para el hero card: arranca con aceleracion fuerte
 * y frena visiblemente en el ultimo ~50% del timeline (asi el numero no
 * se "estrella" contra el target final). Pensado para una duration de
 * ~1000ms donde el freno ocupa ~500ms.
 *
 *  - t in [0, 0.5]: easeOutCubic -> cubre ~80% del valor (aceleracion)
 *  - t in [0.5, 1]: easeOutQuad  -> cubre los ultimos 20% (freno suave)
 */
export function speedometerEase(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped < 0.5) {
    const u = clamped * 2
    return 0.8 * (1 - Math.pow(1 - u, 3))
  } else {
    const u = (clamped - 0.5) * 2
    return 0.8 + 0.2 * (1 - Math.pow(1 - u, 2))
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useCountUp(
  target: number,
  { duration = 1000, easing = speedometerEase, reducedMotion }: UseCountUpOptions = {}
): number {
  const safeTarget = Number.isFinite(target) ? target : 0
  // Estado: arranca en 0 SIEMPRE. La animacion lo lleva al target en el
  // primer effect run. En renders subsiguientes, el effect detecta que ya
  // hubo un primer mount y reanuda desde el valor actual (no resetea a 0).
  const [value, setValue] = useState<number>(0)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const startValueRef = useRef<number>(0)
  const firstRunRef = useRef<boolean>(true)

  useEffect(() => {
    // Cancelar cualquier animacion pendiente.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    startTimeRef.current = null

    const motionOff = reducedMotion ?? prefersReducedMotion()
    if (motionOff || duration <= 0) {
      setValue(safeTarget)
      firstRunRef.current = false
      return
    }

    // En el primer mount arrancamos desde 0 (efecto velocimetro). En
    // renders siguientes (target cambia), arrancamos desde el valor actual
    // para que la transicion sea suave.
    startValueRef.current = firstRunRef.current ? 0 : value
    firstRunRef.current = false

    const tick = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now
      const elapsed = now - startTimeRef.current
      const progress = Math.min(1, elapsed / duration)
      const eased = easing(progress)
      const current = startValueRef.current + (safeTarget - startValueRef.current) * eased
      setValue(current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
        setValue(safeTarget) // snap final por seguridad
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    // intencionalmente solo dependemos de safeTarget para re-disparar al cambiar.
    // `value` se lee via closure para retomar la animacion desde donde quedo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTarget, duration, reducedMotion])

  return value
}
