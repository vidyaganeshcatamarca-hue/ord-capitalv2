# Feature: i18n-segundo-idioma-en — Inglés como segundo idioma de ORD Capital Personal

Estado: **IMPLEMENTACIÓN AUTORIZADA** (dueño, 2026-10-20). Rama: `feat/i18n-ingles`
(base `ef90cf5`). Todo local: **cero push, cero deploy, cero cambios en Supabase**.

## Specs

### S1 — Alcance: opción A + opción B, con el locale normalizado
> "Vamos con B (ii) , A + los 15 archivos (con cuidado). Lo que se rompe lo arreglamos,
> trabajamos en local , no pasamos nada a produccion."

- **A (flip de idioma):** `src/locales/en.ts` con el diccionario completo; `SUPPORTED`
  pasa a `['es', 'en']`; `dictionaries` en `i18n.ts` pasa a `{ es, en }`.
- **B (normalización de locale):** los **28 hardcodes de `'es-AR'`** que viven en **15
  archivos** de `src/` dejan de estar quemados y siguen el idioma activo del usuario.
- Todo se trabaja en local. **Nada** se pushea ni se despliega a producción.

### S2 — `DEFAULT_LANG` se queda en `'es'`
> "se queda en 'es', luego agregaremos que en onboarding podamos seleccionar idioma tambien
> (ahora esta defaul es), dependiendo de la localizacion si podemos detectar latinoamerica
> español, sino defaul 'en'."

- `DEFAULT_LANG` **permanece `'es'`**. Ningún usuario actual ve un cambio de idioma al
  actualizar la app.
- La detección "latinoamérica español vs default inglés" en onboarding queda **fuera de
  esta entrega** (deuda registrada abajo, S2-b).

### S2-b — Deuda acordada, NO implementada en esta entrega
> "luego agregaremos que en onboarding podamos seleccionar idioma tambien"

- Selector de idioma en onboarding + default por localización (latinoamérica → `es`,
  resto → `en`). **No se implementa ahora.** Anotado como deuda en el Log.

### S3 — El diccionario inglés cubre el 100% de las claves
> "2244 completas."

- Corrección de conteo: el número real de claves es **2288** (no 2244). El parser inicial
  del inventario contaba solo las claves de nombre plano y omitía las **44 claves con
  punto** de la sección `tour` (`'trigger.label'`, `'home.step1.title'`, …). Las 2288
  tienen traducción.
- Se traducen también las ~640 claves "dead" (no las llama ningún call site estático):
  muchas se resuelven por template literal (`t(\`bcg_cuadrante_${key}\`)`) que ningún
  scanner puede ver, y otras pertenecen a módulos en desarrollo.

### S4 — Los placeholders se migran tal cual, nunca se traducen
> "Mucha atención con los placeholders que no deben traducirse sino migrarse talcual"

- Las 207 claves con placeholders (36 con dos o más) conservan **el nombre exacto** de
  cada placeholder: `{monto}`, `{placer}`, `{frec}`, `{dias}`, `{count}`, `{max}`,
  `{min}`, `{field}`, `{buzon}`, `{saldo}`, `{nombre}`, `{icono}`, …
- En inglés, el placeholder va embebido en la frase con la sintaxis natural del inglés
  (`{placer}` puede ir antes o después del sustantivo), **pero el nombre no cambia**.
- Un test verifica, clave por clave, que el conjunto y el orden de placeholders de `en.ts`
  es idéntico al de `es.ts`.

### S5 — Coordinación con PI2 (sesión `Personal-2`)
> "cambia la rama, y pregunta a PI2 que esta haciendo, otro agente en otra sesion va a tocar
> es.ts, coodina con el"

- Rama propia: `feat/i18n-ingles` (creada desde `ef90cf5`).
- Respuesta publicada en Engram: **obs #663 "PI1: respuesta — es.ts en uso"** (responde al
  aviso de PI2, obs #662).
- **Esta entrega NO edita `src/locales/es.ts`.**

## Glosario (tono y terminología)

Registro: **inglés financiero neutro y claro**, no literal. El español rioplatense
(voseo, "podés", "tenés") se traduce a un inglés **sin voseo** ("you can", "you have"),
porque el inglés financiero no lo usa. Segunda persona siempre `you`, nunca `you` +
imperativo seco. Nada de calcos: "podés" → "you can", no "you can" tampoco forzado.

| Español | Inglés | Nota |
|---|---|---|
| billetera | wallet | nunca "billfold" |
| cuenta | account | |
| movimiento | transaction | el título de la app es "Recent activity" |
| egreso / ingreso | expense / income | |
| saldo | balance | `saldo actual` → current balance |
| monto | amount | |
| rubro / subrubro | category / subcategory | el par padre/hijo |
| presupuesto | budget | |
| sobre | envelope | modelo de sobres de presupuesto |
| ahorro | savings | |
| inversión | investment | |
| tarjeta | card | `tarjeta de crédito` → credit card |
| cuota | installment | `en cuotas` → in installments |
| resumen de tarjeta | card statement | |
| conciliación / conciliar | reconciliation / reconcile | |
| pendiente de aprobación | pending approval | la "cuarentena" |
| saneamiento | cleanup | módulo "Saneamiento" |
| supervivencia | survival | |
| escudo de tiempo | time shield | |
| licuadora | blender | módulo de inflación |
| hormigas | ants | gasto pequeño y repetido |
| podadora | mower | recortes de gastos |
| ROI Emocional | Emotional ROI | conserva "ROI" |
| día ancla | anchor day | |
| base cero | zero base | |
| modo libertad | free mode | presupuesto anticipado |
|_MONEDA | currency | |
| ARS / USD | ARS / USD | los códigos no se traducen |
| plazo fijo | fixed-term deposit | |
| cedear | CEDEAR | sigla, no se traduce |
| informe / reporte | report | |
| tour | tour | no "walkthrough" |

## Tasks

| ID | Specs | Tarea | Ruta | Commit |
|----|-------|-------|------|--------|
| T1 | S4, S3 | Test de paridad `es.ts`↔`en.ts` (mismas claves, mismos placeholders, sin español filtrado) + test de locale sin hardcodes. **RED primero.** | `tests/i18n/en-dictionary-parity.test.js`, `tests/i18n/locale-follows-language.test.js` | — |
| T2 | S1, S3, S4 | `src/locales/en.ts`: diccionario inglés completo (2288 claves, 10 secciones), placeholders migrados tal cual | `src/locales/en.ts` | `feat(i18n)` |
| T3 | S1, S2 | Cableado: `SUPPORTED = ['es','en']`, `dictionaries = { es, en }`, `DEFAULT_LANG` sigue `'es'` | `src/locales/language.ts`, `src/locales/i18n.ts` | `feat(i18n)` |
| T4 | S1 | Normalización de locale: los 28 hardcodes `'es-AR'` de 15 archivos siguen el idioma activo | 15 archivos de `src/` + `src/hooks/useActiveLocale.ts` | `fix(i18n)` |
| T5 | S3 | El selector de idioma muestra las dos opciones; `apariencia_idioma` deja de decir "próximamente" | `src/locales/en.ts`, `src/locales/es.ts` (solo esa key), `src/pages/Configuracion/RegionFormatoPage.tsx` | `feat(i18n)` |
| T6 | — | Verificación: `npx tsc --noEmit`, suite completa, `node scripts/check-i18n.mjs`, tests de paridad y de locale | — | — |

## Archivos que toca esta entrega (lista exacta)

**NUEVO**
- `src/locales/en.ts`
- `src/hooks/useActiveLocale.ts`
- `tests/i18n/en-dictionary-parity.test.js`
- `tests/i18n/locale-follows-language.test.js`

**MODIFICADO**
- `src/locales/language.ts` — `SUPPORTED`, comentario de `DEFAULT_LANG`
- `src/locales/i18n.ts` — `dictionaries`
- `src/locales/es.ts` — **UNA key**: `apariencia_idioma` (de "Idioma (próximamente)" a "Idioma")
- `src/pages/Configuracion/RegionFormatoPage.tsx` — etiqueta del selector
- `tests/i18n/language-resolver.test.js` — 2 asserts que codificaban "solo hay español"
- `.gitignore` — allowlist de los 2 tests nuevos
- 15 archivos por normalización de locale:
  `components/AportarProyectoModal/AportarProyectoModal.tsx`,
  `components/BilleteraDetailModal/BilleteraDetailModal.tsx`,
  `components/ConfigHogar/ConfigHogar.tsx`,
  `components/DetalleBalanceModal/DetalleBalanceModal.tsx`,
  `components/familia/FeedView.tsx`,
  `components/supervivencia/RadarAsfixiaDetalle.tsx`,
  `components/WalletDropdownSelect/WalletDropdownSelect.tsx`,
  `lib/bcgUtils.ts`,
  `pages/AnalisisEmocional/AnalisisEmocionalPage.tsx`,
  `pages/Auth/AuthPage.tsx`,
  `pages/Billeteras/BilleterasPage.tsx`,
  `pages/Familia/FamiliaPage.tsx`,
  `pages/Home/HomePage.tsx`,
  `pages/Presupuestos/PresupuestosPage.tsx`,
  `pages/Tarjetas/TarjetasPage.tsx`

**NO TOCADO**
- `src/locales/es.ts` (salvo la key de T5) — coordinated con PI2, obs #663
- `funcionesSQL/**`, `temp_sql/**`, `supabase/**`, `start_info/**` — **cero SQL**
- `public/legal/*.html`, `public/manifest.json` — ver Log

## Log

- **L1** (pedido original, verbatim): "Evaluemos la posibilidad de hacer la primera
  traducción de \"es.ts\" al inglés para habilitar este segundo idioma como posibilidad de
  elección de idiomas. Evalúa y entiende todo el sistema I18n para ver de hacer este
  agregado de esta feature con el menor costo posible para no tocar funcionalidades.
  Solamente agregamos un idioma, el cual debería quedar disponible y aunque luego sigamos
  haciendo modificaciones y agregando clave en español para que el idioma se actualice,
  deberíamos luego correr un upgrade. Pero que quede desactualizado no me preocupa. Ahora
  quiero ver de valor contigo esto, planificándolo. Usa la skill \"brainstorming\" para sacar
  de todas las dudas que tengas al respecto. Yo me quiero asegurar de que tú entiendes
  perfectamente bien el sistema I18n y esta app, por supuesto. La traducción la hacemos con
  un perfil completamente financiero ligado a la app para que sea bien entendido.
  no ejecutas nada hasta que no nos ponemos completamente de acuerdo y te doy mi
  autorización."
- **L2** (decisiones del dueño, 2026-10-20): "1. Vamos con B (ii) , A + los 15 archivos
  (con cuidado). Lo que se rompe lo arreglamos, trabajamos en local , no pasamos nada a
  produccion. 2. se queda en 'es', luego agregaremos que en onboarding podamos seleccionar
  idioma tambien (ahora esta defaul es), dependiendo de la localizacion si podemos detectar
  latinoamerica español, sino defaul 'en'. 3. 2244 completas. Mucha atención con los
  placeholders que no deben traducirse sino migrarse talcual"
- **L3** (investigación, read-only): el sistema i18n ya fue construido para N idiomas en
  WU2/WU3 del spec `2026-10-12-onboarding-pais-idioma-moneda-design.md` (D1, D2, D8). Los
  propios comentarios del código lo anticipan: `language.ts:10` ("Adding a language = one
  string here plus its `xx.ts`"), `i18n.ts:23` ("Adding a language is one line here plus its
  `xx.ts` import above"), `language.ts:15-18` ("The day a complete English dictionary
  ships, this constant becomes 'en' and nothing else in the codebase moves"). `fallbackChain`
  ya resuelve `en → es` sin tocar nada. El selector de idioma ya existe y ya usa
  `Intl.DisplayNames` (no necesita keys nuevas por idioma). `p_config_region.idioma_default`
  es `text NOT NULL DEFAULT 'es'` **sin CHECK constraint**: escribir `'en'` no requiere
  tocar Supabase.
- **L4** (coordinación, 2026-10-20): PI2 (sesión `Personal-2`) publicó el aviso obs #662
  ("PI1: aviso — tanda inversiones tocará es.ts"). El canal `orchestrator_send_message`
  rechazó los 4 intentos de PI1 (`session message was not accepted` /
  `Message selection was cancelled`) y `orchestrator_consult` devolvió `unavailable`:
  **Engram es el único canal que funciona entre sesiones**. PI1 respondió con el obs #663
  ("PI1: respuesta — es.ts en uso"). Verificación en disco: `es.ts` tiene md5 idéntico en
  los 3 worktrees; los commits de PI2 (`38de600`, `821f217`, `432c13e`, `a510ee5`) tocan
  **solo `temp_sql/**`**; su T7 (la única que edita `es.ts`) **no arrancó**; PI2 está
  **pausado por el dueño**. Solapamiento con esta entrega: **cero**.
- **L5** (hallazgo, 2026-10-20): contar las claves con un regex de "solo nombre plano" da
  2244, pero el runtime da **2288**: la diferencia son las **44 claves con punto** de la
  sección `tour` (`'trigger.label'`, `'home.step1.title'`, …). El `t()` las resuelve por
  lookup plano dentro de la sección, así que **son claves reales** y se traducen. S3 se
  ajusta a 2288.
- **L6** (hallazgo, 2026-10-20): 10 claves están duplicadas entre secciones
  (`btn_cancel`, `btn_save`, `btn_close`, `title`, `empty_title`, `label_currency`,
  `type_income`, `budget_mode_anticipado`, `btn_back`, `error_unauthorized`). Como
  `t()` itera `Object.values(dict)` y el namespace ESM ordena los exports
  **alfabéticamente**, gana la sección alfabéticamente primera. `en.ts` replica la misma
  distribución para que la resolución en inglés coincida con la española.
- **L7** (hallazgo, 2026-10-20): los formatters a **nivel de módulo** (ej.
  `TarjetasPage.tsx:129-130`, `const fmt = new Intl.NumberFormat('es-AR', ...)`) se
  evalúan **una sola vez al importar el módulo**; el remount del árbol que hace
  `LanguageProvider` al cambiar de idioma no los re-evalúa. Por eso T4 no se limita a
  cambiar el literal: los formatters a nivel de módulo pasan a leer el contexto global
  (`lib/format.ts`), que sí se actualiza.
- **L8** (línea base de tests, 2026-10-20): antes de este trabajo **3 tests de
  `tests/i18n/` ya fallan** y no son culpa de esta entrega:
  `budget-modal-select-action.test.js` (import path roto: busca `tests/src/locales/i18n.js`),
  `consent-v2-i18n.test.js` (afirma el copy viejo de `welcomeback_subtitle`),
  `i18n-nested-keys.test.js` (afirma el copy viejo de `wallets.btn_add_cuenta` = "Agregar
  cuenta", hoy "+ Cuenta"). Se reportan, no se tocan.
- **L9** (deuda, fuera de alcance): `src/voice/apiClient.ts:27` manda
  `DEFAULT_VOICE_LANGUAGE = 'es-AR'` a los jobs de voz (backend FastAPI): un usuario en
  inglés hablaría en inglés y la IA transcribiría en español. Requiere backend.
  `public/legal/tyc.html` y `public/legal/privacidad.html` son HTML estático en español.
  `public/manifest.json` tiene los shortcuts en español. Ninguno pasa por `t()`.
