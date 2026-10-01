-- Owner-approved icon data fix: Panadería carried the semantically wrong
-- 'HandHeart' lucide name; Croissant is the intended icon. Seed functions
-- never generate Panadería (verified: fn_crear_categorias_defecto_usuario
-- only creates cat_mystery), so no regeneration path exists.
BEGIN;

UPDATE public.p_estructuras_egresos
SET icono = 'Croissant'
WHERE icono = 'HandHeart'
  AND nombre_cuenta = 'Panadería';

COMMIT;