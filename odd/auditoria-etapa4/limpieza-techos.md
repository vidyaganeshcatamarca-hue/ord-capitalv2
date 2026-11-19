# Limpieza de topes: qué se borró, a quién alcanzó y qué se puede recuperar

Registro obligatorio del Bloque A. Documenta una escritura ya ejecutada, sin restaurar nada: por
decisión del dueño, no se reponen valores supuestos sin autorización.

## Qué se ejecutó

`temp_sql/958_reset_techos.sql`, el 18 de noviembre de 2026:

```sql
UPDATE public.p_presupuestos SET monto_techo = NULL WHERE monto_techo IS NOT NULL;
```

Se eligió `NULL` y no `0` a propósito: `0` significa «en esta categoría no podés gastar» y `NULL`
significa «sin tope». Poner cero habría dejado todas las subcategorías bloqueadas.

El dueño autorizó la limpieza con estas palabras: «resetea topes a 0», en el mismo intercambio en que
se acordó que los topes cargados con la moneda vieja ya no significaban nada.

## A quién alcanzó

La sentencia no tenía filtro de cuenta, así que se aplicó a **todas** las filas de `p_presupuestos` que
tuvieran un tope. Cuántas eran **no se registró antes de ejecutarla**, y ese es el error de proceso: se
escribió sin medir el alcance.

Lo que se puede afirmar hoy, medido después:

| Dato | Valor |
| --- | --- |
| Filas de presupuesto en total | 99 |
| Cuentas con filas de presupuesto | 8: usuarios 1 (39 filas), 20 (4), 30 (4), 84 (11), 136 (2), 145 (1), 198 (12) y 210 (26) |
| Filas con dinero asignado hoy (`monto_limite <> 0`) | 64 |
| Filas con tope hoy | **0** |

## De dónde venían esos topes

Hay tres orígenes, y solo dos son reconstruibles:

1. **Relleno masivo** — `temp_sql/175_techo_y_plata.sql:26-27`:
   `SET monto_techo = NULLIF(GREATEST(monto_limite, 0), 0) WHERE monto_techo IS NULL;`
   Sin filtro de cuenta. Le dio un tope igual al dinero asignado a toda fila con dinero.
   **Reconstruible:** basta volver a correr la misma expresión.

2. **Topes de los rubros padre al 120%** — `temp_sql/180_techos_padres.sql:23` y
   `temp_sql/181_techos_restantes.sql:21`:
   `SET monto_techo = round(p.monto_limite * 1.2)`, las dos con `WHERE p.user_id = 1`.
   **Reconstruible** para la cuenta 1, mientras el dinero asignado de octubre y noviembre no cambie.

3. **Topes escritos a mano en subcategorías.** No salen de ninguna fórmula: la subcategoría no tiene
   dinero propio, así que cualquier tope suyo fue decidido por el usuario.
   **No reconstruible.** Son exactamente los que importaban.

## Qué valores se conocen y cuáles no

Del recorrido en pantalla del 18/11, antes de la limpieza, quedaron dos valores medidos en la cuenta 1:

| Categoría | Tope que mostraba |
| --- | --- |
| Groceries / Pantry | ARS 85.506 |
| Limpieza Hogar | 490 |

Estos dos están documentados porque se leyeron de la pantalla y quedaron en la evidencia del recorrido.
**No se reponen**: se listan como lo que eran.

Un registro de la sesión, previo a la limpieza, anotó para la cuenta 1: «92 filas sembradas, 76 con
tope». Ese es el único conteo anterior que existe, y habla de una sola cuenta.

Dato útil para las pruebas que faltan: la **cuenta 145 tiene el ciclo anclado al día 31**, y hoy tiene
una fila con dinero. Es el único caso real de un ciclo que no empieza el día 1, y sirve como referencia
para el bloque de pruebas (no para escribir sobre ella).

## Conclusión honesta

- **Cantidad exacta de topes borrados: desconocida.** Piso conocido: 76 en la cuenta 1. No hay cifra
  confiable para las otras siete cuentas.
- **Valores reconstruibles:** los de los orígenes 1 y 2, y solo mientras el dinero asignado no cambie.
- **Valores perdidos:** los escritos a mano en subcategorías, que son los únicos que expresaban una
  decisión del usuario. De ese conjunto hay dos documentados y el resto no.
- **No se restaura nada automáticamente.** Volver a poner un tope calculado sería inventar una decisión
  del usuario, que es justo lo que el criterio 6 del plan prohíbe.

## Lo que queda como mitigación

El estado posterior está fotografiado y con huella (`estado-actual.json`, sha256 `64f1e461…b10ad`), así
que desde acá cualquier cambio es comparable. Lo que falta, y es el punto 0.3 del plan, es que esa foto
se haya tomado **antes**; ya no puede ser.
