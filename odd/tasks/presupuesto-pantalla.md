# Presupuestos: pantalla y textos (etapa 3)

Cierra lo que la etapa 2 dejó calculado pero no visible. Continúa `presupuesto-una-bolsa.md`.

## Specs

S24. «El padre no necesita techo propio; su referencia es el dinero asignado.»
S25. «A la subcategoría se le pone un techo de gasto, no plata asignada.»
S26. «Una subcategoría sin tope comparte el margen libre del padre: un solo margen, no uno por
subcategoría.»
S27. «Si un padre tiene subcategorías, los nuevos gastos deben imputarse a una subcategoría elegida. No
usar automáticamente la primera ni registrar silenciosamente en el padre. Los gastos históricos deben
seguir computándose.»
S28. Que cada método de asignación diga lo que hace.

## Hecho

- La fila del padre perdió el techo: Asignado, Gastado, Sin asignar y Progreso contra su bolsa (66% en
  lugar del 298% que se medía contra un techo del 120% que era un resto del modelo viejo).
- La subcategoría muestra «Tope» y su valor, o «Sin asignar» con el margen compartido cuando no tiene.
  Todas las sin tope muestran el mismo número y bajan juntas.
- El margen compartido sale de la bolsa del padre, no de su techo: la misma cuenta que usa el validador
  de transferencias.
- Etiquetas: «Ingresar Monto» sumaba; ahora dice «Sumar al asignado» y lo explica. El promedio de seis
  meses dice que se calcula por días de uso.
- Gasto en un rubro padre con subcategorías: si tiene «sin detalle» va ahí; si no, el flujo se detiene,
  despliega las subcategorías y exige elegir. Se aplicó también al atajo de recientes del móvil.
- Se eliminó el manejador muerto que todavía asignaba el padre directamente.
- Tope editable por subcategoría: hoja con el valor actual, guardar y quitar el tope (`null`). Solo en
  subcategorías y solo en el ciclo activo. Verificado en pantalla: 20 de 20 subcategorías editables, 0
  de 10 rubros padre.
- Rastro visible: bloque de historial en la hoja de detalle, últimos 10 cambios, con fecha corta y
  motivo traducido. Verificado en pantalla: «Nov 12 · Other change».
- Servidor: `fn_asignar_techo`, columna `monto_techo` en el historial y `fn_historial_presupuesto`.

## Falta

- Sacar el diálogo de mover plata (`confirmacionPlata`, `textosPlata`, el `ConfirmModal` de la línea
  ~2107 y la rama del `catch` que lo levanta). El servidor ya no emite esas claves desde la etapa 1,
  así que quedó inalcanzable. Es limpieza, sin efecto para el usuario.

## Evidencia

`npx tsc --noEmit` 0 · presupuestos 196/196 · idiomas 81/81 · gastos 9/9 · libro de traducciones
reconstruido (2848 claves por idioma). Cinco casos del editor de tope probados contra la base y
revertidos: poner, rastro con su valor, vaciar a NULL, rechazar un padre, rechazar cero.

## Commits

- `b57c4e0` — el padre sin techo y la subcategoría con el suyo.
- `a630389` — el gasto en un padre exige subcategoría.
- `343fd9a` — fuera el manejador muerto que asignaba el padre.
- `02d901e` — tope editable y rastro visible.
