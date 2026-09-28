# Feature: registro de traducciones del catalogo (decision B, conjunto cerrado)

## Objetivo
Un unico lugar que declare que entidades de catalogo fueron creadas por el
sistema (sus nombres = claves i18n) y un unico helper de render
`catalogDisplayName(name)`. Todos los renders de nombres de catalogo de la
app pasan por el helper. Los nombres literales de usuario pasan sin cambio.

## Decision (dueno 2026-09-29)
- Opcion B: registro frontend, cero DB, cero RPCs.
- El conjunto es CERRADO: los 35 rubros seed + la billetera Efectivo son la
  totalidad de entidades de catalogo creadas por sistema. No se prevén mas.
- Fuera del registro (mecanismos propios, no confundir):
  - Claves de sistema no visibles para el user (misterio/card_diff/no_detail
    para reportes) -> SYSTEM_CATEGORY_NAMES (editabilidad).
  - Codigos de error -> parseError + claves error_* con params.
- Convencion futura: nueva entidad de catalogo de sistema = seed
  (fn_onboarding_completo_usuario) + registro, siempre juntos.

## Fuente del registro
- Seed real: funcionesSQL/fn_onboarding_completo_usuario.md (los INSERT de
  rubros y la billetera Efectivo).
- Claves existentes en es.ts (seccion seed ~lineas 673-720).
- El registro lista SOLO los nombres estilo clave presentes en DB
  (cat_dairy, cat_housing, ... wallet_cash_default_name). Los nombres
  literales del seed (Educacion, Transporte, ...) no necesitan registro:
  el passthrough de t() ya los muestra correctos.

## Tareas
- [x] T1: auditoria de renders de nombres de catalogo en toda la app
      (grep de nombre_cuenta, categoria_nombre, billetera_nombre,
      billetera_destino_nombre, tarjeta_nombre, cuenta_ingreso_nombre,
      fuentes de ingreso) y clasificacion: ya pasan por t() / crudos.
      - Commit previos: flujo cuarentena ya cubierto (f7c2288, a58bc2f,
        5dabce6); contexto de voz cubierto (contextBuilder t() en
        categorias, billeteras, fuentes).
- [x] T2: crear src/lib/catalogRegistry.ts con el conjunto cerrado +
      catalogDisplayName() (helper unico).
- [x] T3: migrar los renders crudos encontrados por la auditoria al helper.
- [x] T4: tsc + verificacion + commit (f8d8001: 12 archivos, registry 35 nombres, 16 renders crudos migrados, tsc 0, check-i18n 0 flags propios).

## Reglas operativas
- Regla 14: subagentes NO corren tsc/build/tests. El orquestador ejecuta.
- Los renders de UI estatica (strings del propio frontend) NO se tocan:
  el helper es solo para nombres que llegan de datos (RPC/metadata).
- Sin emojis, i18n solo aditivo, es.ts sin cambios (las claves ya existen).
## Hallazgos laterales resueltos (post T4, 2026-09-29)
- Matching clave-vs-etiqueta: HomePage (color no_detail) y AddMovementModal
  (hijo Sin Detalle) comparan ahora contra el valor DB. Commit 6e2165c.
- Busqueda de rubros por display name. Commit 6e2165c.
- BCG i18n (regla 9): 11 claves aditivas + 5 componentes. Commit 54f41c8.
- Debug RPCs dropeadas de Supabase (fn_debug_triggers, fn_debug_get_source).
- Deuda i18n familia/hogar/proyectos: NO se toca; asentada en Engram
  (i18n/deuda-familia-hogar-proyectos).
- DECISION no_detail (dueno): el agujero del flujo manual (frecuente padre
  -> primer hijo) queda como esta (impacto real: 2 gastos historicos).
  no_detail sigue como placeholder contable de flujos internos.
- PENDIENTE nota: fn_crear_subcuenta_predeterminada es codigo huerfano en
  Supabase (ningun trigger la dispara) - candidata a DROP cuando haya
  ciclo backend.
