# Plantilla: el brief de un refutador

Copiá esto a `scratch/<lang>-refute-<a|b>.md`, una copia por revisor.

**Los dos refutadores reciben briefs casi idénticos, y NO se les dice qué
encontró el otro.** Si un revisor sabe lo que encontró el otro, deja de
buscar. La independencia es el punto: dos personas que miran lo mismo desde
distinto lugar encuentran cosas distintas.

---

# Brief: refutación de la traducción a <IDIOMA>

Sos un revisor **INDEPENDIENTE** de las traducciones de una app de finanzas
personales (ORD Capital Personal). Otro revisor está mirando lo mismo en
paralelo: **no intentes adivinar qué encuentra él**, hacé TU propia revisión
desde cero.

## Contexto

Se acaba de traducir el diccionario español → <IDIOMA>. El dueño pidió una
revisión adversarial, con acuerdo sobre el mejor término cuando haya dudas.

**Tu trabajo es ENCONTRAR FALLOS, no validar.** Si no encontrás nada,
sospechá que no miraste lo suficiente.

## Qué hay que revisar

El archivo `scratch/<lang>-uncertain.json` tiene las keys dudosas de la
traducción, agrupadas por sección. Cada entrada tiene: `es` (español
original), `<lang>` (traducción actual) y a veces `concept` (el concepto
compartido que hay que mantener consistente entre secciones).

Contexto completo:
- `scratch/<lang>-brief.md` — el brief con el estilo y el glosario pedidos
- `src/locales/<lang>.ts` — el diccionario completo
- `src/locales/es.ts` — el español original

## Qué buscar, en orden de importancia

### 1. Placeholder roto o cambiado — CRÍTICO

Si el español tiene `{monto}` y la traducción tiene `{valor}`, es un bug
crítico: en pantalla queda literal `{valor}`. Verificá carácter por carácter.
El NOMBRE del placeholder no cambia y su ORDEN tampoco: el diccionario exige
que aparezca en la misma secuencia que en el español (lo validan el assembler
y el test de paridad).

### 2. Inconsistencia entre secciones

El mismo concepto tiene que traducirse igual en todas partes. Recorré TODAS
las keys del diccionario que contengan el mismo término español — no solo las
de la lista — y verificá que la traducción sea uniforme.

**Estos son los que YA se detectaron por haber partido el diccionario en
chunks con traductores distintos. Confirmalos o corregilos:**

<SUSPECTOS>

Regla para resolver un concepto partido: el término que ya está en 100 keys
es el correcto; el que aparece en 3 es el error. Y si el español mezcla dos
nombres para un mismo concepto, el modelo de datos decide: mirá los nombres
de las RPC, de las columnas y de los campos que renderizan el texto.

### 3. Calco del español o del inglés

Palabras traducidas literalmente que no son naturales en <IDIOMA> financiero.
O palabras que un traductor de inglés arrastró a <IDIOMA> sin adaptar.

### 4. Variante regional equivocada

<REGION>

Ojo: hay palabras que son correctas en una variante y no en la otra. Y hay
palabras que en el idioma destino significan otra cosa: en portugués de Brasil
"almacén" es una boutique de ropa, así que la categoría de despensa no puede
ser "Almacén". Revisá las categorías una por una.

### 5. Registro inconsistente

Si el español es un error calmado y la traducción grita (o al revés). El
español usa voseo; <IDIOMA> no tiene voseo, así que el tratamiento correcto
es el de segunda persona.

### 6. Pérdida o agregado de significado

La traducción dice algo distinto de lo que dice el español, o más corto de lo
que debería.

### 7. Longitud

Una traducción que duplica el largo del original rompe el layout de la app.

### 8. Error de hecho

La key dice una cosa y el texto dice otra. Por ejemplo, una key que dice "La
suma debe ser 100" pero se llama `must_be_zero`.

## Cómo reportar

Por cada hallazgo:

- La key exacta
- El español
- La traducción actual
- Tu propuesta
- Por qué
- La gravedad: **CRÍTICO** (placeholder roto, bug en pantalla) / **ALTO**
  (término incorrecto, pérdida de significado) / **MEDIO** (registro, largo,
  matiz)

**Usá la evidencia del repositorio.** Antes de decir que un término está
mal, buscalo en el código y en el otro idioma ya entregado, y contá. Si el
término aparece 5 veces, decilo. Si el revisor leyó mal el archivo, el
arbitraje lo va a descartar, pero pierde tiempo de todos.

## Reglas de ejecución

- **NO edites ningún archivo.** Solo lectura y reporte.
- **NO corras** `tsc`, `npm run build`, `vitest`, `jest` ni `npm test`.
- Podés usar `bash` con `node -e` para buscar términos en los diccionarios.

## Allowed edit surfaces
scratch/<lang>-uncertain.json
scratch/<lang>-brief.md
src/locales/<lang>.ts
src/locales/es.ts

## Devolvé
El reporte de hallazgos.
