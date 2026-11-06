# fn_obtener_estado_legal

**Espejo creado:** 2026-10-09 · **Estado:** aplicada en Supabase (Tanda 0, commit `93e12e8`)
**Feature:** `odd/tasks/versionado-legal.md` · **Spec:** `docs/spec-versionado-legal-2026-10-09.md` §4.1 (+ §5 flujo UI)
**SQL fuente:** `temp_sql/versionado-legal/03_rpc_obtener_estado_legal.sql`

## Firma

```sql
public.fn_obtener_estado_legal() RETURNS jsonb
```

## Qué hace

Devuelve el estado legal del usuario autenticado en **una sola llamada** al
arranque de sesión. El backend calcula el `pending_action` por documento y el
front solo pinta (§5: overlay bloqueante / modal no bloqueante / nada). Resuelve
la identidad con `auth.uid()` (misma resolución que el resto de las RPCs de usuario).

## Contrato de salida (exacto, §4.1)

```json
{
  "terminos":   { "current_version": "1.1", "requires_acceptance": false,
                  "requires_notification": true, "pending_action": "notify" },
  "privacidad": { "current_version": "1.1", "requires_acceptance": false,
                  "requires_notification": true, "pending_action": "notify" }
}
```

## Derivación de `pending_action` (por documento)

1. **Fallo seguro:** sin NINGÚN evento `aceptado` del doc (de cualquier versión)
   → `require_acceptance`. Nunca queda desbloqueado por aviso.
2. **Guard de la versión vigente:** vigente con `requires_acceptance = true` y sin
   evento `aceptado` de ESA versión → `require_acceptance`. Permite el rollout 1.1:
   aceptados de 1.0 con 1.1 no bloqueante caen en notify/none (spec §3.5, decisión 7).
3. `requires_notification = true`, sin evento `notificado` de la versión vigente y
   **sin evento `aceptado` de la vigente** → `notify`. Aceptar la vigente ya
   implica estar al tanto: el aviso es para quienes venían de una versión previa
   (REV.2 2026-10-10).
4. Caso contrario → `none`.
5. **Defensivo:** doc sin ninguna fila publicada → `current_version` null y `none`.

## Versión vigente

La mayor `version` del doc según `fn_compare_versions` (no orden lexicográfico:
`1.10` > `1.9`), con desempate por `effective_at` / `created_at` más recientes.
`effective_at` es informativa en esta release (ver comentario en 01).

## Código SQL

```sql
CREATE OR REPLACE FUNCTION public.fn_obtener_estado_legal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id         bigint;
    v_doc             text;
    v_version         text;
    v_requires_accept boolean;
    v_requires_notify boolean;
    v_pending         text;
    v_result          jsonb := '{}'::jsonb;
BEGIN
    -- 1. Identidad de la sesion
    SELECT u.user_id INTO v_user_id
      FROM public.usuarios u
     WHERE u.auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Estado por documento (el orden de armado no importa: jsonb no lo preserva)
    FOREACH v_doc IN ARRAY ARRAY['terminos', 'privacidad']::text[] LOOP
        -- 2.1 Version vigente del documento
        SELECT d.version, d.requires_acceptance, d.requires_notification
          INTO v_version, v_requires_accept, v_requires_notify
          FROM public.legal_document_version d
         WHERE d.doc_type = v_doc
           AND NOT EXISTS (
               SELECT 1
                 FROM public.legal_document_version d2
                WHERE d2.doc_type = d.doc_type
                  AND public.fn_compare_versions(d2.version, d.version) > 0)
         ORDER BY d.effective_at DESC, d.created_at DESC
         LIMIT 1;

        -- 2.2 Nivel de politica de la version vigente (backend calcula, front pinta)
        IF v_version IS NULL THEN
            -- Defensivo: documento sin ninguna version publicada.
            v_pending := 'none';
        ELSIF NOT EXISTS (
            -- Fallo seguro: sin NINGUN evento 'aceptado' del doc (cualquier
            -- version) siempre bloquea; nunca se desbloquea por notificacion.
            SELECT 1
              FROM public.p_legal_consentimientos c
             WHERE c.user_id  = v_user_id
               AND c.doc_type = v_doc
               AND c.evento   = 'aceptado') THEN
            v_pending := 'require_acceptance';
        ELSIF COALESCE(v_requires_accept, false)
              AND NOT EXISTS (
            -- Solo bloquea si la version vigente lo requiere. Versiones con
            -- requires_acceptance = false (ej. rollout 1.1 sobre aceptados de
            -- 1.0) caen en notify/none, nunca en bloqueo.
            SELECT 1
              FROM public.p_legal_consentimientos c
             WHERE c.user_id  = v_user_id
               AND c.doc_type = v_doc
               AND c.evento   = 'aceptado'
               AND c.version  = v_version) THEN
            v_pending := 'require_acceptance';
        ELSIF COALESCE(v_requires_notify, false)
              AND NOT EXISTS (
            SELECT 1
              FROM public.p_legal_consentimientos c
             WHERE c.user_id  = v_user_id
               AND c.doc_type = v_doc
               AND c.evento   = 'notificado'
               AND c.version  = v_version)
              -- Aceptar la version vigente YA implica estar al tanto de los
              -- cambios: un recien llegado que acepta la vigente no recibe el
              -- aviso, que es para usuarios que venian de una version previa.
              AND NOT EXISTS (
            SELECT 1
              FROM public.p_legal_consentimientos c
             WHERE c.user_id  = v_user_id
               AND c.doc_type = v_doc
               AND c.evento   = 'aceptado'
               AND c.version  = v_version) THEN
            v_pending := 'notify';
        ELSE
            v_pending := 'none';
        END IF;

        -- 2.3 Bloque del documento
        v_result := v_result || jsonb_build_object(v_doc, jsonb_build_object(
            'current_version',       v_version,
            'requires_acceptance',   COALESCE(v_requires_accept, false),
            'requires_notification', COALESCE(v_requires_notify, false),
            'pending_action',        v_pending));
    END LOOP;

    RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.fn_obtener_estado_legal() IS
    'Estado legal del usuario autenticado (version vigente + flags + pending_action por documento). Fuente: legal_document_version + p_legal_consentimientos.';

REVOKE ALL ON FUNCTION public.fn_obtener_estado_legal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_obtener_estado_legal() TO authenticated;

NOTIFY pgrst, 'reload schema';
```
