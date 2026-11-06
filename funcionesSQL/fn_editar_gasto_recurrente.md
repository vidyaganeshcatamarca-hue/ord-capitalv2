CREATE OR REPLACE FUNCTION public.fn_editar_gasto_recurrente(p_recurrente_id bigint, p_nombre_custom text, p_monto_base numeric, p_dia_del_mes integer DEFAULT NULL::integer, p_frecuencia text DEFAULT NULL::text, p_tipo_variabilidad text DEFAULT 'fijo'::text, p_billetera_defecto_id bigint DEFAULT NULL::bigint, p_activo boolean DEFAULT true, p_modo text DEFAULT 'mensual'::text, p_dias_semana integer[] DEFAULT NULL::integer[], p_dias_mes integer[] DEFAULT NULL::integer[], p_fechas_anio integer[] DEFAULT NULL::integer[], p_motivo_pausa text DEFAULT NULL::text, p_fecha_unica date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_tarjeta_id bigint DEFAULT NULL::bigint, p_es_usd boolean DEFAULT false, p_estructura_egreso_id bigint DEFAULT NULL::bigint, p_naturaleza text DEFAULT NULL::text, p_estructura_ingreso_id bigint DEFAULT NULL::bigint, p_billetera_destino_id bigint DEFAULT NULL::bigint, p_fecha_base date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id     bigint;
    v_dias_mes    integer[];
    v_dias_semana integer[];
    v_fechas_anio integer[];
    v_fecha_unica date;
    v_dia_del_mes integer;
    v_frecuencia  text;
    v_motivo            text;
    v_naturaleza        text;
    v_naturaleza_actual text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_monto_base IS NULL OR p_monto_base <= 0 THEN
        RAISE EXCEPTION '{"key": "error_recurrent_monto_invalid", "params": {}}';
    END IF;

    IF p_tipo_variabilidad IS NULL
       OR p_tipo_variabilidad NOT IN ('fijo', 'promedio_historico') THEN
        RAISE EXCEPTION '{"key": "error_recurrent_variability_invalid", "params": {}}';
    END IF;

    IF p_modo IS NULL OR p_modo NOT IN ('semanal', 'mensual', 'anual', 'unica') THEN
        RAISE EXCEPTION '{"key": "error_recurrent_modo_invalid", "params": {}}';
    END IF;

    -- La naturaleza no se adivina: si el llamador no la manda (bundle viejo) se
    -- conserva la de la fila. Nunca se degrada un ingreso a egreso.
    SELECT COALESCE(r.naturaleza, 'egreso') INTO v_naturaleza_actual
      FROM public.p_gastos_recurrentes r
     WHERE r.recurrente_id = p_recurrente_id AND r.user_id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_recurrent_not_found", "params": {}}';
    END IF;
    v_naturaleza := COALESCE(NULLIF(p_naturaleza, ''), v_naturaleza_actual);

    -- ---------- naturaleza: egreso o ingreso ----------
    -- Un recurrente tiene una sola naturaleza. El ingreso no paga con tarjeta ni
    -- lleva categoria de egreso: cobra en una billetera destino. El egreso no
    -- lleva fuente de ingreso ni billetera destino.
    IF v_naturaleza NOT IN ('egreso', 'ingreso') THEN
        RAISE EXCEPTION '{"key": "error_recurrent_naturaleza_invalid", "params": {}}';
    END IF;

    IF v_naturaleza = 'ingreso' THEN
        IF p_tarjeta_id IS NOT NULL OR p_estructura_egreso_id IS NOT NULL
           OR p_billetera_defecto_id IS NOT NULL OR COALESCE(p_es_usd, false) THEN
            RAISE EXCEPTION '{"key": "error_recurrent_ingreso_origen_invalido", "params": {}}';
        END IF;
        IF p_billetera_destino_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_recurrent_billetera_destino_required", "params": {}}';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.p_billeteras w
                        WHERE w.billetera_id = p_billetera_destino_id
                          AND w.user_id = v_user_id) THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;
        IF p_estructura_ingreso_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.p_ingresos i
                            WHERE i.producto_id = p_estructura_ingreso_id
                              AND i.user_id = v_user_id) THEN
            RAISE EXCEPTION '{"key": "error_income_source_not_found", "params": {}}';
        END IF;
    ELSIF p_estructura_ingreso_id IS NOT NULL OR p_billetera_destino_id IS NOT NULL THEN
        RAISE EXCEPTION '{"key": "error_recurrent_egreso_origen_invalido", "params": {}}';
    END IF;

    IF p_tarjeta_id IS NOT NULL THEN
        IF p_billetera_defecto_id IS NOT NULL THEN
            RAISE EXCEPTION '{"key": "error_recurrent_origen_ambiguo", "params": {}}';
        END IF;
        IF p_modo <> 'mensual' THEN
            RAISE EXCEPTION '{"key": "error_recurrent_modo_tarjeta_invalid", "params": {}}';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.p_tarjetas_credito t
                        WHERE t.tarjeta_id = p_tarjeta_id AND t.user_id = v_user_id) THEN
            RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
        END IF;
    ELSIF p_es_usd IS TRUE THEN
        RAISE EXCEPTION '{"key": "error_recurrent_usd_sin_tarjeta", "params": {}}';
    END IF;

    IF p_modo = 'semanal' THEN
        IF p_dias_semana IS NULL OR cardinality(p_dias_semana) NOT BETWEEN 1 AND 7 THEN
            RAISE EXCEPTION '{"key": "error_recurrent_dates_required", "params": {"modo": "semanal"}}';
        END IF;
        v_dias_semana := (SELECT array_agg(DISTINCT d ORDER BY d)::integer[] FROM unnest(p_dias_semana) d);
        v_dias_mes := NULL; v_fechas_anio := NULL; v_fecha_unica := NULL;
        v_dia_del_mes := 1;
        v_frecuencia := 'mensual';

    ELSIF p_modo = 'mensual' THEN
        -- Con tarjeta NO se elige día: el día lo manda el cierre de la
        -- tarjeta y la ocurrencia se propone 3 días antes. Si el usuario no
        -- eligió días, se guardan las dos columnas en NULL.
        IF p_tarjeta_id IS NOT NULL AND p_dias_mes IS NULL AND p_dia_del_mes IS NULL THEN
            v_dias_mes := NULL;
            v_dia_del_mes := NULL;
        ELSE
            v_dias_mes := COALESCE(p_dias_mes, ARRAY[p_dia_del_mes]);
            IF v_dias_mes IS NULL
               OR cardinality(v_dias_mes) NOT BETWEEN 1 AND 31
               OR EXISTS (SELECT 1 FROM unnest(v_dias_mes) x WHERE x IS NULL) THEN
                RAISE EXCEPTION '{"key": "error_recurrent_dates_required", "params": {"modo": "mensual"}}';
            END IF;
            IF NOT (v_dias_mes <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]) THEN
                RAISE EXCEPTION '{"key": "error_recurrent_dates_invalid", "params": {"campo": "dias_mes"}}';
            END IF;
            v_dias_mes := (SELECT array_agg(DISTINCT d ORDER BY d)::integer[] FROM unnest(v_dias_mes) d);
            v_dia_del_mes := v_dias_mes[1];
        END IF;
        v_dias_semana := NULL; v_fechas_anio := NULL; v_fecha_unica := NULL;
        v_frecuencia := COALESCE(NULLIF(p_frecuencia, 'anual'), 'mensual');

    ELSIF p_modo = 'anual' THEN
        IF p_fechas_anio IS NULL OR cardinality(p_fechas_anio) < 1 THEN
            RAISE EXCEPTION '{"key": "error_recurrent_dates_required", "params": {"modo": "anual"}}';
        END IF;
        v_fechas_anio := (SELECT array_agg(DISTINCT d ORDER BY d)::integer[] FROM unnest(p_fechas_anio) d);
        v_dias_semana := NULL; v_dias_mes := NULL; v_fecha_unica := NULL;
        v_dia_del_mes := (v_fechas_anio[1] % 100)::int;
        v_frecuencia := 'anual';

    ELSE  -- unica
        IF p_fecha_unica IS NULL THEN
            RAISE EXCEPTION '{"key": "error_recurrent_dates_required", "params": {"modo": "unica"}}';
        END IF;
        v_fecha_unica := p_fecha_unica;
        v_dias_semana := NULL; v_dias_mes := NULL; v_fechas_anio := NULL;
        v_dia_del_mes := EXTRACT(DAY FROM p_fecha_unica)::int;
        v_frecuencia := 'anual';
    END IF;

    IF p_fecha_fin IS NOT NULL
       AND v_fecha_unica IS NOT NULL
       AND p_fecha_fin < v_fecha_unica THEN
        RAISE EXCEPTION '{"key": "error_recurrent_fecha_fin_invalid", "params": {}}';
    END IF;

    IF p_activo IS FALSE THEN
        v_motivo := COALESCE(p_motivo_pausa, 'pausado_por_usuario');
    ELSE
        v_motivo := NULL;
    END IF;

    UPDATE public.p_gastos_recurrentes SET
        -- La categoría (estructura de egreso) faltaba en el UPDATE: cambiarla en
        -- el modal se guardaba en el payload y se descartaba acá. COALESCE para
        -- que un cliente viejo, que no manda el parámetro, no la borre.
        estructura_egreso_id  = COALESCE(p_estructura_egreso_id, estructura_egreso_id),
        naturaleza            = v_naturaleza,
        estructura_ingreso_id = p_estructura_ingreso_id,
        billetera_destino_id  = p_billetera_destino_id,
        nombre_custom         = p_nombre_custom,
        monto_base            = p_monto_base,
        dia_del_mes           = v_dia_del_mes,
        frecuencia            = v_frecuencia,
        tipo_variabilidad     = p_tipo_variabilidad,
        billetera_defecto_id  = p_billetera_defecto_id,
        activo                = p_activo,
        modo                  = p_modo,
        dias_semana           = v_dias_semana,
        dias_mes              = v_dias_mes,
        fechas_anio           = v_fechas_anio,
        fecha_unica           = v_fecha_unica,
        fecha_fin             = p_fecha_fin,
        tarjeta_id            = p_tarjeta_id,
        es_usd                = COALESCE(p_es_usd, false),
        motivo_pausa          = v_motivo,
        pausado_at            = CASE WHEN p_activo IS FALSE THEN now() ELSE NULL END
     WHERE recurrente_id = p_recurrente_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_recurrent_not_found", "params": {}}';
    END IF;

    -- Al editar, el puntero se RECALCULA DESDE HOY. Sin esto quedaría apuntando
    -- a una fecha que ya no existe en el patrón nuevo (la ocurrencia nunca se
    -- generaría) o al pasado (se generaría el patrón viejo de nuevo).
    UPDATE public.p_gastos_recurrentes r
       SET proxima_ocurrencia = public.fn_recurrente_proxima_ocurrencia(
               r.modo, r.dias_semana, r.dias_mes, r.fechas_anio,
               r.fecha_unica, r.tarjeta_id, COALESCE(p_fecha_base, CURRENT_DATE))
     WHERE r.recurrente_id = p_recurrente_id;
END;
$function$
