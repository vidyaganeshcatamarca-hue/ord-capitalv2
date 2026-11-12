CREATE OR REPLACE FUNCTION public.fn_aviso_ahorro_en_riesgo()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_s          record;
    v_u          record;
    v_inicio     date;
    v_total      integer;
    v_transc     integer;
    v_espera     date;
    v_restantes  integer;
    v_ventana    integer;
    v_base       numeric;
    v_esperado   numeric;
    v_avance     numeric;
    v_por_user   jsonb := '{}'::jsonb;
    v_encolados  integer := 0;
    v_id         bigint;
BEGIN
    FOR v_s IN
        SELECT sobre_id, user_id, monto_meta, fecha_objetivo,
               COALESCE(plan_inicio_at, creado_at::date) AS inicio
        FROM public.p_sobres
        WHERE archivado_at IS NULL
          AND monto_meta IS NOT NULL
          AND fecha_objetivo IS NOT NULL
          AND fecha_objetivo >= CURRENT_DATE
    LOOP
        v_inicio := v_s.inicio;
        v_total  := (v_s.fecha_objetivo - v_inicio)::int;
        IF v_total <= 0 THEN CONTINUE; END IF;

        -- Periodo de gracia, igual que fn_sobre_plan: antes no se evalua el ritmo.
        v_espera := (v_inicio + CASE
            WHEN v_s.fecha_objetivo < (v_inicio + INTERVAL '1 month') THEN INTERVAL '7 days'
            ELSE INTERVAL '1 month'
        END)::date;
        IF CURRENT_DATE < v_espera THEN CONTINUE; END IF;

        -- Ventana de la Definicion 32.
        v_restantes := (v_s.fecha_objetivo - CURRENT_DATE)::int;
        v_ventana := CASE
            WHEN v_s.fecha_objetivo < (v_inicio + INTERVAL '6 months') THEN 7
            ELSE 14
        END;
        IF v_restantes > v_ventana THEN CONTINUE; END IF;

        -- Ritmo esperado a esta altura del plan.
        v_transc := (CURRENT_DATE - v_inicio)::int;
        v_base   := public.fn_sobre_saldo_base(v_s.sobre_id, v_inicio);
        v_esperado := v_base + (v_s.monto_meta - v_base) * (v_transc::numeric / v_total);

        IF v_esperado <= 0 THEN CONTINUE; END IF;

        v_avance := public.fn_sobre_saldo(v_s.sobre_id) / v_esperado;
        IF v_avance >= 0.60 THEN CONTINUE; END IF;   -- verde o amarillo no avisan

        v_por_user := jsonb_set(
            v_por_user,
            ARRAY[v_s.user_id::text],
            to_jsonb(COALESCE((v_por_user ->> v_s.user_id::text)::int, 0) + 1)
        );
    END LOOP;

    FOR v_u IN SELECT key::bigint AS user_id, value::int AS sobres FROM jsonb_each_text(v_por_user)
    LOOP
        v_id := public.fn_encolar_aviso(
            p_user_id    => v_u.user_id,
            p_tipo       => 'ahorro_en_riesgo',
            p_categoria  => 'ahorro',
            p_metadata   => jsonb_build_object('sobres', v_u.sobres),
            p_prioridad  => 20::smallint,
            p_dedupe_key => 'ahorro_en_riesgo:' || to_char(CURRENT_DATE, 'YYYYMMDD'),
            p_expira_at  => (CURRENT_DATE + 1)::timestamptz
        );

        IF v_id IS NOT NULL THEN
            v_encolados := v_encolados + 1;
        END IF;
    END LOOP;

    RETURN v_encolados;
END;
$function$
