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
