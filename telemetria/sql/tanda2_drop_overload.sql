-- Tanda 2 cleanup: elimina el overload viejo de 2 params
-- (la firma de 4 params tiene DEFAULTs y cubre ambos casos)
DROP FUNCTION IF EXISTS public.fn_registrar_consentimiento_legal(text, text);
NOTIFY pgrst, 'reload schema';
