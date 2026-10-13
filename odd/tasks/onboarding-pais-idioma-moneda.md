# Feature: Onboarding de País, Idioma y Moneda (multiglobal)

PRD de origen: `docs/varias/funcion paises.md`
Spec: `docs/superpowers/specs/2026-10-12-onboarding-pais-idioma-moneda-design.md`
Propuesta SQL: `propuestas/PROPUESTA_onboarding_pais_idioma_moneda_WU1.md`
Rama: `fix/archivar-billetera-y-orientacion-pc`

## ⚠️ PENDIENTE CRÍTICO: revertir el desbloqueo transitorio después del deploy

El 2026-10-12 se aplicó un **desbloqueo transitorio** en `fn_crear_billetera`,
`fn_crear_billetera_inicial` y `fn_crear_billeteras_iniciales`: **si el usuario no tiene país confirmado,
se acepta la moneda que manda el cliente** (validada contra `p_monedas`) en vez de lanzar
`error_region_not_configured`.

**Por qué:** la base es compartida entre desarrollo y producción. Los cambios de la WU1 quedaron vivos
en la base mientras el frontend de producción siguió siendo el viejo, que no tiene paso de país. Los
usuarios nuevos quedaban atrapados sin poder crear su primera billetera: **5 usuarios verificados**
(ids 178 a 182) con `pais_codigo = NULL` y 0 billeteras.

**Qué hacer cuando el frontend nuevo esté deployado:**

1. Quitar la rama transitoria de las 3 funciones y volver a `RAISE EXCEPTION` con
   `error_region_not_configured` cuando no hay país.
2. Invertir las aserciones **5** y **5c** del test transaccional, que son las que documentan el
   comportamiento transitorio.
3. Verificar que no queden usuarios con país nulo creando billeteras.

Scripts del parche: `temp_sql/38_desbloqueo_transitorio.mjs` y `temp_sql/38b_transitorio_contra_catalogo.mjs`.
El aviso también quedó en los espejos de las 3 funciones.

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

### WU3a — Hecha el 2026-10-12

- [x] `src/lib/countryCatalog.ts` — módulo puro **sin imports**: normalización de filas de PostgREST (trim solo a los `char(n)`; los `text` como `' '` se preservan), índice de búsqueda con nombres en `es` + `en` + ISO + sin acentos, `searchCountries` con prefijo antes que contenido y vacío con query vacía, `findCountry`, `regionalDefaults`, y los helpers de presentación (`regionName`, `currencyName`, `flagEmoji`) que derivan de `Intl.DisplayNames` y del código.
- [x] `src/lib/useCountryCatalog.ts` — `fn_obtener_paises()` por RPC, cache en `localStorage['ord_countries_v1']`, refresco en background, error con reintento. Sin catálogo embarcado.
- [x] `src/components/onboarding/CountryStep.tsx` + `CountrySearchModal.tsx` — paso obligatorio, preselección por locale, confirmación explícita, buscador con lista vacía hasta escribir y máximo 8 resultados.
- [x] `AuthPage.tsx` — paso de país como slide 3 (billetera 4, día ancla 5, modo 6), clave `onboarding_slide_v2` con migración `+1` para índices >= 3, selector de moneda y `CurrencyCode` eliminados, `p_cuenta_moneda` ya no se envía.
- [x] 9 claves `onboarding_country_*` en `es.ts`.
- [x] Tests del módulo puro: **16/16 PASS**.
- [x] `npx tsc --noEmit` limpio.
- [x] Guard propio (no pedido al writer): al reanudar se consulta `fn_obtener_region_usuario` y, si el país **no** está confirmado, se vuelve al slide 3. Sin esto, una sesión que quedó a medias antes de que existiera el paso de país migraba a 4 y se salteaba la elección, quedándose con el `AR` viejo del trigger.

Evidencia: `tests/onboarding/country-catalog.test.js`, `src/lib/countryCatalog.ts`, `src/pages/Auth/AuthPage.tsx`.

### Deuda anotada de WU3a

- `regionalDefaults()` está exportado pero **todavía no se consume**: el paso de país solo llama a `fn_configurar_region_usuario`. Persistir los defaults derivados con `fn_actualizar_preferencia_usuario` es la WU3b.
- Al reanudar directo en el slide de billetera, el símbolo del saldo queda vacío en vez de mostrar `$` a la fuerza. Lo cablea WU4a contra el catálogo.
- Al quitar el selector de moneda quedaron **9 claves sin consumidor** en `es.ts` (`country_ar` … `country_uy`, `label_country_residence`). El gate las reporta como advertencia, no como falla.

### WU3c — Hecha el 2026-10-12

Detección de país por IP, con el orden que decidió el dueño tras ver que un navegador en `es-ES`
le sugería España estando en Argentina.

- [x] `api/geo.ts` — endpoint de Vercel que lee `x-vercel-ip-country`. Sin terceros: Vercel ya termina la
      conexión, así que no entra un nuevo procesador de datos. Devuelve `{ country: null }` cuando el
      header no está (Vercel no lo setea en local).
- [x] `vercel.json` — el rewrite comodín pasó a `/((?!api/).*)` para no tapar `/api/*`. La doc de Vercel
      pide envolver la regex en un parámetro sin nombre para el lookahead negativo.
- [x] `src/lib/countrySuggestion.ts` — módulo puro con el orden: **en nativo gana el dispositivo**, **en
      web gana la IP** y el navegador queda de último recurso. Sin señal, no hay sugerencia.
- [x] `CountryStep` — pide la IP una vez (con timeout de 2,5 s), espera a tener las dos señales antes de
      decidir, y registra el origen real (`ip` | `locale` | `manual`).
- [x] DDL: el `CHECK` de `origen_pais` acepta `'ip'` (el PRD §20 lo pide y sin eso la confirmación fallaba).
- [x] Tests del módulo puro: el caso reportado (IP AR + locale ES → AR), y los 7 restantes. **8/8**.

**Pendiente de verificar en el deploy:** los headers de geolocalización no existen en local, así que el
endpoint solo se puede probar después de deployar. Para comprobarlo: `curl https://<dominio>/api/geo`
debe devolver `{"country":"AR"}` desde una conexión argentina.

### WU3b — próximas tareas

- [ ] Consumir `fn_obtener_paises()` con cache; sin snapshot embarcado. **Hecho en WU3a.**
- [ ] `LocaleResolver.resolveRegionFromLocale()` a partir de `navigator.language(s)`. **Hecho en WU3a.**
- [ ] Buscador de países: `Intl.DisplayNames` (es + en) + ISO + sin acentos, lista vacía hasta escribir. **Hecho en WU3a.**
- [ ] Paso de país/idioma obligatorio, con "Continuar" deshabilitado si no hay selección. **Hecho en WU3a.**
- [ ] Reordenar el onboarding: el país se persiste **antes** de la billetera. **Hecho en WU3a.**
- [ ] Quitar el selector de moneda del slide de billetera (la define el país). **Hecho en WU3a.**
- [ ] Versionar `localStorage['onboarding_slide']` a `_v2` y migrar el valor guardado. **Hecho en WU3a.**
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
