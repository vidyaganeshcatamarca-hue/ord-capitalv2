# Tarjetas — corrección de moneda y textos

Rama: `fix/tarjetas-moneda-y-textos` (base `0df0c57`). Origen: validación conversada registrada en
`odd/tasks/tarjetas-validacion-conversada.md` (23 decisiones cerradas con el dueño).

## Specs

**S1.** TC-05: la cantidad de cuotas rechaza decimales. *"A."* (rechazar el decimal con mensaje que pida entero)

**S2.** TC-06: el botón Confirmar bloqueado muestra el motivo debajo. *"A."*

**S3.** TC-08: el rechazo de archivado muestra texto legible. *"usa la primera, y traducir a los diccionarios"* → «No podés archivar esta tarjeta porque tiene cuotas o compromisos pendientes. Terminá de pagarlos y volvé a intentar.»

**S4.** TC-09: un solo texto de confirmación de archivado. *"texto unico"* → «¿Archivar «X»? Va a salir de tu lista, pero no se borra nada: podés volver a activarla cuando quieras desde «Ver archivadas».»

**S5.** P-01: porcentajes con separador regional y un solo decimal. *"respetas el delimitador decimal regional de configuraciones, pero dejas solo un decimal"*

**S6.** P-02: la precarga se redondea a los decimales de la moneda. *"A"*

**S7.** G-01: traducir los tres textos visibles. *"traducimos los tres textos y recuperamos el cartel"*

**S8.** Y-01: se elimina el cartel de atraso del detalle; no se muestran días de atraso. *"Corregimos el error mostrando solo el cartel 'Tarjeta Vencida', sin la cantidad de dias"* + *"A"* (sacar el cartel del detalle)

**S9.** Y-02: singular y plural en el aviso de cuotas cargadas. *"A"*

**S10.** G-03: la cotización arranca sin valor. *"A"*

**S11.** TC-01 + G-02 + X-07 + Y-03: comparativa y serie de ciclos con la moneda real, convertida, sin tarjetas archivadas. *"Elegimos B"*, *"A. las sacamos."*

**S12.** TC-02a + TC-02b: la deuda total muestra el convertido y la porción en dólares; sin cotización se avisa y la ventana de pago pide el valor del dólar. *"Esta segunda opcion es mas limpia."*, *"Elijo la opcion 2."*

**S13.** TC-07: el tope del cálculo sube de 6 a 12 ciclos. *"B"*

**S14.** G-04 + Y-04: el historial se pide por tarjeta y el contador de cuotas liquidadas muestra el número real. *"A"*

**S15.** X-01, X-02, X-06: alertas del Inicio, calendario financiero y radar de asfixia separan moneda. *"corrige las 4"*

**S16.** Umbral 50.000 del calendario: se elimina; lo reemplaza un semáforo por fecha —rojo 3 días o menos o ya vencido, amarillo 4 a 10, verde más de 10—. *"debes quitarlo porque no podemos tener un umbral generico en una app global"*

**S17.** TC-03b: el pago desde la pantalla liquida las cuotas del resumen, consume el saldo a favor y refinancia el faltante.

## Tasks

| ID | Tarea | Specs | Verificación |
|---|---|---|---|
| T1 | Rama, documento y volcado de las funciones desplegadas | — | hecho |
| T2 | Diez arreglos de pantalla y diccionarios en tres idiomas | S1-S10 | manual + paridad |
| T3 | B1-B2: saldo pasivo por moneda y mapa con cotización nula | S12 | entorno de prueba |
| T4 | B3: comparativa con moneda y filtrada | S11 | entorno de prueba |
| T5 | B4: serie por moneda y tope 12 | S11, S13 | entorno de prueba |
| T6 | B5-B6: historial por tarjeta y contador de liquidadas | S14 | entorno de prueba |
| T7 | B7-B9: Inicio, calendario con semáforo y radar | S15, S16 | entorno de prueba |
| T8 | B10: pago con objetivo | S17 | A/B en el entorno de prueba |
| T9 | PRD | — | lectura |
| T10 | Verificación UI con pi-ego (móvil primero, luego escritorio) y limpieza | — | capturas + seis valores base |

Regla de compatibilidad: **ningún cambio de base puede romper la pantalla ya desplegada**. Las
columnas nuevas se agregan, no se renombran; el parámetro nuevo lleva DEFAULT.

## Log

- **L1:** *"Aprobado el plan, continua hasta el final. Aprobado el SQL para supabase."*
- **L2:** *"las pruebas de UI las haces con pi-ego, en formato movil primero, luego para pc controlas que se vea bien."*
