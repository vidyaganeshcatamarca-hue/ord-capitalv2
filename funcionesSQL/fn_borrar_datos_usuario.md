# fn_borrar_datos_usuario (creada 2026-10-16 con OK del dueño: 'ejecuta a, b, c y d')

## Descripcion
Borrado de DATOS del usuario (menu-ajustes S15/T5c). La cuenta permanece; arranca de cero con datos frescos (onboarding nuevo en el arranque siguiente). Diferente de `fn_eliminar_cuenta_usuario` (esa archiva la cuenta 30 dias).

- `p_confirmacion_texto` debe ser `ERASE` (distinto de `DELETE`, que pertenece a la otra operacion). La palabra es FIJA y en ingles a proposito: el texto se compara exacto, asi que traducirla compararia una palabra espanola contra una portuguesa. La UI la envia como placeholder `{palabra}` (ver `src/lib/deleteConfirmation.ts`), de modo que ninguna traduccion futura pueda tocarla.
- Guardia backend de los 15 dias (defensa en profundidad del gate S15; el gate front fail-closed esta en `src/lib/accountDeletionGate.ts`): rechaza con `error_borrado_datos_primeros_dias` si la antiguedad desde `usuarios.creado_at` es <= 15 dias.
- RLS-safe: SECURITY DEFINER con `auth.uid()` (regla del proyecto).
- Alcance: SOLO tablas p_* del dominio Personal del usuario (21 tablas del espejo). NO toca: usuarios, app_global_config, app_feature_flags, app_usuario_bloqueos, p_divisas, p_paises, p_telemetry_*, p_app_sessions, ni tablas de la app madre (caja, cuentas_egresos, productos, vendedores).
- Retorno: `{ resultado:'borrado_datos_ok', user_id, entradas_con_filas, total_filas_eliminadas, detalle:[{tabla, filas}] }` (solo tablas con filas > 0).
- Test transaccional: `tests/sql/run_borrar_datos_test.js` + `fn_run_borrar_datos_test.sql` (3/3 PASS, ROLLBACK, sin datos residuales). Sesiones de testing SIN auth.uid() real — A1/A2 verifican fail-closed de identidad; A3 existencia; la ejecucion end-to-end de la limpieza queda para validacion con sesion real del dueño.
- Runner y RPC de testing DROPeados al final del run (regla 11 del proyecto). Verificacion post-limpieza: 0 funciones residuales.

## Codigo SQL (creada 2026-10-16, propuesta revisada y aprobada: 'ejecuta a, b, c y d')
```sql
CREATE OR REPLACE FUNCTION public.fn_borrar_datos_usuario(p_confirmacion_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_creado_at timestamptz;
    v_dias int;
    v_totalFilas int := 0;
    v_filas bigint;
    v_detalle json := '[]'::json;
    v_tabla text;
    v_sql text;
BEGIN
    -- 1. Identidad del usuario (regla del proyecto)
    SELECT user_id, creado_at INTO v_user_id, v_creado_at
    FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Confirmacion de texto exacto (distinta de la otra operacion)
    IF p_confirmacion_texto IS DISTINCT FROM 'ERASE' THEN
        RAISE EXCEPTION '{"key": "error_confirmation_invalid", "params": {}}';
    END IF;

    -- 3. Guardia backend de los 15 dias (defensa en profundidad, S15)
    v_dias := (now()::date - v_creado_at::date);
    IF v_dias <= 15 THEN
        RAISE EXCEPTION '{"key": "error_borrado_datos_primeros_dias", "params": {"dias": %}}', v_dias;
    END IF;

    -- 4. Limpieza de datos p_* del usuario (orden dependencias)
    FOREACH v_tabla IN ARRAY ARRAY[
        'p_cuotas_detalle',
        'p_compromisos_tarjeta',
        'p_gastos_recurrentes',
        'p_inyecciones_presupuesto',
        'p_presupuestos_config',
        'p_config_bola_nieve',
        'p_prestamos',
        'p_conciliaciones',
        'p_historico_score_salud',
        'p_caja',
        'p_caja_cuarentena',
        'p_billeteras',
        'p_estructuras_egresos',
        'p_tarjetas_credito',
        'p_presupuestos',
        'p_ingresos',
        'p_inversiones',
        'p_webhook_queue',
        'p_preferencias_usuario',
        'p_preferencias_notificaciones',
        'p_config_region'
    ]
    LOOP
        v_sql := 'DELETE FROM public.' || v_tabla || ' WHERE user_id = $1';
        EXECUTE v_sql USING v_user_id;
        GET DIAGNOSTICS v_filas = ROW_COUNT;
        IF v_filas > 0 THEN
            v_detalle := v_detalle || json_build_array(
                json_build_object('tabla', v_tabla, 'filas', v_filas));
            v_totalFilas := v_totalFilas + v_filas::int;
        END IF;
    END LOOP;

    RAISE LOG 'borrado de datos ok: user %, tablas con filas %, total %',
        v_user_id, json_array_length(v_detalle), v_totalFilas;

    RETURN jsonb_build_object(
        'resultado', 'borrado_datos_ok',
        'user_id', v_user_id,
        'entradas_con_filas', json_array_length(v_detalle),
        'total_filas_eliminadas', v_totalFilas,
        'detalle', v_detalle
    );
END;
$function$
```

## Nota de validacion
- Test transaccional 3/3 PASS (runner + RPC de testing DROPeados al final; verificacion post-limpieza 0 funciones residuales en Supabase).
- Espejo + `start_info/indice de funciones.md` 260 pendiente de commit de conocimiento (carpeta no versionada).
