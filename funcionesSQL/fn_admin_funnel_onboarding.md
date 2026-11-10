# fn_admin_funnel_onboarding

**Espejo creado:** 2026-09-30 · **Estado:** desplegada y verificada (HTTP 200 con JWT real)
**Repo que la invoca:** `ord-admin` (panel Admin)
**SQL fuente:** `ord-admin/admin/sql/fase_c_fn_admin_funnel_onboarding.sql`
**Actualizado:** 2026-10-09 (pasos legales desde el log `p_legal_consentimientos`)

## Firma

```sql
public.fn_admin_funnel_onboarding(
    p_desde timestamptz DEFAULT now() - interval '90 days',
    p_hasta timestamptz DEFAULT now(),
    p_app_version text, p_platform text, p_plan text, p_cohorte text
) RETURNS jsonb
```

## Que hace

Funnel de onboarding de la pantalla Onboarding del Admin (PRD telemetria §19.2),
12 pasos, por COHORTE DE ALTA en la ventana (default 90 dias). Preguntas §28: 5,6,7,8,9.

**Fuente de los pasos legales:** desde la migración legal (2026-10-09) los pasos
2, 3 y 4 se derivan del log append-only `p_legal_consentimientos` (eventos
`abierto` / `aceptado`), no de las columnas de `usuarios`. El resto de los pasos
siguen derivándose de ESTADO. Cada paso trae `origen`:

- `estado`: 1_alta (cohorte), 2_abrio_terminos (EXISTS `abierto` de terminos),
  3_abrio_privacy (EXISTS `abierto` de privacidad), 4_acepto (EXISTS `aceptado`
  de terminos), 5_acepto_sin_abrir (aceptado AND NOT abierto(terminos) AND NOT
  abierto(privacidad)), 12_primer_movimiento (min p_caja.fecha)
- `estado_proxy`: 6_abandono (NOT aceptado AND last_session_at IS NOT NULL),
  7_onboarding_iniciado (p_config_region existe), 8_billetera_principal
  (active_wallet_count>0), 9_saldo_inicial (billetera sin saldo_inicial_pendiente),
  10_dia_ancla (p_presupuestos_config existe), 11_onboarding_completado (region+billetera)

Mapeo fiel: `4_acepto` usa solo `terminos` porque la columna previa
`consentimiento_legal_at` se setea cuando viene `terminos_version`; el
consentimiento de privacidad no la movía.

`timing_primer_movimiento`: p50_dias (crudo), p50_dias_post_alta,
n_movimientos_pre_alta. Verificado: hay usuarios con movimientos FECHADOS ANTES
del alta (legado/historico del seed, user_ids 84/86/85) → el p50 crudo puede salir
negativo; NO es un bug, es data. La UI muestra p50_dias_post_alta como headline.

- `p_plan`/`p_app_version`/`p_platform` aceptados y reservados (funnel por cohorte).
- SECURITY DEFINER, gate fn_admin_session(), REVOKE anon, auditoria con ventana.
- Orden de pasos: numerico (split_part(paso,'_',1)::int), no lexicografico.
- `meta.notas` incluye dos textos actualizados en la migración legal: el gate legal
  ya está instrumentado (`p_legal_consentimientos_instrumentado_desde_esta_version`).
  Mismas claves y cantidad de notas; solo cambia el texto informativo que muestra el panel.

## Código SQL

```sql
CREATE OR REPLACE FUNCTION public.fn_admin_funnel_onboarding(p_desde timestamp with time zone DEFAULT (now() - '90 days'::interval), p_hasta timestamp with time zone DEFAULT now(), p_app_version text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_plan text DEFAULT NULL::text, p_cohorte text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session jsonb;
    v_result  jsonb;
    v_tz      constant text := 'America/Argentina/Buenos_Aires';
BEGIN
    v_session := public.fn_admin_session();

    IF p_desde > p_hasta THEN
        RAISE EXCEPTION '{"key": "error_invalid_range", "params": {}}';
    END IF;

    WITH cohorte AS (
        SELECT u.user_id,
               u.creado_at,
               u.last_session_at
        FROM public.usuarios u
        WHERE u.deleted_at IS NULL
          AND u.creado_at >= p_desde AND u.creado_at <= p_hasta
          AND (p_cohorte IS NULL
               OR to_char(u.creado_at AT TIME ZONE v_tz, 'YYYY-MM') = p_cohorte)
    ),
    senales AS (
        SELECT c.user_id,
               EXISTS (SELECT 1 FROM public.p_legal_consentimientos l
                        WHERE l.user_id = c.user_id
                          AND l.doc_type = 'terminos'
                          AND l.evento = 'abierto')                AS abrio_terminos,
               EXISTS (SELECT 1 FROM public.p_legal_consentimientos l
                        WHERE l.user_id = c.user_id
                          AND l.doc_type = 'privacidad'
                          AND l.evento = 'abierto')                AS abrio_privacy,
               EXISTS (SELECT 1 FROM public.p_legal_consentimientos l
                        WHERE l.user_id = c.user_id
                          AND l.doc_type = 'terminos'
                          AND l.evento = 'aceptado')               AS acepto,
               (r.creado_at IS NOT NULL)                        AS inicio_setup,
               (coalesce(m.active_wallet_count,0) > 0)         AS tiene_billetera,
               (pc.user_id IS NOT NULL)                        AS config_budjet,
               EXISTS (SELECT 1 FROM public.p_billeteras b
                        WHERE b.user_id = c.user_id
                          AND b.saldo_inicial_pendiente)       AS saldo_pendiente,
               (x.primer_mov IS NOT NULL)                      AS hay_movimiento,
               x.primer_mov,
               c.last_session_at
        FROM cohorte c
        LEFT JOIN public.p_config_region r ON r.user_id = c.user_id
        LEFT JOIN public.p_presupuestos_config pc ON pc.user_id = c.user_id
        LEFT JOIN public.p_telemetry_user_metrics m ON m.user_id = c.user_id
        LEFT JOIN (SELECT user_id, min(fecha)::timestamptz AS primer_mov
                     FROM public.p_caja
                    WHERE tipo IN ('expense','income','transfer')
                    GROUP BY user_id) x ON x.user_id = c.user_id
    ),
    paso AS (
        SELECT '1_alta'                      AS paso, count(*)                          AS n, 'estado'       AS origen FROM senales
        UNION ALL
        SELECT '2_abrio_terminos',            count(*) FILTER (WHERE abrio_terminos),  'estado'       FROM senales
        UNION ALL
        SELECT '3_abrio_privacy',             count(*) FILTER (WHERE abrio_privacy),   'estado'       FROM senales
        UNION ALL
        SELECT '4_acepto',                    count(*) FILTER (WHERE acepto),          'estado'       FROM senales
        UNION ALL
        SELECT '5_acepto_sin_abrir',          count(*) FILTER (WHERE acepto AND NOT abrio_terminos AND NOT abrio_privacy), 'estado' FROM senales
        UNION ALL
        SELECT '6_abandono',                  count(*) FILTER (WHERE NOT acepto AND last_session_at IS NOT NULL), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '7_onboarding_iniciado',       count(*) FILTER (WHERE inicio_setup),    'estado_proxy' FROM senales
        UNION ALL
        SELECT '8_billetera_principal',       count(*) FILTER (WHERE tiene_billetera), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '9_saldo_inicial',             count(*) FILTER (WHERE tiene_billetera AND NOT saldo_pendiente), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '10_dia_ancla',                count(*) FILTER (WHERE config_budjet),    'estado_proxy' FROM senales
        UNION ALL
        SELECT '11_onboarding_completado',    count(*) FILTER (WHERE inicio_setup AND tiene_billetera), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '12_primer_movimiento',          count(*) FILTER (WHERE hay_movimiento),  'estado'       FROM senales
    )
    SELECT jsonb_build_object(
        'cohort', jsonb_build_object(
            'desde', p_desde, 'hasta', p_hasta,
            'usuarios_alta', (SELECT count(*) FROM cohorte)),
        'pasos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'paso',   p.paso,
                       'usuarios', p.n,
                       'origen', p.origen,
                       'pct_alta', round(100.0 * p.n / NULLIF((SELECT count(*) FROM cohorte),0), 1),
                       'pct_previo', NULL  -- el orden no es estrictamente lineal;
                                             -- la UI muestra cada paso vs alta
                   ) ORDER BY split_part(p.paso, '_', 1)::int)
            FROM paso p), '[]'::jsonb),
        'timing_primer_movimiento', jsonb_build_object(
            'nota', 'dias entre alta y primer movimiento; negativos = movimientos con fecha anterior al alta (legado/historico)',
            'p50_dias', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                            ORDER BY ((s.primer_mov AT TIME ZONE v_tz)::date
                                   - (c.creado_at AT TIME ZONE v_tz)::date)::float8))::int
                         FROM senales s JOIN cohorte c ON c.user_id = s.user_id
                         WHERE s.primer_mov IS NOT NULL),
            'p50_dias_post_alta', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                            ORDER BY ((s.primer_mov AT TIME ZONE v_tz)::date
                                   - (c.creado_at AT TIME ZONE v_tz)::date)::float8))::int
                         FROM senales s JOIN cohorte c ON c.user_id = s.user_id
                         WHERE s.primer_mov IS NOT NULL
                           AND (s.primer_mov AT TIME ZONE v_tz)::date
                               >= (c.creado_at AT TIME ZONE v_tz)::date),
            'n_movimientos_pre_alta', (SELECT count(*)
                         FROM senales s JOIN cohorte c ON c.user_id = s.user_id
                         WHERE s.primer_mov IS NOT NULL
                           AND (s.primer_mov AT TIME ZONE v_tz)::date
                               < (c.creado_at AT TIME ZONE v_tz)::date),
            'origen', 'estado'),
        'meta', jsonb_build_object(
            'admin', v_session ->> 'email',
            'notas', jsonb_build_array(
                'funnel_mixto_pasos_legales_desde_log_de_eventos_resto_derivado_de_estado',
                'p_legal_consentimientos_instrumentado_desde_esta_version',
                'los_pasos_con_origen_estado_proxy_no_son_eventos_reales',
                'el_paso_6_abandono_es_abrieron_sin_aceptar_legal',
                'orden_de_pasos_numeric_no_lexicografico'))
    ) INTO v_result;

    INSERT INTO public.admin_audit_log (accion, admin_caller, resultado, parametros)
    VALUES ('fn_admin_funnel_onboarding',
            v_session ->> 'email',
            'ok',
            jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'cohorte', p_cohorte));

    RETURN v_result;
END;
$function$;
DECLARE
    v_session jsonb;
    v_result  jsonb;
    v_tz      constant text := 'America/Argentina/Buenos_Aires';
BEGIN
    v_session := public.fn_admin_session();

    IF p_desde > p_hasta THEN
        RAISE EXCEPTION '{"key": "error_invalid_range", "params": {}}';
    END IF;

    WITH cohorte AS (
        SELECT u.user_id,
               u.creado_at,
               u.last_session_at
        FROM public.usuarios u
        WHERE u.deleted_at IS NULL
          AND u.creado_at >= p_desde AND u.creado_at <= p_hasta
          AND (p_cohorte IS NULL
               OR to_char(u.creado_at AT TIME ZONE v_tz, 'YYYY-MM') = p_cohorte)
    ),
    senales AS (
        SELECT c.user_id,
               EXISTS (SELECT 1 FROM public.p_legal_consentimientos l
                        WHERE l.user_id = c.user_id
                          AND l.doc_type = 'terminos'
                          AND l.evento = 'abierto')                AS abrio_terminos,
               EXISTS (SELECT 1 FROM public.p_legal_consentimientos l
                        WHERE l.user_id = c.user_id
                          AND l.doc_type = 'privacidad'
                          AND l.evento = 'abierto')                AS abrio_privacy,
               EXISTS (SELECT 1 FROM public.p_legal_consentimientos l
                        WHERE l.user_id = c.user_id
                          AND l.doc_type = 'terminos'
                          AND l.evento = 'aceptado')               AS acepto,
               (r.creado_at IS NOT NULL)                        AS inicio_setup,
               (coalesce(m.active_wallet_count,0) > 0)         AS tiene_billetera,
               (pc.user_id IS NOT NULL)                        AS config_budjet,
               EXISTS (SELECT 1 FROM public.p_billeteras b
                        WHERE b.user_id = c.user_id
                          AND b.saldo_inicial_pendiente)       AS saldo_pendiente,
               (x.primer_mov IS NOT NULL)                      AS hay_movimiento,
               x.primer_mov,
               c.last_session_at
        FROM cohorte c
        LEFT JOIN public.p_config_region r ON r.user_id = c.user_id
        LEFT JOIN public.p_presupuestos_config pc ON pc.user_id = c.user_id
        LEFT JOIN public.p_telemetry_user_metrics m ON m.user_id = c.user_id
        LEFT JOIN (SELECT user_id, min(fecha)::timestamptz AS primer_mov
                     FROM public.p_caja
                    WHERE tipo IN ('expense','income','transfer')
                    GROUP BY user_id) x ON x.user_id = c.user_id
    ),
    paso AS (
        SELECT '1_alta'                      AS paso, count(*)                          AS n, 'estado'       AS origen FROM senales
        UNION ALL
        SELECT '2_abrio_terminos',            count(*) FILTER (WHERE abrio_terminos),  'estado'       FROM senales
        UNION ALL
        SELECT '3_abrio_privacy',             count(*) FILTER (WHERE abrio_privacy),   'estado'       FROM senales
        UNION ALL
        SELECT '4_acepto',                    count(*) FILTER (WHERE acepto),          'estado'       FROM senales
        UNION ALL
        SELECT '5_acepto_sin_abrir',          count(*) FILTER (WHERE acepto AND NOT abrio_terminos AND NOT abrio_privacy), 'estado' FROM senales
        UNION ALL
        SELECT '6_abandono',                  count(*) FILTER (WHERE NOT acepto AND last_session_at IS NOT NULL), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '7_onboarding_iniciado',       count(*) FILTER (WHERE inicio_setup),    'estado_proxy' FROM senales
        UNION ALL
        SELECT '8_billetera_principal',       count(*) FILTER (WHERE tiene_billetera), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '9_saldo_inicial',             count(*) FILTER (WHERE tiene_billetera AND NOT saldo_pendiente), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '10_dia_ancla',                count(*) FILTER (WHERE config_budjet),    'estado_proxy' FROM senales
        UNION ALL
        SELECT '11_onboarding_completado',    count(*) FILTER (WHERE inicio_setup AND tiene_billetera), 'estado_proxy' FROM senales
        UNION ALL
        SELECT '12_primer_movimiento',          count(*) FILTER (WHERE hay_movimiento),  'estado'       FROM senales
    )
    SELECT jsonb_build_object(
        'cohort', jsonb_build_object(
            'desde', p_desde, 'hasta', p_hasta,
            'usuarios_alta', (SELECT count(*) FROM cohorte)),
        'pasos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'paso',   p.paso,
                       'usuarios', p.n,
                       'origen', p.origen,
                       'pct_alta', round(100.0 * p.n / NULLIF((SELECT count(*) FROM cohorte),0), 1),
                       'pct_previo', NULL  -- el orden no es estrictamente lineal;
                                             -- la UI muestra cada paso vs alta
                   ) ORDER BY split_part(p.paso, '_', 1)::int)
            FROM paso p), '[]'::jsonb),
        'timing_primer_movimiento', jsonb_build_object(
            'nota', 'dias entre alta y primer movimiento; negativos = movimientos con fecha anterior al alta (legado/historico)',
            'p50_dias', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                            ORDER BY ((s.primer_mov AT TIME ZONE v_tz)::date
                                   - (c.creado_at AT TIME ZONE v_tz)::date)::float8))::int
                         FROM senales s JOIN cohorte c ON c.user_id = s.user_id
                         WHERE s.primer_mov IS NOT NULL),
            'p50_dias_post_alta', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                            ORDER BY ((s.primer_mov AT TIME ZONE v_tz)::date
                                   - (c.creado_at AT TIME ZONE v_tz)::date)::float8))::int
                         FROM senales s JOIN cohorte c ON c.user_id = s.user_id
                         WHERE s.primer_mov IS NOT NULL
                           AND (s.primer_mov AT TIME ZONE v_tz)::date
                               >= (c.creado_at AT TIME ZONE v_tz)::date),
            'n_movimientos_pre_alta', (SELECT count(*)
                         FROM senales s JOIN cohorte c ON c.user_id = s.user_id
                         WHERE s.primer_mov IS NOT NULL
                           AND (s.primer_mov AT TIME ZONE v_tz)::date
                               < (c.creado_at AT TIME ZONE v_tz)::date),
            'origen', 'estado'),
        'meta', jsonb_build_object(
            'admin', v_session ->> 'email',
            'notas', jsonb_build_array(
                'funnel_mixto_pasos_legales_desde_log_de_eventos_resto_derivado_de_estado',
                'p_legal_consentimientos_instrumentado_desde_esta_version',
                'los_pasos_con_origen_estado_proxy_no_son_eventos_reales',
                'el_paso_6_abandono_es_abrieron_sin_aceptar_legal',
                'orden_de_pasos_numeric_no_lexicografico'))
    ) INTO v_result;

    INSERT INTO public.admin_audit_log (accion, admin_caller, resultado, parametros)
    VALUES ('fn_admin_funnel_onboarding',
            v_session ->> 'email',
            'ok',
            jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'cohorte', p_cohorte));

    RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';
```

## Verificacion hecha (2026-09-30)

- sin JWT → error_unauthorized ✔ · JWT real → 200 con 12 pasos en orden numerico ✔
- coherencia con estado: 17 en cohorte, 9 aceptaron legal (8 sin abrir docs),
  11 con movimiento, p50_post_alta 0 dias, 8 movimientos pre-alta (legado) ✔

## Cambio (2026-10-09)

Migración al log legal (`p_legal_consentimientos`), dentro de la Tanda 0 del
versionado legal. El contrato de salida queda intacto: mismas claves, mismo shape,
mismos `paso`, mismos `origen`, mismo timing y mismos filtros de cohorte/ventana.
Solo cambian de fuente los pasos 2, 3 y 4 (`abierto`/`aceptado` del log en lugar de
las columnas de `usuarios`) y dos textos de `meta.notas` que quedaban falsos.
El bloque 4 de `07_backfill_semillas.sql` (DROP de columnas legales) **no** fue
aplicado en Supabase: está diferido.
