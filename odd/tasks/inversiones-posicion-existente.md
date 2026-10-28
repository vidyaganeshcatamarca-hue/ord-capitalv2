# Inversión preexistente — carga inicial sin billetera (B sola)

Rama `pi/inversiones-v1-puesta-punto`. Agregar al modal de nueva inversión el modo
"ya la tenía": carga una posición que el usuario ya tiene sin sacar dinero de
ninguna billetera, con valor actual y fecha de inicio.

## Specs

- **S1** — "el dinero no sale de una billetera real, sino que ya está ahí en su
  cartera de inversiones". La posición se crea con `billetera_origen_id = NULL`
  y **sin** fila en `p_caja`: no hay egreso, no aparece en History, no toca
  ningún saldo.
- **S2** — "B sola. Entiendo que con B resolvermos todo." Alcance de esta tanda:
  el modo dentro del modal existente. La pantalla de carga masiva (C) **no** se
  implementa.
- **S3** — "capital = valor actual". Un único campo de monto ("Valor actual")
  escribe las dos columnas: `monto_invertido_original` y `valor_mercado_actual`.
  La ganancia de la posición arranca en cero.
- **S4** — "obligatoria con opcion a elegir una fecha, pero por defecto hoy si el
  usuario no elige". El campo "Fecha de inicio" está siempre visible en el modo
  preexistente, viene precargado con hoy y no admite fechas futuras.
- **S5** — "billeteras no son inversiones. Lo que el user declara en billeteras,
  no son inversiones". No hay chequeo ni advertencia de doble contabilidad: solo
  una línea de texto que fija la frontera conceptual.
- **S6** *(derivada de S3)* — Si el valor es explícito, la posición **no
  devenga** por TNA: `valor_mercado_actual` nunca queda NULL en el modo
  preexistente. Por eso la TNA obligatoria en plazo fijo aplica **solo** cuando
  la inversión sale de una billetera (ahí sí hay que proyectar).
- **S7** *(derivada de S1)* — Una posición sin movimiento no puede borrarse con
  el camino actual (borrar el movimiento `investment_prefix:`). Necesita
  `fn_eliminar_inversion`, que solo borra filas sin movimientos asociados.
- **S8** — El camino existente ("sale de una billetera ahora") no cambia: misma
  validación de saldo, mismo egreso en `p_caja`, misma TNA obligatoria.

## Tasks

| T | Qué | Specs | Ruta | Commit |
|---|---|---|---|---|
| T1 | Migración 111: `fn_crear_inversion` con `p_fecha_inicio` + regla de TNA por camino + `fn_eliminar_inversion` con guarda | S1, S3, S4, S6, S7 | SQL | `2b72fc5` |
| T2 | Modal: modo "ya la tenía", campos condicionales, sin billetera | S1, S4, S5 | TSX + CSS | `13c6837` |
| T3 | i18n es/en/pt + ledger (2410 claves) | S4, S5 | locales | `13c6837` |
| T4 | Eliminar una posición sin movimientos (backend ya en T1) | S7 | TSX | `13c6837` |
| T5 | Tests de regresión y de la feature + allowlist `.gitignore` | todas | tests | `13c6837` |

## Log

- **L1** — Pedido original, textual: "En el módulo de inversiones tenemos que
  elaborar algo pare cido a lo que hicimos con tarjetas de poder agregar las
  inversiones que la persona ya tiene al momento de instalar la app, pero que no
  necesariamente son nuevas, o sea que el dinero no sale de una billetera real,
  sino que ya está ahí en su cartera de inversiones. Quiero que me hagas dos o
  tres propuestas de cómo podemos hacer eso. Una cosa que se me ocurre es que al
  momento de seleccionar la billetera, ahí podemos marcar la opción de que la
  invers ión ya está existente y que solo es cargable. Entonces seleccionamos
  como una opción de, en lugar de bill etera, en la misma lista desplegable de
  las billeteras, una opción que diga inversión en curso o inversión ya anterior.
  Entonces, de esa manera lo procesamos y no sacamos ese dinero de una cuenta
  específica. Eso es una opción que se me ocurre. La otra opción, escucho tus
  propuestas y vemos qué sería lo mejor. Planificamos eso y después que definamos,
  ahí recién implementas."
- **L2** — Decisiones del dueño, textuales: "1. capital = valor actual" /
  "2. obligatoria con opcion a elegir una fecha, pero por defecto hoy si el
  usuario no elige" / "3. billeteras no son inversiones. Lo que el user declara
  en billeteras, no son inversiones" / "4. B sola. Entiendo que con B resolvermos
  todo. Luego podemos construir C encima si vemos que hace falta, lo resolvemos
  cunaod B este funcionando".
- **L3** — Evidencia previa al diseño: `fn_crear_inversion` ya declara
  `p_billetera_origen_id bigint DEFAULT NULL` y el `INSERT` en `p_caja` está
  dentro de `IF p_billetera_origen_id IS NOT NULL`; `p_inversiones.billetera_origen_id`
  es nullable con FK `ON DELETE CASCADE`; `fecha_inicio` está fija en
  `CURRENT_DATE`; no existe `fn_eliminar_inversion`; el modal exige billetera con
  saldo suficiente (`billeterasElegibles`), lo que bloquea el alta cuando la
  plata está invertida.

- **L4** — Cierre. Migraciones **111** y **113** aplicadas en Supabase; el ensayo
  de la 111 corrió **9/9** casos dentro de una transacción revertida (sin filas de
  prueba): preexistente con fecha histórica, plazo fijo sin TNA aceptado, plazo
  fijo desde billetera sin TNA rechazado, fecha futura rechazada, alta desde
  billetera intacta, borrado permitido sin movimientos, borrado rechazado con
  movimientos (dos casos). Postcheck: un solo overload de `fn_crear_inversion`,
  `p_fecha_inicio` presente, `fn_eliminar_inversion` con guarda; las 6 filas de
  `p_inversiones` intactas. La 113 verificada contra la inversión 1
  (`billetera_origen_id = 2`) conservando el resto del contrato.
  Tests: `tests/inversiones/posicion-existente.test.js` **16/16**. Suite completa
  **730/733**; los 3 fallos son preexistentes y se reproducen con los cambios
  ocultos (`tests/icon-wrappers/test-runner-exit-status.test.js` sin
  `tests/config.js`, más dos de biometría/PIN). `tsc -b` limpio.
  Ledger: 2410 claves, `missing/stale/drifted/changed` en 0 (hubo que usar
  `build --force`: `npm run i18n:ledger` sin argumento solo hace `check`).
- **L5** — Verificación independiente (read-only, commit `13c6837`): confirmó S1,
  S4 (backend), S7 y S8; refutó un sub-punto de S3 y encontró tres huecos.
  - R1 (**medio**) — con fecha histórica, el nominal es 0 pero el **real** no:
    el capital de una posición preexistente es un valor *de hoy* y el reporte lo
    deflacta por la inflación de todo el período (`113:84-90`, `96:157-177`), así
    que una posición de 2021 muestra un real muy negativo y hunde el agregado de
    cartera. Con la fecha por defecto (días = 0) el efecto es nulo.
  - R2 (**media-baja**) — el `max` del input y el "hoy" del cliente son locales,
    pero el backend compara contra `CURRENT_DATE`: un usuario adelantado respecto
    de UTC después de las 22:00 manda como hoy el día que el servidor ve como
    mañana. **Corregido.**
  - R3 (**baja**) — el tipo de activo no se persiste (TNA = 0) y los reportes lo
    derivan `variable`: un plazo fijo preexistente se muestra como variable.
  - R4/R5 (**baja**) — el botón "Eliminar" aparecía en posiciones que ya tenían
    aportes, y con `== null` laxo aparecía en todas si el reporte 113 no estaba
    desplegado. **Corregido.**
  - R6 (**latente, preexistente**) — el CASCADE de la FK deja movimientos
    huérfanos si se borra una billetera en duro; no es alcanzable desde la app.
- **L6** — Correcciones de R2/R4/R5 en `8c86f1e`: un día de tolerancia en la
  validación de fecha más `LEAST(v_fecha_inicio, CURRENT_DATE)` para que los días
  de tenencia nunca sean negativos (la 111 se reaplicó: **10/10** casos, 6 filas
  intactas); y el botón de borrado ahora exige también `historial` vacío, que es
  la misma condición que cuenta `fn_eliminar_inversion`, con comparación estricta.
  Tests **16/16**, suite **730/733**, `tsc` limpio.
- **L7** — Prueba de punta a punta en pantalla (usuario 198, 412 px), ejecutada
  sobre datos reales y limpiada después: alta desde la UI en modo "ya la tenía"
  con 777.000 GBP → fila `inversion_id = 38` con `billetera_origen_id = null`,
  `monto_invertido_original = valor_mercado_actual = 777000`, `tasa_anual_tna = 0`,
  fecha de hoy y **0 filas en `p_caja`**; la tarjeta mostró "Capital original
  777,000.00 GBP / Valor actual 777,000.00 GBP / Ganancia 0.00". El detalle ofreció
  las cuatro acciones (incluida 🗑️ Eliminar) con 0 px de desborde; el borrado pidió
  confirmación y volvió al panel sin la tarjeta. Estado final: 6 filas, 0 de prueba,
  0 movimientos de prueba.
- **L8** — Decisiones del dueño sobre los hallazgos del verificador, textuales:
  R1 "queda como esta, no cambies nada"; R3 "si dejarlo sigue funcionando bien, lo
  demamos (c)".
- **L9** — Alcance real de R3 antes de aceptarlo: `tipo_activo` solo alimenta el
  badge y la clave de traducción en `InversionCard` y `DetalleInversionView`, el
  color y la etiqueta de la leyenda en `DistribucionDonut:43,51`, y el punto y el
  tipo en `DistribucionView:54-55,167`. Ningún cálculo, agregado ni prorrateo lo
  usa. Una posición preexistente de plazo fijo se ve como "Variable" y con la
  TNA en 0; los números son correctos. Aceptado como deuda cosmética.
