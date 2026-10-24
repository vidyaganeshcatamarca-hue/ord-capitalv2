/**
 * ¿Hay algo para guardar en la configuración de inflación?
 *
 * Dueño, 2026-10-23: "La primera vez que entras a la pestaña de inflación aparece
 * el botón guardar, pero no se ha hecho ningún cambio en la fuente de inflación.
 * [...] el botón guardar solo aparece cuando hay cambios en la fuente."
 *
 * El bug era una bandera `configurado` que, cuando el RPC decía `false` (el usuario
 * nunca guardó nada, aunque el proxy dólar ya esté aplicado por defecto), forzaba
 * "hay cambios". La verdad no es "¿guardó alguna vez?", es "¿el formulario difiere
 * de lo guardado?".
 *
 * Reglas:
 *  - proxy dólar es el default: entrar sin tocar nada NO es un cambio;
 *  - un país sin valor guardado no es un cambio (es el derivado del dispositivo);
 *  - manual sin valor guardado es cambio recién cuando hay un valor válido tipeado;
 *  - mismo valor numérico con distinto texto (`35` vs `35.00`) no es un cambio.
 */

export type FuenteInflacionValue = 'proxy_dolar' | 'manual' | 'desactivado' | string

export interface InflacionFormState {
  pais: string
  fuente: FuenteInflacionValue
  valorManual: string
}

export interface InflacionSavedState {
  pais: string | null
  fuente: FuenteInflacionValue
  valorManual: number | null
}

export function hayCambiosInflacion(
  form: InflacionFormState,
  guardado: InflacionSavedState
): boolean {
  // País: si nunca se guardó, el valor del formulario es el derivado del
  // dispositivo y no representa una decisión del usuario.
  if (guardado.pais !== null && form.pais !== guardado.pais) return true

  if (form.fuente !== guardado.fuente) return true

  if (form.fuente === 'manual') {
    const texto = form.valorManual.trim()
    const valor = Number(texto)
    const valido = texto !== '' && Number.isFinite(valor) && valor > 0

    if (guardado.valorManual === null) return valido
    if (!valido) return false
    return Math.abs(valor - guardado.valorManual) > 0.0001
  }

  return false
}
