# Integración de las tres ramas — OCR (P1) + Presupuesto (P2) + Préstamos/Ahorros (P3)

Rama de integración: `integracion/tres-ramas`, creada desde
`fix/ronda-14-bugs-presupuesto-cuarentena` (P2, commit `bddd36f`).
Tronco de entrega: `origin/produccion` (`c592f68`).

## Specs

S1. Traer todo el trabajo de P1 sin perder ninguno de sus commits. Textual del dueño: «Vas a tomar
el trabajo de PI1 en la rama de OCR Y vas a traer todo su trabajo».
S2. Hacer un merge con todo lo hecho en presupuesto (P2). Textual: «Vas a hacer un merge con todo lo
que has hecho en presup uesto».
S3. Traer todo el trabajo de P3. Textual: «Y también vas a traer todo el trabajo de PI3 Que ha
trabajado en el módulo de ahorros».
S4. Mezclar «con atención y cuidado en los diccionarios Que pueden ser los archivos compartidos».
S5. Comparar el resultado contra producción «Para no volver a subir cosas que ya están en
producción». Textual: «No debería haber nada de ellos subido a producción».
S6. Verificar que las otras dos ramas no tengan trabajo sin commitear. Textual: «Fíjate que no
tengan trabajo sin comitear En teoría no».
S7. Publicar en producción: «sincronizas con producción Hacemos el push, la producción».
S8. Dejar las tres ramas alineadas después del push: «Vas a dejar las tres ramas alineadas».

## Estado de partida (medido, no supuesto)

| Rama | HEAD | Sin commitear | Commits sobre `origin/produccion` |
| --- | --- | --- | --- |
| P1 `fix/ocr-ajustes-20261113` | `fc037e5` | limpio | 6 |
| P2 `fix/ronda-14-bugs-presupuesto-cuarentena` | `bddd36f` | limpio | 50 |
| P3 `feat/prestamos-saneamiento-rebuild` | `71660cf` | un `.tmp-dev.log` sin trackear (registro temporal, no trabajo) | 57 |

## Tasks

| ID | Qué | Specs | Estado |
| --- | --- | --- | --- |
| T1 | Crear `integracion/tres-ramas` desde P2 y mergear la rama de OCR | S1, S2 | Hecho: `687d840` |
| T2 | Mergear la rama de P3 y resolver los archivos compartidos (diccionarios, índice) | S3, S4 | Hecho: `ad580d3` |
| T3 | Verificar: tipos, idiomas, estáticas y el diff contra producción | S5, S6 | Hecho |
| T4 | Publicar en `origin/produccion` | S7 | Hecho: `c592f68..2e3bec9` |
| T5 | Alinear las tres ramas al commit publicado | S8 | Hecho: las tres en `2e3bec9` |

## Log

L1. Pedido del dueño, literal: «Bien, ahora tenemos el desafío de trabajar con PI1, PI2 y PI3 Tú
eres PI2 Vas a tomar el trabajo de PI1 en la rama de OCR Y vas a traer todo su trabajo Vas a hacer
un merge con todo lo que has hecho en presup uesto Y también vas a traer todo el trabajo de PI3 Que
ha trabajado en el módulo de ahorros Y vas a hacer un merge contigo Vas a mezclar todo con atención
y cuidado en los diccion arios Que pueden ser los archivos compartidos Y luego de ese gran merge que
vas a hacer Vas a compararlo contra producción Para no volver a subir cosas que ya están en
producción No debería haber nada de ellos subido a producción Fíjate que no tengan trabajo sin
comitear En teoría no Y una vez que hagas eso, sincronizas con producción Hacemos el push, la
producción Y luego de que el push sea satisfactorio Vas a dejar las tres ramas alineadas ¿Vale?»

L2. Conflictos y cómo se resolvieron:
- `start_info/indice de funciones.md` (dos veces): las dos ramas reescribieron la lista. Se unió por
  nombre de función, se conservó la entrada con la nota más completa y se renumeró de 1 a 351.
- `.gitignore`: se conservaron las dos listas blancas; la de préstamos va al final porque en
  .gitignore gana la última regla que coincide.
- `src/App.tsx`: se conservó la pantalla de desarrollo de la cámara y las páginas de préstamos, y se
  retiró `SaneamientoPage`, que P3 reemplazó por `/prestamos/saneamiento` con redirección.
- Diccionarios: git los fusionó solo, pero el libro quedó viejo: se reconstruyó (3.226 claves).
- `tests/i18n/translate-pipeline.test.js` esperaba quince secciones y el master pasó a dieciséis por
  `dev_camera_batch` (la cámara de P1). Se actualizó el número con el motivo escrito arriba.

L3. Estado publicado: `origin/produccion` en `2e3bec9`, 116 commits sobre `c592f68`, 240 archivos,
+61.395/−10.553. Sólo dos archivos borrados (el módulo de exclusividad que el modelo nuevo retiró).
Las tres ramas quedaron en `2e3bec9`, sin trabajo pendiente.
