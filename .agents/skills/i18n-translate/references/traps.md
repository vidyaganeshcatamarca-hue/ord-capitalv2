# Trampas

Los errores que ya sePagaron. Cada uno dice qué pasó, por qué, y cómo
defenderse.

## 1. Placeholder renombrado

**Qué pasó:** el español decía `{monto}` y la traducción decía `{valor}`.

**Por qué duele:** en pantalla queda literal `{valor}`. O peor: si el
placeholder se duplica o se reordena, imprime el número equivocado en el
lugar equivocado, sin error visible.

**Defensa:** el nombre sobrevive byte a byte. La posición en la frase puede
cambiar, el nombre no. El array `ph` tiene que coincidir exactamente con los
placeholders de la traducción: mismo conjunto, mismo orden, misma cantidad.
El assembler y el test de paridad lo verifican.

## 2. Doble escapado

**Qué pasó:** el diccionario guarda el valor escapado (es lo que necesita un
literal TS: `"Archivar \"{nombre}\"?"`), pero la app lo renderiza sin
escapar: `Archivar "{nombre}"?`. El lector viejo no deshacía el escape, y el
escritor viejo lo volvía a aplicar: la barra se duplicaba y la comilla se
convertía en una barra visible en pantalla.

**Defensa:** la regla es una línea — **leer SIN escapes, escribir ESCAPANDO**.
Hoy eso vive en un solo lugar: `scripts/i18n/lib/dictionary.mjs`. Todo script
que toca un diccionario pasa por ahí. Si tocás el lector o el escritor, que
sea **el** de la librería, no una copia.

## 3. Una key nueva al final de la sección

**Qué pasó:** el apply ponía la key nueva al final de su sección, mientras el
maestro la tenía en el medio. Los dos archivos dejaron de alinearse, y
después un agente tuvo que corregirlo a mano.

**Defensa:** una traducción es el ESPEJO del maestro: mismas keys, mismo
orden. El maestro decide el orden (`keyOrderOf`). Si una key nueva no queda
en su lugar, el orden está mal.

## 4. El header pisado

**Qué pasó:** el apply reescribía el encabezado del diccionario con uno
genérico. El encabezado es lo único que dice qué es el archivo.

**Defensa:** `readHeader` lo conserva. Si el encabezado de un diccionario
cambió, algo está mal.

## 5. `ledger build` antes de traducir

**Qué pasó:** el build graba el español actual como la base de cada
traducción. Correrlo antes de traducir grababa como base un texto del que
nadie había traducido, y la señal de "esto está viejo" desaparecía. El
cambio se perdía en silencio y nunca llegaba a los otros idiomas.

**Defensa:** el build **va al final** del ciclo. Y ahora se niega a correr
mientras haya trabajo pendiente, diciendo qué falta. Si te pide `--force`,
preguntate si de verdad querés descartar la traducción.

## 6. Un chunk viejo aplicado de más

**Qué pasó:** el apply leía todos los chunks del directorio de salida. Un
chunk de una corrida anterior se aplicaba encima del actual.

**Defensa:** el reporte del delta es la lista blanca. Solo se aplican las
keys que el delta pidió. Si sobra un chunk, se borra el directorio de salida
antes de empezar.

## 7. Una key borrada que no se borró

**Qué pasó:** la eliminación la guiaba el chunk traducido. Pero una key
borrada no tiene nada que traducir, así que nunca aparece en un chunk: el
chunk vacío no informaba la eliminación.

**Defensa:** la eliminación la guia el **reporte** del delta
(`report.removed`), no el chunk.

## 8. Un término unificado de más

**Qué pasó:** al arreglar que "fuente de ingreso" y "ingreso" se tradujeran
igual, se rompió la distinción que el glosario pedía: `fonte de renda` para
la entidad nombrada, `receita` para el flujo de ingreso. Hubo que revertirlo.

**Defensa:** dos palabras del español pueden ser dos conceptos. Antes de
unificar, preguntá si el maestro las separa. Si las separa, no se tocan.

## 9. 16 chunks, 16 estilos

**Qué pasó:** sin brief, cada traductor decide su propio registro: uno
formal, otro coloquial, otro con exclamaciones. El resultado era un
diccionario que se nota traducido.

**Defensa:** el brief es obligatorio, y va en el prompt de cada traductor.
El registro, el voseo, el tono de los errores y el glosario van ahí.

## 10. Traducción mecánica

**Qué pasó:** la copy suena a traducción. La lee alguien que administra su
propia plata: tiene que sonar natural en el idioma destino, no traducida.

**Defensa:** leé cada entrada. Si en el idioma destino la frase "no suena
como algo que diría una app de dinero", no es la frase.

## 11. Contenido inventado

**Qué pasó:** un `howTo` de tour que en español está vacío ("") se
tradujo con texto. El maestro vacío significa vacío.

**Defensa:** si el español está vacío, la traducción va vacía.

## 12. Heredoc de bash para un chunk largo

**Qué pasó:** el heredoc trunca el contenido largo. Un chunk a medio escribir
es un chunk corrupto.

**Defensa:** escribí el archivo con la herramienta de escritura de archivos.
Un heredoc solo para chequeos chicos de una línea.

## 13. Correr la verificación pesada desde un subagente

**Qué pasó:** los subagentes que corren `tsc` o la suite gastan tiempo y
tokens del usuario, y el resultado no es confiable si lo corrieron ellos.

**Defensa:** el orquestador es el único que corre `tsc --noEmit`,
`npm run build` y la suite. Al delegar, poné la regla **en el primer bloque**
del prompt, con lenguaje enfático, no al final.

## 14. Commitar en `main` o `produccion`

**Defensa:** verificá la rama **antes** de delegar. Si el subagente puede
commitear, pasale el nombre de la rama en el prompt. Y el subagente tiene
que **rechazar** el commit y reportar el bloqueo si el prompt lo deja en
`main` o `produccion`. El cherry-pick es la única forma sancionada de
llevar trabajo a esas ramas, y lo hace el orquestador.

## 15. Fijar un locale global

**Qué pasó (por evitar):** fijar `en-US` o `pt-BR` global rompe el formato
de moneda de los demás países.

**Defensa:** el idioma se persiste como dos letras. La región sale del
país: `buildLocale(lang, countryCode)`.

## 16. Marcadores de español residual compartidos

**Qué pasó:** marcar `celular`, `nenhum`, `extrato` o `cota` como español
residual en portugués daba falsos positivos: son palabras válidas en Brasil.

**Defensa:** cada idioma tiene **su propia** lista de marcadores.

## 17. Hardcodear español en el código

**Qué pasó (por evitar):** un string en español en un `.tsx` o `.ts` rompe el
idioma destino sin que ningún test lo detecte.

**Defensa:** toda la mensajería va por el diccionario, y se traduce por i18n.

## 18. Tests que mutan los archivos reales

**Qué pasó:** los tests del toolchain corrían los comandos contra el repo
real. Como los comandos escriben los archivos que leen, los tests se
corrían entre sí en paralelo (fallos falsos) y dejaban el working copy
sucio si fallaban a mitad de camino.

**Defensa:** los tests del toolchain corren contra un **sandbox**: una copia
temporal de los diccionarios y del ledger (`tests/i18n/support/sandbox.mjs`).

## 19. Confiar en el refutador que no entrega

**Qué pasó:** un revisor (`jd-judge-a`) pasó 123 turnos sin entregar
informe. Se canceló y su mitad se cubrió con detectores propios.

**Defensa:** un revisor que no entrega no es un bloqueante. La cobertura se
completa con detectores propios: consistencia de términos, divergencia entre
secciones, formas del mismo término, marcadores de español residual, voseo y
valores candidatos. Lo que no se negocia es la cobertura.

## 20. Aceptar un hallazgo sin evidencia

**Qué pasó:** un revisor propuso "Buzo de Deseos" sin tilde. El archivo tenía
"Buzão" 5 veces: leyó mal. Y otro propuso "Saldo transportado" para un
valor que el código siempre renderiza con signo negativo.

**Defensa:** antes de aceptar un término, contá las ocurrencias en el repo,
mirá el modelo de datos y el código que renderiza. Si el hallazgo no tiene
evidencia, se descarta y se dice por qué.
