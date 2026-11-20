import { useNumberFormat } from '@/hooks/useNumberFormat'

/**
 * Publica el contexto compartido de formato para el módulo de Préstamos.
 *
 * Las funciones de `lib/format.ts` (`formatCurrency`, `formatDate`, …) leen un
 * valor de módulo que publica `useNumberFormat`; por eso cada pantalla que las
 * usa tiene que montarlo. Home, Billeteras, Tarjetas y Presupuestos lo hacen. El
 * módulo de Préstamos era el único que sólo SE SUSCRIBÍA (`useFormatRevision`) y
 * nunca publicaba: en carga en frío de `/prestamos/*` el contexto se quedaba en su
 * default `es-AR` y una interfaz en inglés seguía mostrando «10 oct 2026» y
 * separadores argentinos.
 *
 * Por qué acá y no dentro del calendario: el módulo tiene cinco rutas que se
 * cargan en frío por separado (`/prestamos`, `/debo`, `/me-deben`, `/saneamiento`,
 * `/calendario`, `/pareja`), así que cada entrada monta este único publicador y
 * ninguna pantalla arrastra el contexto de otra. Montarlo dentro del calendario
 * dejaba las otras cuatro secciones sin publicar, y el calendario no es la raíz del
 * módulo.
 *
 * Por qué no es un segundo publicador que compita: `useNumberFormat` ES el
 * publicador —este componente sólo lo monta— y hoy no puede pisar un contexto
 * bueno con uno incompleto:
 *   1. no publica nada mientras la región no esté resuelta (F-08), así que una
 *      instancia recién montada nunca escribe `ARS` ni un locale sin país;
 *   2. la región se pide una sola vez por usuario (memo en `useNumberFormat`), así
 *      que todas las instancias reciben el mismo país y el mismo locale;
 *   3. el locale sale de `buildLocale(idioma, país)`: el idioma decide las fechas y
 *      la forma del número, y el país decide la moneda local y los separadores
 *      regionales.
 *
 * El intento anterior que rompió la moneda no falló por competir: falló porque el
 * inglés renderiza USD como `$` en todas sus regiones. Eso se resuelve en la
 * moneda del importe (`montoMoneda` en `./formato.ts`), no acá.
 */
export function ContextoFormatoPrestamos() {
  useNumberFormat()
  return null
}

export default ContextoFormatoPrestamos
