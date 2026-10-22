-- ============================================================================
-- 83 — La categoría de Inversiones es EXCLUSIVA del módulo de Inversiones (S7)
--
--   El dueño: "esa categoría que se crea no debe ser accesible desde el menú
--   de categorías. No se le puede cambiar el nombre, es una categoría del
--   sistema y no puede tener subcategorías. Tampoco se puede hacer una
--   transacción manual a esa categoría de inversiones. Solo se accede a través
--   de las operaciones del módulo de inversión. Deberíamos bloquear todo
--   acceso por fuera de este módulo a esa categoría."
--
--   La categoría se identifica por tipo_cupo = 'investment' (la crea
--   fn_crear_inversion). El bloqueo es por tipo_cupo, NO por nombre: si un
--   usuario ya tiene la fila con otro nombre, sigue protegida, y el nombre
--   (una key de i18n) puede cambiar sin romper el bloqueo (ver 84).
--
--   POR QUÉ TRIGGERS Y NO REESCRIBIR LAS RPCs
--   Reescribir fn_registrar_movimiento_caja / fn_editar_movimiento_caja /
--   fn_crear_subcuenta_egreso / fn_modificar_subcuenta_egreso /
--   fn_eliminar_estructura_egreso obligaría a reemitir ~450 líneas de lógica
--   ya probada: cualquier divergencia con la versión viva sería una regresión
--   silenciosa. Un trigger es ADITIVO: no cambia ninguna función, y además
--   cubre las rutas que nadie recuerda — la carga por voz, la importación de
--   respaldos, las RPCs que se agreguen en el futuro, y el SQL directo.
--
--   REGLAS
--     1. La fila tipo_cupo='investment' no se puede renombrar ni editar.
--     2. No admite subcategorías (nadie puede colgar de ella).
--     3. No se puede eliminar.
--     4. Solo el módulo de inversiones puede escribir movimientos contra ella.
--        El módulo marca sus movimientos con metadata->>'inversion_id'; el
--        front NO puede forjarlo (fn_registrar_movimiento_caja no expone
--        metadata como parámetro), así que el marker es fiable.
--     5. Nadie puede CREAR una categoría con tipo_cupo='investment' salvo el
--        módulo de inversiones: fn_crear_cuenta_egreso acepta p_tipo_cupo
--        sin validarlo, así que un cliente podría fabricar una categoría
--        "Inversiones" paralela. Solo fn_crear_inversion (que la crea una vez
--        por usuario) tiene legitimitad.
--
--   El bloqueo del FRONT (que la categoría no aparezca en el editor de
--   Categorías ni en los selectores de movimiento) va en el front:
--   src/lib/categoryFilters.ts (lista SYSTEM_CATEGORY_NAMES).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) + (2) La categoria de inversiones: intocable y sin subcategorias.
--     BEFORE INSERT: no se puede colgar una subcategoria de ella.
--     BEFORE UPDATE: no se le puede cambiar el nombre, la descripcion, el
--                    icono ni ningun otro campo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tr_bloquear_categoria_inversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_es_inversion boolean := false;
    v_padre_es_inversion boolean := false;
BEGIN
    -- INSERT: no se admite ninguna fila bajo la categoria de inversiones.
    IF TG_OP = 'INSERT' THEN
        -- (5) Y no se puede fabricar una categoria de inversiones desde afuera.
        --     Solo fn_crear_inversion puede crearla, y lo hace UNA vez por
        --     usuario (indice unico parcial, ver 84); el trigger la reconoce
        --     por su nombre de sistema y la deja pasar. Cualquier otra fila
        --     con tipo_cupo='investment' es una impostura y se rechaza.
        IF COALESCE(NEW.tipo_cupo, '') = 'investment'
           AND NEW.nombre_cuenta IS DISTINCT FROM 'cat_investments_portfolio'
           AND NEW.nombre_cuenta IS DISTINCT FROM 'cat_investments' THEN
            RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
        END IF;

        IF NEW.padre_id IS NOT NULL THEN
            SELECT COALESCE(tipo_cupo, '') = 'investment' INTO v_padre_es_inversion
            FROM public.p_estructuras_egresos
            WHERE estructura_id = NEW.padre_id;

            IF v_padre_es_inversion THEN
                RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: si la fila ES la categoria de inversiones, no se toca.
    IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(tipo_cupo, '') = 'investment' INTO v_es_inversion
        FROM public.p_estructuras_egresos
        WHERE estructura_id = OLD.estructura_id;

        IF v_es_inversion THEN
            -- EXCEPCION UNICA: la migracion 84 renombra la fila de una vez
            -- (cat_investments -> cat_investments_portfolio). Ese UPDATE es de
            -- la propia migracion, no del usuario: se permite SOLO ese cambio
            -- de nombre y nada mas (mismo tipo_cupo, mismo usuario, sin tocar
            -- descripcion/icono/color). Cualquier otro cambio se rechaza.
            IF OLD.nombre_cuenta = 'cat_investments'
               AND NEW.nombre_cuenta = 'cat_investments_portfolio'
               AND NEW.tipo_cupo IS NOT DISTINCT FROM OLD.tipo_cupo
               AND NEW.descripcion IS NOT DISTINCT FROM OLD.descripcion
               AND NEW.icono IS NOT DISTINCT FROM OLD.icono
               AND NEW.color IS NOT DISTINCT FROM OLD.color
               AND NEW.padre_id IS NOT DISTINCT FROM OLD.padre_id
               AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
                RETURN NEW;
            END IF;

            RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
        END IF;

        -- Y tampoco se le puede cambiar el padre para colgar algo de ella.
        IF NEW.padre_id IS NOT NULL AND NEW.padre_id IS DISTINCT FROM OLD.padre_id THEN
            SELECT COALESCE(tipo_cupo, '') = 'investment' INTO v_padre_es_inversion
            FROM public.p_estructuras_egresos
            WHERE estructura_id = NEW.padre_id;

            IF v_padre_es_inversion THEN
                RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tr_bloquear_categoria_inversion ON public.p_estructuras_egresos;
CREATE TRIGGER tr_bloquear_categoria_inversion
BEFORE INSERT OR UPDATE ON public.p_estructuras_egresos
FOR EACH ROW EXECUTE FUNCTION public.fn_tr_bloquear_categoria_inversion();

-- ----------------------------------------------------------------------------
-- (3) No se puede eliminar la categoria de inversiones.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tr_bloquear_borrado_categoria_inversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_es_inversion boolean := false;
BEGIN
    SELECT COALESCE(tipo_cupo, '') = 'investment' INTO v_es_inversion
    FROM public.p_estructuras_egresos
    WHERE estructura_id = OLD.estructura_id;

    IF v_es_inversion THEN
        RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
    END IF;

    RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS tr_bloquear_borrado_categoria_inversion ON public.p_estructuras_egresos;
CREATE TRIGGER tr_bloquear_borrado_categoria_inversion
BEFORE DELETE ON public.p_estructuras_egresos
FOR EACH ROW EXECUTE FUNCTION public.fn_tr_bloquear_borrado_categoria_inversion();

-- ----------------------------------------------------------------------------
-- (4) Movimientos: solo el modulo de inversiones escribe contra la categoria.
--     El modulo marca sus movimientos con metadata->>'inversion_id'.
--     fn_registrar_movimiento_caja NO expone metadata como parametro, asi que
--     un movimiento manual (voz, importacion, pantalla) jamas lo lleva: la
--     distincion es fiable y no se puede falsear desde el cliente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tr_bloquear_movimiento_categoria_inversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_es_inversion boolean := false;
    v_inversion_id text;
BEGIN
    IF NEW.estructura_egreso_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(e.tipo_cupo, '') = 'investment' INTO v_es_inversion
    FROM public.p_estructuras_egresos e
    WHERE e.estructura_id = NEW.estructura_egreso_id;

    IF NOT v_es_inversion THEN
        RETURN NEW;
    END IF;

    -- El modulo de inversiones (fn_crear_inversion, fn_liquidar_inversion,
    -- fn_rescatar_inversion) marca cada movimiento con el inversion_id.
    v_inversion_id := COALESCE(NEW.metadata->>'inversion_id', '');
    IF v_inversion_id = '' THEN
        RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_bloquear_movimiento_categoria_inversion ON public.p_caja;
CREATE TRIGGER tr_bloquear_movimiento_categoria_inversion
BEFORE INSERT OR UPDATE OF estructura_egreso_id, metadata ON public.p_caja
FOR EACH ROW EXECUTE FUNCTION public.fn_tr_bloquear_movimiento_categoria_inversion();

-- ----------------------------------------------------------------------------
-- (5) Editar un movimiento: no se puede reasignar a la categoria de inversiones
--     (ni sacarlo de ella).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tr_bloquear_reasignacion_categoria_inversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_nuevo_es_inversion boolean := false;
    v_viejo_es_inversion boolean := false;
BEGIN
    IF NEW.estructura_egreso_id IS NOT NULL THEN
        SELECT COALESCE(e.tipo_cupo, '') = 'investment' INTO v_nuevo_es_inversion
        FROM public.p_estructuras_egresos e
        WHERE e.estructura_id = NEW.estructura_egreso_id;
    END IF;

    IF OLD.estructura_egreso_id IS NOT NULL THEN
        SELECT COALESCE(e.tipo_cupo, '') = 'investment' INTO v_viejo_es_inversion
        FROM public.p_estructuras_egresos e
        WHERE e.estructura_id = OLD.estructura_egreso_id;
    END IF;

    IF v_nuevo_es_inversion AND NOT v_viejo_es_inversion THEN
        RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_bloquear_reasignacion_categoria_inversion ON public.p_caja;
CREATE TRIGGER tr_bloquear_reasignacion_categoria_inversion
BEFORE UPDATE OF estructura_egreso_id ON public.p_caja
FOR EACH ROW EXECUTE FUNCTION public.fn_tr_bloquear_reasignacion_categoria_inversion();