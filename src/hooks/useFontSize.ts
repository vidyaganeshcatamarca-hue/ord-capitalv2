import { useCallback, useEffect, useState } from 'react'

export type FontSize = 'chico' | 'mediano' | 'grande' | 'gigante'

const STORAGE_KEY = 'tamanio_fuente'
const ATTR = 'data-font-size'
const VALID: FontSize[] = ['chico', 'mediano', 'grande', 'gigante']
const DEFAULT: FontSize = 'mediano'

function isValid(v: string | null | undefined): v is FontSize {
  return !!v && (VALID as string[]).includes(v)
}

export function getCurrentFontSize(): FontSize {
  if (typeof document === 'undefined') return DEFAULT
  const attr = document.documentElement.getAttribute(ATTR) as FontSize | null
  if (isValid(attr)) return attr
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (isValid(stored)) return stored
  return DEFAULT
}

export function applyFontSize(value: FontSize): void {
  if (!isValid(value)) return
  document.documentElement.setAttribute(ATTR, value)
  try { window.localStorage.setItem(STORAGE_KEY, value) } catch { /* localStorage may be disabled */ }
}

export function useFontSize() {
  const [current, setCurrent] = useState<FontSize>(() => getCurrentFontSize())

  const apply = useCallback((v: FontSize) => {
    applyFontSize(v)
    setCurrent(v)
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isValid(e.newValue)) {
        applyFontSize(e.newValue)
        setCurrent(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { current, apply }
}
