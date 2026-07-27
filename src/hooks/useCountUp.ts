// src/hooks/useCountUp.ts
// Hook que anima un numero desde su valor anterior hasta el target
// durante `duration` ms, con curva ease-out cubic. Se usa en el hero card
// del Home para que el monto del patrimonio "acelere" como un velocimetro
// de 0 al total cada vez que se monta la pantalla.
//
// Reglas:
// - Si `prefers-reduced-motion: reduce` esta activo, retorna el target
//   inmediatamente (sin animar).
// - Si el target cambia a mitad de la animacion, reinicia desde el valor
//   actual (no desde 0) para que sea una transicion suave.
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

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useCountUp(
  target: number,
  { duration = 1200, easing = easeOutCubic, reducedMotion }: UseCountUpOptions = {}
): number {
  const safeTarget = Number.isFinite(target) ? target : 0
  const [value, setValue] = useState<number>(safeTarget)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const startValueRef = useRef<number>(safeTarget)
  const lastTargetRef = useRef<number>(safeTarget)

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
      lastTargetRef.current = safeTarget
      return
    }

    // Si veniamos animando, retomar desde el valor actual para suavizar
    // la transicion entre targets.
    startValueRef.current = value
    lastTargetRef.current = safeTarget

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
    // intencionalmente solo dependemos de safeTarget para re-disparar al cambiar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTarget, duration, reducedMotion])

  return value
}
