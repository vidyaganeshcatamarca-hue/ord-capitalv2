-- 20261120b_prestamo_detalle_tipo_deuda.sql
--
-- T27 / S29. fn_prestamo_detalle did not return tipo_deuda, so the edit form could
-- not prefill it and re-saving silently kept whatever was stored. The column exists
-- on p_prestamos and fn_prestamo_editar already accepts p_tipo_deuda; only the
-- read side was missing.
--
-- One key added, same name as the column: 'tipo_deuda'. Every other key, and the
-- return type, is unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_prestamo_detalle(p_prestamo_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id bigint;
    v_p       public.p_prestamos%ROWTYPE;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    SELECT * INTO v_p
    FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;

    RETURN jsonb_build_object(
        'prestamo_id',        v_p.prestamo_id,
        'direccion',          v_p.tipo_flujo,
        'contraparte',        v_p.entidad_nombre,
        'nombre',             COALESCE(v_p.nombre_prestamo, v_p.entidad_nombre),
        'tipo_deuda',         v_p.tipo_deuda,
        'moneda',             trim(v_p.moneda_iso),
        'monto_original',     v_p.monto_original,
        'saldo_al_ingreso',   v_p.saldo_al_ingreso,
        'saldo_pendiente',    v_p.saldo_actual,
        'pagado_registrado',  v_p.monto_pagado_acumulado,
        'modalidad',          v_p.modalidad,
        'condicion_interes',  v_p.condicion_interes,
        'interes_total_acordado', v_p.interes_total_acordado,
        'tasa',               v_p.tasa_anual_tna,
        'tasa_informada',     v_p.tasa_informada,
        'estado',             v_p.estado,
        'estado_vencimiento', public.fn_prestamos_estado_vencimiento(v_p.prestamo_id),
        'proximo_vencimiento', v_p.proximo_vencimiento,
        'puntos_vinculo',     v_p.puntos_vinculo,
        'creado_at',          v_p.creado_at,
        'cuotas', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'cuota_id',           c.cuota_id,
                       'numero_cuota',       c.numero_cuota,
                       'fecha_vencimiento',  c.fecha_vencimiento,
                       'monto_cuota',        c.monto_cuota,
                       'capital_componente', c.capital_componente,
                       'interes_componente', c.interes_componente,
                       'vencida',            c.fecha_vencimiento <= CURRENT_DATE
                   ) ORDER BY c.numero_cuota)
            FROM public.p_prestamos_cuotas c
            WHERE c.prestamo_id = v_p.prestamo_id
        ), '[]'::jsonb),
        'pagos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'pago_id',          g.pago_id,
                       'direccion',        g.direccion,
                       'fecha',            g.fecha,
                       'p_caja_id',        g.p_caja_id,
                       'billetera_id',     g.billetera_id,
                       'moneda_billetera', g.moneda_billetera,
                       'monto_billetera',  g.monto_billetera,
                       'monto_aplicado',   g.monto_aplicado,
                       'capital_aplicado', g.capital_aplicado,
                       'interes_aplicado', g.interes_aplicado,
                       'interes_excedente', g.interes_excedente,
                       'nota',             g.nota,
                       'estado',           g.estado
                   ) ORDER BY g.fecha DESC, g.pago_id DESC)
            FROM public.p_prestamos_pagos g
            WHERE g.prestamo_id = v_p.prestamo_id
        ), '[]'::jsonb),
        'total_interes_excedente', COALESCE((
            SELECT SUM(g.interes_excedente)
            FROM public.p_prestamos_pagos g
            WHERE g.prestamo_id = v_p.prestamo_id AND g.estado = 'activo'
        ), 0)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_prestamo_detalle IS
    'Full detail of one loan as jsonb, including tipo_deuda so the edit form can prefill it.';

COMMIT;
