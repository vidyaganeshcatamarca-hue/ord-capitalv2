# p_pin_seguridad (pin-huella T5, deployada con OK del dueño el 2026-10-16)

Tabla **p_pin_seguridad** (hash de PIN, intentos, cooldown, estado) + 5 RPCs.
Dominio RPC-only con `auth.uid()`, RLS sin policies (FORCE no aplica: los definers
son owner). `pgcrypto` se llama cualificado `extensions.crypt/gen_salt`.

---

```sql
-- p_pin_seguridad (deployada)
CREATE TABLE IF NOT EXISTS public.p_pin_seguridad (
  pin_row_id        bigserial PRIMARY KEY,
  user_id           bigint NOT NULL UNIQUE REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
  pin_hash          text,
  estado            text NOT NULL DEFAULT 'sin_pin'
                    CHECK (estado IN ('sin_pin','activa','en_cooldown','restaurar')),
  intentos_fallidos integer NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta   timestamptz,
  pin_ultimo_cambio timestamptz
);
ALTER TABLE public.p_pin_seguridad ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_p_pin_seguridad_estado ON public.p_pin_seguridad (estado);
```

## Notas de verificación del deploy

Verificación del deploy (smokes 74b, TODOS OK)

1. estructura: 5 RPCs + tabla + idx + rls `relrowsecurity` on.
2. alta → activa/0.
3. `fn_desactivar_pin('9999')` → `error_pin_actual_incorrecto`.
4. desactivar correcto → sin_pin (fila borrada).
5. cambio con actual correcto → sigue activa.
6. verificar OK `ok=true`; fallo `ok=false,intentos=1` (sin raise).
7. 9 intentos → activa/9; el **10º** → `en_cooldown` + ventana.
8. reactivar → activa/0 (ventana cancelada).
9. ventana vencida al leer → `restaurar`, hash NULL, intentos 0.
10. formato → error_pin_formato; AAAA → error_pin_debil (server-side).
