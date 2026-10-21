-- ============================================================================
-- 86b — Guardas de saldo y cascada de inversión (B2, B7)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B2 — No se puede invertir (ni registrar un egreso de inversión) más de lo
--      que hay en la billetera de origen.
--
--      El trigger de saldo (tr_actualizar_saldo_p_caja_integral) recalcula el
--      saldo de la billetera a partir de p_caja, así que un egreso sin saldo
--      suficiente la deja en NEGATIVO. Eso no puede pasar.
--
--      Solo se valida el egreso de una inversión (metadata con inversion_id):
--      el resto de los movimientos ya tienen su propia validacion en
--      fn_registrar_movimiento_caja, y duplicarla aqui podria cambiarle el
--      comportamiento a la app entera.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tr_validar_saldo_inversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_saldo numeric;
    v_monto numeric;
BEGIN
    -- Solo movements de inversion (los marca el modulo con inversion_id).
    IF NEW.metadata IS NULL OR COALESCE(NEW.metadata->>'inversion_id', '') = '' THEN
        RETURN NEW;
    END IF;

    IF NEW.billetera_origen_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- El monto del egreso.
    v_monto := COALESCE(NEW.valor_egreso, 0);
    IF v_monto <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT saldo_actual INTO v_saldo
    FROM public.p_billeteras
    WHERE billetera_id = NEW.billetera_origen_id
      AND user_id = NEW.user_id;

    IF v_saldo IS NULL THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;

    -- El saldo no puede quedar negativo: la inversion no puede exceder lo
    -- que hay en la cuenta de origen.
    IF v_saldo < v_monto THEN
        RAISE EXCEPTION '{"key": "error_investment_insufficient_balance", "params": {}}';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_validar_saldo_inversion ON public.p_caja;
CREATE TRIGGER tr_validar_saldo_inversion
BEFORE INSERT ON public.p_caja
FOR EACH ROW EXECUTE FUNCTION public.fn_tr_validar_saldo_inversion();

-- ----------------------------------------------------------------------------
-- B7 — Al borrar el movimiento de CREACION de una inversion, la inversion se
--      anula tambien.
--
--      El dueño: "para poder borrar una inversion que se cargo mal, yo desde
--      actividad reciente borro el movimiento y inmediatamente seria anular,
--      borrar la inversion de todas las tablas correspondientes."
--
--      Cuando el usuario borra el movimiento 'investment_prefix: <activo>' (el
--      que salio de la billetera), el dinero vuelve a la billetera (lo hace el
--      trigger de saldo) pero la inversion quedaba viva en la cartera: la
--      plata estaba en dos lugares a la vez.
--
--      Que hace este trigger:
--        - borra la inversion (p_inversiones);
--        - borra sus movimientos derivados (rescates, liquidaciones) para no
--          dejar movimientos huerfanos apuntando a una inversion inexistente.
--      Solo actua sobre el movimiento de CREACION: si el usuario borra un
--      rescate o una liquidacion, no se toca la inversion (eso es otra
--      decision, con otras consecuencias contables).
-- ----------------------------------------------------------------------------
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
    IF v_inversion_id = '' THEN
        RETURN OLD;
    END IF;

    -- Solo el movimiento de CREACION (el de salida de la billetera).
    IF OLD.detalle NOT LIKE 'investment_prefix:%' THEN
        RETURN OLD;
    END IF;

    SELECT inversion_id INTO v_inversion_row
    FROM public.p_inversiones
    WHERE inversion_id = v_inversion_id::bigint
      AND user_id = OLD.user_id;

    IF v_inversion_row IS NULL THEN
        RETURN OLD;
    END IF;

    -- Los movimientos derivados (rescate, liquidacion) se van con ella: si no,
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

DROP TRIGGER IF EXISTS tr_anular_inversion_al_borrar_movimiento ON public.p_caja;
CREATE TRIGGER tr_anular_inversion_al_borrar_movimiento
BEFORE DELETE ON public.p_caja
FOR EACH ROW EXECUTE FUNCTION public.fn_tr_anular_inversion_al_borrar_movimiento();