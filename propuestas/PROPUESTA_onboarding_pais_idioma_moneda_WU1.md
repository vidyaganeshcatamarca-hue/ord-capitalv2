# PROPUESTA WU1 — Catálogo de países y monedas, y región del usuario

**Fecha:** 2026-10-12
**Estado:** ⏳ PENDIENTE DE APROBACIÓN. **Nada de esto fue ejecutado.**
**Autoriza:** dueño del producto (regla 0/1 de `AGENTS.md`: no se toca Supabase sin OK explícito).
**Spec de origen:** `docs/superpowers/specs/2026-10-12-onboarding-pais-idioma-moneda-design.md`

---

## 0. Objetivo de esta work unit

Que el país, la moneda y el idioma del usuario sean **datos** y no **código**:

1. Un catálogo en base de datos con todos los países y sus monedas.
2. Una RPC que alimenta el selector del onboarding.
3. Que "todavía no eligió país" sea representable (hoy no lo es).
4. Que muera la whitelist de 11 monedas hardcodeada en dos RPCs.
5. Que ninguna función invente `ARS` cuando no hay país.

**Lo que esta WU NO hace:** no trae cotizaciones, no toca el cron, no toca el cliente (eso es WU2/WU3).

---

## 1. Fase 0 — Verificación previa (read-only, obligatoria)

Los espejos de `funcionesSQL/` son la fuente documentada, pero **la base viva puede diferir**.
Antes de cualquier `ALTER` se ejecutan estas consultas y se compara contra el espejo:

```sql
-- 1. Estado real de la tabla a migrar
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'p_config_region'
ORDER BY ordinal_position;

-- 2. ¿Hay constraints que los espejos no muestran?
SELECT con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname IN ('p_config_region','p_billeteras');

-- 3. ¿Existe ya algo parecido al catálogo?
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('p_paises','p_monedas','p_divisas');

-- 4. Datos actuales (para dimensionar el impacto en usuarios existentes)
SELECT COUNT(*) AS filas,
       COUNT(*) FILTER (WHERE pais_codigo = 'AR') AS con_ar,
       COUNT(DISTINCT pais_codigo) AS paises_distintos
FROM public.p_config_region;

-- 5. Cotizaciones: qué monedas hay hoy y cómo se llaman las filas
SELECT nombre, valor_por_usd, valor_anterior, ultima_actualizacion
FROM public.p_divisas ORDER BY nombre;

-- 6. Jobs programados
SELECT jobid, schedule, command, active FROM cron.job;
```

**Criterio de aprobación de la Fase 0:** si algo difiere del espejo, se documenta acá y se ajusta el
SQL antes de ejecutar. Si `p_config_region` tuviera un `CHECK` sobre `pais_codigo`, la migración cambia.

---

## 1.b RESULTADOS DE LA FASE 0 (ejecutada 2026-10-12, solo lecturas)

Scripts: `temp_sql/fase0_inspect.mjs`, `temp_sql/fase0b_drift.mjs`, `temp_sql/fase0c_censo.mjs`.

### Lo que se confirmó igual al espejo ✅

| Objeto | Estado real |
|---|---|
| `p_config_region` | `user_id` PK / `pais_codigo` NOT NULL DEFAULT `'AR'` / `moneda_default` NOT NULL DEFAULT `'ARS'` / `idioma_default` NOT NULL DEFAULT `'es'` / `creado_at`. **Sin `CHECK`.** |
| Constraints | Solo PK y FK a `usuarios` en `p_config_region`; en `p_billeteras` PK + FK `user_id` + FK `billetera_respaldo_id`. **Ningún `CHECK` sobre `moneda`.** La migración del §5 es aplicable tal cual. |
| Catálogo | **No existe** `p_paises`, `p_monedas` ni `p_cotizaciones_dolar`. Sí existe `p_divisas`. |
| Usuarios | **63 filas y las 63 en `AR`/`ARS`/`es`.** Ningún usuario cambió su región nunca. |
| Billeteras | 151 en ARS · 6 en USD · **1 en UYU** (y UYU no tiene cotización). |
| Triggers | Cuatro sobre `usuarios`, todos `AFTER INSERT`: `tr_handle_new_user_region`, `tr_onboarding_usuario`, `trg_auto_crear_preferencias`, `trg_auto_crear_preferencias_notif`. Ninguno sobre `p_config_region`. |
| Deriva de funciones | Los 7 cuerpos desplegados coinciden con los espejos en lo que importa (whitelist de 11 monedas presente, `COALESCE ... 1.00` presente, escritura de `'AR'` presente). |

### Hallazgos que la inspección destapó y cambian el alcance

**H1 — `fn_configurar_inflacion` está rota en producción.**
El cuerpo desplegado consulta `p_cotizaciones_dolar`, que **no existe** en la base. Postgres resuelve
esos nombres en runtime, por eso la función crea sin error y falla recién al llamarla con
`fuente = 'proxy_dolar'` → `42P01 relation "p_cotizaciones_dolar" does not exist`. Además su
espejo en `funcionesSQL/` está desactualizado (le falta el fallback a `fn_calcular_inflacion_mensual`).

**H2 — Los reportes consolidados NO convierten las billeteras en USD. BUG VIVO, 6 usuarios afectados.**
`fn_reporte_safe_to_spend` y `fn_reporte_patrimonio_neto_consolidado` leen
`p_divisas WHERE nombre = 'USD'`. Pero `p_divisas` guarda **unidades de esa moneda por 1 USD**
(`ARS = 1515.87`, `USD = 1`). O sea que la cotización que obtienen vale **1**, y
`CASE WHEN moneda = 'USD' THEN saldo_actual * 1` deja el saldo en dólares sumado 1:1 contra pesos.
La intención del código es correcta (multiplicar por la cotización del dólar en la moneda local);
el lookup está mal: debe usar la **moneda local del usuario**, no la fila `'USD'`. Es un one-liner,
y es exactamente el mismo eje que este trabajo ordena.

**H3 — El cron de cotizaciones tiene la lista de monedas hardcodeada, y no está en el repositorio.**
`cron.job` id 1 (diario 12:00 UTC) llama a la Edge Function `get_currency`, que **no está en
`supabase/functions/`** (drift: solo viven ahí `send-personal-reminders` y `daily-expenses-reminder`).
Su fuente, recuperada vía Management API, tiene:

```ts
const monedas = ['USD','ARS','MXN','EUR','BRL','CLP','COP','PEN'];   // ← la línea a cambiar
```

Proveedor: exchangerate-api.com v6, `/latest/USD`. Escribe `p_cotizaciones_historico`
(`fecha`, `moneda_iso`, `valor_por_usd`) y hace upsert de `p_divisas` con `onConflict: 'nombre'`.
**Faltan PYG (Paraguay), UYU (Uruguay, con una billetera viva) y BOB.**
Reemplazar ese array por una consulta a `p_paises WHERE soportado = true` es el cambio que pide D17.

**H4 — Hay overloads duplicados y uno es legado roto.**
Existen **dos** `fn_crear_billetera` (1339 y 1411 bytes) y **dos** `fn_reporte_safe_to_spend`. El
segundo overload de `safe_to_spend` es `(p_user_id uuid, p_billetera_id uuid)` — con `uuid` cuando
`usuarios.user_id` es `bigint`, sin `search_path`, sin filtro por billetera y usando la fila `'USD'`
como si fuera un gasto diario. Hay que decidir si se elimina o se ignora; **todo cambio va a los
overloads que la app realmente usa**.

**H5 — El secreto del cron está en texto plano dentro de `cron.job`.**
El job 1 manda `Authorization: Bearer <secreto literal>`, que es el `CRON_SECRET` de la Edge Function.
Los jobs 3 y 4 usan el patrón correcto (`current_setting('app.settings.service_role_key')`).
Fuera del alcance de este trabajo, pero **hay que reportarlo y eventualmente rotarlo**.

### Censo de consumidores (23 funciones tocan `pais_codigo`, `moneda_default`, `fn_get_default_currency` o `p_divisas`)

Además de las 8 ya identificadas, aparecen: `fn_gestionar_compra_cuotas`, `fn_registrar_gasto_tarjeta`,
`fn_registrar_pago_tarjeta_multi`, `fn_reporte_escudo_tiempo`, `fn_reporte_mapa_tarjetas`,
`fn_reporte_podadora_bcg`, `fn_reporte_vencimientos_tarjetas`. **Ninguna crea país ni moneda**, así que
la migración del §5 no las rompe; pero `fn_reporte_mapa_tarjetas` y `fn_reporte_vencimientos_tarjetas`
leen `moneda_default` y hay que revisar su manejo de NULL.

### Consecuencia sobre el §6.3

`fn_get_default_currency` tiene **4** consumidores y `fn_obtener_saldo_a_asignar` es el único que
compara en un `WHERE` (`moneda = fn_get_default_currency(...)`), que con NULL pasaría a sumar 0 en
silencio. El guard del §6.6 es obligatorio, no opcional.

---

## 2. Fase 1 — Tablas nuevas

```sql
-- 2.1 Monedas (ISO 4217)
CREATE TABLE public.p_monedas (
  codigo             char(3) PRIMARY KEY,            -- 'ARS', 'USD', 'PYG'
  decimales          smallint NOT NULL DEFAULT 2,
  simbolo            text,                          -- '$', '€', '₲' — solo presentación
  activa             boolean NOT NULL DEFAULT false,
  creado_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.p_monedas IS
  'Catálogo de monedas ISO 4217. Los decimales son propiedad de la moneda, no del país.';

-- 2.2 Países (ISO 3166-1 alpha-2)
CREATE TABLE public.p_paises (
  codigo            char(2) PRIMARY KEY,            -- 'AR', 'ES', 'PY'
  moneda_local      char(3) NOT NULL REFERENCES public.p_monedas(codigo),
  idioma_sugerido   char(2) NOT NULL DEFAULT 'en',  -- PRD §2.1
  separador_miles   text NOT NULL,
  separador_decimal text NOT NULL,
  primer_dia_semana smallint NOT NULL DEFAULT 1,    -- 0=domingo, 1=lunes, 6=sábado
  formato_fecha     text NOT NULL DEFAULT 'DD/MM/YYYY',
  formato_hora      text NOT NULL DEFAULT '24h',
  soportado         boolean NOT NULL DEFAULT false, -- decisión de producto
  orden             smallint,
  creado_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.p_paises.soportado IS
  'Decisión de producto: si el pais esta habilitado en la app. NO se deriva de la cotizacion.';

CREATE INDEX idx_p_paises_soportado ON public.p_paises (soportado, orden);

-- 2.3 RLS: catálogo de solo lectura para usuarios autenticados, escritura solo service_role
ALTER TABLE public.p_monedas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p_paises  ENABLE ROW LEVEL SECURITY;
```

> **Nota sobre RLS:** el patrón de las tablas `p_*` del proyecto se verifica en la Fase 0 antes de
> escribir estas policies. Si el proyecto usa solo `SECURITY DEFINER` sin policies, se alinea a eso.

---

## 3. Fase 2 — Siembra del catálogo

**No se escribe a mano.** El seed se **genera con un script** a partir de datos CLDR autoritativos
(paquete `cldr-core` de Unicode, solo devDependency) y se revisa antes de ejecutar:

| Campo de `p_paises` | Origen en CLDR |
|---|---|
| `codigo` | ISO 3166-1 alpha-2 (lista de territorios) |
| `moneda_local` | `supplemental/currencyData.json` → `region[XX]`, la moneda de curso legal vigente |
| `primer_dia_semana` | `supplemental/weekData.json` → `weekData.firstDay[XX]` |
| `separador_miles` / `separador_decimal` | `cldr-numbers-full` → `symbols-numberSystem-latn` del locale |
| `formato_fecha` | `cldr-dates-full` → `dateFormats` del locale |
| `formato_hora` | `cldr-dates-full` → preferencia 12h/24h del locale |

Script previsto: `temp_sql/gen_seed_paises.cjs` → produce `temp_sql/20_seed_paises_monedas.sql`.
Se te presenta el `.sql` generado **antes** de ejecutarlo, con el conteo de filas.

Todos los países entran con `soportado = false` (decisión D9).

**Monedas:** se insertan todas las ISO 4217 referenciadas, con `decimales` desde CLDR
(`supplemental/currencyData.json` / `cldr-numbers-full`) y `simbolo` desde CLDR.

### 3.1 Activación inicial (`soportado = true`)

Decisión de producto: América completa, Europa completa y los principales de Asia, Oceanía y
Medio Oriente. **Esta es la lista que define, además, qué monedas debe cotizar el cron.**

```
América (21):
AR BO BR CA CL CO CR DO EC SV GT HN MX NI PA PE PR PY US UY VE

Europa (31):
AT BE BG CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LU MT NL NO PL PT RO RS SE SI SK UA RU

Asia / Oceanía / Medio Oriente (20):
AE AU CN HK ID IL IN JP KR MY NZ PH QA SA SG TH TR TW VN
```

**Total: 72 países activos.** Es el número que hay que ajustar si querés arrancar más conservador:
cada país activo suma una moneda que el cron del punto 8 tiene que poder cotizar.

Se activan con:

```sql
UPDATE public.p_paises SET soportado = true WHERE codigo IN ( ...los 72... );
UPDATE public.p_monedas SET activa = true
  WHERE codigo IN (SELECT DISTINCT moneda_local FROM public.p_paises WHERE soportado);
```

**Crecimiento futuro:** `UPDATE public.p_paises SET soportado = true WHERE codigo = 'XX';`
Sin código, sin deploy, sin release.

---

## 4. Fase 3 — RPC del catálogo

```sql
CREATE OR REPLACE FUNCTION public.fn_obtener_paises()
RETURNS TABLE(
  codigo            char(2),
  moneda_local      char(3),
  moneda_decimales  smallint,
  moneda_simbolo    text,
  idioma_sugerido   char(2),
  separador_miles   text,
  separador_decimal text,
  primer_dia_semana smallint,
  formato_fecha     text,
  formato_hora      text,
  orden             smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.codigo, p.moneda_local, m.decimales, m.simbolo, p.idioma_sugerido,
         p.separador_miles, p.separador_decimal, p.primer_dia_semana,
         p.formato_fecha, p.formato_hora, p.orden
  FROM public.p_paises p
  JOIN public.p_monedas m ON m.codigo = p.moneda_local
  WHERE p.soportado = true
  ORDER BY COALESCE(p.orden, 32767), p.codigo;
$function$;

-- Sin nombres de pais: los resuelve el cliente con Intl.DisplayNames (PRD §16),
-- para no mantener 249 nombres por cada idioma.
REVOKE ALL ON FUNCTION public.fn_obtener_paises() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_obtener_paises() TO authenticated;
```

> El bloque de `GRANT`/`REVOKE` se alinea al patrón real de las RPC de catálogo existentes,
> que se verifica en la Fase 0.

---

## 5. Fase 4 — Migración de `p_config_region`

```sql
ALTER TABLE public.p_config_region
  ALTER COLUMN pais_codigo    DROP NOT NULL,
  ALTER COLUMN pais_codigo    DROP DEFAULT,
  ALTER COLUMN moneda_default DROP NOT NULL,
  ALTER COLUMN moneda_default DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS origen_pais   text,
  ADD COLUMN IF NOT EXISTS confirmado_at timestamptz;

ALTER TABLE public.p_config_region
  ADD CONSTRAINT p_config_region_origen_pais_chk
  CHECK (origen_pais IS NULL OR origen_pais IN ('locale','manual'));

-- FK opcional al catálogo (se decide en la Fase 0 si el resto de las tablas usa FKs de catálogo)
-- ALTER TABLE public.p_config_region
--   ADD CONSTRAINT p_config_region_pais_fk
--   FOREIGN KEY (pais_codigo) REFERENCES public.p_paises(codigo);
```

- `idioma_default` se mantiene `NOT NULL DEFAULT 'es'`: el idioma siempre resuelve, el país no.
- **Usuarios existentes:** no se tocan. Conservan su `AR/ARS/es` (decisión D12).

---

## 5.7 [NUEVO por pedido del dueño] `formato_hora` como preferencia editable

El dueño pidió que el formato de hora sea **configurable desde Configuración**, igual que los
decimales y separadores. Hoy no existe la columna.

```sql
ALTER TABLE public.p_preferencias_usuario
  ADD COLUMN IF NOT EXISTS formato_hora text NOT NULL DEFAULT '24h';

ALTER TABLE public.p_preferencias_usuario
  ADD CONSTRAINT p_preferencias_usuario_formato_hora_chk
  CHECK (formato_hora IN ('12h','24h'));
```

**Consecuencia sobre dos funciones, con una trampa de Postgres que hay que respetar:**

| Función | Cambio | Trampa |
|---|---|---|
| `fn_obtener_preferencias_usuario()` | Agregar `formato_hora` al `RETURNS TABLE` y al `SELECT` | `CREATE OR REPLACE` **falla** si cambia el tipo de retorno. Hay que `DROP` primero. |
| `fn_actualizar_preferencia_usuario(...)` | Agregar `p_formato_hora text DEFAULT NULL` **al final** | Un `CREATE OR REPLACE` con un parámetro más crea un **overload nuevo** y deja el viejo vivo. Es exactamente cómo aparecieron los overloads duplicados del hallazgo H4. Hay que `DROP` el viejo primero. |

```sql
-- Trampa: por esto existen los overloads duplicados de fn_crear_billetera y safe_to_spend.
DROP FUNCTION IF EXISTS public.fn_obtener_preferencias_usuario();
DROP FUNCTION IF EXISTS public.fn_actualizar_preferencia_usuario(
  text, text, boolean, smallint, smallint, text, text, smallint, text,
  bigint, bigint, bigint, boolean, smallint, boolean, jsonb, text
);
-- Luego los CREATE, generados desde el cuerpo desplegado con la columna/parametro agregado,
-- y mostrados antes de ejecutar.
```

Firmas actuales verificadas contra la base: `fn_actualizar_preferencia_usuario` tiene 17 parámetros
opcionales (desde `p_tema` hasta `p_orden_billeteras`) y `fn_obtener_preferencias_usuario` devuelve 17
columnas. El detalle exacto de los nuevos cuerpos se genera mecánicamente del cuerpo desplegado
—para no transcribir a mano 40 líneas— y se muestra antes de ejecutar.

---

## 6. Fase 5 — Funciones a modificar

### 6.1 `fn_handle_new_user_region` — dejar de mentir

```sql
CREATE OR REPLACE FUNCTION public.fn_handle_new_user_region()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- El pais y la moneda los define el onboarding, no un default.
    INSERT INTO public.p_config_region (user_id, pais_codigo, moneda_default, idioma_default)
    VALUES (NEW.user_id, NULL, NULL, 'es')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$function$;
```

### 6.2 `fn_obtener_region_usuario` — idem

```sql
CREATE OR REPLACE FUNCTION public.fn_obtener_region_usuario()
RETURNS TABLE(pais_codigo text, moneda_default text, idioma_default text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  -- Fila vacia si falta: el pais lo elige el usuario, no nosotros.
  INSERT INTO public.p_config_region (user_id, pais_codigo, moneda_default, idioma_default)
  VALUES (v_user_id, NULL, NULL, 'es')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT r.pais_codigo, r.moneda_default, r.idioma_default
  FROM public.p_config_region r
  WHERE r.user_id = v_user_id;
END;
$function$;
```

### 6.3 `fn_get_default_currency` — nunca más `ARS` por sorpresa

```sql
CREATE OR REPLACE FUNCTION public.fn_get_default_currency(p_user_id bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Devuelve la moneda local del pais confirmado, o NULL si todavia no eligio.
  -- NUNCA inventa una moneda.
  SELECT r.moneda_default FROM public.p_config_region r WHERE r.user_id = p_user_id;
$function$;
```

**Impacto verificado (4 consumidores):**

| Consumidor | Qué pasa ahora | Acción |
|---|---|---|
| `fn_crear_billetera` (pantalla de billeteras) | `COALESCE(p_moneda, ...)` = NULL → nueva validación rechaza | Regla nueva, ver 6.4 |
| `fn_crear_billetera_inicial` (onboarding) | ídem | Regla nueva, ver 6.4 |
| `fn_crear_billeteras_iniciales` (onboarding) | ídem | Regla nueva, ver 6.4 |
| `fn_obtener_saldo_a_asignar` | `moneda = NULL` → `NULL` → sumaría 0 en silencio | **Guard explícito, ver 6.6** |

### 6.4 Regla de moneda de billetera (reemplaza la whitelist de 11)

Fragmento idéntico para `fn_crear_billetera`, `fn_crear_billetera_inicial` y
`fn_crear_billeteras_iniciales`:

```sql
  v_moneda_local := public.fn_get_default_currency(v_user_id);
  v_moneda_final := COALESCE(p_moneda, v_moneda_local);

  -- Sin pais confirmado no hay moneda local: error claro, nunca un default.
  IF v_moneda_local IS NULL THEN
    RAISE EXCEPTION '{"key": "error_region_not_configured", "params": {}}';
  END IF;

  -- Solo se permite la moneda local del pais del usuario o USD (segunda moneda).
  IF v_moneda_final <> 'USD' AND v_moneda_final <> v_moneda_local THEN
    RAISE EXCEPTION '{"key": "error_currency_not_local", "params": {}}';
  END IF;
```

Beneficio: la moneda de la billetera queda atada al país por datos, y la whitelist hardcodeada
desaparece. Si el día de mañana se activa un país con una moneda nueva, funciona sin tocar SQL.

> Se conserva `error_currency_not_supported` en `es.ts` (ya existe, línea 24) para no romper nada.

### 6.5 `fn_configurar_inflacion` — lookup en vez de `CASE ... ELSE 'ARS'`

```sql
-- Reemplaza:
--   v_moneda_pais := CASE p_pais WHEN 'AR' THEN 'ARS' ... ELSE 'ARS' END;
-- Por:
    SELECT p.moneda_local INTO v_moneda_pais
    FROM public.p_paises p
    WHERE p.codigo = p_pais AND p.soportado = true;

    IF v_moneda_pais IS NULL THEN
        RAISE EXCEPTION '{"key": "error_country_not_supported", "params": {}}';
    END IF;
```

Arregla que hoy un usuario de España que active `proxy_dolar` cae en la cotización del peso argentino.

### 6.6 `fn_obtener_saldo_a_asignar` — guard por país NULL

```sql
  v_moneda_local := public.fn_get_default_currency(v_user_id);
  IF v_moneda_local IS NULL THEN
    -- Sin pais confirmado no hay moneda local contra la cual comparar.
    RETURN 0;
  END IF;
```

> El nombre del retorno se ajusta al tipo real de la función (se lee completo en la Fase 0).

### 6.7 [H1] `fn_configurar_inflacion` — arreglar la función rota

Hoy consulta `p_cotizaciones_dolar`, que **no existe** (confirmado en la Fase 0) → `42P01` en runtime.
Se elimina esa consulta muerta y se va directo a la fuente que sí existe, más el lookup de catálogo.

```sql
CREATE OR REPLACE FUNCTION public.fn_configurar_inflacion(p_pais text, p_fuente_inflacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_inflacion_6m numeric := 0;
    v_inflacion_12m numeric := 0;
    v_variacion_mensual_pct numeric := 0;
    v_moneda_pais text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_fuente_inflacion NOT IN ('api_automatica', 'proxy_dolar', 'desactivado') THEN
        RAISE EXCEPTION '{"key": "error_inflation_source_invalid", "params": {}}';
    END IF;

    IF p_fuente_inflacion = 'proxy_dolar' THEN
        -- Moneda local del pais desde el catalogo (antes: CASE hardcodeado con ELSE 'ARS')
        SELECT p.moneda_local INTO v_moneda_pais
        FROM public.p_paises p
        WHERE p.codigo = p_pais AND p.soportado = true;

        IF v_moneda_pais IS NULL THEN
            RAISE EXCEPTION '{"key": "error_country_not_supported", "params": {}}';
        END IF;

        -- Fuente real: historico de cotizaciones. (p_cotizaciones_dolar no existe.)
        v_variacion_mensual_pct := COALESCE(
            public.fn_calcular_inflacion_mensual(
                v_moneda_pais,
                EXTRACT(YEAR  FROM CURRENT_DATE)::int,
                EXTRACT(MONTH FROM CURRENT_DATE)::int),
            0
        );

        IF v_variacion_mensual_pct > 0 THEN
            v_inflacion_6m  := (POWER(1 + (v_variacion_mensual_pct / 100), 6)  - 1) * 100;
            v_inflacion_12m := (POWER(1 + (v_variacion_mensual_pct / 100), 12) - 1) * 100;
        END IF;
    END IF;

    INSERT INTO p_config_inflacion (user_id, pais, fuente_inflacion, inflacion_acumulada_6m, inflacion_acumulada_12m)
    VALUES (v_user_id, p_pais, p_fuente_inflacion, v_inflacion_6m, v_inflacion_12m)
    ON CONFLICT (user_id) DO UPDATE SET
        pais = EXCLUDED.pais,
        fuente_inflacion = EXCLUDED.fuente_inflacion,
        inflacion_acumulada_6m = EXCLUDED.inflacion_acumulada_6m,
        inflacion_acumulada_12m = EXCLUDED.inflacion_acumulada_12m,
        actualizado_at = now();

    RETURN jsonb_build_object('success_key', 'success_inflation_configured', 'params', '{}'::jsonb);
END;
$function$;
```

Firma de la dependencia, verificada contra la base: `fn_calcular_inflacion_mensual(p_moneda_iso text, p_anio integer, p_mes integer) RETURNS numeric`.

### 6.8 [H2a] Los reportes consolidados: la conversión de USD que hoy vale 1

`p_divisas.valor_por_usd` guarda **unidades de esa moneda por 1 USD**. Las dos funciones de reporte
leen la fila `'USD'` (que vale 1) en lugar de la **moneda local del usuario**. Son **2 reemplazos**,
sin cambiar ninguna clave del JSON de salida:

```sql
-- fn_reporte_safe_to_spend (overload sin parametros)
-- ANTES:
    SELECT COALESCE((SELECT valor_por_usd FROM p_divisas WHERE nombre = 'USD' ORDER BY ultima_actualizacion DESC LIMIT 1), 1.00) INTO v_cotizacion_usd;
-- DESPUES:
    SELECT r.moneda_default INTO v_moneda_local FROM p_config_region r WHERE r.user_id = v_user_id;
    SELECT p.valor_por_usd INTO v_cotizacion_usd
    FROM p_divisas p
    WHERE p.nombre = COALESCE(v_moneda_local, 'USD')
    ORDER BY p.ultima_actualizacion DESC LIMIT 1;
    v_cotizacion_usd := COALESCE(v_cotizacion_usd, 1.00);   -- solo si no hay pais ni cotizacion

-- fn_reporte_patrimonio_neto_consolidado (overload sin parametros)
-- ANTES:
    SELECT COALESCE((SELECT valor_por_usd FROM p_divisas WHERE nombre = 'USD' ORDER BY ultima_actualizacion DESC LIMIT 1), 1.00) INTO v_cotizacion_usd;
-- DESPUES: el mismo patron, con la moneda local del usuario.
```

**Qué arregla:** una billetera con 100 USD dejaba de contarse (se sumaba como 100 unidades de la
moneda local) en `saldo_operativo` y en el patrimonio. Y `patrimonio_neto_usd` salía **idéntico** a
`patrimonio_neto_ars`, porque dividía por 1. Hoy hay 6 billeteras en USD afectadas.

### 6.9 Fuera de la WU1 (decidido y documentado)

| Item | Qué es | Por qué queda afuera |
|---|---|---|
| **H2b** | `fn_reporte_patrimonio_neto_consolidado` tiene `'ARS'` incrustado en 4 ramas de SQL **y en las claves del JSON de salida** (`patrimonio_neto_ars`, `activo_total_ars`, `billeteras.ars`). Para que un usuario de España o Paraguay lo vea bien hay que parametrizar la moneda local y cambiar el contrato + el cliente. | Es un refactor de reporte + contrato de frontend, no un fix. Va con el rollout de país (WU4). |
| **H4** | Overloads duplicados de `fn_crear_billetera` y `fn_reporte_safe_to_spend`, uno legado roto (`p_user_id uuid` contra `bigint`). | Requiere decidir si se borra. No bloquea nada. |
| **H5** | El `CRON_SECRET` en texto plano dentro de `cron.job`. | Es una rotación de secreto + cambio de job, no parte del catálogo. |

> **Corrección honesta:** dije que el bug de la cotización era un one-liner. En `fn_reporte_safe_to_spend`
sí lo es; en `fn_reporte_patrimonio_neto_consolidado` no, porque el ARS también está incrustado en el
contrato del JSON. Por eso se parte en H2a (WU1) y H2b (rollout).

---

## 7. Fase 6 — Claves i18n nuevas (van a `src/locales/es.ts`, WU3)

| Clave | Cuándo se muestra |
|---|---|
| `error_region_not_configured` | Se intentó crear una billetera sin país confirmado |
| `error_currency_not_local` | La moneda pedida no es la local del país ni USD |
| `error_country_not_supported` | País fuera del catálogo soportado |
| `error_quote_not_supported` | Falta la cotización de la moneda local (punto 8) |
| `onboarding_country_title` / `_subtitle` / `_cta` / `_change` / `_search_placeholder` / `_empty` / `_unsupported` | Paso nuevo del onboarding |

---

## 8. Fase 7 — Cotizaciones y cron (fuera de esta WU, requiere inspección propia)

Pedido del dueño: *"modificar también el cron que trae las cotizaciones para que traiga la cotización
de los países soportados = true; si el país no tiene cotización, informar cotización no soportada."*

**Lo que se sabe (confirmado en la Fase 0):** `cron.job` id 1 llama cada día a las 12:00 UTC a la
Edge Function **`get_currency`**, que no está en el repositorio y cuya fuente tiene la lista de
monedas hardcodeada:

```ts
const monedas = ['USD','ARS','MXN','EUR','BRL','CLP','COP','PEN'];
```

**El cambio que pide D17 es esa única línea:** reemplazarla por la lista de monedas de los países
`soportado = true` (consulta a `p_paises` + `p_monedas`). Es el cambio más barato de todo el proyecto
y el que más desbloquea la expansión.

**Lo que hay que inspeccionar antes (read-only, ya incluido en la Fase 0):**

```sql
SELECT jobid, schedule, command, active FROM cron.job;
SELECT nombre, valor_por_usd, valor_anterior, ultima_actualizacion FROM p_divisas ORDER BY nombre;
```

**Ambigüedad resuelta en la Fase 0:** `p_divisas` guarda **unidades de la moneda por 1 USD**
(`ARS = 1515.87`, `USD = 1`, `EUR = 0.8926`). Por lo tanto:

- `fn_obtener_cotizacion_usd` (`WHERE nombre = v_moneda`) está **bien**: devuelve la cotización del
dólar en la moneda local del usuario.
- `fn_reporte_safe_to_spend` y `fn_reporte_patrimonio_neto_consolidado` (`WHERE nombre = 'USD'`)
están **mal**: obtienen `1` y dejan los saldos en dólares sumados 1:1 contra los locales. Deben usar
la moneda local del usuario. Es el hallazgo H2, un bug vivo con 6 usuarios afectados.

**Cambios previstos (a escribir después de la inspección):**

1. `p_divisas` debe tener una fila por cada moneda de un país `soportado = true`.
2. `fn_obtener_cotizacion_usd`: hoy termina en `COALESCE(..., 1.00)`, que trata la moneda local como
   si valiera 1 USD. Pasa a devolver **NULL** cuando no hay cotización. Sus consumidores en el cliente
   son solo **3 archivos**, así que el impacto es contenido:
   `src/components/AddMovementModal/AddMovementModal.tsx`,
   `src/components/saneamiento/EditarCuarentenaModal.tsx`,
   `src/pages/Tarjetas/TarjetasPage.tsx`.
3. El cliente muestra `error_quote_not_supported` en vez de un número inventado.
4. Cargar la cotización a mano para un usuario puntual queda como **funcionalidad aparte** (decisión del dueño).

---

## 9. Fase 8 — Verificación (test transaccional con ROLLBACK)

Regla 11 de `AGENTS.md`: RPC de testing temporal, autorizada aparte, ejecutada por Management API,
y **borrada al terminar**.

Aserciones mínimas de `fn_run_wu1_catalogo_test()`:

| # | Aserción |
|---|---|
| 1 | `fn_obtener_paises()` devuelve solo países `soportado = true` |
| 2 | Cada país devuelto tiene una moneda presente en `p_monedas` |
| 3 | El catálogo trae PY → PYG y ES → EUR |
| 4 | `fn_get_default_currency` de un usuario sin país devuelve **NULL** (no `ARS`) |
| 5 | Crear billetera sin país confirmado → excepción `error_region_not_configured` |
| 6 | Crear billetera con moneda distinta de la local y de USD → `error_currency_not_local` |
| 7 | Crear billetera con la moneda local del país → OK |
| 8 | Crear billetera con `USD` → OK (segunda moneda) |
| 9 | `fn_configurar_inflacion` con país no soportado → `error_country_not_supported` |
| 10 | Un usuario con país AR sigue funcionando exactamente como antes (no regresión) |

Todo dentro de una transacción con `ROLLBACK` y con el runner borrado al final.

---

## 10. Rollback

| Fase | Cómo se revierte |
|---|---|
| 1 y 2 | `DROP TABLE public.p_paises, public.p_monedas CASCADE;` (sin dependencias de datos de usuario) |
| 3 | `DROP FUNCTION public.fn_obtener_paises();` |
| 4 | `ALTER TABLE ... SET DEFAULT 'AR' / 'ARS'; SET NOT NULL; DROP COLUMN origen_pais, confirmado_at;` |
| 5 | Re-aplicar el cuerpo anterior de cada función (los originales están en `funcionesSQL/*.md`) |

Los usuarios existentes **no se modifican** en ninguna fase, así que el rollback nunca puede perder
configuración de usuario.

---

## 11. Fuera de alcance de la WU1

- Cliente: onboarding, `LanguageContext`, catálogo en `src/` (WU2 y WU3).
- Refactor de los ~200 hardcodeos de moneda (WU4).
- Cotizaciones y cron (Fase 7, requiere inspección).
- Carga manual de cotización por usuario (funcionalidad aparte).
- Deuda de i18n y mojibake.

---

## 12. Checklist de ejecución — ✅ EJECUTADO el 2026-10-12

- [x] Fase 0 ejecutada y resultado documentado en la §1.b de este archivo
- [x] `temp_sql/gen_seed_paises.mjs` escrito y seed generado (es `.mjs`, no `.cjs`: con `"type":"module"` los `.cjs` con top-level await fallan)
- [x] Seed revisado por el dueño (conteo de filas y spot-check de PY, ES, AR, BR, US)
- [x] Tablas creadas (`p_monedas`, `p_paises`)
- [x] Seed insertado (249 países, 153 monedas)
- [x] `soportado = true` aplicado a los 72
- [x] `fn_obtener_paises()` creada
- [x] `p_config_region` migrada (país y moneda nullable, `origen_pais`, `confirmado_at`)
- [x] `p_preferencias_usuario.formato_hora` agregada, con los 2 DROP/CREATE de preferencias
- [x] Las 9 funciones modificadas
- [x] [H1] `fn_configurar_inflacion` arreglada (ya no consulta `p_cotizaciones_dolar`)
- [x] [H2a] Los dos lookups de cotización de los reportes arreglados
- [x] Test transaccional en verde (**18/18 PASS**) y sin runner que borrar: el test es un bloque `DO` con excepción forzada
- [x] [H4] Los 3 overloads legado eliminados (aprobados uno a uno por el dueño), con **9/9 PASS**
- [x] Espejos actualizados en `funcionesSQL/` — 14 archivos, escritos **desde la base** con `pg_get_functiondef`, no transcritos
- [x] Entrada agregada en `start_info/indice de funciones.md` (#255) para `fn_obtener_paises`
- [x] Commit de la WU1: `ea0c790`

### Nota sobre qué queda versionado

`.gitignore` excluye `docs/`, `start_info/`, `funcionesSQL/`, `supabase/` y `temp_sql/`. O sea que
**los espejos, el índice y el spec son base de conocimiento local, no versionada** — por diseño del
repo. Lo único versionado de este cambio es el SQL de este archivo (en `propuestas/`), las claves de
i18n y el feature doc de `odd/tasks/`. Conviene saberlo: un `git clone` limpio no trae los espejos.
