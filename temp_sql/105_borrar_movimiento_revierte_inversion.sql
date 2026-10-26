-- ============================================================================
-- 105 — Borrar un movimiento de inversión deshace la operación
--
--   Dueño, 2026-10-26: "cuando yo borro desde actividad reciente un agregado de dinero,
--   eso debería modificar la inversión. Tal como lo hemos resuelto para las liquidaciones
--   parciales, también sería el mecanismo de borrar un error que ha agregado dinero por
--   error o lo he agregado mal. Entonces, de esa forma, borrando una actividad reciente,
--   me debe volver para atrás la operación."
--
--   Qué pasaba: el único trigger de inversión sobre p_caja
--   (fn_tr_anular_inversion_al_borrar_movimiento, migración 86b) actuaba SÓLO sobre el
--   movimiento de creación ('investment_prefix:'), y a propósito: el comentario de la 86b
--   dice "si el usuario borra un rescate o una liquidacion, no se toca la inversion (eso
--   es otra decision, con otras consecuencias contables)". La decisión ya está tomada:
--   ahora también se deshacen el aporte y el retiro parcial.
--
--   Cada rama es la INVERSA exacta de la función que creó el movimiento:
--
--     investment_contribution:   fn_aportar_inversion   (migración 100)
--       hizo  capital += monto,  valor = COALESCE(valor, capital_previo) + monto
--       deshace capital -= monto, valor -= monto
--
--     rescate_inversion:         fn_rescatar_inversion
--       hizo  monto_liquidado += monto,  valor = GREATEST(0, valor - monto)
--       deshace monto_liquidado -= monto, valor += monto
--       y si el retiro era el que la había dejado 'finalizada', vuelve a 'activa':
--       si queda capital sin retirar, la inversión no está terminada.
--
--     investment_prefix:         (sin cambios) borra la inversión y sus movimientos
--       derivados, que es lo que ya hacía.
--
--   El dinero vuelve a la billetera solo: de eso se ocupa
--   fn_actualizar_saldo_billetera_integral (AFTER DELETE). Acá sólo se arregla la
--   inversión, que era la que quedaba mintiendo.
--
--   `GREATEST(0, ...)` para no dejar capital ni valor negativo si el usuario ya había
--   editado la posición a mano: deshacer un movimiento no puede inventar deuda.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_tr_anular_inversion_al_borrar_movimiento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_inversion_id text;
    v_inversion_row bigint;
BEGIN
    IF OLD.metadata IS NULL THEN
        RETURN OLD;
    END IF;

    v_inversion_id := COALESCE(OLD.metadata->>'inversion_id', '');
    IF v_inversion_id = '' OR v_inversion_id !~ '^[0-9]+$' THEN
        RETURN OLD;
    END IF;

    SELECT inversion_id INTO v_inversion_row
    FROM public.p_inversiones
    WHERE inversion_id = v_inversion_id::bigint
      AND user_id = OLD.user_id;

    IF v_inversion_row IS NULL THEN
        RETURN OLD;
    END IF;

    -- ------------------------------------------------------------------
    -- Aporte de capital: se descuenta lo que se había sumado.
    -- ------------------------------------------------------------------
    IF OLD.detalle LIKE 'investment_contribution:%' THEN
        UPDATE public.p_inversiones
           SET monto_invertido_original =
                    GREATEST(0, COALESCE(monto_invertido_original, 0) - COALESCE(OLD.valor_egreso, 0)),
               valor_mercado_actual =
                    GREATEST(0, COALESCE(valor_mercado_actual, monto_invertido_original) - COALESCE(OLD.valor_egreso, 0))
         WHERE inversion_id = v_inversion_row
           AND user_id = OLD.user_id;
        RETURN OLD;
    END IF;

    -- ------------------------------------------------------------------
    -- Retiro parcial: vuelve el capital retirado y el valor que se había descontado.
    -- ------------------------------------------------------------------
    IF OLD.detalle LIKE 'rescate_inversion:%' THEN
        UPDATE public.p_inversiones
           SET monto_liquidado =
                    GREATEST(0, COALESCE(monto_liquidado, 0) - COALESCE(OLD.valor_ingreso, 0)),
               valor_mercado_actual =
                    COALESCE(valor_mercado_actual, monto_invertido_original) + COALESCE(OLD.valor_ingreso, 0),
               estado =
                    CASE
                        WHEN estado = 'finalizada'
                         AND GREATEST(0, COALESCE(monto_liquidado, 0) - COALESCE(OLD.valor_ingreso, 0))
                             < COALESCE(monto_invertido_original, 0)
                        THEN 'activa'
                        ELSE estado
                    END,
               fecha_liquidacion =
                    CASE
                        WHEN estado = 'finalizada'
                         AND GREATEST(0, COALESCE(monto_liquidado, 0) - COALESCE(OLD.valor_ingreso, 0))
                             < COALESCE(monto_invertido_original, 0)
                        THEN NULL
                        ELSE fecha_liquidacion
                    END
         WHERE inversion_id = v_inversion_row
           AND user_id = OLD.user_id;
        RETURN OLD;
    END IF;

    -- ------------------------------------------------------------------
    -- Alta de la inversión: se anula la inversión entera (comportamiento de la 86b).
    -- ------------------------------------------------------------------
    IF OLD.detalle NOT LIKE 'investment_prefix:%' THEN
        RETURN OLD;
    END IF;

    -- Los movimientos derivados (rescate, liquidacion, aporte) se van con ella: si no,
    -- quedan apuntando a una inversion que ya no existe.
    DELETE FROM public.p_caja
    WHERE user_id = OLD.user_id
      AND metadata->>'inversion_id' = v_inversion_id
      AND p_caja_id <> OLD.p_caja_id;

    DELETE FROM public.p_inversiones
    WHERE inversion_id = v_inversion_row
      AND user_id = OLD.user_id;

    RETURN OLD;
END;
$function$;

-- Verificación (read-only):
--   select pg_get_functiondef(oid) from pg_proc where proname =
--     'fn_tr_anular_inversion_al_borrar_movimiento';
