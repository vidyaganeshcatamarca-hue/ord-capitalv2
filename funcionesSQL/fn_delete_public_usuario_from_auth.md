# fn_delete_public_usuario_from_auth

**Espejo creado:** 2026-10-14 · **Estado:** desplegada y verificada borrando user 195 en vivo (HTTP 200, 0 residuales)
**Trigger:** `tr_delete_public_usuario` (AFTER DELETE ON auth.users, enabled 'O') · **Trabaja con:** `tr_caja_limpieza` (`fn_t_limpiar_dependencias_caja` en p_caja DELETE)

## Firma

```sql
public.fn_delete_public_usuario_from_auth() RETURNS trigger
```

## Qué hace (y por qué el orden importa)

Se dispara al eliminar un usuario authentication (dashboard o Admin API). Antes hacía solo
`DELETE FROM usuarios WHERE auth_id = old.id` y dejaba a la cascada matar al resto — pero la
cascada mata a `p_caja` **dentro de la misma sentencia**: el trigger `tr_caja_limpieza` de
p_caja DELETE hace `UPDATE p_compromisos_tarjeta ... WHERE user_id = OLD.user_id` con el
usuario **ya eliminado** en la misma transacción → FK 23503 "Key (user_id)=(X) is not present
in table usuarios" → el borrado del auth user fallaba con 500 (bloqueo reportado 2026-10-14;
estaba "andando" antes de que existieran ambos triggers DELETE, agregados con las tandas de voz/pagos).

**Orden correcto implementado:**
1. Resolver `v_uid` desde `auth_id`; si no hay usuario público → `RETURN old` (nada que limpiar).
2. `DELETE FROM p_caja WHERE user_id = v_uid` — sus triggers corren con el usuario VIVO (la
   re-versión de pagos/cuotas es inocua; la tarjeta muere después).
3. `DELETE FROM p_compromisos_tarjeta WHERE user_id = v_uid`.
4. `DELETE FROM usuarios WHERE auth_id = old.id AND user_id = v_uid` — cascada mata el resto
   (billeteras, tarjetas, cuotas, presupuestos, inversiones...) con ON DELETE CASCADE.

## Corrección acompañante (2026-10-14)

- `app_usuario_bloqueos.fk_bloqueos_usuario`: `ON DELETE NO ACTION` → **ON DELETE CASCADE**
  (era la única FK pública a usuarios sin cascada; bloqueaba borrados por bloqueos existentes).

## Verificación (2026-10-14)

- Reproducción del 500 (23503 en `p_compromisos_tarjeta_user_id_fkey`) ✔ luego fix.
- DELETE Admin API de `d434e03f...` (user 195 arieldere75) → **200** ✔.
- Post: usuarios 195 = 0, auth.users = 0, residuales 0/0/0/0/0/0 (p_caja, compromisos,
  cuotas, billeteras, tarjetas, bloqueos) ✔.