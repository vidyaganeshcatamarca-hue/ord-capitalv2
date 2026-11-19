# Hijos sin plata: la asignación vive solo en el rubro padre

Decisión del dueño (2026-11-13): los hijos nunca manejan dinero propio. Solo el padre
tiene asignación; los hijos tienen techo y gastan de la cuota del padre.

## Specs

S1. «los hijos nunca manejan plata, nunca tienen asignaciones y solo las asignaciones
las tiene el padre. Los hijos pueden gastar de la cuota del padre, pueden tener límites
en ese gasto, que son techos, pero siempre manejan la plata del padre y nunca manejan su
propia plata.»

S2. «si el padre tiene dinero y su hijo se lo ha gastado, en realidad el hijo no gasta su
propio dinero, siempre gasta el dinero del padre. El padre no puede estar en positivo si
el hijo tiene arrastre, eso está mal, de ahí la confusión.»

S3. «arrastre negativo es deuda, por lo tanto no se puede transferir a otro sobre.
arrastre positivo es dinero, se puede transferir.»

S4. «el arrastre del mes anterior se suma al asignado este mes. Es el dinero o deuda del
mes anterior, y modifica el actual y lo asignado ahora.»

S5. «No quiero resolver una categoría en particular, quiero que el sistema funcione bien
para todas las categorías y para todos los users.»

S6. Un padre con plata y un hijo con arrastre negativo es un ESTADO INVÁLIDO: el número
del padre tiene que reflejar la deuda del grupo, no quedarse en positivo.

## Consecuencias que se aceptan

- C1. La bolsa del grupo = asignado del padre + arrastre del padre + arrastres de los
  hijos; el disponible del grupo es eso menos el gasto del grupo.
- C2. Un hijo no transfiere: solo transfieren los padres y las categorías sin padre.
- C3. Health, Transporte y Alimentos-Hogar dejan de poder transferir mientras sus grupos
  estén en déficit. Ese cero es correcto, no una regresión.
- C4. La exclusividad de la plata entre padre e hijos desaparece como problema: el padre
  siempre tiene la plata, así que no hay nada que mover de un lado al otro.

## Tasks

| ID | S#     | Ruta                                                                 | Commit |
| -- | ------ | -------------------------------------------------------------------- | ------ |
| T1 | S1, S5 | Consolidar la plata de los hijos en su padre, en seco y por usuario   | — |
| T2 | S2, S6 | Reporte: la fila del padre es la bolsa del grupo; el hijo lee techo   | — |
| T3 | S3, S4 | `fn_disponible_transferible` y el validador usan la misma bolsa       | — |
| T4 | C2     | La lista de orígenes ofrece solo padres y categorías sueltas          | — |
| T5 | S5     | Verificar los escenarios en la app: Health, Transporte, Alimentos, Mascotas | — |
| T6 | —      | Tests, espejos de funciones y i18n si cambian etiquetas               | — |

## Log

L1. Dueño, 2026-11-13, texto original de la decisión: «¿Qué tal si los hijos nunca
manejan plata, nunca tienen asignaciones y solo las asignaciones las tiene el padre? Los
hijos pueden gastar de la cuota del padre, pueden tener límites en ese gasto, que son
techos, pero siempre manejan la plata del padre y nunca manejan su propia plata. Esto que
te acabo de decir, ¿simplifica las cuentas y nos da mayor luz sobre lo que está pasando?
Si es así, implementemos esto y verifiquemos todos los escenarios.»

L2. Antes de esta decisión se midió el estado real de noviembre del user 1: Health
(padre) asignado 0 con arrastre propio +2.000 y −27.182 en hijos; Transporte (padre)
344.500 con Combustible en −780.500; Alimentos-Hogar 106.246 con 243.990 gastados;
Mascotas (hija) 0 asignado con +95.000 de arrastre. El número que la lista de orígenes
ofrecía salía de `fn_disponible_transferible`, calculado sobre la fila propia del padre,
mientras el reporte mostraba en el padre la suma de sus hijos: dos conceptos con el
mismo nombre.

L3. Ya aplicado y en verde en la rama: el arrastre entra en el asignado de la fila de los
hijos (commit faad088), con el reporte como fuente única. Falta la rama de los padres.

L4. Medición en seco de T1 (temp_sql/202_t1_seco.sql, mes actual y anterior): en el ciclo
vigente del user 1 hay **un solo hijo con plata**: Celular (405), 50.000, sin techo. Los
padres con plata son Alimentos-Hogar 106.246, Ocio y Placer 60.000 y Transporte 344.500.
En todos los users, contando el mes actual y el anterior: user 1 con 6 filas y 645.060,
user 136 con 1 y 300.000, user 198 con 4 y 105.500 (el grupo 4265 que ya habíamos visto),
y user 210 con 4 y 594.160. O sea: la migración es chica y abarcable usuario por usuario,
no un barrido masivo.

L5. T1 APLICADA con el RPC `fn_asignar_presupuesto(..., 'consolidacion_hijos_sin_plata',
true)`, nunca con UPDATE directo (temp_sql/203_t1_aplicar.sql). Nueve consolidaciones:
user 1 octubre → padre 2 de 0 a 518.155, padre 19 de 0 a 75.000, padre 20 de 2.000 a 3.905;
user 1 noviembre → padre 23 de 0 a 50.000 (el Celular). User 136 → padre 3252 a 300.000.
User 198 → padre 4265 a 105.500. User 210 → padres 6285 a 518.155, 6288 a 75.000, 6289 a
1.005. Verificado después (temp_sql/204): **cero hijos con plata** en el mes actual y el
anterior en todos los users, y 9 filas de historial con ese motivo. Reversible: cada
movimiento dejó su fila en `p_presupuestos_historial`.

L6. Mapa de impacto (T7), inventario read-only verificado contra el working tree. Escala:
20 funciones SQL, ~20 puntos en la UI, 10 archivos de test y ~20 claves de i18n.

**SQL crítico**: `fn_asignar_presupuesto` (todo el bloque de exclusividad queda sin objeto y
hoy permite escribir plata en un hijo), `fn_disponible_transferible` (no conoce la bolsa del
padre ni el gasto de los hermanos), `fn_disponibles_transferibles` (devuelve disponible para
TODA estructura, hijos incluidos), `fn_transferir_entre_sobres` (valida contra el helper y
escribe `monto_limite` en origen y destino), `fn_reporte_sobres_detalle` (fila hijo 137-149,
fila padre 184-205, `cuenta_en_totales` 155-162), `fn_obtener_saldo_a_asignar` (44, depende
de `cuenta_en_totales`), `fn_configurar_modo_presupuesto` (43,53: pone `monto_limite = 0` en
TODAS las filas al cambiar de modo).

**SQL que daría falsos positivos con hijos en 0**: `fn_aviso_categoria_en_rojo` (38-57),
`fn_calcular_arrastre_deuda` (20-35), `fn_reporte_termometro_presupuestos` (93),
`fn_obtener_saldo_disponible_para_asignar` (31), `fn_reporte_proyeccion_presupuestaria` (23).

**SQL de estructura/migración**: `fn_crear_subcuenta_egreso` (68-76),
`fn_migrar_y_eliminar_estructura_egreso` (56), `fn_clonar_usuario_admin` (549),
`fn_telemetry_refresh_user_metrics` (79).

**UI**: `PresupuestosPage.tsx` — contrato `SobreDetalle` (58-70), `disponibleDeSobre`
(174-181: en anticipado un hijo da 0 − gasto, déficit falso), `disponibleParaTransferir`
(696-698, incluye hijos como origen), `fondoLibreDe` (682-690), `sobresExcedidos` (859),
`totalAsignado` (1808), `libreDe`/`pozoPadre` (1855-1918), `referenciaBarra` (1969-1980),
etiquetas por fila (2117-2119 Asignado, 2124-2128 Techo), cabeceras de los sheets (1218,
1297) y el gate 1309. `src/lib/barraSobre.ts` (52-63, 83-88) y `src/lib/exclusividadPlata.ts`
(módulo entero que queda muerto).

**Tests que rompen**: `presupuesto-padres.test.js` (el núcleo), `exclusividad-plata.test.js`,
`escape-y-criterio-disponible.test.js`, `modal-disponible-del-servidor.test.js`,
`barra-hijo-sin-asignacion.test.js`, `total-grupo-libertad.test.js`,
`techo-y-plata-separados.test.js`, `budget-detalle-asignacion.test.js`,
`saldo-a-asignar-deficit.test.js`, `cambio-modo-ciclo.test.js`,
`base-cero-sin-arrastre.test.js`, `presupuestos-ui.test.js`, `patas-de-transferencia.test.js`.

**i18n**: `budget_stat_assigned`/`budget_stat_ceiling` (el par cambia de significado en
hijos), `budget_stat_group_free`, `budget_group_total`, los `budget_move_*`, los
`error_budget_child_over_parent`/`error_budget_parent_below_children` (hablan de «repartido
en hijos»), `budget_carryover_warning` y `budget_label_transfer_*`.

L7. Orden para no romper la app a mitad de camino: **slice 1** reporte + helper + validador
(una sola bolsa); **slice 2** pantallas y etiquetas; **slice 3** las funciones que hoy
asumen hijo con plata (aviso en rojo, arrastre deuda, termómetro, crear subcuenta, migrar
estructura, clonar usuario).
