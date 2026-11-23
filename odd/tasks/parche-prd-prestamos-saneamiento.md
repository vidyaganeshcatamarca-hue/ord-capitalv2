# Parche del PRD — `docs/deudas/Prestamos-Saneamiento.md`

**Qué es esto.** El PRD normativo del módulo vive en el worktree `Personal`, que no es el ámbito de
trabajo de esta rama. Por eso no se lo modificó: acá quedan los cambios exactos, listos para
incorporarse, sin duplicar el documento ni sobrescribir reglas ya aprobadas.

**Cómo aplicarlo.** Reemplazá el texto de «Antes» por el de «Después» en el archivo del PRD. Son
cuatro bloques: uno reemplaza el criterio AC-16 y tres agregan reglas posteriores ya aprobadas.

---

## 1. Criterio AC-16 — reemplazo

**Antes** (tabla de criterios de aceptación, línea 278):

```
| AC-16 | Registrar pago desde Calendario o Saneamiento | Utilizar misma lógica de préstamo, mismo movimiento de billetera, mismas categorías, sin duplicados |
```

**Después**:

```
| AC-16 | Pagos reales y alcance de Saneamiento | El pago se registra siempre desde Préstamos → Debo, o desde el Calendario, con la misma lógica de préstamo, el mismo movimiento de billetera y las mismas categorías, sin duplicados. Saneamiento sólo orienta y simula: sus estrategias, el simulador y el cuestionario no modifican cuotas, condiciones, vencimientos ni movimientos, no registran operaciones y no ofrecen accesos de pago |
```

---

## 2. Regla posterior — el saldo no se edita directamente (decisión 32A)

**Dónde**: en la sección de edición de préstamos, junto a la regla de que editar condiciones no
genera movimientos.

```
### Saldo derivado

El saldo pendiente se deriva de las condiciones iniciales y de las operaciones registradas. No se
edita directamente.

- Cuando el saldo llega a cero, el préstamo queda «Saldado».
- Para reabrirlo porque un pago o un cobro se registró mal, se corrige o se anula esa operación;
  el sistema recalcula el saldo y, si queda pendiente, el préstamo vuelve a estado activo.
- La única corrección admitida sobre un saldo es la del saldo inicial declarado de un préstamo
  histórico que todavía no tiene pagos.
- Una edición que no cambia ninguna condición se rechaza: el sistema no informa éxito sobre un
  cambio que no se aplicó.
```

---

## 3. Regla posterior — coherencia entre billetera y deuda (decisión 33A)

**Dónde**: en la sección de pagos y cobros.

```
### Importe de billetera e importe aplicado

Con la misma moneda entre la billetera y el préstamo, el importe que sale o entra en la billetera
tiene que coincidir con el importe aplicado a la deuda. Si difieren sin un componente financiero
identificado, la operación se rechaza antes de escribir nada.

La única diferencia admitida es el sobrepago con intereses confirmados: se pide confirmación
explícita, el excedente queda identificado como intereses no registrados anteriormente, la
billetera se mueve por el importe real y el préstamo se cancela. Un solo movimiento.

Con monedas distintas se conservan dos importes independientes: el dinero real en la billetera y el
importe reconocido contra el saldo. ORD no inventa ni impone un tipo de cambio.

La misma regla vale al registrar y al corregir un pago o un cobro, y la interfaz no reescribe nunca
en silencio un importe ingresado por el usuario.
```

---

## 4. Regla posterior — naturaleza de Saneamiento

**Dónde**: al inicio de la sección de Saneamiento, después del objetivo.

```
### Alcance: educativo, informativo y de simulación

Saneamiento no opera sobre el dinero ni sobre los contratos.

- Las estrategias Matemática, Emocional y Vínculos son orientativas: cambian el orden sugerido y
  las proyecciones que ve el usuario, y nada más.
- Elegir una estrategia no modifica cuotas, condiciones ni vencimientos, no reprograma préstamos,
  no genera un calendario de devoluciones y no ejecuta pagos.
- El simulador no registra operaciones: proyecta sobre datos existentes y lo dice en pantalla.
- El cuestionario de Vínculos alimenta únicamente la prioridad sugerida.
- No hay accesos de pago en Saneamiento. Los pagos reales se registran desde Préstamos → Debo.
- La estrategia elegida se recuerda como preferencia del usuario. No tiene efectos financieros.
- El Plan de Ataque incluye sólo préstamos activos de «Debo». No importa saldos de Tarjetas, de
  gastos recurrentes ni de préstamos de «Me deben»; una deuda de tarjeta sólo aparece si el usuario
  la registró expresamente como préstamo. Las monedas no se suman entre sí.
```

---

## 5. Qué queda materialmente pendiente

- Aplicar estos cuatro bloques en `Personal/docs/deudas/Prestamos-Saneamiento.md`. Es el único
  paso que no se puede hacer desde esta rama sin tocar un árbol ajeno.
- Nada más: el PRD de traspaso de Pareja (`odd/tasks/prd-pareja-traspaso.md`) es un documento
  independiente y completo, y las decisiones sobre Pareja siguen reservadas a ese módulo.
