# fn_admin_legal_versiones_listar

**Espejo creado:** 2026-10-09 · **Estado:** aplicada en Supabase (Tanda 0, commit `93e12e8`)
**Feature:** `odd/tasks/versionado-legal.md` · **Spec:** `docs/spec-versionado-legal-2026-10-09.md` §4.1 + §6
**Repo que la invoca:** `ord-admin` (panel Admin)
**SQL fuente:** `temp_sql/versionado-legal/05_rpc_admin_versiones.sql`

## Firma

```sql
public.fn_admin_legal_versiones_listar() RETURNS jsonb
```

## Qué hace

Listado del catálogo de versiones legales (Términos y Privacidad) con los conteos
de aceptación y aviso por versión. Réplica del patrón admin:

- Gate `fn_admin_session()` como **primera línea** (identidad vía `admin_usuarios`:
  `viewer|admin`; audita `ok`/`denied`). Sin JWT → `error_unauthorized` sin auditar.
- Auditoría en `admin_audit_log` (acción, caller, resultado, parámetros).
- **Sin `STABLE`**: `fn_admin_session()` escribe; `STABLE` rompe con 405 vía
  PostgREST.
- Errores siempre con el contrato JSON `{"key": "...", "params": {...}}`.

## Contrato de salida

```json
{
  "versiones": [
    { "doc_type": "terminos", "version": "1.1", "requires_acceptance": false,
      "requires_notification": true, "effective_at": "...", "created_at": "...",
      "es_vigente": true, "usuarios_aceptado": 0, "usuarios_notificado": 0 }
  ],
  "meta": { "admin": "...", "escritura_habilitada": true }
}
```

`es_vigente` se calcula con la misma resolución de versión vigente que
`fn_obtener_estado_legal`: mayor `version` según `fn_compare_versions`.

## Código SQL

```sql
CREATE OR REPLACE FUNCTION public.fn_admin_legal_versiones_listar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session jsonb;
    v_result  jsonb;
BEGIN
    v_session := public.fn_admin_session();

    WITH vigente AS (
        -- Version vigente por doc: mayor `version` segun fn_compare_versions
        SELECT d.doc_type, d.version
          FROM public.legal_document_version d
         WHERE NOT EXISTS (
             SELECT 1
               FROM public.legal_document_version d2
              WHERE d2.doc_type = d.doc_type
                AND public.fn_compare_versions(d2.version, d.version) > 0)
    ),
    conteos AS (
        SELECT c.doc_type, c.version,
               count(*) FILTER (WHERE c.evento = 'aceptado')   AS usuarios_aceptado,
               count(*) FILTER (WHERE c.evento = 'notificado') AS usuarios_notificado
          FROM public.p_legal_consentimientos c
         GROUP BY c.doc_type, c.version
    )
    SELECT jsonb_build_object(
        'versiones', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'doc_type',              v.doc_type,
                       'version',               v.version,
                       'requires_acceptance',   v.requires_acceptance,
                       'requires_notification', v.requires_notification,
                       'effective_at',          v.effective_at::text,
                       'created_at',            v.created_at::text,
                       'es_vigente',            (g.version IS NOT NULL),
                       'usuarios_aceptado',     COALESCE(k.usuarios_aceptado, 0),
                       'usuarios_notificado',   COALESCE(k.usuarios_notificado, 0))
                   ORDER BY v.doc_type, v.effective_at DESC, v.created_at DESC)
              FROM public.legal_document_version v
              LEFT JOIN vigente g ON g.doc_type = v.doc_type AND g.version = v.version
              LEFT JOIN conteos k ON k.doc_type = v.doc_type AND k.version = v.version),
            '[]'::jsonb),
        'meta', jsonb_build_object(
            'admin', v_session ->> 'email',
            'escritura_habilitada', public.fn_admin_escritura_habilitada()))
      INTO v_result;

    INSERT INTO public.admin_audit_log (accion, admin_caller, resultado, parametros)
    VALUES ('fn_admin_legal_versiones_listar',
            v_session ->> 'email',
            'ok',
            jsonb_build_object('versiones', jsonb_array_length(v_result -> 'versiones')));

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_admin_legal_versiones_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_legal_versiones_listar() TO authenticated;
```
