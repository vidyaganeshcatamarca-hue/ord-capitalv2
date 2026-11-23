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
| T1 | Crear `integracion/tres-ramas` desde P2 y mergear la rama de OCR | S1, S2 | |
| T2 | Mergear la rama de P3 y resolver los archivos compartidos (diccionarios, índice) | S3, S4 | |
| T3 | Verificar: tipos, idiomas, estáticas y el diff contra producción | S5, S6 | |
| T4 | Publicar en `origin/produccion` | S7 | |
| T5 | Alinear las tres ramas al commit publicado | S8 | |

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
