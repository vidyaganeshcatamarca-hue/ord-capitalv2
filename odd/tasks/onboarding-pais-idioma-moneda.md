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

- [ ] `[H4]` Decidir si se borra el overload viejo de `fn_crear_billetera` (oid 27228, 4 argumentos): hace
      ambigua cualquier llamada con menos de 5 argumentos (`function is not unique`). El cliente manda
      los 5, así que hoy no rompe, pero es una mina. Igual caso en `fn_reporte_safe_to_spend` (29110) y
      `fn_reporte_patrimonio_neto_consolidado` (29112), ambos con `p_user_id uuid`.
- [ ] `[H5]` Reportar y rotar el `CRON_SECRET` que está en texto plano dentro de `cron.job`.
- [ ] Commit de la WU1 (pendiente de pedido explícito del dueño).

### WU2 — próximas tareas

- [ ] `LanguageContext` reactivo (`useSyncExternalStore` o equivalente) + `setLanguage` cableado.
- [ ] `SUPPORTED = ['es']`, cadena de fallback `pedido → es → clave`.
- [ ] Persistencia en localStorage y en `p_config_region.idioma_default`.
- [ ] Precedencia: preferencia guardada > locale del dispositivo > `idioma_sugerido` del país > `es`.
- [ ] Selector de idioma en Configuración (y en el onboarding), funcional con una sola opción.
- [ ] Tests con diccionario falso de 3 claves: resolver, fallback, persistencia, re-render.

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
