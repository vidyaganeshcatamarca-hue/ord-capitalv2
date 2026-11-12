CREATE OR REPLACE FUNCTION public.fn_avisos_ejecutar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r jsonb := '{}'::jsonb;
BEGIN
    r := r || jsonb_build_object('cuarentena',          public.fn_aviso_cuarentena());
    r := r || jsonb_build_object('vencimiento_tarjeta', public.fn_aviso_vencimiento_tarjeta());
    r := r || jsonb_build_object('deuda_por_vencer',    public.fn_aviso_deuda_por_vencer());
    r := r || jsonb_build_object('categoria_en_rojo',   public.fn_aviso_categoria_en_rojo());
    r := r || jsonb_build_object('ahorro_en_riesgo',    public.fn_aviso_ahorro_en_riesgo());
    RETURN r;
END;
$function$
