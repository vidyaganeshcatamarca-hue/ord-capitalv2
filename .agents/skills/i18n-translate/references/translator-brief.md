# Plantilla: el brief de un traductor

Copiá esto a `scratch/<lang>-brief.md` y cambiá lo que sea específico del
idioma. **Cada chunk recibe este brief entero.** Es lo que hace que 16
traductores distintos produzcan una sola traducción.

Adaptá el idioma del brief al del traductor: el inglés con el brief en
inglés, el portugués con el brief en portugués. Un traductor que lee las
reglas en otra lengua las aplica peor.

---

# Brief: traducción de un chunk del diccionario de ORD Capital Personal

## Contexto

Estás traduciendo un chunk del diccionario de una app de finanzas personales
(ORD Capital Personal) a **<IDIOMA>**. La app es un control de finanzas
personales: carteras, movimientos, presupuestos, tarjetas de crédito,
inversiones, ahorro, gastos compartidos en pareja, y módulos analíticos
(«Sobrevivencia Financiera», «Saneamiento»).

El diccionario maestro está en `src/locales/es.ts` (español rioplatense).
Tu chunk es un archivo JSON con los strings en español de una sección, más
los nombres de los placeholders que cada string usa.

## Entrada

- `scratch/<lang>-input/<chunk>.json` — el chunk a traducir.
  Formato: `{ "section": "...", "part": N, "parts": M, "entries": { "<key>": { "es": "<español>", "ph": ["<placeholder>", ...] } } }`

## Salida

Escribí `scratch/<lang>-output/<chunk>.json` con la MISMA forma, pero con el
string en español sustituido por su traducción:

```json
{
  "section": "errors",
  "part": 1,
  "parts": 1,
  "entries": {
    "error_unauthorized": { "es": "No tenés permiso para hacer esta acción.", "ph": [] },
    "error_field_required": { "es": "El campo {field} es obligatorio.", "ph": ["field"] }
  }
}
```

Reglas del archivo de salida:
- Mantené EXACTAMENTE todas las keys. No agregues, quites, renombres ni
  reordenes.
- Reemplazá SOLO el valor de `es`. El campo `ph` queda igual.
- Una key por línea, JSON válido, sin coma final, sin comentarios.
- Escribí el archivo con la herramienta de escritura de archivos. **NO uses
  heredoc de bash**: el contenido largo trunca — es un problema conocido de
  este repo.

## LA REGLA DE LOS PLACEHOLDERS — acá es donde se rompe

`{nombre}` se sustituye en el render. Un placeholder renombrado, perdido,
duplicado o reordenado deja un `{monto}` literal en pantalla, o peor: imprime
el número equivocado en el lugar equivocado.

**El nombre del placeholder tiene que sobrevivir byte a byte.** Podés moverlo
a otra posición de la frase — el orden de las palabras es distinto — pero NO
podés renombrarlo.

- `{monto}` sigue `{monto}`. No `{amount}`, no `{valor}`, no `{quantia}`.
- El conjunto de placeholders de tu traducción tiene que ser EXACTAMENTE el
  array `ph`.
- La cantidad tiene que ser exactamente la misma.

Ejemplos:
- es: `"No podés retirar más que el valor actual ({max})."` → en: `"You cannot withdraw more than the current balance ({max})."`
- es: `"Ahorrás {monto}/mes"` → en: `"You save {monto}/month"`
- es: `"¿Las transferimos a \"{buzon}\"? Saldo actual del buzón: {saldo}"` → en: `"Shall we move them to \"{buzon}\"? Current mailbox balance: {saldo}"`

## ESTILO — leelo con atención, es un producto financiero

**Registro:** <IDIOMA> financiero, claro y natural. No literal, no jerga, no
lenguaje de banco. Pensá en una app de dinero bien escrita, no en un contrato
jurídico ni en un chat.

**Persona y tratamiento:** el español usa voseo rioplatense ("podés", "tenés",
"elegí"). <IDIOMA> no tiene voseo: usá la segunda persona natural.
- "podés" → <"podés" se resuelve así>
- "tenés" → <"tenés" se resuelve así>
- "elegí" → <"elegí" se resuelve así>
- "tocá" → <"tocá" se resuelve así>
- "guardá" → <"guardá" se resuelve así>
- "cargá" → <"cargá" se resuelve así>
- "borrá" → <"borrá" se resuelve así>

**Imperativos en botones:** forma base del verbo, sin "por favor".
- "Guardar" → <"Save">
- "Cancelar" → <"Cancel">
- "Eliminar" → <"Delete">
- "Reintentar" → <"Retry">

**Tono en errores:** decí el problema y la consecuencia, con calma. Sin
puntos exclamativos, sin regañar, sin "¡Ojo!" o "¡Cuidado!". A veces el
español grita; <IDIOMA> no grita.

**Tono en las dicas:** amigable y directo. Segunda persona, frases cortas. La
app le enseña al usuario a cuidar su plata.

**TERMINOLOGÍA — usá estos términos, son los del producto:**

| Español | <IDIOMA> | Nota |
|---|---|---|
| billetera | <término> | |
| cuenta | <término> | |
| movimiento | <término> | |
| egreso / ingreso | <término> / <término> | |
| saldo | <término> | `saldo actual` → <término> |
| monto | <término> | |
| rubro / subrubro | <término> / <término> | |
| presupuesto | <término> | |
| sobre | <término> | el envelope de reserva |
| ahorro | <término> | |
| inversión | <término> | |
| tarjeta | <término> | `tarjeta de crédito` → <término> |
| cuota | <término> | <nota: en algunos idiomas "cuota" significa otra cosa> |
| resumen de tarjeta | <término> | |
| conciliación / conciliar | <término> | |
| pendiente de aprobación | <término> | |
| saneamiento | <término> | |
| supervivencia | <término> | |
| escudo de tiempo | <término> | |
| licuadora | <término> | módulo de inflación |
| hormigas | <término> | gasto pequeño y recurrente |
| podadora | <término> | |
| ROI Emocional | <término> | mantiene "ROI" |
| día ancla | <término> | |
| base cero | <término> | |
| modo libertad | <término> | |
| fuente de ingreso | <término> | <no es lo mismo que "ingreso" de arriba> |
| origen / destino | <término> | |
| corretaje / comisión | <término> | |
| plazo fijo | <término> | |
| cedear | CEDEAR | es un instrumento, se conserva el nombre |
| War Room | War Room | es el nombre del módulo, se conserva |

**NUNCA traduzcas:**
- Códigos de moneda: ARS, USD, EUR.
- Nombres de módulos que son nombres de producto: "War Room".
- Placeholders (ver arriba).
- Emoji.
- Nombres de producto en mayúscula: "ORD Capital".

**Números y unidades:** dejalos como están. "30 días" → "30 days".
"{dias} días" → "{dias} days". Se traduce la unidad, no el número.

**Largo:** el texto traducido tiene que parecerse en largo al español. Si
una traducción fiel queda mucho más larga, apretá la redacción en vez de
inflarla. Las etiquetas de UI tienen que seguir siendo cortas.

**Strings vacíos:** si el valor en español está vacío (un `howTo` de un tour
que es ""), el valor traducido también tiene que estar vacío. No inventes
contenido.

## Notas por sección

- **errors**: mensajes de error. Algunos son contratos del backend (el texto
  de un `RAISE EXCEPTION` de Postgres). Que sean cortos y factuales. Varias
  keys están duplicadas en distintas secciones con significados distintos:
  traducí cada una en su contexto.
- **voice**: mensajes de micrófono / dictado. "Grabando..." → <equivalente>
  (mantené los puntos suspensivos si están en el original).
- **category_keys**: los nombres canónicos de las categorías de gasto. Son
  etiquetas CORTAS que van en gráficos y listas: "Alimentos-Hogar" →
  <"Food-Home">, "Ocio y Placer" → <"Leisure & Pleasure">, "Diezmo" →
  <"Tithing">, "Mascotas" → <"Pets">, "Frescos" → <"Fresh Produce">.
  Mantené el estilo de guion del original.
- **bcg**: el módulo de ROI Emocional. <notas específicas del idioma>.
- **war_room**: el módulo de supervivencia financiera. Registro serio.
- **saneamiento**: el módulo de limpieza de deudas. Directo, orientado a la
  acción.
- **wallets**: la lista de carteras y cuentas.
- **inversiones**: el módulo de inversiones. <terminología financiera>.
- **reports**: el formulario de reporte de errores.
- **tour**: los tours guiados. Amigable, instructivo, segunda persona. Las
  keys con punto como `'home.step1.title'` son nombres literales: dejalos
  EXACTOS y traduci solo el valor.

## La barra de calidad

Leé cada entrada. No traduzcas mecánicamente. El usuario de esta app
administra su propia plata y lee esta copy para entender su situación
financiera: la redacción tiene que ser precisa sobre el dinero.

Después de escribir el archivo, verificá:
- El conjunto de keys es idéntico al de la entrada.
- El array `ph` de cada entrada quedó igual.
- El archivo es JSON válido (parsealo con node y fijate).
- No sobrevivió español en el campo `es` de la salida (nada de voseo, nada
  de "¿" invertido, nada de "ñ" salvo que sea un nombre propio que la
  conserve).

## Reglas para vos

- NO corras `tsc`, `npm run build`, `vitest`, `jest` ni `npm test`. Es lento
  y el orquestador corre la verificación.
- NO edites ningún archivo que no sea `scratch/<lang>-output/<chunk>.json`.
- NO toques `src/locales/es.ts` ni `src/locales/<lang>.ts`.
- NO crees ni modifiques documentación.
- Podés usar `read`, `grep`, `glob`, `bash` (comprobaciones de solo lectura y
  un `node -e` para validar el JSON).

## Devolvé

- La ruta del archivo de salida.
- Cuántas keys escribiste.
- Cualquier key que te haya resultado dudosa, y por qué. Eso alimenta la
  ronda de refutación: lo que no digas, nadie lo va a mirar.
