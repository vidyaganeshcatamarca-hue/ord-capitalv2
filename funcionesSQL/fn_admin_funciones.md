# fn_admin_funciones

**Espejo creado:** 2026-09-30 · **Estado:** desplegada y verificada (HTTP 200 con JWT real)
**Repo que la invoca:** `ord-admin` (panel Admin)
**SQL fuente:** `ord-admin/admin/sql/fase_c_fn_admin_funciones.sql`

## Firma

```sql
public.fn_admin_funciones(
    p_desde timestamptz DEFAULT now() - interval '30 days',
    p_hasta timestamptz DEFAULT now(),
    p_app_version text, p_platform text, p_plan text
) RETURNS jsonb
```

## Que hace

Pantalla Funciones (PRD telemetria §19.5), separando Billeteras/Categorias/
Conciliacion/Tarjetas/Presupuesto. Preguntas §28: 13,14,15,16.
Gate fn_admin_session() primera linea.

Fuente: foto DIARIA de p_telemetry_user_metrics (cron 13:00 UTC, ventanas 30d
internas). p_desde/p_hasta NO la recortan — la respuesta incluye
snapshot.calculado_desde/hasta y nota foto_diaria (honestidad de fuente).

- billeteras: usuarios_con_billetera 15/17, promedio 4.3, max 14.
- categorias: 9 usuarios usando 30d, promedio usadas 9.3, custom 24.1.
- **conciliacion con DOBLE SENAL** (hallazgo HANDOFF §3.1):
  por_eventos (p_conciliaciones, SUBESTIMA: conciliar sin diferencia no deja
  fila → hoy 2) vs por_billetera (ultima_conciliacion_at no null → hoy 12).
  nota_reconciliation_subestima: true en la respuesta.
- tarjetas: 11 con tarjeta, 6 con uso 30d, promedio 2.1.
- presupuesto: 17 con cobertura, promedio 0.497, usados_ciclo_siguiente 0.
- p_plan reservado (decision ④). SECURITY DEFINER, REVOKE anon, auditoria.

## Verificacion hecha (2026-09-30)

- deploy 201 · JWT real → 200 con los 5 bloques; gap conciliacion 2 vs 12
  documenta por que existen las dos senales ✔
