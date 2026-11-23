CREATE OR REPLACE FUNCTION public.fn_prestamos_listar(p_direccion text, p_incluir_saldados boolean DEFAULT false)
 RETURNS TABLE(prestamo_id bigint, direccion text, contraparte text, nombre text, moneda text, saldo_pendiente numeric, monto_original numeric, pagado_registrado numeric, estado text, estado_vencimiento text, proximo_vencimiento date, tasa numeric, tasa_informada boolean, modalidad text, tiene_cronograma boolean, contraparte_user_id bigint, contraparte_nombre text, contraparte_integrante boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    IF p_direccion IS NOT NULL AND p_direccion NOT IN ('debo', 'me_deben') THEN
        RAISE EXCEPTION 'error_invalid_direction';
    END IF;

    RETURN QUERY
    SELECT p.prestamo_id,
           p.tipo_flujo::text,
           p.entidad_nombre::text,
           COALESCE(p.nombre_prestamo, p.entidad_nombre)::text,
           trim(p.moneda_iso)::text,
           p.saldo_actual,
           p.monto_original,
           p.monto_pagado_acumulado,
           p.estado::text,
           public.fn_prestamos_estado_vencimiento(p.prestamo_id),
           p.proximo_vencimiento,
           p.tasa_anual_tna,
           p.tasa_informada,
           p.modalidad,
           EXISTS (SELECT 1 FROM public.p_prestamos_cuotas c WHERE c.prestamo_id = p.prestamo_id) AS tiene_cronograma,
           -- The named counterparty, if the loan declares one. LEFT JOIN on the primary
           -- key, so a loan without counterparty keeps NULL and no row is multiplied.
           p.contraparte_user_id,
           ct.nombre::text AS contraparte_nombre,
           -- The classification the Partner screen needs, decided here because only the
           -- server knows who belongs to the caller's household: the counterparty of this
           -- loan is a member of MY household. v_user_id is deliberately NOT compared: a
           -- co-owned loan naming B belongs to A's group and to B's group, and for B the
           -- counterparty is B itself. False when the loan names nobody, when the
           -- counterparty lives outside the household, and always false when the caller
           -- belongs to no household.
           (p.contraparte_user_id IS NOT NULL
            AND v_hogar_id IS NOT NULL
            AND EXISTS (SELECT 1
                        FROM public.p_hogar_participantes hp
                        WHERE hp.user_id = p.contraparte_user_id
                          AND hp.hogar_id = v_hogar_id)) AS contraparte_integrante
    FROM public.p_prestamos p
    LEFT JOIN public.usuarios ct ON ct.user_id = p.contraparte_user_id
    WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
      AND (p_direccion IS NULL OR p.tipo_flujo = p_direccion)
      AND p.estado <> 'eliminado'
      AND p.estado <> 'archivado'
      AND (COALESCE(p_incluir_saldados, false) OR p.estado <> 'pagado')
    ORDER BY
        -- Settled at the bottom, then the real debt pressure first.
        (p.estado = 'pagado') ASC,
        p.proximo_vencimiento ASC NULLS LAST,
        p.saldo_actual DESC,
        p.prestamo_id ASC;
END;
$function$
