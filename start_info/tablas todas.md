[
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "audit_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "nextval('admin_audit_log_audit_id_seq'::regclass)",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "accion",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "admin_caller",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "origen_user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "destino_user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "parametros",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "resultado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "detalle",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "admin_audit_log"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "destino_user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "habilitado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "agregado_en",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "agregado_por",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "admin_clone_destinos_permitidos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "admin_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "uuid",
                "column_name": "auth_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "email",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "rol",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'viewer'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "habilitado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "ultimo_acceso_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "admin_usuarios"
    },
    {
        "columns": [
            {
                "data_type": "text",
                "column_name": "feature_key",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "modo_minimo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "orden",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "pref_key",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activo_testing",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "app_feature_flags"
    },
    {
        "columns": [
            {
                "data_type": "text",
                "column_name": "clave",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "valor",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "app_global_config"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "reporte_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "nextval('app_reportes_reporte_id_seq'::regclass)",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "usuario_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "character varying",
                "column_name": "titulo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": 150,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "transcripcion_audio",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "tiene_audio",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "media",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'[]'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "pantalla",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "version_app",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "plataforma",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'nuevo'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "respuesta_admin",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_el",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'bug'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "idioma_origen",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "texto_original",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "tuvo_adjuntos",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "explicacion_interna",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "app_reportes"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "bloqueo_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "nextval('app_usuario_bloqueos_bloqueo_id_seq'::regclass)",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "usuario_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "feature_key",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "motivo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_el",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "hasta",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "app_usuario_bloqueos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "caja_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "cuenta_egreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "producto_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "vendedor_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_cuenta_historico",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "valor_egreso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "valor_ingreso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "ajuste",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "margen_unitario",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_cliente",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "observaciones",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "valor_contratado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "valor_real",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "ALWAYS"
            }
        ],
        "table_name": "caja"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "cuenta_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_cuenta",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "cost_type",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'fixed'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "cuentas_egresos"
    },
    {
        "columns": [
            {
                "data_type": "text",
                "column_name": "doc_type",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "version",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "requires_acceptance",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "requires_notification",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "effective_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "created_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "legal_document_version"
    },
    {
        "columns": [
            {
                "data_type": "uuid",
                "column_name": "session_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "gen_random_uuid()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "platform",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'web'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "app_version",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "started_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "ended_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "paused_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "total_active_seconds",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "status",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'active'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "metadata",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "created_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "updated_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_app_sessions"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "min_required_version",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "latest_version",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "mandatory",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "effective_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "notes",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "created_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_app_version_policy"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "billetera_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'ARS'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "saldo_actual",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activa",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_compartida",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "ultima_conciliacion_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_fondo_prevision",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_meta",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_objetivo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_respaldo_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_cuenta_madre_ahorro",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "icono",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'💵'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "saldo_inicial_pendiente",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_billeteras"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "p_caja_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "cuenta_ingreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_origen_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_destino_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_cuenta_historico",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_egreso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_ingreso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "observaciones",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "metadata",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "familiar_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "tarjeta_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "cuotas_totales",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "1",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_usd",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_compartido",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "pagado_por_user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "proyecto_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "en_balance_activo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_creador_snapshot",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_invitado_snapshot",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "detalle",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "estructura_egreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'ARS'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "parent_pago_caja_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "resumen_real",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_local",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda_local",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "tasa_snapshot",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_caja"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "pendiente_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "origen",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "recurrente_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "estructura_egreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "CURRENT_DATE",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "detalle",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "metadata",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'pendiente'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_destino_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "tarjeta_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "cuenta_ingreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "cuotas",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "destination_amount",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_caja_cuarentena"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "compromiso_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "tarjeta_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_cuota",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "mes_periodo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "pagado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_compromisos_tarjeta"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "conciliacion_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "fecha",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "saldo_teorico",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "saldo_real",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "diferencia",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "ALWAYS"
            }
        ],
        "table_name": "p_conciliaciones"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "config_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estrategia_activa",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'math'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_inicio_plan",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "CURRENT_DATE",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "actualizado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_config_bola_nieve"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "pais",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "fuente_inflacion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "inflacion_acumulada_6m",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "inflacion_acumulada_12m",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp without time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp without time zone",
                "column_name": "actualizado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "p_inflacion_manual_anual_pct",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_config_inflacion"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "pais_codigo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda_default",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "idioma_default",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'es'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "origen_pais",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "confirmado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "monedas_extra",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'[\"USD\"]'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "monedas_formateo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_config_region"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "cotizacion_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda_iso",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_por_usd",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_cotizaciones_historico"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "cuota_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "tarjeta_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "prestamo_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "p_caja_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "numero_cuota",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_cuota",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_estimada_pago",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "pagado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'ARS'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "estructura_egreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "carga_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "pago_caja_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_cuotas_detalle"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "divisa_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_por_usd",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "ultima_actualizacion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_anterior",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "variacion_mensual_pct",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_divisas"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "estructura_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "padre_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_cuenta",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo_cupo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "icono",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'🔹'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "color",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'#64748B'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_deseo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_hormiga",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "definicion_hormiga",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "utilidad_placer",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "5",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "flexibilidad_recorte",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "5",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_estructuras_egresos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "feedback_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "mensaje",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "metadata",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'nuevo'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "respuesta_admin",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "resuelto_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_feedback_usuario"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "config_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "nextval('p_gastos_fijos_config_config_id_seq'::regclass)",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "estructura_egreso_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_mensual",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_fijo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "created_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "updated_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_gastos_fijos_config"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "recurrente_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "estructura_egreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_custom",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_base",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "dia_del_mes",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "frecuencia",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'mensual'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo_variabilidad",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'fijo'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_defecto_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "modo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'mensual'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "ARRAY",
                "column_name": "dias_semana",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "ARRAY",
                "column_name": "dias_mes",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "ARRAY",
                "column_name": "fechas_anio",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "motivo_pausa",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "pausado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_unica",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_fin",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "tarjeta_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_usd",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "proxima_ocurrencia",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "naturaleza",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'egreso'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "estructura_ingreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_destino_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_gastos_recurrentes"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "familiar_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_grupo_familiar"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "score_global",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "score_proteccion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "score_presupuesto",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "score_deuda",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "score_crecimiento",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "score_ahorro",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_historico_score_salud"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "conciliacion_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "creado_por_user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_saldado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "direccion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_origen_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_destino_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nota",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_hogar_conciliaciones"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "invitacion_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "codigo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "creado_por_user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "expira_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "usada",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "usada_por_user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creada_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_hogar_invitaciones"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "pago_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "de_user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "para_user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_hogar_pagos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "rol",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_hogar_participantes"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_hogar",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'Nuestro Hogar'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_usuario_creador",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "50.00",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_usuario_invitado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "50.00",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "codigo_invitacion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_hogares"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "mapping_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "termino_clave",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "rubro_nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "subcuenta_nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_ia_global_mapping"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "suggestion_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "termino_clave",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "rubro_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "subcuenta_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "usuario_que_sugirio",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "votos_coincidentes",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "1",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_ia_global_suggestions"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "impuesto_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_impuesto",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'Impuesto País/CABA/Otros'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_impuesto_tarjeta"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "indice_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "mes",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "anio",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_ipc",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_indices_precios"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "producto_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "icono",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'💰'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "color",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'#22C55E'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_pasivo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_ingresos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "inversion_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_activo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_invertido_original",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_origen_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_inicio",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'activa'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "tasa_anual_tna",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_mercado_actual",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_liquidado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_liquidacion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'ARS'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "ultima_conciliacion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "CURRENT_DATE",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_inversiones"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "inyeccion_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "mes_periodo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_inyectado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_origen_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_inyecciones_presupuesto"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "doc_type",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "evento",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "version",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "created_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_legal_consentimientos"
    },
    {
        "columns": [
            {
                "data_type": "character",
                "column_name": "codigo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": 3,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "decimales",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "2",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "simbolo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activa",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_monedas"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "push_enabled",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "time without time zone",
                "column_name": "push_time",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'09:00:00'::time without time zone",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "reminder_daily_expenses",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "time without time zone",
                "column_name": "reminder_daily_expenses_time",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'20:00:00'::time without time zone",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_vencimientos",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_recurrentes",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_liquidez",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_presupuesto",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_cuarentena",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_deuda",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_ahorro",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_inversiones",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_hogar",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_score",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_resumen_semanal",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "cat_resumen_mensual",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "balance_desequilibrado_threshold",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "100000",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "actualizado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_notificaciones_config"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "notificacion_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "nextval('p_notificaciones_enviadas_notificacion_id_seq'::regclass)",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo_notificacion",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "referencia_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "canal",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "titulo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "mensaje",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "leida",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "pausada_hasta",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "enviado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "leida_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "metadata",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "familia",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'operativo'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "categoria",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "dedupe_key",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "prioridad",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "50",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "expira_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "presentada_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "accion_completada_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_notificaciones_enviadas"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "p_caja_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "tarjeta_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_total",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "liquidado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "aporte_saldo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "refinanciado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "cuota_refi_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "ARRAY",
                "column_name": "cuotas_ids",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'{}'::bigint[]",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "cotizacion_usd",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_total_ars",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_total_usd",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "pagos_aplicados",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "aporte_saldo_usd",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "refinanciado_ars",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "refinanciado_usd",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "cuota_refi_id_ars",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "cuota_refi_id_usd",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "cuotas_adelantadas",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "total_adelantado_ars",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "total_adelantado_usd",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "favor_acreditado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_pagos_tarjeta_log"
    },
    {
        "columns": [
            {
                "data_type": "character",
                "column_name": "codigo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": 2,
                "is_generated": "NEVER"
            },
            {
                "data_type": "character",
                "column_name": "moneda_local",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": 3,
                "is_generated": "NEVER"
            },
            {
                "data_type": "character",
                "column_name": "idioma_sugerido",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'en'::bpchar",
                "character_maximum_length": 2,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "separador_miles",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "separador_decimal",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "primer_dia_semana",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "1",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "formato_fecha",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'DD/MM/YYYY'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "formato_hora",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'24h'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "soportado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "orden",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_paises"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "pin_row_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "nextval('p_pin_seguridad_pin_row_id_seq'::regclass)",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "pin_hash",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'sin_pin'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "intentos_fallidos",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "bloqueado_hasta",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "pin_ultimo_cambio",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_pin_seguridad"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tema",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'auto'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tamanio_fuente",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'mediano'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "ocultar_montos",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "decimales_moneda_local",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "decimales_segunda_moneda",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "1",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "separador_miles",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'.'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "separador_decimal",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "','::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "primer_dia_semana",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "1",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "formato_fecha",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'DD/MM/YYYY'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_default_egreso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_default_ingreso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "categoria_default_sin_clasificar",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "ocr_auto_aprobar",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "ocr_confianza_minima",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "80",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "voz_activada",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "actualizado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "home_preferencias",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "orden_billeteras",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'valor'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "formato_hora",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'24h'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_preferencias_usuario"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "prestamo_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "entidad_nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo_entidad",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo_flujo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_total_deuda",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_pagado_acumulado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "character",
                "column_name": "moneda_iso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'ARS'::bpchar",
                "character_maximum_length": 3,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'activo'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "p_caja_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_prestamo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo_deuda",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "saldo_actual",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "tasa_anual_tna",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "cuota_mensual",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "proximo_vencimiento",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_original",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "saldo_al_ingreso",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "modalidad",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'libre'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "condicion_interes",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'desconocido'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "interes_total_acordado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "tasa_informada",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "puntos_vinculo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "eliminado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_prestamos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "cuota_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "prestamo_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "numero_cuota",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_vencimiento",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_cuota",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "capital_componente",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "interes_componente",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_prestamos_cuotas"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "pago_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "prestamo_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "p_caja_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "direccion",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda_billetera",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_billetera",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda_prestamo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_aplicado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "capital_aplicado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "interes_aplicado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "interes_excedente",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nota",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'activo'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "corregido_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_prestamos_pagos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "presupuesto_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_limite",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "mes_periodo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "estructura_egreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "dia_ancla",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "1",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_techo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_presupuestos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "config_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_necesidades",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "50.00",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_deseos",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "30.00",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_ahorro",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "20.00",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_diezmo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0.00",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "dia_ancla_ciclo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "1",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "modo_presupuesto",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'anticipado'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_activacion_base_cero",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_presupuestos_config"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "historial_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "presupuesto_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "estructura_egreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "mes_periodo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "dia_ancla",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_limite",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "motivo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "modo_origen",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "modo_destino",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "idempotency_key",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_techo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_presupuestos_historial"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "proyecto_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_proyecto",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "presupuesto_meta",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0.00",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_proyectos_compartidos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "recordatorio_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "titulo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "time without time zone",
                "column_name": "hora",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "ARRAY",
                "column_name": "dias_semana",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "recurrente",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_unica",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "created_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_recordatorios"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "referido_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id_invitador",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "codigo_referido",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id_invitado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "email_invitado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "completado_onboarding",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "suscrito_premium",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "fecha_suscripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "beneficio_aplicado",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "usado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_referidos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "movimiento_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "sobre_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "importe",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "modalidad",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "genera_rendimiento",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "CURRENT_DATE",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "caja_ingreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "corrige_a",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "actualizado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "caja_movimiento_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_sobre_movimientos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "auditoria_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "movimiento_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "datos_anteriores",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "datos_nuevos",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "motivo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_sobre_movimientos_auditoria"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "sobre_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "monto_meta",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha_objetivo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "plan_inicio_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "CURRENT_DATE",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "orden",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "orden_manual",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "archivado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "icono",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'💰'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "actualizado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_sobres"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "tarjeta_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_tarjeta",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "dia_cierre",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "dia_vencimiento",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "limite_un_pago",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "limite_cuotas",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "character",
                "column_name": "moneda_iso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'ARS'::bpchar",
                "character_maximum_length": 3,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "banco",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "color",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'#6366F1'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activa",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "saldo_a_favor",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "saldo_a_favor_usd",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_tarjetas_credito"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "snapshot_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "score_value",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "score_version",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'cps_basic_v1'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "categoria",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "calculated_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "metrics_snapshot",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_telemetry_cps_snapshots"
    },
    {
        "columns": [
            {
                "data_type": "uuid",
                "column_name": "event_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "gen_random_uuid()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "uuid",
                "column_name": "session_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "event_name",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "event_timestamp",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "received_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "app_version",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "platform",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "schema_version",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'basic_v1'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "smallint",
                "column_name": "priority",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "2",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "properties",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "created_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_telemetry_events"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "calculated_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "active_days_7d",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "active_days_30d",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "movement_days_30d",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "sessions_30d",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "active_seconds_30d",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "active_wallet_count",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "custom_category_count",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "distinct_categories_used_30d",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "reconciliation_count",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "days_since_last_reconciliation",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "active_card_count",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "has_card_activity_30d",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "budget_coverage_ratio",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "budget_used_next_cycle",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "modules_used_30d",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_telemetry_user_metrics"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "vendedor_app_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "telefono",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "email",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_comision",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "comision_fija_entrega",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "activo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "true",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "observaciones",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_vendedores_app"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "webhook_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo_evento",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "payload",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'{}'::jsonb",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'pendiente'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "intentos",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "ultimo_error",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "procesado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "p_webhook_queue"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "producto_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "precio_vta",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "cv1",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "cv2",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "cv3",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "cv_total",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "ALWAYS"
            },
            {
                "data_type": "integer",
                "column_name": "ganancia",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "ALWAYS"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "productos"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "telefono",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "documento",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "razon_social",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo_producto",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "valor_entrega",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "valor_mensual_contratado",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "mes_ultimo_pago",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "now()",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "login",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "password",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo_sistema",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'personal'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "vendedor_app_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "asignado_vendedor_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "uuid",
                "column_name": "auth_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "email",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "deleted_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "estado_cuenta",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": "'activo'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "app_version",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "ultimo_login",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "modo_app",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'simple'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "total_usage_seconds",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "0",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "last_session_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "consentimiento_legal_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "terminos_version_aceptada",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "privacidad_version_aceptada",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "opened_terms",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "opened_privacy",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "false",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "plan_tipo",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": "'trial'::text",
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "usuarios"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "p_caja_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "date",
                "column_name": "fecha",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "tipo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "cuenta_ingreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_origen_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "billetera_destino_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre_cuenta_historico",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_egreso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_ingreso",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "observaciones",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "jsonb",
                "column_name": "metadata",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "timestamp with time zone",
                "column_name": "creado_at",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "familiar_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "tarjeta_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "integer",
                "column_name": "cuotas_totales",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_usd",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "hogar_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "es_compartido",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "pagado_por_user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "proyecto_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "boolean",
                "column_name": "en_balance_activo",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_creador_snapshot",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "porcentaje_invitado_snapshot",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "detalle",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "estructura_egreso_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "parent_pago_caja_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "resumen_real",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "valor_local",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "moneda_local",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "tasa_snapshot",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "v_p_caja_reportable"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "total_pesos",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "total_solo_pesos",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "numeric",
                "column_name": "total_solo_dolares",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "v_patrimonio_neto"
    },
    {
        "columns": [
            {
                "data_type": "bigint",
                "column_name": "vendedor_id",
                "is_identity": "YES",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "nombre",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "telefono",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "text",
                "column_name": "descripcion",
                "is_identity": "NO",
                "is_nullable": "YES",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            },
            {
                "data_type": "bigint",
                "column_name": "user_id",
                "is_identity": "NO",
                "is_nullable": "NO",
                "column_default": null,
                "character_maximum_length": null,
                "is_generated": "NEVER"
            }
        ],
        "table_name": "vendedores"
    }
]
