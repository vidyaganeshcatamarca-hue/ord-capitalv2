# Feature: Onboarding de País, Idioma y Moneda (multiglobal)

PRD de origen: `docs/varias/funcion paises.md`
Spec: `docs/superpowers/specs/2026-10-12-onboarding-pais-idioma-moneda-design.md`
Propuesta SQL: `propuestas/PROPUESTA_onboarding_pais_idioma_moneda_WU1.md`
Rama: `fix/archivar-billetera-y-orientacion-pc`

## Decisión del dueño (2026)

La app se prepara para cobertura mundial (Play Store). El país, el idioma y la moneda
del usuario pasan a ser **datos**, no código:

- El resolver de idioma se construye para **N idiomas**; hoy se carga solo `es`.
- El catálogo de países y monedas vive en **Supabase**; crecer es encender una bandera.
- **Sin default silencioso de país.** El paso de país se muestra siempre y exige confirmación.
- El país define la **moneda local**; la segunda moneda es **siempre USD**.
- **Sin IP ni GPS**: la región se infiere del locale del dispositivo y, si no hay señal, el usuario elige.
- Nada hardcodeado: lo que cambia según el país es dato; lo que es regla de producto es constante nombrada.
- Los usuarios existentes **no** se migran (quedan donde están); se arregla para los nuevos.

## Corte en work units

| WU | Alcance | Estado |
|---|---|---|
| WU1 | Supabase: catálogo, RPC, migración y funciones de moneda | ✅ hecha |
| WU2 | i18n N idiomas + `LanguageContext` + selector de idioma | pendiente |
| WU3 | Catálogo en el cliente + paso de país en el onboarding + derivación regional | pendiente |
| WU4a | Símbolo y decimales desde el catálogo (`useNumberFormat` + los 6 archivos top) | pendiente |
| WU4b | Resto de los ~41 archivos con moneda hardcodeada | pendiente |
| WU5 | Cotizaciones y cron: que cubra las monedas de los países `soportado = true` | pendiente |

## Tareas

### WU1 — Ejecutada el 2026-10-12

- [x] Fase 0: inspección read-only del estado real (3 scripts en `temp_sql/`). Resultados en la §1.b de la propuesta.
- [x] Tablas `p_monedas` (153 filas) y `p_paises` (249 filas) + `fn_obtener_paises()`.
- [x] Seed generado con CLDR + ICU del runtime (`temp_sql/gen_seed_paises.mjs`) y validado contra los tipos de columna.
- [x] Activación de 72 países (`soportado = true`). Paraguay → PYG, España → EUR, EE.UU. → USD.
- [x] Migración de `p_config_region`: país y moneda nullable, `origen_pais`, `confirmado_at`.
- [x] 9 funciones modificadas + `formato_hora` en preferencias.
- [x] `[H1]` `fn_configurar_inflacion` arreglada (consultaba una tabla inexistente).
- [x] `[H2a]` Los 2 reportes cotizan con la moneda local en vez de la fila `'USD'`.
- [x] Test transaccional: **18/18 PASS**, con ROLLBACK verificado. Sin RPC de testing persistido.
- [x] Espejos de `funcionesSQL/` sincronizados desde la base (14 archivos) + índice #255.
- [x] Claves de error nuevas en `src/locales/es.ts`.

Evidencia: `temp_sql/run_test_wu1.mjs` (18 aserciones), `temp_sql/20_seed_review.md` (revisión del catálogo),
`temp_sql/_generated/` (parches aplicados), `temp_sql/_live/` (cuerpos previos, para revertir).

### Pendiente en WU1

- [x] `[H4]` Los 3 overloads legado eliminados el 2026-10-12, aprobados uno a uno por el dueño:
      `fn_crear_billetera(text,text,numeric,text)` (oid 27228), `fn_reporte_safe_to_spend(uuid,uuid)` (29110)
      y `fn_reporte_patrimonio_neto_consolidado(uuid)` (29112). Se borraron por **firma exacta**, nunca
      por nombre. Verificación 9/9 PASS, incluida la prueba decisiva de que una llamada de 3 argumentos
      ya no falla con `is not unique`. Script: `temp_sql/h4_drop_overloads.mjs`.
- [ ] `[H5]` Reportar y rotar el `CRON_SECRET` que está en texto plano dentro de `cron.job`.
- [x] Commit de la WU1: `ea0c790`

### WU2 — próximas tareas

- [ ] `LanguageContext` reactivo (`useSyncExternalStore` o equivalente) + `setLanguage` cableado.
- [ ] `SUPPORTED = ['es']`, cadena de fallback `pedido → es → clave`.
- [ ] Persistencia en localStorage y en `p_config_region.idioma_default`.
- [ ] Precedencia: preferencia guardada > locale del dispositivo > `idioma_sugerido` del país > `es`.
- [ ] Selector de idioma en Configuración (y en el onboarding), funcional con una sola opción.
- [ ] Tests con diccionario falso de 3 claves: resolver, fallback, persistencia, re-render.

### WU2 — Hecha el 2026-10-12

- [x] `src/locales/language.ts` — módulo puro **sin imports** (requisito para que los tests lo importen directo con Node): `SUPPORTED`, `Lang`, `DEFAULT_LANG`, `isSupported`, `normalizeLocale`, `parseDeviceLocales`, `resolveRegionFromLocale`, `resolveLanguage` y `fallbackChain`.
- [x] `src/locales/i18n.ts` — mapas de diccionarios, `getLanguage`, `subscribe`, `setLanguage` con caída a `DEFAULT_LANG`, y `t()` recorriendo la cadena de fallback sin tocar el orden plano/`seccion.clave` ni el final `defaultValue || key`.
- [x] `src/locales/LanguageProvider.tsx` — contexto, persistencia en `localStorage['ord_lang']`, `useSyncExternalStore` y remount por `key={lang}`.
- [x] `src/App.tsx` — provider dentro de `ModoAppProvider`, con el tracker de telemetría afuera del límite de remount.
- [x] Selector de idioma funcional en `RegionFormatoPage`, etiquetas vía `Intl.DisplayNames` (verificado en runtime: `es` → "español").
- [x] Tests con `node:test` que importan el código real: **27/27 PASS**.
- [x] `npx tsc --noEmit` limpio.

Decisiones del writer que vale la pena registrar: el provider va **debajo** de auth/toast/modo (arriba,
un cambio de idioma re-dispararía el bootstrap de sesión); `TelemetryRouteTracker` queda fuera del
límite de remount (adentro duplicaba `main_module_opened`); y los tests afirman invariantes que
sobreviven al crecimiento, no que el catálogo tenga un solo idioma.

### Deuda anotada que NO es de esta WU

- `tests/lib/locales/i18n.js` es una **copia precompilada vieja** de `i18n.ts`: `i18n-nested-keys.test.js` hoy no testea el módulo real. Preexistente.
- `RegionFormatoPage` guarda `idioma_default` con la misma llamada que configura el país. Con la §6.10 ya no miente sobre la confirmación, pero WU3 tiene que decidir si el idioma merece su propio camino.

### WU3 — próximas tareas

- [ ] Consumir `fn_obtener_paises()` con cache; sin snapshot embarcado.
- [ ] `LocaleResolver.resolveRegionFromLocale()` a partir de `navigator.language(s)`.
- [ ] Buscador de países: `Intl.DisplayNames` (es + en) + ISO + sin acentos, lista vacía hasta escribir.
- [ ] Paso de país/idioma obligatorio, con "Continuar" deshabilitado si no hay selección.
- [ ] Reordenar el onboarding: el país se persiste **antes** de la billetera.
- [ ] Quitar el selector de moneda del slide de billetera (la define el país).
- [ ] Versionar `localStorage['onboarding_slide']` a `_v2` y migrar el valor guardado.
- [ ] Derivar los defaults regionales con `fn_actualizar_preferencia_usuario`.
- [ ] Selector de `formato_hora` en RegionFormatoPage.
- [ ] Actualizar el catálogo hardcodeado de `RegionFormatoPage` para que salga de la RPC.
- [ ] Cubrir país nullable en `src/voice/contextBuilder.ts` y en `fn_admin_ficha_usuario`.

## Notas de implementación

- El seed **no** se escribe a mano: sale de CLDR (`cldr-core` vía unpkg, cacheado en `temp_sql/_cldr/`)
  más `Intl.NumberFormat` / `Intl.DateTimeFormat` del runtime. Validación de tipos antes de emitir.
- `primer_dia_semana` es 1 (lunes) para todos por decisión de producto, aunque CLDR diga otra cosa.
- `formato_hora` es 24h por defecto, salvo 16 países donde el uso de 12h es seguro (US, MX, CA, PR, AU, NZ,
  IN, PH, SG, MY, KR, TW, HK, AE, SA, QA). Es preferencia editable por el usuario.
- `p_moneda_local` sigue en la firma de `fn_configurar_region_usuario` pero **el servidor la ignora**:
  la moneda la define el país.
- Trampa de Postgres documentada: agregar un parámetro con `CREATE OR REPLACE` crea un **overload nuevo**
  en vez de reemplazar. Por eso `fn_obtener_region_usuario`, `fn_get_default_currency` y
  `fn_configurar_region_usuario` se recrearon con `DROP` previo.
