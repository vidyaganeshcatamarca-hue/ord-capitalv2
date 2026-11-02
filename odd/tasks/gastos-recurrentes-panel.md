# HANDOFF — Recurrentes (ingresos y egresos) · ORD Capital Personal

> **Este archivo es la memoria del trabajo.** Escrito el 2026-11-02 antes de una compactación de contexto.
> Si estás retomando: leé esto entero, después `docs/varias/prd-gastos-recurrentes.md` (§0.4, §32, §33),
> y recién entonces tocá código. Nada de lo que sigue es una suposición: cada afirmación se verificó
> contra la base desplegada o contra el navegador.

---

## 0. Ubicaciones — leer primero

| Qué | Dónde |
|---|---|
| **Código y trabajo** | `C:\temp\Antigravity\ORD Capital v2\Personal-3` (rama `pi/sesion-3`) |
| **PRD (fuente normativa)** | `C:\temp\Antigravity\ORD Capital v2\Personal\docs\varias\prd-gastos-recurrentes.md` (v1.4, **gitignoreado**) |
| **Este documento** | `Personal-3/odd/tasks/gastos-recurrentes-panel.md` |
| **SQL aplicado y propuesto** | `Personal/temp_sql/60..66_gastos_recurrentes_*.sql` |
| **Espejos de funciones** | `Personal/funcionesSQL/` (gitignoreado) |
| **Servidor de desarrollo** | `http://localhost:5173` (lo levantó el dueño desde `Personal-3`) |

**Los tres worktrees (`Personal`, `Personal-2`, `Personal-3`) están en el mismo sha `897c2bc`.**
`Personal` tiene el PRD; `Personal-3` tiene el código. Los archivos no versionados existen en una sola
copia física: **no los muevas sin avisar**.

Credenciales: `Personal/.env.local` (`ACCESS_TOKEN`, `SUPABASE_URL`, `DATABASE_URL`). **No copies esos
valores a ningún archivo ni a la memoria.** Proyecto Supabase: `bjszdmheddcxjdhcvibi`.

---

## 1. Estado real, sin adornos

### Terminado y verificado

| Pieza | Evidencia |
|---|---|
| Esquema fase 1: `p_gastos_recurrentes` 11 → **17 columnas**, 4 CHECKs, índice por `user_id` | Aplicado; probado con la función desplegada en transacciones con ROLLBACK |
| **7 funciones SQL** | Aplicadas y probadas: 18 aserciones del panel + 6 del motor, todas en verde |
| Panel de UI | Página, tarjetas, modal de 3 modos, borrado con conteo |
| **CategoriaPicker compartido** | Extraído de cuarentena; `EditarCuarentenaModal` −124 líneas, su CSS 287 → 136 |
| Calendario | 4 horizontes (30/90/180/365) y heatmap por **fecha**, no por monto |
| i18n | 88 claves nuevas por idioma (es/en/pt), una sola ocurrencia por clave |
| Renombre | Pantalla, menú y ruta: **`/configuracion/recurrentes`**, título «Recurrentes» |
| Pestañas | **Egresos** (por defecto) e **Ingresos**, en el navegador |
| `tsc --noEmit` | **0 errores** |
| `npm run build` | **exit 0** (1m31s); bundle principal 1018 kB → 970 kB |

### Pendiente, en orden

1. **Probar modo claro y oscuro.** El tema es `data-theme` en `<html>` con valores `'dark'` y
   `'warm-light'`; lo aplica `src/components/configuracion/AparienciaCard.tsx:22` con
   `setAttribute`. Hay reglas `[data-theme='warm-light']` en `src/styles/index.css` y en varios CSS.
   **Riesgo concreto:** el CSS nuevo usa `var(--surface)`, `var(--text)`, `var(--text-muted)`,
   `var(--border)` y `color-mix(...)`. Si algún token no existe en `warm-light`, el panel queda con
   contraste roto. Verificar pestañas, tarjeta, badge de pausa y la hoja del picker en los dos temas.
2. **Alta completa por UI** con el picker (ya es operable: son botones, no un `<select>`).
3. **Ciclo completo**: pausar → ver badge EN PAUSA y el motivo → reactivar → borrar con el conteo de
   pendientes. Al terminar, la tabla debe volver a **0 filas**.
4. **Verificar la cuarentena.** Es la regresión más probable: se le cambió el selector de categoría a
   un flujo en uso. Abrir el modal de edición de un movimiento, abrir el picker y elegir una categoría.
5. **Opción A**: generalizar `p_gastos_recurrentes` para ingresos. Decisión ya tomada por el dueño.
6. **AGENTS.md**: asentar el procedimiento de restaurar la ventana de ego (ver §6).

---

## 2. Prompts del dueño, en orden (textuales)

Estos son los mensajes que dirigieron el trabajo. **Conservados literalmente** porque son la
autoridad: si algo del código o del PRD contradice uno de estos, gana el prompt.

1. «ahora a implementar todo el prd. comienza»
2. «Cuando yo dije borrar, era borrar. ¿Qué hacemos si un gasto recurrente lo queremos eliminar
   definitivamente? Así que tienes que agregar la opción borrar.»
3. «ok» (autorización para aplicar el SQL presentado)
4. «modo testing ya esta en true»
5. «el prd que construiste en personal/docs/varias»
6. «tus cambios deberian estar en tu carpeta personal-3, solo el doc estaba en personal»
7. «recuerda testear UI de punta a punta con recurrentes, primero en formato movil, luego escritorio.
   perfil vidya en ego-browser»
8. «fijate como esta hecho para cuarentena, el selector, hay que usar el mismo. Investiga eso y
   decidimos como seguir»
9. «A» (extraer el componente compartido, no duplicar)
10. «tenes que restaurar la ventana tu, Ego Browser está minimizado y no permite capturas.»
    — con el procedimiento: `ensure-ego.mjs`, `ego_viewport` 1300×900, reabrir la URL, verificar
    `pageInfo()` > 0 y un PNG real. «No cierres la sesión, no cambies de perfil ni borres cookies.»
    Y: «dejalo acentado para todos los agentes en agents.md».
11. «debes probar primero en modo movil, luego escritorio»
12. «que pasa con los ingresos recurrentes? los estas contemplando?»
13. «termina el layout en movil, agrega una pestaña mas para ingresos recurrentes, cambia el nombre de
    la pantalla a 'recurrentes', dos pestañas, ingresos y egresos, egresos por defecto (como en el menu
    cuentas). Luego de terminar la UI, vamos con opcion A. Generalizar el objeto existente»
14. «prueba modo claro y oscuro»
15. «preparate para la compactacion del contexto, resume en un archivo lo escencial para no perder
    data sensible urgente»
16. «/COmpact preserva prompts y respuestas finales»

## 3. El objeto, hoy

### Tabla `p_gastos_recurrentes` (17 columnas)

Originales: `recurrente_id, user_id, estructura_egreso_id, nombre_custom, monto_base, dia_del_mes,
frecuencia, tipo_variabilidad, billetera_defecto_id, activo, creado_at`.

Fase 1 (aplicada): `modo` (`semanal|mensual|anual`, DEFAULT `mensual`), `dias_semana smallint[]`,
`dias_mes smallint[]`, `fechas_anio smallint[]`, `motivo_pausa`, `pausado_at`.

`fechas_anio` usa `mes*100+dia` (315 = 15 de marzo) y se valida contra el array literal de los **366
valores válidos** de un calendario real; `230` (31 de febrero) se rechaza.

### Funciones desplegadas

| Función | Estado |
|---|---|
| `fn_crear_gasto_recurrente` | 3 modos; valida monto > 0 (cierra D-20) |
| `fn_editar_gasto_recurrente` | 3 modos |
| `fn_listar_gastos_recurrentes` | devuelve modo, fechas, `motivo_pausa` y `ocurrencias_pendientes` |
| `fn_borrar_gasto_recurrente` | borrado real, devuelve cuántas pendientes se perdieron |
| `fn_pausar_gasto_recurrente` | pausa/reactiva tocando solo 3 columnas |
| `fn_generar_recurrentes_hoy` | 3 modos, dedupe, recorte de día 31, `COALESCE`, `EXCEPTION` por fila, `SET search_path` |
| `fn_reporte_calendario_financiero` | proyección en 3 modos; ya no devuelve el literal español |

**La tabla está en 0 filas. Nada de prueba quedó.**

### Feature flag

`menu_recurrentes` en `app_feature_flags`: `modo_minimo='avanzado'`, `activo=false`,
**`activo_testing=true`**, `orden=15`. El interruptor global `app_global_config.modo_avanzado_testing`
está en **`true`** (lo puso el dueño). Para el usuario de prueba, `fn_obtener_modo_app` devuelve
**17 features**, `menu_recurrentes` incluida.

Usuario de prueba: `user_id = 1`, email `vidyaganeshcatamarca@gmail.com`. El `auth_id` se obtiene de
`public.usuarios`; **no lo pegues en archivos** (es identificador de sesión).

---

## 4. Trampas técnicas encontradas (esto ahorra horas)

1. **`CREATE OR REPLACE` con otra lista de parámetros crea una SOBRECARGA**, no reemplaza. Una llamada
   posicional queda ambigua. Solución usada: barrido por nombre con
   `DO $$ FOR r IN SELECT p.oid::regprocedure ... EXECUTE 'DROP FUNCTION ' || r.firma`.
2. **`COMMENT ON FUNCTION` con la firma vieja rompe todo el script** con `42883`, sin nombrar el
   comentario. La firma forma parte del nombre.
3. **`smallint[]` es frágil desde el cliente**: `ARRAY[5,15]` es `integer[]` y no hay cast implícito en
   la resolución de funciones. Las RPC usan `integer[]` y castean al insertar.
4. **`array_position(arr, NULL)` nunca encuentra nada.** Para detectar nulos:
   `EXISTS (SELECT 1 FROM unnest(arr) x WHERE x IS NULL)`.
5. **`.spinner-sm` no es global**: está duplicado en tres CSS de componentes. Un componente compartido
   no puede depender de eso; `CategoriaPicker` tiene `cp-loading` propio.
6. **`.config-page` vive en `ConfiguracionPage.css`**. Sin ese import, la pantalla no tiene padding ni
   el margen del sidebar y el contenido desborda. Fue un bug real, corregido.
7. **`t(nombre_cuenta)` es obligatorio**: las categorías semilla guardan una clave i18n como nombre.
   Sin traducir, la UI muestra `cat_housing`, `cat_mystery`.
8. **Regla del picker**: un rubro padre **con hijos es encabezado y no se elige**; los gastos apuntan a
   una subcuenta real. Los padres sin hijos sí son elegibles.

---

## 5. Base de datos: cómo probar sin ensuciar

Todo test va en **transacción con ROLLBACK** (regla 11 del `AGENTS.md`). Para simular la sesión:

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','<auth_id del user 1>','role','authenticated')::text, true);
-- ... llamadas a las RPC ...
ROLLBACK;
```

La Management API se usa con `ACCESS_TOKEN` de `Personal/.env.local`:

```
POST https://api.supabase.com/v1/projects/bjszdmheddcxjdhcvibi/database/query
body: {"query": "..."}
```

Los scripts temporales se escriben en `tests/`, se ejecutan con
`C:/temp/miniconda3/python.exe` y **se borran al terminar**.

---

## 6. Navegador (ego-lite) — cómo se prueba de verdad

- **Restaurar la ventana** (si está minimizada, Playwright rechaza todo click con «element is not
  visible in the viewport» y las capturas fallan):

  ```
  node C:\Users\Vidya Ganesh\.pi\agent\packages\pi-ego-win\scripts\ensure-ego.mjs --restore
  ```
  Respuesta correcta: `"restore":{"minimizedBefore":true,"minimizedAfter":false,"ok":true}`.

- **Los refs `@N` no son confiables entre llamadas**: usar CSS o `xpath=...`.
  `.btn-primary` matchea varios: acotar con un contenedor (`.recur-state button`).
- **`ego_type` usa `fill`**: no opera `<select>`. Para selects no hay vía; por eso el picker de
  categoría se hizo con botones.
- **`ego_viewport` emula CSS y el snapshot lo refleja, pero `ego_screenshot` rasteriza la ventana
  real.** Windows no permite bajar la ventana de ~916px de ancho, así que **no hay captura con layout
  móvil**: la verificación móvil es estructural (en 360×844 desaparece el sidebar y aparece la barra
  inferior).
- **No cierres la sesión, no cambies de perfil, no borres cookies.**

---

## 7. Lo que NO hay que hacer

- **No tocar Supabase sin presentar el SQL y recibir OK** (regla 1 del `AGENTS.md`).
- **No commitear en `main` ni en `produccion`.**
- **No hacer push ni cherry-pick** sin pedido explícito (regla 13).
- **Los sub-agentes no corren `tsc` ni builds**: eso lo corre el orquestador (regla 14).
- **No delegar ediciones con rutas relativas**: un subagente editó `Personal-3` cuando se le pidió
  `Personal` porque resolvió los surfaces contra su cwd. Usar rutas absolutas.
- **No dejar datos de prueba**: al terminar, `p_gastos_recurrentes` debe tener 0 filas.

---

## 8. Archivos tocados en `Personal-3`

**Nuevos**
- `src/lib/gastosRecurrentes.ts` — tipos, recorte de día 31, fechas por modo
- `src/hooks/useGastosRecurrentes.ts` — CRUD contra las RPC
- `src/components/gastos-recurrentes/RecurrenciaEditor.tsx`
- `src/components/gastos-recurrentes/GastoRecurrenteFormModal.tsx`
- `src/components/gastos-recurrentes/GastoRecurrenteCard.tsx`
- `src/components/CategoriaPicker/CategoriaPicker.tsx` + `.css`
- `src/pages/Configuracion/GastosRecurrentesPage.tsx` + `.css`
  (la página conserva el nombre de archivo; la ruta y el título son «Recurrentes»)

**Modificados**
- `src/App.tsx` — lazy import + `<FeatureRoute feature="menu_recurrentes">` en `/configuracion/recurrentes`
- `src/config/settingsMenu.ts` — campo `feature?: string` en `SettingsMenuItem` + entrada en `data_operations`
- `src/config/settingsIcons.ts` — icono `recurring_expenses: '🔁'`
- `src/components/configuracion/ConfiguracionHub.tsx` — gating por `feature` en `SettingsEntry`
- `src/components/saneamiento/CalendarioFinanciero.tsx` — 4 horizontes + heatmap por fecha
- `src/components/saneamiento/EditarCuarentenaModal.tsx` + `.css` — migrados al picker compartido
- `src/locales/{es,en,pt}.ts` — 88 claves nuevas por idioma

---

## 9. Próximo paso concreto

1. Probar **tema claro y oscuro** (§1.1) y arreglar los tokens que fallen.
2. Alta completa, pausa, reactivación y borrado por UI; verificar 0 filas al final.
3. Verificar la cuarentena con el picker nuevo.
4. Recién entonces, **opción A**: agregar `naturaleza` (`egreso`/`ingreso`) a `p_gastos_recurrentes`
   más `estructura_ingreso_id` y `billetera_destino_id`, y unificar el modal y las RPC. La pestaña de
   Ingresos ya existe con el badge «Próximamente» esperando ese cambio.

---

## 10. Conclusiones de las respuestas dadas (resumen)

Lo que se informó al dueño y sigue vigente:

**Sobre el borrado.** «Borrar» y «pausar» son acciones distintas y el usuario necesita las dos.
Borrar es irreversible, pide `ConfirmModal` con `type="danger"` y **avisa cuántas ocurrencias
pendientes se pierden**; no toca `p_caja` ni el saldo. Pausar conserva todo y se deshace con «▶».

**Sobre el motor.** No gestiona errores de negocio: crea la ocurrencia con lo que haya y el usuario
la corrige en la cuarentena. No avisa, no reintenta, no valida saldo. Un `monto_base` nulo **no**
puede abortar la generación de los demás.

**Sobre el día 31.** Se recorta al último día del mes, en el generador y en el calendario. Elegir 30 y
31 en febrero produce **una sola** ocurrencia el 28.

**Sobre el selector de categoría.** La cuarentena ya lo hacía bien y el resto usaba `<select>` planos.
Se extrajo un `CategoriaPicker` compartido. Regla que no se puede perder: **un padre con hijos es
encabezado, no se elige**.

**Sobre los ingresos recurrentes.** No estaban contemplados en ningún lado: ni en el código ni en el
PRD, ni siquiera como no-objetivo. Eso era una omisión, no una decisión. El dueño eligió **A**:
generalizar el objeto existente, con dos pestañas en la pantalla.

**Sobre la prueba.** La verificación por API es exhaustiva (24 aserciones SQL en verde). Lo que no se
pudo hacer es la captura con layout móvil, por el mínimo de ventana de Windows; el layout móvil se
verificó de forma estructural. **Ninguna prueba visual de punta a punta quedó completa todavía.**

**Riesgo abierto declarado.** Al migrar la cuarentena al picker compartido se modificó un flujo que
ya funcionaba. Compila y no quedaron clases huérfanas, pero **no se vio funcionar en el navegador**.
Es la primera verificación pendiente después del tema claro/oscuro.

**Sin commits, sin push.** Todo el trabajo está en el árbol de `Personal-3`.
