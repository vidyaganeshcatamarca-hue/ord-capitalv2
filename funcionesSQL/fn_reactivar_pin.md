# fn_reactivar_pin (pin-huella T5, deployada con OK del dueño el 2026-10-16)

```sql
-- S7: el desbloqueo biométrico cancela una ventana ACTIVA y deja el PIN en vigencia.
CREATE OR REPLACE FUNCTION public.fn_reactivar_pin()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key":"error_unauthorized","params":{}}';
  END IF;

  UPDATE public.p_pin_seguridad
    SET estado = 'activa', intentos_fallidos = 0, bloqueado_hasta = NULL
    WHERE user_id = v_user_id
      AND estado IN ('en_cooldown')
      AND (bloqueado_hasta IS NULL OR bloqueado_hasta > now());
  -- una ventana VENCIDA no se reactiva por huella sola: queda 'restaurar'.
END;
$function$;
```
