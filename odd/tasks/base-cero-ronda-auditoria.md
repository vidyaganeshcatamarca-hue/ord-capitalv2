# Ronda de auditoría: parser de montos, guarda de base cero y accesibilidad

El agente auditor del dueño dejó `docs/varias/BUG-EXPLORER-PRESUPUESTO-BASE-CERO-2026-10-29.md`
con nueve hallazgos sobre Presupuesto. Se verificaron los nueve contra el código y contra la base.
La auditoría corrió con `user_id = 198`, la cuenta de testing del dueño (región GB, moneda GBP),
no con su cuenta real (`user_id = 1`, AR/ARS). Los hallazgos de código valen igual.

## Specs

- **S1** (F-01) Escribir `1500.50` en un campo de monto guarda `1500.50`, no `150.050`. Aplica a
  asignar monto manual y a transferir entre sobres. Un solo parser compartido, sin repetir la
  regla en cada pantalla.
- **S2** (F-01) El parser acepta las formas que el usuario puede tipear: `1500.50`, `1500,50`,
  `1.500,50`, `1,500.50`, `1.500.000`, con espacios y sin ellos.
- **S3** (F-02) En base cero, una asignación nunca puede superar el disponible, **tampoco cuando
  el sobre no tiene fila previa en el ciclo**. El dueño: "arreglalo".
- **S4** (F-02) La cuenta de testing 198 queda operativa: sin saldo a asignar negativo y con sus
  asignaciones dentro de lo que su liquidez permite. El dueño: "puedes modificar valores en la
  tabla para 198, es de testing pero debe quedar operativo".
- **S5** (F-03) No aplica como bug: en base cero el gasto se mide desde la activación (tanda B2).
  El dueño: "es mi decicion, no aplica como bug".
- **S6** (F-04) Activar base cero avisa que las asignaciones del ciclo se reinician y se archivan,
  igual que ya avisa la vuelta a libertad. El aviso está en los tres idiomas.
- **S7** (F-05) Las opciones de la hoja de asignación se alcanzan con teclado y son botones
  reales; la fila del sobre no anida un botón dentro de otro.
- **S8** (F-06) Todos los modales de Presupuesto cierran con Escape, además de la X y el fondo.
- **S9** (F-08) Un solo criterio de "disponible" en los tres lugares que lo usan: lista de
  orígenes de transferencia, «Llenar Hueco» y la fila del sobre.

## Tasks

| ID | Spec | Ruta | Commit |
| --- | --- | --- | --- |
| T1 | S1, S2 | Parser compartido + sus tests, aplicado en asignar y transferir | pendiente |
| T2 | S3, S4 | `COALESCE` del previo en `fn_asignar_presupuesto` y saneo del 198 | pendiente |
| T3 | S6 | Aviso de reset al activar base cero | pendiente |
| T4 | S7 | Teclado y semántica en la hoja de asignación y en la fila | pendiente |
| T5 | S8 | Escape en los modales | pendiente |
| T6 | S9 | Un criterio de disponible | pendiente |

## Log

**L1** (pedido del dueño, verbatim)

> 1. el test fue hecho sobre el user 198, tambien es mio, es de testing.
> f-01. ok - yContigo no nos ocupamos de los errores de AllCapital, cont igo nos ocupamos de dejar Valdexplorer en condiciones. Revisa tambien si esta presente en otras funcionalidades y pantallas
> f-02. arreglalo (y fijate si se puede arreglar que quedo negativo el monto para asignar), puedes modificar valores en la tabla para 198, es de testing pero debe quedar operativo
> f-03 es mi decicion, no aplica como bug.
> f-04 - ok.
> f-05 arreglalo
> f-06 arreglalo
> f-07 no entiendo tu explicacion, no me diste ejemplo (debes ser mas explicativo para que decidamos juntos)
> f-08 arreglalo

**E1** (barrido de F-01) El patrón destructivo `parseFloat(x.replace(/\./g,''))` existe solo en
`PresupuestosPage.tsx:445` (monto manual) y `:499` (transferir). La línea `:738` de la activación
parsea bien: `parseFloat(valor)` sobre el value crudo de un `input[type=number]`. El mismo campo
se parsea bien en `:1157` para habilitar el botón y mal en `:445` para confirmar.

**E2** (F-02, causa raíz probada) `fn_asignar_presupuesto` valida con
`IF p_monto_asignado > (v_saldo_disponible + v_monto_previo)`. Cuando el sobre no tiene fila en el
ciclo, el `SELECT ... INTO v_monto_previo` no asigna nada —el `COALESCE` no se evalúa sin fila—,
`v_monto_previo` queda NULL y la comparación da NULL, que no dispara el `IF`. Prueba en la cuenta
198 con saldo `−998.089,09`: sobre 4267 (previo 999.899) rechaza el límite 999.949; sobre 2362
(previo NULL) lo acepta.

**E3** (F-02 arreglado y verificado) `temp_sql/143_guard_base_cero.sql` agrega
`v_monto_previo := COALESCE(v_monto_previo, 0);` después del `SELECT INTO`. Desplegado con
`144_deploy_143.mjs`, que lee el `RAISE` del bloque `DO` como resultado en lugar de reventar.
Medición antes y después sobre la cuenta 198, saldo `−998.089,09`: el sobre 2362 sin fila previa
pasaba `999.949` (**ACEPTADO**) y ahora lo **RECHAZA**; el sobre 4267 con fila previa rechaza en
los dos casos; un monto de `50` con saldo negativo también se rechaza.

**E4** (S4) `temp_sql/145_saneo_198.mjs`: la cuenta de testing 198 tenía 6 sobres por
`1.000.199,00` contra `2.109,91` de liquidez. Quedaron los 6 en `0,00` y el saldo a asignar pasó a
`+2.109,91`. `p_presupuestos` no tiene triggers, así que el `UPDATE` no dispara nada más.
