# Sobres — corrección de la auditoría móvil (2026-11-13)

Frente: módulo Ahorro/Sobres. Origen: auditoría visual y funcional en móvil 390×844 con el user 1
(40 capturas en `C:/Users/Vidya Ganesh/ego/sobres-audit-20261113/`). 17 hallazgos.

Regla de entrega: **sin commit** hasta que el dueño lo pida. Los cambios quedan en el working tree.

## Specs

- **S1** El arrastre de tarjetas debe persistir el orden. Hoy reordena en pantalla y no guarda.
  El cierre del arrastre no puede depender del target del `pointerup`: llega `lostpointercapture`
  antes y el `pointerup` final tiene target `null`.
- **S2** El botón "Orden automático" debe poder alcanzarse. Hoy solo se renderiza si
  `hayOrdenManual`, bandera que escribe el arrastre roto. Con S1 resuelto queda alcanzable; hay que
  verificarlo.
- **S3** Los tres montos de métricas del detalle (`CURRENT BALANCE`, `GOAL`, `MISSING`) deben
  leerse completos en 390 px. Hoy las cajas miden 94 px y el texto necesita 122-127 px.
- **S4** El label `CURRENT BALANCE` no debe partirse en dos líneas desalineando los tres montos.
- **S5** Los botones `Contribute` y `Withdraw` del detalle deben quedar dentro del viewport con el
  sobre completo (plan + historial). Hoy terminan en `bottom: 859` con viewport 844 y `scrollMax: 0`.
- **S6** El nombre de billetera por defecto (`wallet_cash_default_name`) debe resolverse igual que
  en el Home ("Cash") en detalle, historial y modales de rescate y rendimiento. Nunca la clave cruda.
- **S7** La copy de la modalidad no puede prometer que el dinero sigue en la cuenta si el saldo se
  descuenta igual en ambas modalidades. Debe decir la diferencia real.
- **S8** El subtítulo del alta no puede afirmar que meta y fecha son independientes: sin meta el
  campo de fecha se deshabilita.
- **S9** El conteo de cada bloque `SAVED` debe ser el de esa moneda, no el total.
- **S10** El formato de moneda debe ser el mismo en el resumen y en la meta de la tarjeta.
- **S11** El botón "Correct" debe existir donde el backend lo soporte; donde no, no debe insinuarse.
- **S12** No debe haber dos encabezados `Archived envelopes` en la lista.
- **S13** El badge de estado del sobre (`PROJECT` / `PLAN STARTED`) debe verse igual en tarjeta y
  detalle.
- **S14** Los tres botones del modal de rescate no pueden compartir el mismo nombre accesible.
- **S15** `apariencia_idioma` debe decir lo mismo en los tres diccionarios.
- **S16** El campo `icono` del sobre debe renderizarse o dejar de existir en la tabla. Se renderiza.
- **S17** `RETURN CREDITED` no debe parecer un estado; es el importe a ingresar.
- **S18** El eyebrow `ENVELOPES` necesita aire respecto del borde superior.

## Fuera de alcance (requieren autorización de Supabase, regla 1)

- Corregir un movimiento de tipo `rendimiento` (hoy la fila Return no tiene botón).
- Cambiar `genera_rendimiento` al corregir un aporte.
- Borrar un sobre (hoy solo se archiva, y es irreversible).
Presentar propuesta y esperar OK. No se tocan RPC en esta ronda.

## Tasks

- T1 — S1, S2: cerrar el arrastre con `pointerup`/`pointercancel`/`lostpointercapture` en document. Sin commit.
- T2 — S3, S4: CSS de las métricas del detalle. Sin commit.
- T3 — S5: pie de acciones del detalle dentro del viewport. Sin commit.
- T4 — S6: helper de nombre de billetera en los cuatro puntos. Sin commit.
- T5 — S7: copy de modalidades en es/en/pt. Sin commit.
- T6 — S8: subtítulo del alta y ubicación del hint. Sin commit.
- T7 — S9, S10: conteo por moneda y formato unificado. Sin commit.
- T8 — S11: botón Correct según lo que soporte el backend. Sin commit.
- T9 — S12, S13: encabezado duplicado y badge unificado. Sin commit.
- T10 — S14, S17: nombres accesibles del rescate y label del rendimiento. Sin commit.
- T11 — S15: alinear el diccionario inglés. Sin commit.
- T12 — S16: renderizar el icono del sobre. Sin commit.
- T13 — S18: padding del eyebrow. Sin commit.
- T14 — Verificación en móvil 390×844 de todo lo corregido, más regresión de lo que ya funcionaba. Sin commit.

## Log

**L1** (pedido, literal): "1. Ataca cada uno de los fallos que encontraste y resuélvelos, luego vuelve a verificar."

## Resultado

| Spec | Estado | Evidencia |
|---|---|---|
| S1 | Corregido | `fn_sobres_reordenar` con `[92,91,93]`; base con `orden_manual = true` |
| S2 | Corregido | El botón "Automatic order" se renderiza; el hint desaparece |
| S3 | Corregido | Cajas de 94 → 190 px; `scrollWidth == clientWidth` |
| S4 | Corregido | Labels en una sola línea |
| S5 | Falso positivo | `main.page` scrollea: 1002 vs 844, botones alcanzables |
| S6 | Corregido | Detalle, historial y modal de corrección dicen "Cash" |
| S7 | Corregido | Copy nueva en es/en/pt: explica que deja de estar disponible |
| S8 | Corregido | "La meta es opcional. La fecha necesita una meta." |
| S9 | Corregido | ARS plural (3), USD singular (1) |
| S10 | NO corregido | Unificar el formato de moneda toca `formatCurrency`, que usa toda la app: es decisión de producto |
| S11 | Corregido | `fn_sobre_rendimiento_editar` ya existía; el botón estaba oculto por código |
| S12 | NO corregido | El botón del header y el encabezado de la sección de archivados conviven; no lo toqué |
| S13 | Corregido | Tarjeta y detalle comparten `claseEstado` |
| S14 | Corregido | `sobres_rescue_all` con `aria-label` propio |
| S15 | Corregido | en.ts: "Language" |
| S16 | Parcial | Detalle sí; lista necesita `icono` en `fn_sobres_listar` (autorización) |
| S17 | Corregido | "Return amount" / "Importe del rendimiento" |
| S18 | Corregido | `padding-top: 16px` medido |

## Pendiente de autorización (regla 1)

`fn_sobres_listar` no devuelve `icono`. Para que la tarjeta muestre el emoji hay que
agregar la columna a su `RETURNS TABLE`. No se tocó.

## Lecciones del tramo

- `tsc` en este repo tarda ~95 s: hay que correrlo en background, no con timeout corto.
- Un `tsc` con `| tail` devuelve el exit code del `tail`, no el de `tsc`: mirar el texto.
- Al envolver JSX condicional con dos hermanos hace falta `<>...</>` (TS2657).
- `page.click` sobre una tarjeta tapada por el FAB falla con "un svg intercepta": no es un bug del componente.

## Segunda ronda (pedido del dueño)

**L1 (literal):** "1. modifica la rpc para que traiga el icono / 2. el formato de la moneda lo determina la configuracion regional / 3. quita la redundancia, y ademas, no le des tanto protagonismo a ver lo archivado, tiene que estar al final del scroll, no como primear opcion."

- **S16 cerrado.** `fn_sobres_listar` devuelve `icono text`. Cambiar el `RETURNS TABLE` exigió
  `DROP FUNCTION` + `CREATE`, así que se re-aplicaron los 4 `GRANT` (PUBLIC, anon, authenticated,
  service_role). Verificado en la base: `tiene_icono = 1` y ACL idéntica. Espejo regenerado.
  **Faltaba además el mapper**: `normalizarSobre` no copiaba `icono`; ahora la tarjeta lo muestra.
- **S10 cerrado por la vía correcta.** No era el formato: `SobresPage` era el único del módulo sin
  `useFormatRevision`, así que el resumen se quedaba con el formato del primer render. Medido:
  resumen USD `$0,0` contra tarjeta `$0,0` / `of $1.000,5`.
- **S12 cerrado.** El botón de archivados salió del header (ya no es la primera opción) y el único
  acceso quedó después de la lista: fin de lista 734, enlace 750.
- **Traducciones de Personal-2.** Llegaron 4 textos en `es.ts` y **solo en español**. Se trajeron 3 y
  se tradujeron a `en.ts` y `pt.ts`. `sobres_target_hint` se descartó a propósito: en Personal-2 dice
  "la fecha son opcionales e independientes", que es justo la contradicción corregida en S8.
  El `es.ts` de Personal-2 quedó intacto.

**Lecciones nuevas:**
- `pg_get_functiondef` NO incluye el `;` final: hay que agregarlo o el `GRANT` siguiente rompe el parseo.
- Escribir SQL generado con `newline='\n'`; con CRLF los `replace` de verificación no matchean.
- Cambiar un `RETURNS TABLE` obliga a `DROP` + `CREATE`, y el `DROP` se lleva los permisos.

## Tercera ronda: selector de icono

**L2 (literal):** "Comenzamos con grilla, scrollable, para que no sea demasiado grande la ventana.
Mostramos cuatro filas e incluye todos los iconos, emojis, que tengan que ver con proyectos, con
sueños, con anhelos y deseos. Por ejemplo, vacaciones, casas, bienes, compras, juguetes, viajes y
afines. Podemos tener un cento de cincuenta emojis para elegir, máximo."

- `src/components/sobres/iconosSobre.ts`: **150 emojis**, sin duplicados, agrupados por tema
  (viajes, casa y bienes, compras y tecnología, juguetes, estudio, salud, familia, festejos,
  dinero, naturaleza, comida, oficios). Tope respetado: 163 → recortados 13.
- `SobreFormModal`: estado `icono`, reset al abrir, `p_icono` en `fn_sobre_crear` **y**
  `fn_sobre_editar` (antes el front no lo mandaba nunca). Grilla entre moneda y meta.
- CSS: `height: calc(4 * 36px + 3 * 6px + 10px)` con `box-sizing: border-box`. Con `max-height`
  el navegador dejaba entrar una quinta fila; con alto fijo entran exactamente 4.
- i18n `sobres_icon` en es/en/pt.

**Verificado:** 150 botones, 7 columnas, scrollHeight 926 contra 172 visibles. Sobre "Moto nueva"
con 🏍️: en la base `f09f8f8d ef b88f` (U+1F3CD + U+FE0F), y la tarjeta lo muestra en vez del 💰.

**Lección:** un emoji con selector de variación ocupa 2 caracteres en Postgres (`length = 2`); para
verificarlo hay que comparar el hex, no el texto, porque la consola de Windows lo rompe.
