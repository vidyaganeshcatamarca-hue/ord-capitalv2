# Presupuestos: cierre, ciclos y bordes (etapa 4)

Última etapa del plan aprobado (v3.1). Depende de que la etapa 3 esté cerrada.

## Specs

S18. «Al cerrar el mes, ¿qué guardamos? B) solo el saldo de cierre de cada padre.»
S19. «Mover una subcategoría de padre, ¿cuándo rige? A) desde el mes siguiente.» «El ciclo actual sigue
cerrando bajo el padre original; el próximo ciclo aparece bajo el nuevo padre.»
S20. «Una corrección histórica puede generar el ajuste correspondiente en el ciclo activo, sin duplicar
dinero ni recalcular arrastres cerrados.»
S21. «El corte al cambiar de modo» debe ser correcto. (Del plan: apuntar al ciclo real, no al mes
calendario.)
S22. «Los gastos en otra moneda entran con su equivalente.»
S23. «El día de inicio del ciclo se respeta en todos los cálculos.»

## Piezas y qué necesitan

| Pieza | Qué es | Permiso |
| --- | --- | --- |
| Cierre del ciclo | Tabla de cierre por ciclo y padre, con el saldo y la lectura congelada. El arrastre se lee de ahí y deja de recalcularse. | Tabla nueva |
| Corrección histórica | Fila de ajuste en el ciclo activo, con motivo. No toca el cierre ni recalcula arrastres. | Tabla nueva (o la misma del cierre) |
| Pertenencia por ciclo | Tabla que dice a qué padre pertenecía cada subcategoría en cada ciclo. El reporte consulta ahí en vez de mirar el árbol actual. | Tabla nueva |
| Repetición mensual en libertad | Al abrir ciclo, copiar lo asignado a mano en el anterior. En base cero no aplica: lo hace el arrastre. | Solo código |
| Corte por modo | `fn_configurar_modo_presupuesto` apunta a `date_trunc('month', CURRENT_DATE)` en vez del ciclo real; deja vivos los topes; después del corte la lista de sugerencias está fija en vacío. | Solo código |
| Guardas del servidor | Transferir en libertad y escribir sobre un ciclo cerrado se rechazan. | Solo código |
| Moneda | `v_p_caja_reportable.valor_egreso` en lugar de `p_caja.valor_local` en el reporte, el validador y el arrastre. | Solo código |
| Día de inicio del ciclo | Cinco lugares calculan por mes calendario: `fn_calcular_arrastre_deuda`, `fn_aviso_categoria_en_rojo`, `fn_telemetry_refresh_user_metrics`, `fn_reporte_presupuestos_mensuales`, `fn_reporte_proyeccion_presupuestaria`. | Solo código |

## Orden propuesto

1. **Día de inicio y moneda.** Primero, porque son correcciones que no cambian contratos y dejan de
   mentir los números de todos los ciclos que no empiezan el día 1, y los gastos en otra moneda.
2. **Corte por modo y guardas.** Cierra los bordes que hoy permiten estados imposibles.
3. **Repetición mensual en libertad**, que es lo único que se agrega de cero para el usuario.
4. **Cierre, ajuste y pertenencia.** Al final, porque son las tres tablas nuevas y las que más superficie
   tocan: mientras no existan, el sistema sigue recalculando el arrastre en vivo, que es lo que hace hoy.

## Lo que hay que decidir antes de empezar

- Si la tabla de cierre y la de ajustes son una sola con un tipo, o dos. Recomiendo una sola con un
  campo de tipo: comparten las mismas columnas y así el reporte lee una sola fuente.
- Si el cierre se dispara solo al abrir el ciclo siguiente, o también con un botón. Recomiendo al abrir:
  menos piezas y no se puede olvidar.
- Qué pasa con los ciclos ya cerrados que nunca se cerraron con esta tabla. Recomiendo una carga inicial
  que los calcule una vez y los deje congelados.

## Tests que hay que escribir

- Un ciclo que no empieza el día 1: el gasto del 2 cae en el ciclo correcto y el del 1 en el anterior.
- Un gasto en dólares descuenta el equivalente, no el nominal.
- Cerrar un ciclo y corregir un gasto suyo: el ciclo cerrado no se mueve, el activo recibe un ajuste, y
  el ajuste aparece una sola vez.
- Mover una subcategoría: el ciclo en curso no cambia y el siguiente la muestra bajo el padre nuevo.
- Transferir en libertad y escribir en un ciclo cerrado: rechazados por el servidor.
