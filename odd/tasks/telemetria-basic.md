# Feature: Telemetría BASIC v1 — ORD Capital Personal

Plan aprobado: `telemetria/PLAN_Telemetria_BASIC_v1.md`
Rama: `feat/telemetria-basic`

## Tanda 1 — Infraestructura + navegación

- [ ] SQL: tabla `p_telemetry_events` (pendiente autorización usuario)
- [ ] SQL: RPC `fn_telemetry_ingest` (pendiente autorización usuario)
- [ ] Ejecutar SQL en Supabase + espejo en funcionesSQL + índice de funciones
- [ ] TelemetryService frontend (cola memoria+localStorage, flush background/20/180s/cierre, dedup sesión, prioridades)
- [ ] Instrumentación router: `main_module_opened` + sesiones de módulo (home/cards/budget viewed)
- [ ] Instrumentación HomePage: `home_interaction`, `home_movement_edited`, `home_movement_deleted`
- [ ] Verificación tsc --noEmit + revisión

## Tandas siguientes (ver plan §9)

- [ ] Tanda 2: gate legal (opened_terms/opened_privacy) + derivación funnel onboarding
- [ ] Tanda 3: conciliación (fn_ejecutar_conciliacion → p_conciliaciones)
- [ ] Tanda 4: eventos F7/F8/F9 (tarjetas, presupuesto, errores)
- [ ] Tanda 5: motor CPS (métricas + snapshots + pg_cron)
- [ ] Tanda 6: ORD Admin (bloque B, planificación aparte)