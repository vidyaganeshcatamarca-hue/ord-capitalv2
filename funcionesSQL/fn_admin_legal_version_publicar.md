# fn_admin_legal_version_publicar

**Espejo creado:** 2026-10-09 · **Estado:** aplicada en Supabase (Tanda 0, commit `93e12e8`)
**Feature:** `odd/tasks/versionado-legal.md` · **Spec:** `docs/spec-versionado-legal-2026-10-09.md` §4.1 + §6
**Repo que la invoca:** `ord-admin` (panel Admin)
**SQL fuente:** `temp_sql/versionado-legal/05_rpc_admin_versiones.sql`

## Firma

```sql
public.fn_admin_legal_version_publicar(
    p_doc_type text,
    p_version text,
    p_requires_acceptance boolean,
    p_requires_notification boolean,
    p_effective_at timestamptz DEFAULT now()
) RETURNS jsonb
```

## Qué hace

Publica (UPSERT) una versión del catálogo `legal_document_version`. Es la **única
vía de escritura** de la tabla. Aplica el patrón admin de escritura:

- Gate `fn_admin_session()` como primera línea (identidad vía `admin_usuarios`).
- Rol `admin` estricto; `viewer` rebota con `error_admin_only`.
- Kill-switch `fn_admin_escritura_habilitada()`: `false` → `error_admin_write_disabled`.
- Auditoría en `admin_audit_log` (acción, caller, resultado, parámetros).
- Sin `STABLE` (el gate escribe).

## Validaciones (contrato de errores)

| Situación | Error |
| --- | --- |
| `doc_type` fuera de `('terminos','privacidad')` | `error_valor_invalido` `{campo: doc_type}` |
| `version` no cumple el formato `x.y[.z]` (regex `^[0-9]+(\.[0-9]+){0,2}$`, el mismo de `fn_admin_policy_guardar`) | `error_valor_invalido` `{campo: version}` |
| Versión menor que la vigente (según `fn_compare_versions`) | `error_legal_version_downgrade` |
| Re-publicar la vigente con flags distintos | `error_legal_version_immutable` |

- La comparación de versiones usa `fn_compare_versions` (numérico, no
  lexicográfico). El regex además protege el cast interno de esa función.
- Re-publicar la versión vigente con los **mismos** flags es un noop sin write ni
  auditoría (`cambio: false`), mismo criterio que `fn_admin_config_guardar`.
- **Regla de release (§6):** el deploy del HTML va PRIMERO; esta RPC se llama
  después, en la misma release. Nunca publicar una fila con el HTML sin deployar.
- La identidad y el rol salen de `fn_admin_session()` (`admin_usuarios`), no de
  `usuarios`.

## Código SQL

```sql
CREATE OR REPLACE FUNCTION public.fn_admin_legal_version_publicar(
    p_doc_type              text,
    p_version               text,
    p_requires_acceptance   boolean,
    p_requires_notification boolean,
    p_effective_at          timestamptz DEFAULT now()
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session jsonb;
    v_actual  public.legal_document_version%ROWTYPE;
    v_regex   text := '^[0-9]+(\.[0-9]+){0,2}$';
    v_accept  boolean;
    v_notify  boolean;
    v_eff     timestamptz;
BEGIN
    v_session := public.fn_admin_session();

    IF (v_session ->> 'rol') IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION '{"key": "error_admin_only", "params": {}}';
    END IF;

    IF NOT public.fn_admin_escritura_habilitada() THEN
        RAISE EXCEPTION '{"key": "error_admin_write_disabled", "params": {}}';
    END IF;

    -- Validacion de entrada: mismo regex de version que fn_admin_policy_guardar
    -- (ademas protege el cast interno de fn_compare_versions).
    IF p_doc_type IS NULL OR p_doc_type NOT IN ('terminos', 'privacidad') THEN
        RAISE EXCEPTION '{"key": "error_valor_invalido", "params": {"campo": "doc_type"}}';
    END IF;

    IF p_version IS NULL OR p_version !~ v_regex THEN
        RAISE EXCEPTION '{"key": "error_valor_invalido", "params": {"campo": "version"}}';
    END IF;

    v_accept := COALESCE(p_requires_acceptance, false);
    v_notify := COALESCE(p_requires_notification, false);
    v_eff    := COALESCE(p_effective_at, now());

    -- Version vigente del documento (ver fn_obtener_estado_legal)
    SELECT d.* INTO v_actual
      FROM public.legal_document_version d
     WHERE d.doc_type = p_doc_type
       AND NOT EXISTS (
           SELECT 1
             FROM public.legal_document_version d2
            WHERE d2.doc_type = d.doc_type
              AND public.fn_compare_versions(d2.version, d.version) > 0)
     ORDER BY d.effective_at DESC, d.created_at DESC
     LIMIT 1;

    IF FOUND THEN
        -- Downgrade: la version nueva debe ser mayor que la vigente
        IF public.fn_compare_versions(p_version, v_actual.version) < 0 THEN
            RAISE EXCEPTION '{"key": "error_legal_version_downgrade", "params": {}}';
        END IF;

        -- Republicar la version vigente: los flags son inmutables
        IF public.fn_compare_versions(p_version, v_actual.version) = 0 THEN
            IF v_accept IS DISTINCT FROM v_actual.requires_acceptance
               OR v_notify IS DISTINCT FROM v_actual.requires_notification THEN
                RAISE EXCEPTION '{"key": "error_legal_version_immutable", "params": {}}';
            END IF;

            -- Noop: sin write ni auditoria
            RETURN jsonb_build_object(
                'ok', true,
                'cambio', false,
                'doc_type', p_doc_type,
                'version', p_version,
                'requires_acceptance', v_actual.requires_acceptance,
                'requires_notification', v_actual.requires_notification,
                'effective_at', v_actual.effective_at);
        END IF;
    END IF;

    INSERT INTO public.legal_document_version (
        doc_type, version, requires_acceptance, requires_notification, effective_at
    ) VALUES (
        p_doc_type, p_version, v_accept, v_notify, v_eff
    );

    INSERT INTO public.admin_audit_log (accion, admin_caller, resultado, parametros)
    VALUES ('fn_admin_legal_version_publicar',
            v_session ->> 'email',
            'ok',
            jsonb_build_object(
                'doc_type', p_doc_type,
                'version', p_version,
                'requires_acceptance', v_accept,
                'requires_notification', v_notify,
                'effective_at', v_eff,
                'version_anterior', v_actual.version));

    RETURN jsonb_build_object(
        'ok', true,
        'cambio', true,
        'doc_type', p_doc_type,
        'version', p_version,
        'requires_acceptance', v_accept,
        'requires_notification', v_notify,
        'effective_at', v_eff);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_admin_legal_version_publicar(text, text, boolean, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_legal_version_publicar(text, text, boolean, boolean, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
```
