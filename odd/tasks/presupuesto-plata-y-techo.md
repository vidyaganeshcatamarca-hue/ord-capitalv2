# Modelo presupuesto: plata y techo como dos ejes

Cambio de arquitectura del módulo de presupuesto. Nace de la ronda 10: un solo campo
(`monto_limite`) hacía dos trabajos incompatibles —a veces era un tope, a veces era
dinero— y de ahí salieron casi todos los bugs de la ronda.

## Specs

S18. **Son dos conceptos distintos.** El techo dice lo que se puede gastar y lo que no.
La plata dice cuánto se le asignó realmente a esa categoría.

> Me gusta que haya separado los dos conceptos. Uno es el techo. El techo dice lo que se
> puede gastar y lo que no. Y otra es la plata. La plata dice cuánto se le asignó
> realmente a esa cuenta categoría. Son dos conceptos diferentes.

S19. **La plata es excluyente; el techo es superponible.** En un grupo, la plata la tiene
el padre o la tienen los hijos, nunca los dos. El techo puede estar en el padre, en los
hijos, o en ambos.

> en el concepto que te planteo, el que tiene la plata o es el padre o son los hijos, no
> los dos. Pero el techo lo puede tener el padre y por el padre todos sus hijos, o lo
> pueden tener el padre y los hijos, y algunos hijos que no tienen techo estarían usando
> lo libre.

S20. **El libre del grupo es la capacidad no consumida**, no un reparto: techo del padre
menos lo gastado por el conjunto del grupo. Un hijo sin techo propio gasta de ese libre.

S21. **Con qué se decide cada cosa.** El rojo y el avance se miden contra el **techo**;
el disponible se calcula con la **plata**. Gastar más que el techo es pasarse; tener
plata sin usar no es nada.

S22. **Implementación elegida: opción A.** Dos números por fila. `monto_limite` queda
como plata (asignación real) y se agrega `monto_techo` como tope de gasto.

> vamos con A.

S23. **Los estados imposibles de hoy se resuelven, no se toleran.** Que un padre tenga
plata y sus hijos también es un estado inválido bajo este modelo: hay que decidir caso
por caso cuál de los dos se queda con la plata, y la app debe impedir volver a ese
estado desde el servidor.

## Tasks

| ID  | S#             | Ruta | Commit |
| --- | -------------- | ---- | ------ |
| M1  | S22            | Agregar `monto_techo` a `p_presupuestos` y sembrarlo con el valor actual | — |
| M2  | S21            | Estado y avance calculados contra `monto_techo` en el reporte | — |
| M3  | S20            | Libre del grupo = techo del padre menos gasto del grupo | — |
| M4  | S19, S23       | Exclusividad de la plata impuesta en `fn_asignar_presupuesto` | `c2bc0e0` |
| M5  | S18            | La pantalla muestra techo y plata por separado | `d8c00ff` |
| M6  | S23            | Resolver los casos imposibles existentes (Alimentos-Hogar: padre 500 vs hijos 106.046) | datos, sin commit |

## Log

L7 (pedido original, literal):

> Me gusta que haya separado los dos conceptos. Uno es el techo. El techo dice lo que se
> puede gastar y lo que no. Y otra es la plata. La plata dice cuánto se le asignó
> realmente a esa cuenta categoría. Son dos conceptos diferentes. ¿Cómo los
> compatibilizamos? Vuelve a ponerme las opciones. Porque en el concepto que te planteo,
> el que tiene la plata o es el padre o son los hijos, no los dos. Pero el techo lo puede
> tener el padre y por el padre todos sus hijos, o lo pueden tener el padre y los hijos, y
> algunos hijos que no tienen techo estarían usando lo libre. Ahí es donde me confundo.

L8: el dueño eligió la opción A (dos números por fila) sobre la C (solo plata con el techo
en el padre) y descartó la B (papel declarado con un solo número, que no resuelve el caso
de un hijo con techo 40.000 y plata 25.000).

L9 (decisión de M6, literal): «ok para el user 1» y después «B». La plata se concentra en
el padre; los hijos conservan su techo y quedan con plata 0.

Aplicado por la RPC `fn_asignar_presupuesto` con `p_mover_plata = true`, no por INSERT, así
que cada movimiento dejó su fila en `p_presupuestos_historial`: `movido_al_padre` para los
hijos que se vaciaron y `manual` para los padres. Valores finales (noviembre 2026, user 1):
Alimentos-Hogar 106.546, Ocio 60.000, Tecnología 31.000; hijos 3, 7, 11, 166 y 406 en 0 con
su techo intacto. Quedaron 0 grupos imposibles y 0 filas con plata negativa.

Dos cosas que este paso dejó a la vista y no resuelve:

1. **Frescos.** `p_mover_plata` sólo vacía a los hijos con plata POSITIVA, así que el
   −135.000 de Frescos sobrevivía al movimiento del padre. Necesitó su propia llamada. Un
   saldo negativo de una subcategoría no lo absorbe nadie: si vuelve a aparecer, hay que
   asignarle 0 explícitamente.
2. **El techo de los padres.** Resuelto por el dueño, literal: «pon los techos de los
   padres en 20% mayor del dinero que tienen, que queden todos en positivo». No existe RPC
   que escriba `monto_techo`, así que fue por UPDATE directo con su autorización. Quedó:
   Alimentos-Hogar 127.855 (plata 106.546), Ocio 72.000 (60.000), Tecnología 37.200 (31.000),
   Transporte 413.400 (344.500) y Ropa 192.000 (160.000). Transporte y Ropa no estaban en el
   diagnóstico: aparecieron al verificar todos los padres, con el techo sembrado igual a su
   plata por M1. Verificado: los cinco padres con plata del ciclo tienen techo que supera su
   plata, ninguno se quedó sin techo.
