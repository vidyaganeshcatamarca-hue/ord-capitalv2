-- Etapa 1 del módulo presupuesto: prueba de integridad transaccional.
--
-- Se ejecuta en UNA transacción que termina en RAISE EXCEPTION: crea sus propios datos
-- sintéticos, verifica las seis conductas y revierte todo. Nunca deja una fila.
--
-- Casos:
--   A · asignar dinero a una subcategoría se rechaza y no mueve nada
--   B · crear una subcategoría no le saca la plata al padre
--   C · transferir cubriendo un déficit conserva la suma firmada y sube el libre ese déficit
--   D · reintentar la misma transferencia (misma clave) no mueve dinero
--   E · transferir sin déficit no mueve el libre
--   F · transferir desde un origen sin fila crea la fila en negativo, sin duplicar el arrastre
--
-- El resultado viaja en el mensaje de la excepción, como JSON. El runner lo lee y sale
-- con código distinto de cero si algún caso falla.
DO $t$
DECLARE
    v_jwt text;
    v_uid bigint;
    v_ciclo date := date_trunc('month', CURRENT_DATE)::date;
    v_ant date := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date;
    p_padre bigint; p_hijo bigint; p_a bigint; p_b bigint; p_c bigint;
    v_num numeric; v_num2 numeric; v_libre numeric; v_libre2 numeric;
    v_hay boolean;
    r jsonb := '[]'::jsonb;
BEGIN
    SELECT user_id, auth_id::text INTO v_uid, v_jwt
      FROM public.usuarios WHERE user_id = {{USUARIO}} AND auth_id IS NOT NULL;
    IF v_uid IS NULL THEN RAISE EXCEPTION 'no hay usuario para probar'; END IF;
        -- Cuenta de prueba designada (no se elige sola) y modo forzado dentro de la
    -- transaccion: las dos cuentas designadas son de libertad y esta prueba necesita
    -- base cero. Todo esto se revierte al final.
    UPDATE public.p_presupuestos_config SET modo_presupuesto = 'base_cero' WHERE user_id = v_uid;
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_jwt, 'role', 'authenticated')::text, true);

    -- fixtures sintéticos, todos revertidos al final
    INSERT INTO public.p_estructuras_egresos (user_id, nombre_cuenta) VALUES (v_uid,'etapa1_padre') RETURNING estructura_id INTO p_padre;
    INSERT INTO public.p_estructuras_egresos (user_id, nombre_cuenta, padre_id) VALUES (v_uid,'etapa1_hijo',p_padre) RETURNING estructura_id INTO p_hijo;
    INSERT INTO public.p_estructuras_egresos (user_id, nombre_cuenta) VALUES (v_uid,'etapa1_a') RETURNING estructura_id INTO p_a;
    INSERT INTO public.p_estructuras_egresos (user_id, nombre_cuenta) VALUES (v_uid,'etapa1_b') RETURNING estructura_id INTO p_b;
    INSERT INTO public.p_estructuras_egresos (user_id, nombre_cuenta) VALUES (v_uid,'etapa1_c') RETURNING estructura_id INTO p_c;

    INSERT INTO public.p_presupuestos (estructura_egreso_id,user_id,monto_limite,mes_periodo,dia_ancla)
    VALUES (p_padre,v_uid,100000,v_ciclo,1),(p_hijo,v_uid,0,v_ciclo,1),
           (p_a,v_uid,50000,v_ciclo,1),(p_b,v_uid,-20000,v_ciclo,1);

    -- A · asignar a una subcategoría
    BEGIN
        PERFORM public.fn_asignar_presupuesto(p_hijo, 5000, v_ciclo);
        r := r || jsonb_build_object('caso','A asignar a hijo','ok',false,'detalle','no rechazo');
    EXCEPTION WHEN OTHERS THEN
        SELECT COALESCE(monto_limite,0) INTO v_num FROM public.p_presupuestos
         WHERE estructura_egreso_id=p_hijo AND mes_periodo=v_ciclo AND user_id=v_uid;
        SELECT COALESCE(monto_limite,0) INTO v_num2 FROM public.p_presupuestos
         WHERE estructura_egreso_id=p_padre AND mes_periodo=v_ciclo AND user_id=v_uid;
        r := r || jsonb_build_object('caso','A asignar a hijo','ok',
              (SQLERRM LIKE '%error_budget_child_holds_no_money%' AND v_num=0 AND v_num2=100000),
              'error',left(SQLERRM,60),'hijo',v_num,'padre',v_num2);
    END;

    -- B · crear una subcategoría
    BEGIN
        PERFORM public.fn_crear_subcuenta_egreso(p_padre,'etapa1_nueva','desc_quick_load','X');
        SELECT COALESCE(monto_limite,0) INTO v_num FROM public.p_presupuestos
         WHERE estructura_egreso_id=p_padre AND mes_periodo=v_ciclo AND user_id=v_uid;
        SELECT EXISTS(SELECT 1 FROM public.p_presupuestos pr JOIN public.p_estructuras_egresos e
                       ON e.estructura_id=pr.estructura_egreso_id
                      WHERE e.padre_id=p_padre AND e.nombre_cuenta='no_detail' AND pr.monto_limite<>0)
          INTO v_hay;
        r := r || jsonb_build_object('caso','B crear subcategoria','ok',(v_num=100000 AND NOT v_hay),
              'padre_despues',v_num,'plata_en_no_detail',v_hay);
    EXCEPTION WHEN OTHERS THEN
        r := r || jsonb_build_object('caso','B crear subcategoria','ok',false,'error',left(SQLERRM,120));
    END;

    -- C · transferir cubriendo un déficit
    v_libre := public.fn_obtener_saldo_a_asignar(v_ciclo);
    PERFORM public.fn_transferir_entre_sobres(p_a, p_b, 30000, v_ciclo, 'clave-C');
    v_libre2 := public.fn_obtener_saldo_a_asignar(v_ciclo);
    SELECT COALESCE(monto_limite,0) INTO v_num FROM public.p_presupuestos
     WHERE estructura_egreso_id=p_a AND mes_periodo=v_ciclo AND user_id=v_uid;
    SELECT COALESCE(monto_limite,0) INTO v_num2 FROM public.p_presupuestos
     WHERE estructura_egreso_id=p_b AND mes_periodo=v_ciclo AND user_id=v_uid;
    r := r || jsonb_build_object('caso','C transferir sobre deficit','ok',
          (v_num=20000 AND v_num2=10000 AND (v_num+v_num2)=30000 AND (v_libre2-v_libre)=20000),
          'origen',v_num,'destino',v_num2,'suma',v_num+v_num2,'libre_antes',v_libre,'libre_despues',v_libre2);

    -- D · reintento con la misma clave
    PERFORM public.fn_transferir_entre_sobres(p_a, p_b, 30000, v_ciclo, 'clave-C');
    SELECT COALESCE(monto_limite,0) INTO v_num FROM public.p_presupuestos
     WHERE estructura_egreso_id=p_a AND mes_periodo=v_ciclo AND user_id=v_uid;
    SELECT COALESCE(monto_limite,0) INTO v_num2 FROM public.p_presupuestos
     WHERE estructura_egreso_id=p_b AND mes_periodo=v_ciclo AND user_id=v_uid;
    r := r || jsonb_build_object('caso','D reintento misma clave','ok',(v_num=20000 AND v_num2=10000),
          'origen',v_num,'destino',v_num2);

    -- E · transferir sin déficit
    v_libre := public.fn_obtener_saldo_a_asignar(v_ciclo);
    PERFORM public.fn_transferir_entre_sobres(p_a, p_b, 10000, v_ciclo, 'clave-E');
    v_libre2 := public.fn_obtener_saldo_a_asignar(v_ciclo);
    SELECT COALESCE(monto_limite,0) INTO v_num FROM public.p_presupuestos
     WHERE estructura_egreso_id=p_a AND mes_periodo=v_ciclo AND user_id=v_uid;
    SELECT COALESCE(monto_limite,0) INTO v_num2 FROM public.p_presupuestos
     WHERE estructura_egreso_id=p_b AND mes_periodo=v_ciclo AND user_id=v_uid;
    r := r || jsonb_build_object('caso','E transferir sin deficit','ok',(v_num=10000 AND v_num2=20000 AND v_libre2=v_libre),
          'origen',v_num,'destino',v_num2,'libre_antes',v_libre,'libre_despues',v_libre2);

    -- F · origen sin fila en el ciclo pero con arrastre positivo
    INSERT INTO public.p_presupuestos (estructura_egreso_id,user_id,monto_limite,mes_periodo,dia_ancla)
    VALUES (p_c,v_uid,40000,v_ant,1);
    DELETE FROM public.p_presupuestos WHERE estructura_egreso_id=p_c AND mes_periodo=v_ciclo AND user_id=v_uid;
    v_num := public.fn_disponible_transferible(p_c, v_ciclo);
    IF COALESCE(v_num,0) >= 10000 THEN
        PERFORM public.fn_transferir_entre_sobres(p_c, p_a, 10000, v_ciclo, 'clave-F');
        SELECT COALESCE(monto_limite,0) INTO v_num2 FROM public.p_presupuestos
         WHERE estructura_egreso_id=p_c AND mes_periodo=v_ciclo AND user_id=v_uid;
        r := r || jsonb_build_object('caso','F origen sin fila','ok',(v_num2=-10000),
              'disponible_antes',v_num,'fila_creada',v_num2,
              'disponible_despues',public.fn_disponible_transferible(p_c, v_ciclo));
    ELSE
        r := r || jsonb_build_object('caso','F origen sin fila','ok',false,
              'detalle','no se pudo armar arrastre positivo','disponible',v_num);
    END IF;

    RAISE EXCEPTION 'RESULTADO %', r::text;
END;
$t$;
