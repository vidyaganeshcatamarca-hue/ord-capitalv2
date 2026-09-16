/**
 * TelemetryRouteTracker — single instrumentation point for main navigation.
 *
 * Mounted once inside BrowserRouter. Maps the current pathname to a canonical
 * module name and emits main_module_opened (with previous_module) plus the
 * once-per-session *_session_viewed events defined in the PRD (Fase 3, 14.6,
 * 15.3). No per-subscreen tracking (PRD §10.3).
 */

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { telemetry } from '@/lib/telemetry'

// Canonical module names for telemetry (PRD §10.2 values + extra ORD modules).
const ROUTE_MODULE_MAP: Array<[RegExp, string]> = [
  [/^\/$/, 'home'],
  [/^\/billeteras/, 'wallets'],
  [/^\/tarjetas/, 'cards'],
  [/^\/presupuesto/, 'budget'],
  [/^\/configuracion/, 'settings'],
  [/^\/cuarentena/, 'cuarentena'],
  [/^\/familia/, 'familia'],
  [/^\/analisis-emocional/, 'bcg'],
  [/^\/supervivencia/, 'supervivencia'],
  [/^\/saneamiento/, 'saneamiento'],
  [/^\/inversiones/, 'inversiones'],
  [/^\/salud/, 'salud'],
  [/^\/sobres/, 'sobres'],
  [/^\/privacidad/, 'privacidad']
]

// Modules whose first visit per session is a dedicated *_session_viewed event.
const SESSION_VIEWED_MODULES = new Set(['home', 'cards', 'budget'])

function pathToModule(pathname: string): string {
  for (const [pattern, module] of ROUTE_MODULE_MAP) {
    if (pattern.test(pathname)) return module
  }
  // Fallback: first path segment (or 'other' for unknown roots)
  const segment = pathname.split('/')[1]
  return segment ? segment : 'other'
}

export function TelemetryRouteTracker() {
  const location = useLocation()

  useEffect(() => {
    const module = pathToModule(location.pathname)
    telemetry.trackModule(module)

    if (SESSION_VIEWED_MODULES.has(module)) {
      telemetry.trackOncePerSession(`${module}_session_viewed`)
    }
  }, [location.pathname])

  return null
}