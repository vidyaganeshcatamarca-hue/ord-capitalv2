# Ronda 8 — presupuestos: borde de grupo, total del grupo y scroll

Rama de trabajo: `pi/sesion-3`. Documento de la tanda 8. Cada `S#` cita el pedido del dueño
sin resumir. S1-S3 son cambios de UI; S4 es verificación de cálculo, sin tocar Supabase.

## Specs

**S1 — Rubro padre desplegado: recuadro verde grueso para el grupo completo y borde fino por hijo.**
"Para toda la categoría padre, incluida sus hijos, cuando se despliegan, un borde verde grueso,
tal cual el menú ajustes, y luego cada una de las subcategorías en un borde personal fino. Para
que se pueda leer donde empieza y termina cada tarjeta de las subcategorías, y que todas
pertenecen al mismo rubro padre. Copia la estética del menú de ajustes, para que vea tamaño y cómo
está diseñado."
Referencia aprobada por el dueño en Ajustes (`src/components/configuracion/ConfiguracionHub.css`):
grupo abierto `border: 2px solid var(--mint)`; cada hijo `border: 1px solid var(--mint)`; grupo
plegado sin borde.

**S2 — Total del grupo legible y stats en columna.**
"no está claro el dinero total del grupo. Esto quiere decir cuánto tiene asignado el grupo. El
rubro no tiene asignado nada, personalmente dice asignación cero, pero el grupo lleva asignado
493.155. Pero total del grupo está como desfasado. Me gustaría que lo pongas total del grupo como
título alineado a la derecha abajo de asignar con buena distancia y el valor abajo centrado justo
abajo del total del grupo. Centrado en relación al título pero alineado a la derecha. Grupal libre
lo debes sacar porque no está diciendo nada. Además, los datos abajo, asignado, gastado, libre y
avance, menos avance, los tres deberían ser fáciles de leer. Asignado, gasto y libre son títulos y
luego el valor debería estar abajo, centrado. De alguna manera me gustaría separarlos con algún
separador vertical para que facilite el entendimiento, por lo menos en los rubros padres."

**S3 — Asignar un presupuesto no debe devolver el scroll al principio.**
"Una categoría, una vez que se le asigna un presupuesto, vuelve el scroll arriba, debería dejarlo
donde está, porque puedo querer continuar con la categoría de abajo."

**S4 — Disponible negativo en el user 198: verificar si es un error y por qué pasa.**
"En el user 198 me da negativo el cálculo de lo que tiene disponible. Eso puedes verificar si es
un error o por qué está pasando."
Entrega de esta ronda: diagnóstico con evidencia (consulta de sólo lectura). Cualquier cambio de
RPC o de tabla requiere autorización previa del dueño.

## Tasks

| ID | S# | Ruta | Commit |
| --- | --- | --- | --- |
| T1 | S1 | `PresupuestosPage.tsx` (bloques padre+hijas) + `Presupuestos.css` | `5413e65` |
| T2 | S2 | `PresupuestosPage.tsx` (FilaSobre) + `Presupuestos.css` + `es/en/pt` | `5413e65` |
| T3 | S3 | `PresupuestosPage.tsx` (recarga silenciosa sin desmontar la lista) | `8dabb52` |
| T4 | S4 | lectura de `funcionesSQL` + consulta de sólo lectura sobre 198 | sin código |

### T4 — resultado del diagnóstico (no es un error de cálculo)

`fn_obtener_saldo_a_asignar` = liquidez de las billeteras de la moneda principal
− `SUM(GREATEST(monto_disponible,0))` de los sobres que cuentan en totales
− cuotas de tarjeta impagas hasta el fin del ciclo. Medido hoy sobre el 198:

```
420.836,83 GBP (2 billeteras)  −  446.200 (2 sobres con techo y saldo)  −  4.366,67 (2 cuotas)
= −29.729,84
```

El signo es correcto: la cuenta tiene 450.000 de techos asignados contra 420.836,83 de liquidez.
En modo libertad la pantalla no limita la asignación (el tope existe sólo en base cero), así que
el número negativo es el aviso de sobre-asignación. La captura del dueño mostraba −409.695 con la
misma fórmula y una liquidez mucho menor en ese momento.

Lo que sí está mal es el rótulo: en modo libertad el encabezado dice «PROYECCIÓN DEL MES / según
tu dinero ideal», pero el número no es una proyección ni usa los porcentajes ideales: es
liquidez menos comprometido. Además `getLabelDisponible()` devuelve primero la etiqueta de
anticipado, así que las claves `budget_over_allocation` («SOBRE-ASIGNACIÓN») y
`budget_over_allocation_desc` nunca se muestran en ese modo. Propuesta para otra ronda: cuando
el saldo sea negativo en anticipado, mostrar «SOBRE-ASIGNACIÓN» y su explicación.

## Log

**L1 — pedido del dueño (verbatim).**
"Son algunos bugs de presupuestos y algunas correcciones:
1. C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-6f5c7a8a-d4f4-4be8-9dac-1bc755175336.png
En esta imagen te voy a pedir correcciones de Uy. La primera es que Alimentos Hogar, que es un
rubro padre, tiene varias cuentas hijas que dependen de ella, que se des pliegan con el signo
menos, con el signo más. Eso funciona bien. Lo que quiero que hagas es algo muy similar a lo que
resolv imos para el menú ajustes. Para toda la categoría padre, incluida sus hijos, cuando se
despliegan, un borde verde grueso, tal cual el menú ajustes , y luego cada una de las
subcategorías en un borde personal fino. Para que se pueda leer donde empieza y termina cada
tarjeta de las subcategorías, y que todas pertenecen al mismo rubro padre. Copia la estética del
menú de ajustes, para que vea tamaño y cómo está diseñado. Eso es lo primero.
Lo segundo y sobre la misma imagen vas a poder ver que no está claro el dinero total del grupo.
Esto quiere decir cuánto tiene asignado el grupo. El rubro no tiene asignado nada, personalmente
dice asign ación cero, pero el grupo lleva asignado 493.155. Pero total del grupo está como
desfasado. Me gustaría que lo pongas total del grupo como título alineado a la derecha abajo de
asignar con buena distancia y el valor abajo centrado justo abajo del total del grupo. Centrado
en relación al título pero alineado a la derecha. Grupal libre lo debes sacar porque no está
diciendo nada. Además, los datos abajo, asignado, gastado, libre y avance, menos avance, los tres
deberían ser fáciles de leer. Asignado, gasto y libre son títulos y luego el valor debería estar
abajo, centrado. De alguna manera me gustaría separarlos con algún separador vertical para que
facilite el entendimiento, por lo menos en los rubros padres.
2. Una categoría, una vez que se le asigna un presupuesto, vuelve el scroll arriba, debería
dejarlo donde está, porque puedo querer continuar con la categoría de abajo.
3. C:\Users\VIDYAG~1\AppData\Local\Temp\pi-clipboard-c0e17073-2afa-4217-85e7-5665d4f913a6.png
En el user 198 me da negativo el cálculo de lo que tiene disponible. Eso puedes verificar si es
un error o por qué está pasando."

**L2 — el dueño pide agrupar el trabajo y la prueba al final (verbatim).**
"haz todos los cambios y luego pruebas ui todo junto"

**L3 — evidencia de la verificación (390x844, móvil, build de desarrollo).**
- Recuadro del grupo desplegado: `border: 2px solid #00B127` (medido 1,6px con la escala de la
  emulación, ratio 2:1 contra la hija). 17 subcategorías envueltas.
- Subcategoría: `border: 1px solid #00B127` en cada tarjeta. Plegado: el bloque no existe y la
  fila queda sin borde (mismo criterio que Ajustes).
- «Total del grupo»: título al borde derecho, valor centrado debajo (título x=236 w=104,
  valor x=249 w=79). `(grupal libre)` ya no aparece en pantalla.
- Columnas: Asignado / Gastado / Libre / Avance con el monto en una sola línea (18px de alto,
  sin desborde) y separador vertical de 1px en los rubros padre.
- Alturas del acordeón: 2.527px de contenido contra 3.000px de techo; con el techo anterior de
  2.000px se recortaba, así que ahora es 6.000px.
- Scroll: con la lista en `scrollTop = 1400`, un refresco silencioso (`movement-added`) la deja
  en `1400` sin spinner. Es el mismo camino que corre después de guardar una asignación.
- `npx tsc --noEmit`: 0 errores.
- Tests: `node --test tests/presupuestos/*.test.js` → 115/115 en verde. Los seis casos nuevos de
  `tests/presupuestos/grupo-recuadro-y-columnas.test.js` se corrieron contra los cinco archivos
  fuente de `b555bdf` y fallaron los seis (RED); con el código de esta ronda pasan los seis
  (GREEN). Tres casos viejos de `presupuesto-padres.test.js` congelaban la lista plana y la
  etiqueta `(grupal libre)`: se cambiaron los assertions, no el comportamiento.
- Fuera de alcance: `tests/budget-detalle-asignacion.test.js` sigue en rojo por un selector que
  nunca existió (`className="sobre-fila"`, el marcado usa template string desde la ronda 4).
  No se tocó en esta ronda.
