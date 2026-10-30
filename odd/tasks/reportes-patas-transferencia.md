# Reportes: dejar de contar las patas de transferencia entre monedas

El dueño vio Farmacia $1.336.746 en el donut de Inicio y $1.170.110 en Presupuestos para
el mismo mes. El primero es correcto: la diferencia son 3 compras cargadas en USD que el
donut convierte a pesos y el presupuesto suma a valor nominal. Investigando el origen
apareció un problema mayor: comprar o vender dólares se guarda como dos filas
(`expense` en pesos + `income` en dólares) y trece reportes las cuentan como gasto e
ingreso reales.

## Specs

- **S1** Un movimiento con `metadata.transfer_double_insert = true` no cuenta como gasto
  ni como ingreso en ningún reporte. Septiembre de 2026, usuario 1, en pesos: gasto
  `6.262.323,79` (hoy `6.992.641,32`) e ingreso `9.323.175,32` (hoy `10.046.505,93`).
- **S2** La regla vive en un solo lugar: la vista `v_p_caja_reportable`. Toda función de
  reporte que mida gasto o ingreso lee de ahí, no de `p_caja`.
- **S3** Ningún reporte cambia de resultado cuando el usuario no hizo conversiones de
  divisa. Verificación: para un usuario sin patas de transferencia, salida idéntica
  antes y después.
- **S4** El feed de movimientos no cambia: `fn_reporte_movimientos_recientes` sigue
  mostrando las dos patas rotuladas como transferencia (ya lee el marcador) y no se toca.
- **S5** La fila `p_caja_id 4416` queda con `moneda='USD'`, `es_usd=true`,
  `valor_local=98531.98`, `moneda_local='ARS'` y `tasa_snapshot=1515.8766`. El saldo de la
  billetera 400 no se mueve.
- **S6** Los saldos de las billeteras no cambian con este trabajo: el cambio es de
  lectura, no de plata.

## Tasks

| ID | Spec | Ruta | Commit |
| --- | --- | --- | --- |
| T1 | S2 | Crear `v_p_caja_reportable` (`temp_sql/136_vista_reportable.sql`) | desplegado |
| T2 | S1, S2 | Repuntar las 14 funciones a la vista (15 definiciones, 41 referencias) | desplegado |
| T3 | S1, S3 | Medir cada RPC antes/después con el usuario 1 (`temp_sql/137_trial_136.mjs`) | hecho |
| T4 | S5, S6 | Corregir la fila 4416 manteniendo la tasa del 29/09 (`temp_sql/139_fila_4416.mjs`) | desplegado |
| T5 | S1-S6 | Test en `tests/` y commit | pendiente |
| T6 | S1 | Triar las definiciones que suman `valor_egreso` sin leer la vista | hecho |
| T7 | S1, S2 | Repuntar las 10 del grupo A (`temp_sql/140_reportes_restantes.sql`) | desplegado |

## Log

**L1** (pedido original)

> 1. C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-f684545b-3a35-45a9-b0c2-833aca349df6.png
> revisa que esta mal

**L2**

> explicame como es posible que haya gastos sin detalle, sin categoria de salida, algo esta mal ahi. veamos eso primero.

**L3**

> antes de tocar las funciones, explicame porque no estan marcadas como transferencias y listo?

**L4** (decisiones del dueño)

> Vista única, y los reportes leen de ahí
>
> Mantener la tasa histórica

**E1** No existe ningún gasto sin rubro que no sea una pata de transferencia: 9 filas en
toda la base, `1.635.080,51`, todas con `transfer_double_insert = true`, entre el
28/09/2026 y el 05/10/2026. El alta de gastos no permite guardar sin categoría.

**E2** La transferencia entre monedas no puede ser una sola fila:
`fn_actualizar_saldo_billetera_integral` lanza `error_transfer_different_currencies` si
`tipo='transfer'` cruza monedas, y `fn_p_caja_snapshot_moneda` no calcula `valor_local`
para `tipo='transfer'`. Por eso el escritor hace doble insert con marcador en metadata.

**E3** Septiembre 2026, usuario 1, en pesos: gasto `6.992.641,32` con las patas y
`6.262.323,79` sin ellas (diferencia `730.317,53`); ingreso `10.046.505,93` contra
`9.323.175,32` (diferencia `723.330,61`). El donut de Inicio muestra el número correcto
por casualidad: hace `INNER JOIN` con los rubros y las patas no tienen rubro.

**E4** El trigger de snapshot recalcula `valor_local` con la tasa del día cuando cambia
`moneda`. Corregir la fila 4416 en un solo paso habría reescrito el valor del 29/09, por
eso S5 se cumple en dos sentencias.

**E5** Incidencia de método, sin daño: `137_trial_136.mjs` abrió `BEGIN` y `ROLLBACK` en
requests distintos, y la API de Management corre cada request en su propia sesión. El
rollback fue un no-op y la migración quedó aplicada. Se verificó el estado y es el
buscado: vista con `security_invoker=true`, dueña `postgres`; 14 nombres (15 definiciones)
leen de la vista; saldos totales sin cambios (`2.594.782,00`). Para las próximas pruebas
hay que usar un bloque `DO` que revierta solo, como en `135_deploy_134.mjs`.

**E6** Medición antes/después, usuario 1: `variacion_intermensual` mes anterior
`5.633.797` → `4.933.777` y mes actual `2.778.000` → `2.327.700`; `timeline_proyeccion`
capacidad `1.070.209` → `1.180.553`; `termometro_tarjeta` capacidad de pago
`2.128.675,67` → `2.239.020,50`; `simulador_escenarios` ingreso promedio `5.357.983,67` →
`5.195.233,33`; `termometro_presupuestos('2026-09-30')` límite de `needs` `4.525.616` →
`4.510.100`. Sin cambio, porque ya las excluían por `INNER JOIN` o por ventana temporal:
`safe_to_spend`, `resumen_cuadrantes`, `reto_hormigas`, `reto_buzon_deseos`,
`sobres_detalle`, `sugerir_distribucion_activacion`, `termometro_presupuestos(NULL)`.
Controles sin tocar e idénticos: `top_categorias_mes` y `movimientos_recientes`.

**E7** Fila 4416 corregida: `moneda='USD'`, `es_usd=true` (igual que sus hermanas 4448 y
4464), `valor_local=98531.98`, `moneda_local='ARS'`, `tasa_snapshot=1515.8766`. Saldo total
de billeteras `2.594.782,00` y billetera 400 en `273` antes y después.

**E8** Triaje: 34 definiciones usan `valor_egreso` y no leían la vista. 15 candidatas se
revisaron línea por línea. Diez suman gasto o ingreso sin unir el rubro, filtrar proyecto
ni cuenta, así que veían las patas: `fn_obtener_saldo_disponible_para_asignar`,
`fn_obtener_techo_presupuestario`, `fn_reporte_escudo_tiempo` (dos overloads),
`fn_reporte_evolucion_presupuesto`, `fn_reporte_limite_seguro_deuda`,
`fn_reporte_proyeccion_presupuestaria`, `fn_reporte_gasto_por_integrante`,
`fn_reporte_punto_equilibrio` y `fn_reporte_top_fuentes_ingreso`. Las otras cinco ya las
excluían por construcción: `calcular_pe_personal_json` une `p_cuentas_egresos`,
`fn_generar_recurrentes_hoy` filtra una estructura concreta, y `fn_reporte_proyecto_detalle`,
`fn_reporte_proyectos_compartidos` y `fn_reporte_proyectos_hogar` filtran por `proyecto_id`.
Los `e_fn_get_*` y `calcular_pe_*` quedaron fuera de alcance: leen la tabla histórica
`caja` con `cuentas_egresos`, no `p_caja`.

**E9** Medición del 140, usuario 1: `techo_presupuestario` `5.357.983,67` → `5.195.233,33`;
`limite_seguro_deuda` y `proyeccion_presupuestaria` igual delta; `gasto_por_integrante`
`2.778.000` → `2.327.700`; `punto_equilibrio` meta de ahorro `803.697,55` → `779.285,00` y
margen de maniobra `−603.706,48` → `−742.044,26`; `escudo_tiempo` burn rate `104.224,34` →
`94.557,79`; `top_fuentes_ingreso` total `4.722.719` → `4.265.500`. Total de funciones que
leen la vista: 25. Saldo de billeteras sin cambios (`2.594.782,00`).

**E10** Tres RPC ya estaban rotas antes de esta tanda y siguen fallando igual:
`fn_obtener_saldo_disponible_para_asignar(date)` con `column "hogar_id" does not exist`,
`fn_reporte_escudo_tiempo(uuid)` con `operator does not exist: bigint = uuid` y
`fn_reporte_evolucion_presupuesto()` con `BY value of FOR loop must be greater than zero`.
No se tocaron: son otro defecto y necesitan decisión del dueño.
