CREATE OR REPLACE FUNCTION public.fn_obtener_paises()
 RETURNS TABLE(codigo character, moneda_local character, moneda_decimales smallint, moneda_simbolo text, idioma_sugerido character, separador_miles text, separador_decimal text, primer_dia_semana smallint, formato_fecha text, formato_hora text, orden smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.codigo, p.moneda_local, m.decimales, m.simbolo, p.idioma_sugerido,
         p.separador_miles, p.separador_decimal, p.primer_dia_semana,
         p.formato_fecha, p.formato_hora, p.orden
  FROM public.p_paises p
  JOIN public.p_monedas m ON m.codigo = p.moneda_local
  WHERE p.soportado = true
  ORDER BY COALESCE(p.orden, 32767), p.codigo;
$function$
