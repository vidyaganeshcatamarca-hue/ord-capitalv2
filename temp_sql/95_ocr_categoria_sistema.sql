-- ============================================================================
-- 95 — OCR: categoría de sistema `ocr_unrecognized` + feature flag `menu_ocr`
--
-- PRD OCR definitivo §8, §9, §10, §29, §60, §61, §105.
--
-- QUÉ HACE
--   1. Indice unico parcial: una sola fila `ocr_unrecognized` raiz por usuario.
--   2. Helper interno `fn_ocr_categoria_id(user_id)`: devuelve el id real del
--      nodo final, provisionandolo si falta (backfill perezoso y seguro).
--   3. RPC publica `fn_obtener_categoria_ocr_no_reconocidos()` para el front.
--   4. Backfill para los usuarios existentes.
--   5. `fn_onboarding_completo_usuario` la crea para los usuarios nuevos.
--   6. Proteccion: no se renombra ni se re-cuelga (trigger UPDATE) y no se
--      elimina desde las RPC de categorias (guard en las dos RPC de borrado).
--   7. Flag `menu_ocr` en app_feature_flags (gate de producto, NO `ocr_enabled`).
--
-- POR QUÉ EL BORRADO SE PROTEGE EN LA RPC Y NO CON UN TRIGGER DELETE
--   `fn_borrar_datos_usuario` vacia `p_estructuras_egresos WHERE user_id = $1`
--   como parte del borrado de cuenta. Un trigger BEFORE DELETE sobre la fila
--   del sistema ABORTARIA el borrado de datos del usuario (y el inversiones ya
--   demuestra el riesgo). Por eso el DELETE directo del purge queda intacto y
--   el bloqueo se aplica en `fn_eliminar_estructura_egreso`, que es el camino de
--   borrado del usuario.
--
--   PENDIENTE CONOCIDO: `fn_migrar_y_eliminar_estructura_egreso` (migrar y borrar
--   el origen) tambien puede eliminar esta fila si el usuario migra DESDE
--   `ocr_unrecognized`. No se reescribe aqui porque exigiria reproducir su cuerpo
--   completo; el efecto es acotado (solo se reescriben `estructura_egreso_id` y la
--   fila se re-provisiona en la proxima confirmacion, sin perder importes).
--
-- IDENTIFICADOR ESTABLE
--   El esquema real de `p_estructuras_egresos` no tiene columna `codigo`; las
--   categorias de sistema se identifican por `nombre_cuenta` = clave i18n
--   (`cat_mystery`, `no_detail`, `cat_card_diff`, `cat_investments_portfolio`).
--   `ocr_unrecognized` sigue esa convencion: NO es texto visible, es la clave
--   i18n (`ocr_unrecognized` en es/en/pt).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Una sola categoria de sistema por usuario.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_estructuras_egresos_ocr_unrecognized
    ON public.p_estructuras_egresos (user_id)
    WHERE nombre_cuenta = 'ocr_unrecognized' AND padre_id IS NULL;

-- ----------------------------------------------------------------------------
-- (2) Helper interno: id del nodo final, provisionando si falta.
--     SECURITY DEFINER y sin parametro de identidad publico: solo se invoca
--     desde otras RPCs, que ya resolvieron `v_user_id` con `auth.uid()`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ocr_categoria_id(p_user_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_id bigint;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT e.estructura_id INTO v_id
    FROM public.p_estructuras_egresos e
    WHERE e.user_id = p_user_id
      AND e.padre_id IS NULL
      AND e.nombre_cuenta = 'ocr_unrecognized'
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    -- Provision en el primer uso. El indice unico parcial convierte dos
    -- llamadas concurrentes en "una inserta, la otra reusa".
    INSERT INTO public.p_estructuras_egresos (
        user_id, padre_id, nombre_cuenta, descripcion, tipo_cupo, icono, color
    )
    VALUES (
        p_user_id, NULL, 'ocr_unrecognized',
        'sys_do_not_delete_ocr_fallback', 'need', 'ReceiptText', '#64748B'
    )
    ON CONFLICT (user_id) WHERE nombre_cuenta = 'ocr_unrecognized' AND padre_id IS NULL
    DO NOTHING
    RETURNING estructura_id INTO v_id;

    IF v_id IS NULL THEN
        SELECT e.estructura_id INTO v_id
        FROM public.p_estructuras_egresos e
        WHERE e.user_id = p_user_id
          AND e.padre_id IS NULL
          AND e.nombre_cuenta = 'ocr_unrecognized'
        LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_ocr_system_category_missing", "params": {}}';
    END IF;

    RETURN v_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- (3) RPC publica para el frontend (la cuarentena necesita el id para el
--     grupo fallback y para validar que la categoria sigue existiendo).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_obtener_categoria_ocr_no_reconocidos()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN public.fn_ocr_categoria_id(v_user_id);
END;
$function$;

-- ----------------------------------------------------------------------------
-- (4) Backfill: los usuarios que ya existen no vuelven a pasar por el trigger.
-- ----------------------------------------------------------------------------
INSERT INTO public.p_estructuras_egresos (
    user_id, padre_id, nombre_cuenta, descripcion, tipo_cupo, icono, color
)
SELECT u.user_id, NULL, 'ocr_unrecognized',
       'sys_do_not_delete_ocr_fallback', 'need', 'ReceiptText', '#64748B'
FROM public.usuarios u
WHERE u.tipo_sistema IN ('personal', 'ambos')
  AND NOT EXISTS (
      SELECT 1 FROM public.p_estructuras_egresos e
      WHERE e.user_id = u.user_id
        AND e.padre_id IS NULL
        AND e.nombre_cuenta = 'ocr_unrecognized'
  );

-- ----------------------------------------------------------------------------
-- (5) Usuarios nuevos: mismo seed del onboarding, una fila mas.
--     Cuerpo tomado de la definicion VIVA en Supabase (pg_get_functiondef), NO
--     del espejo, con el INSERT de OCR agregado literalmente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_onboarding_completo_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rubro_alimentos_id int8;
BEGIN
    IF NEW.tipo_sistema IN ('personal', 'ambos') THEN
        
        -- 1. Members
        INSERT INTO public.p_grupo_familiar (user_id, nombre) VALUES (NEW.user_id, 'member_personal');
        INSERT INTO public.p_grupo_familiar (user_id, nombre) VALUES (NEW.user_id, 'member_family');

        -- 2. Root categories
        INSERT INTO public.p_estructuras_egresos (nombre_cuenta, descripcion, user_id, tipo_cupo, icono, color)
        VALUES ('cat_mystery', 'sys_do_not_delete_reconciliation', NEW.user_id, 'want', 'TriangleAlert', '#64748B');

        -- OCR fallback category (definitive OCR PRD §8): a real final node so
        -- an unclassified ticket amount can always become a movement. It is
        -- never learned as memory (§10) and never offered as a choice (§29).
        INSERT INTO public.p_estructuras_egresos (nombre_cuenta, descripcion, user_id, tipo_cupo, icono, color)
        VALUES ('ocr_unrecognized', 'sys_do_not_delete_ocr_fallback', NEW.user_id, 'need', 'ReceiptText', '#64748B')
        ON CONFLICT (user_id) WHERE nombre_cuenta = 'ocr_unrecognized' AND padre_id IS NULL DO NOTHING;

        INSERT INTO public.p_estructuras_egresos (nombre_cuenta, descripcion, user_id, tipo_cupo, icono, color)
        VALUES ('cat_food_home', 'desc_daily_home', NEW.user_id, 'need', 'Refrigerator', '#F97316')
        RETURNING estructura_id INTO v_rubro_alimentos_id;

        INSERT INTO public.p_estructuras_egresos (padre_id, user_id, nombre_cuenta, tipo_cupo, icono) VALUES
            (v_rubro_alimentos_id, NEW.user_id, 'cat_dry_goods', 'need', 'PaperBag'),
            (v_rubro_alimentos_id, NEW.user_id, 'cat_fresh_foods', 'need', 'Refrigerator'),
            (v_rubro_alimentos_id, NEW.user_id, 'cat_drinks', 'need', 'Milk'),
            (v_rubro_alimentos_id, NEW.user_id, 'cat_cleaning_hygiene', 'need', 'SoapDispenserDroplet'),
            (v_rubro_alimentos_id, NEW.user_id, 'cat_home_pets', 'need', 'PawPrint');

        -- 3. Leisure and pleasure
        INSERT INTO public.p_estructuras_egresos (nombre_cuenta, user_id, tipo_cupo, icono, color)
        VALUES ('cat_leisure_pleasure', NEW.user_id, 'want', 'PartyPopper', '#EC4899');

        -- 4. Remaining root categories
        INSERT INTO public.p_estructuras_egresos (nombre_cuenta, user_id, tipo_cupo, icono, color)
        VALUES
            ('cat_clothing', NEW.user_id, 'want', 'Shirt', '#A855F7'),
            ('cat_housing', NEW.user_id, 'need', 'Home', '#EF4444'),
            ('cat_transport', NEW.user_id, 'need', 'Car', '#06B6D4'),
            ('cat_health', NEW.user_id, 'need', 'Stethoscope', '#10B981'),
            ('cat_education', NEW.user_id, 'need', 'GraduationCap', '#3B82F6'),
            ('cat_finance_taxes', NEW.user_id, 'need', 'BarChart3', '#EAB308'),
            ('cat_tech_electro', NEW.user_id, 'want', 'Monitor', '#8B5CF6');
            
        -- 5. Budget rules
        INSERT INTO public.p_presupuestos_config (user_id, porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo, dia_ancla_ciclo)
        VALUES (NEW.user_id, 50.00, 30.00, 20.00, 0.00, 1);
    END IF;
    RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- (6a) No renombrar ni re-cuelgar la categoria de sistema.
--      Solo UPDATE: el DELETE del purge de cuenta debe seguir funcionando.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tr_proteger_categoria_ocr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.nombre_cuenta IS DISTINCT FROM OLD.nombre_cuenta
       OR NEW.padre_id IS DISTINCT FROM OLD.padre_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_proteger_categoria_ocr ON public.p_estructuras_egresos;
CREATE TRIGGER tr_proteger_categoria_ocr
BEFORE UPDATE ON public.p_estructuras_egresos
FOR EACH ROW
WHEN (OLD.nombre_cuenta = 'ocr_unrecognized' AND OLD.padre_id IS NULL)
EXECUTE FUNCTION public.fn_tr_proteger_categoria_ocr();

-- ----------------------------------------------------------------------------
-- (6b) Guard en la RPC de borrado del usuario.
--      `error_category_system_locked` ya existe y ya se usa para Inversiones.
--      Cuerpo tomado de la definicion VIVA en Supabase + el guard de OCR.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_eliminar_estructura_egreso(p_estructura_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint;
    v_es_padre boolean;
    v_count integer;
    v_es_sistema_ocr boolean;
BEGIN
    -- Validar identidad
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- OCR: la categoria fallback del sistema no se elimina a mano (PRD §8).
    SELECT EXISTS (
        SELECT 1 FROM public.p_estructuras_egresos
        WHERE estructura_id = p_estructura_id
          AND user_id = v_user_id
          AND nombre_cuenta = 'ocr_unrecognized'
          AND padre_id IS NULL
    ) INTO v_es_sistema_ocr;
    IF v_es_sistema_ocr THEN
        RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
    END IF;

    -- Verificar que no se intente borrar un rubro padre si todavía tiene subcuentas adentro
    SELECT EXISTS (SELECT 1 FROM p_estructuras_egresos WHERE padre_id = p_estructura_id AND user_id = v_user_id) INTO v_es_padre;
    IF v_es_padre THEN
        RAISE EXCEPTION '{"key": "error_category_has_children", "params": {}}';
    END IF;

    -- Verificar que no se intente borrar si ya hay movimientos de la billetera utilizando esta categoría
    SELECT count(*) INTO v_count FROM p_caja WHERE estructura_egreso_id = p_estructura_id;
    IF v_count > 0 THEN
        RAISE EXCEPTION '{"key": "error_category_in_use", "params": {}}';
    END IF;

    -- Eliminar la categoría
    DELETE FROM p_estructuras_egresos 
    WHERE estructura_id = p_estructura_id AND user_id = v_user_id;
    
    IF NOT FOUND THEN 
        RAISE EXCEPTION '{"key": "error_category_not_found", "params": {}}'; 
    END IF;
END;
$function$;

-- ----------------------------------------------------------------------------
-- (7) Feature flag: el gate real de producto es `menu_ocr` (PRD §60).
--     modo_minimo='simple': OCR no depende del modo avanzado.
-- ----------------------------------------------------------------------------
INSERT INTO public.app_feature_flags (feature_key, modo_minimo, activo, activo_testing, descripcion, orden)
VALUES ('menu_ocr', 'simple', true, true, 'OCR de tickets (captura y cuarentena)', 16)
ON CONFLICT (feature_key) DO NOTHING;
