-- Higiene: la rev. con p_tipo (9 params) deja obsoleta la firma v1 de 8 params.
DROP FUNCTION IF EXISTS public.fn_crear_reporte(text, text, text, boolean, jsonb, text, text, text);
