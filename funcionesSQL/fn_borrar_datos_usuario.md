# fn_borrar_datos_usuario (creada 2026-10-16 con OK del dueño: 'ejecuta a, b, c y d')

## Descripcion

Borrado de DATOS del usuario (menu-ajustes S15/T5c). La cuenta permanece; arranca de cero con datos frescos (onboarding nuevo en el arranque siguiente). No es `fn_eliminar_cuenta_usuario`: esa archiva la cuenta 30 dias.

**Firma vigente: `fn_borrar_datos_usuario(p_confirmacion_texto text, p_pin text DEFAULT NULL)`** (2 argumentos desde 20261119b; este espejo decia 1 y describia la palabra `'BORRAR DATOS'`, que no existe en ninguna version desplegada).

- `p_confirmacion_texto` debe ser exactamente `ERASE`. La palabra es FIJA y en ingles a proposito: el texto se compara exacto, asi que traducirla compararia una palabra espanola contra una portuguesa. La UI la envia como placeholder `{palabra}` (ver `src/lib/deleteConfirmation.ts`), de modo que ninguna traduccion futura pueda tocarla.
- `p_pin` es obligatorio pasados los 15 dias: `fn_verificar_pin` tiene que devolver `ok`. Sin PIN, `error_pin_no_configurado`; configurado hace menos de 24 h, `error_pin_espera_24h`; incorrecto, `error_pin_incorrecto`. Dentro de la ventana de 15 dias no se pide nada (regla S15 del dueño, elevada 10 -> 15).
- Identidad: `SECURITY DEFINER` + `auth.uid()` resuelto contra `usuarios.auth_id`. Ningun valor del cliente decide de quien son las filas.
- Mecanismo: `SET LOCAL session_replication_role = replica` y borrado por enumeracion `tabla|columna`. Los triggers estan apagados porque `tr_bloquear_categoria_inversion` devuelve NULL en DELETE, porque los BEFORE DELETE de `p_caja` levantan 27000 y porque `tr_caja_limpieza` reescribe tablas que se estan borrando.
- Hogar: la pertenencia del que reinicia se borra siempre; el contenido del hogar solo cuando no queda ningun otro participante (politica del dueño, 2026-11-19). El que se va pierde el acceso, no los saldos del otro.
- Retorno: `{ resultado:'borrado_datos_ok', user_id, entradas_con_filas, total_filas_eliminadas, detalle:[{tabla, columna, filas}] }`, solo con las tablas que tenian filas.

## Estado del espejo

El cuerpo de abajo es el **desplegado hoy**, leido con `pg_get_functiondef('public.fn_borrar_datos_usuario(text,text)')` el 2026-11-22: 46 pares `tabla|columna` sobre 44 tablas, post-condition escrita a mano.

La migracion `supabase/migrations/20261122a_borrado_datos_decisiones_aprobadas.sql` **todavia no fue aplicada**. Implementa las decisiones C1, C3, C4, C7, C8 y C9 del capitulo 5 de `odd/tasks/diagnostico-cierre-prestamos.md` y cambia este cuerpo: cuando se aplique, este archivo tiene que volver a copiarse desde `pg_get_functiondef`.

Respaldo del cuerpo actual, para revertir: `tests/prestamos/respaldo-fn-borrar-datos-usuario-20261119c.sql`.

## Codigo SQL (desplegado, verificado 2026-11-22)

```sql
CREATE OR REPLACE FUNCTION public.fn_borrar_datos_usuario(p_confirmacion_texto text, p_pin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id       bigint;
    v_creado_at     timestamptz;
    v_dias          int;
    v_pin_estado    text;
    v_pin_cambio    timestamptz;
    v_pin_ok        boolean;
    v_par           text;
    v_tabla         text;
    v_col           text;
    v_sql           text;
    v_filas         bigint;
    v_total         bigint := 0;
    v_detalle       jsonb := '[]'::jsonb;
    v_restantes     bigint;
    v_hogares       bigint[];
    v_vinculos      text[];
BEGIN
    -- 1. Identity (project rule: the row in usuarios decides, never a client value).
    SELECT user_id, creado_at INTO v_user_id, v_creado_at
    FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Exact text confirmation.
    IF p_confirmacion_texto IS DISTINCT FROM 'ERASE' THEN
        RAISE EXCEPTION '{"key": "error_confirmation_invalid", "params": {}}';
    END IF;

    -- 3. S15 enforced server-side, in the order the owner stated.
    v_dias := (now()::date - v_creado_at::date);
    IF v_dias > 15 THEN
        SELECT estado, pin_ultimo_cambio INTO v_pin_estado, v_pin_cambio
        FROM public.p_pin_seguridad WHERE user_id = v_user_id;

        IF v_pin_estado IS DISTINCT FROM 'activa' THEN
            RAISE EXCEPTION '{"key": "error_pin_no_configurado", "params": {}}';
        END IF;

        -- The wait. A PIN set minutes ago cannot authorise a wipe; a legacy row with no
        -- timestamp is treated as old enough, so pre-existing PINs keep working.
        IF COALESCE(v_pin_cambio, '-infinity'::timestamptz) > now() - interval '24 hours' THEN
            RAISE EXCEPTION '{"key": "error_pin_espera_24h", "params": {}}';
        END IF;

        -- fn_verificar_pin RETURNS ok; it does not raise. Reading the result is the
        -- whole check - PERFORM here would silently accept any PIN.
        SELECT f.ok INTO v_pin_ok FROM public.fn_verificar_pin(p_pin) AS f;
        IF v_pin_ok IS NOT TRUE THEN
            RAISE EXCEPTION '{"key": "error_pin_incorrecto", "params": {}}';
        END IF;
    END IF;

    -- 4. Triggers off for the wipe. Three reasons, each one measured:
    --    - tr_bloquear_categoria_inversion returns NULL on DELETE, so the user's own
    --      categories were never removed;
    --    - the p_caja BEFORE DELETE triggers raise 27000 when two rows share an
    --      investment, which is why the old body needed a row-by-row cursor;
    --    - tr_caja_limpieza rewrites p_tarjetas_credito and p_compromisos_tarjeta while
    --      we are deleting those same tables.
    -- The verification in step 6 replaces the safety the triggers provided.
    SET LOCAL session_replication_role = replica;

    -- 5. Wipe. Order is irrelevant with triggers off; it is kept parent-last so the list
    --    stays readable and doubles as the verification list.
    v_vinculos := ARRAY[
        'p_sobre_movimientos_auditoria|user_id',
        'p_sobre_movimientos|user_id',
        'p_sobres|user_id',
        'p_prestamos_vinculos|user_id',
        'p_prestamos_pagos|user_id',
        'p_prestamos_cuotas|user_id',
        'p_prestamos|user_id',
        'p_cuotas_detalle|user_id',
        'p_compromisos_tarjeta|user_id',
        'p_pagos_tarjeta_log|user_id',
        'p_gastos_recurrentes|user_id',
        'p_inyecciones_presupuesto|user_id',
        'p_presupuestos|user_id',
        'p_presupuestos_config|user_id',
        'p_presupuestos_historial|user_id',
        'p_gastos_fijos_config|user_id',
        'p_config_bola_nieve|user_id',
        'p_config_inflacion|user_id',
        'p_conciliaciones|user_id',
        'p_caja_cuarentena|user_id',
        'p_caja|user_id',
        'p_caja|pagado_por_user_id',
        'p_grupo_familiar|user_id',
        'p_tarjetas_credito|user_id',
        'p_estructuras_egresos|user_id',
        'p_billeteras|user_id',
        'p_ingresos|user_id',
        'p_inversiones|user_id',
        'p_historico_score_salud|user_id',
        'p_recordatorios|user_id',
        'p_pin_seguridad|user_id',
        'p_notificaciones_enviadas|user_id',
        'p_notificaciones_config|user_id',
        'p_preferencias_usuario|user_id',
        'p_config_region|user_id',
        'p_legal_consentimientos|user_id',
        'p_feedback_usuario|user_id',
        'p_referidos|user_id_invitador',
        'p_referidos|user_id_invitado',
        'app_reportes|usuario_id',
        'app_usuario_bloqueos|usuario_id',
        'p_app_sessions|user_id',
        'p_telemetry_events|user_id',
        'p_telemetry_cps_snapshots|user_id',
        'p_telemetry_user_metrics|user_id',
        'p_webhook_queue|user_id'
    ];

    FOREACH v_par IN ARRAY v_vinculos LOOP
        v_tabla := split_part(v_par, '|', 1);
        v_col   := split_part(v_par, '|', 2);
        CONTINUE WHEN to_regclass('public.' || quote_ident(v_tabla)) IS NULL;

        v_sql := format('DELETE FROM public.%I WHERE %I = $1', v_tabla, v_col);
        EXECUTE v_sql USING v_user_id;
        GET DIAGNOSTICS v_filas = ROW_COUNT;
        IF v_filas > 0 THEN
            v_detalle := v_detalle || jsonb_build_array(
                jsonb_build_object('tabla', v_tabla, 'columna', v_col, 'filas', v_filas));
            v_total := v_total + v_filas;
        END IF;
    END LOOP;

    -- 5b. Household. Policy (owner, 2026-11-19): a reset never deletes a shared account.
    --     The leaving member loses their ACCESS - the membership row - and everything
    --     shared stays with the other member, because that member's balances are built
    --     from p_hogar_pagos and p_hogar_conciliaciones. Only when the last participant
    --     leaves does the household and its content go with them.
    SELECT COALESCE(array_agg(p.hogar_id), '{}') INTO v_hogares
    FROM public.p_hogar_participantes p
    WHERE p.user_id = v_user_id;

    IF array_length(v_hogares, 1) IS NOT NULL THEN
        DELETE FROM public.p_hogar_participantes WHERE user_id = v_user_id;

        SELECT COALESCE(array_agg(h.hogar_id), '{}') INTO v_hogares
        FROM public.p_hogares h
        WHERE h.hogar_id = ANY (v_hogares)
          AND NOT EXISTS (
              SELECT 1 FROM public.p_hogar_participantes p
              WHERE p.hogar_id = h.hogar_id
          );

        IF array_length(v_hogares, 1) IS NOT NULL THEN
            DELETE FROM public.p_hogar_pagos          WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_hogar_conciliaciones WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_hogar_invitaciones   WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_proyectos_compartidos WHERE hogar_id = ANY (v_hogares);
            DELETE FROM public.p_hogares              WHERE hogar_id = ANY (v_hogares);
            v_detalle := v_detalle || jsonb_build_array(
                jsonb_build_object('tabla', 'p_hogares', 'columna', 'sin_participantes',
                                   'filas', array_length(v_hogares, 1)));
            v_total := v_total + array_length(v_hogares, 1);
        END IF;
    END IF;

    -- 5c. Shared category mapping. It is learned from every user, so the row stays and
    --     the author reference is cleared instead: deleting it would change what other
    --     users' receipts map to.
    UPDATE public.p_ia_global_suggestions
       SET usuario_que_sugirio = NULL
     WHERE usuario_que_sugirio = v_user_id;

    -- 6. Post-condition. With FK triggers off, a table missing from the list above would
    --    leave an orphan silently. This makes that impossible to ship.
    FOREACH v_par IN ARRAY v_vinculos LOOP
        v_tabla := split_part(v_par, '|', 1);
        v_col   := split_part(v_par, '|', 2);
        CONTINUE WHEN to_regclass('public.' || quote_ident(v_tabla)) IS NULL;

        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_tabla, v_col)
           INTO v_restantes USING v_user_id;
        IF v_restantes > 0 THEN
            RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                              "params": {"tabla": %, "columna": %, "filas": %}}',
                v_tabla, v_col, v_restantes;
        END IF;
    END LOOP;

    EXECUTE 'SELECT count(*) FROM public.p_hogar_participantes WHERE user_id = $1'
       INTO v_restantes USING v_user_id;
    IF v_restantes > 0 THEN
        RAISE EXCEPTION '{"key": "error_borrado_incompleto",
                          "params": {"tabla": "p_hogar_participantes", "filas": %}}', v_restantes;
    END IF;

    -- 7. The two rows that only the signup trigger creates, so the account keeps working
    --    right after the reset.
    INSERT INTO public.p_preferencias_usuario (user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.p_notificaciones_config (user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    RAISE LOG 'borrado de datos ok: user %, tablas con filas %, total %',
        v_user_id, jsonb_array_length(v_detalle), v_total;

    RETURN jsonb_build_object(
        'resultado', 'borrado_datos_ok',
        'user_id', v_user_id,
        'entradas_con_filas', jsonb_array_length(v_detalle),
        'total_filas_eliminadas', v_total,
        'detalle', v_detalle
    );
END;
$function$


COMMENT ON FUNCTION public.fn_borrar_datos_usuario(text, text) IS
'Self-service account reset: removes every row the user owns, verifies the post-condition, restores the preference rows, and past the S15 grace window requires the security PIN, set at least 24 hours earlier.';
```

## Decisiones aprobadas que 20261122a implementa (pendientes de aplicar)

Matriz medida el 2026-11-22 antes de escribir la migracion.

| Decision | Tabla | Hoy | Despues |
|---|---|---|---|
| C1 | `p_presupuestos_cierre` | **no se borra**: 7 filas, 1 usuario, **0 claves foraneas**, y el post-condition no la veia | se borra por `user_id` y entra en la verificacion |
| C3 | `p_legal_consentimientos` | se borraba: 315 filas, 80 usuarios | se conserva entera; el post-condition comprueba que siguen las mismas filas por `id` |
| C4 | `app_reportes` | se borraba | se conserva entera, con `usuario_id` intacto. Medido: `usuario_id` es NOT NULL y **no tiene FK** en el catalogo; no hay nada que relajar |
| C7 | `p_feedback_usuario` | se borraba | se conserva anonimizada: `user_id = NULL`, `metadata` sustituido por un marcador explicito, correo y telefono redactados en el texto libre |
| C8 | `p_referidos` | se borraba por las dos columnas | se conserva: se limpia el lado invitado (`user_id_invitado`, `email_invitado`) y la fila queda con codigo, flags y fechas. `user_id_invitador` **es NOT NULL** con FK `ON DELETE CASCADE`: no admite NULL, asi que ese id sigue ahi (C5/DDL, abierto) |
| C9 | post-condition | lista escrita a mano | derivado del catalogo: toda tabla con columna `user_id`/`usuario_id` (con cualquier prefijo) o con FK a `usuarios`, menos una lista explicita de excepciones. Una tabla nueva aborta el reset |

Excepciones aprobadas del post-condition: `caja`, `cuentas_egresos`, `productos`, `vendedores` (app madre), `admin_audit_log`, `admin_clone_destinos_permitidos` (responsabilidad administrativa), `usuarios` (raiz de identidad), `p_legal_consentimientos` y `app_reportes` (conservadas enteras), `p_feedback_usuario`, `p_referidos` y `p_ia_global_suggestions` (anonimizadas), y los objetos compartidos del hogar `p_hogar_pagos`, `p_hogar_conciliaciones`, `p_hogar_invitaciones`. Por columna: `p_prestamos|contraparte_user_id`, porque limpiarlo borraria quien le debe a quien en un prestamo ajeno y la transferencia de elementos compartidos (C5) sigue abierta.

**C5 sigue abierto**: transferir elementos co-poseidos (`hogar_id IS NOT NULL` en `p_caja`, `p_estructuras_egresos`, `p_inversiones`, `p_prestamos`, `p_presupuestos`, `p_presupuestos_cierre`, `p_presupuestos_historial`, `p_sobres`) al integrante que queda. Hoy la titularidad es `user_id` y el reset borra por `user_id`, asi que un elemento co-poseido desaparece para los dos. Medido: 0 filas co-poseidas y 0 hogares hoy, o sea que no hay exposicion viva; el bloqueo es del modelo, no de las FK.

## Notas de validacion

- `tests/prestamos/borrado-datos-decisiones-transaccional.sql` (nuevo): usuarios descartables, `BEGIN ... ROLLBACK`, 13 aserciones PASS. Dos de ellas simulan tablas sin decision (una con `user_id` y sin FK, otra con una columna de otro nombre y FK a `usuarios`) y comprueban que el reset aborta nombrando la tabla.
- `tests/prestamos/borrado-usuario-transaccional.sql`: actualizado a las decisiones (ya no exige que esas cuatro tablas queden vacias; comprueba que sobreviven). PASS sobre el cuerpo nuevo, con 4 consentimientos de user 20 intactos.
- `tests/prestamos/eliminar-cuenta-transaccional.sql`: PASS sin cambios (no toca esta funcion).
- Mientras 20261122a no este aplicada, las suites se corren junto con la migracion dentro de una sola transaccion que termina en ROLLBACK: `node tests/prestamos/run-migracion-sin-aplicar.mjs <migracion> <suite>`.
- Contra el cuerpo desplegado las dos suites fallan a proposito: `FALLO C1: sobrevivieron 1 cierres de presupuesto` y `FALLO: los consentimientos pasaron de 4 a 0 filas`. Eso es la medida del hueco, no una regresion.
- Aviso de i18n (fuera del alcance de este archivo): `error_borrado_incompleto`, `error_borrado_datos_primeros_dias`, `error_confirmation_invalid` y `error_pin_no_configurado` no estan en `src/locales/es.ts`; el backend las emite y el front no las traduce. Es previo a esta migracion.
