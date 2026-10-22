# Terminología

## El método

Un concepto, un término. En toda la app.

Las reglas, en orden de peso:

1. **El dato manda.** Los nombres de las RPC, de las columnas y de los campos
   que renderizan el texto dicen qué es el concepto en realidad. Cuando el
   español mezcla dos nombres para lo mismo, el modelo de datos elige.
2. **El código que renderiza manda sobre el dictionary.** Si un valor siempre
   se renderiza con signo negativo (`-{fmt(arrastre)}`), "saldo negativo" es
   correcto y "saldo transportado" perdería el signo.
3. **La frecuencia manda.** El término que ya está en 100 keys es el
   correcto; el que aparece en 3 es el error.
4. **El idioma ya entregado es el precedente**, pero solo si es consistente.
   Cuando el inglés está partido, el español y el modelo de datos deciden.
5. **El glosario del brief manda** sobre el criterio propio del traductor.

**Dos palabras del español no son la misma palabra.** "fuente de ingreso" y
"ingreso" son dos conceptos distintos: `fonte de renda` y `receita`.
Unificarlos contradice el brief y es un retroceso.

## Los términos que no se traducen

Son nombres de producto o de instrumentos. En todos los idiomas:

`War Room` · `Safe-to-Spend` · `Safe to Spend` · `Burn rate` · `Runway` ·
`Heatmap` · `Insight` · `BCG` · `IPC` · `CEDEAR` · `TNA` · `Renda Fixa` ·
`ORD Capital` · los códigos de moneda (ARS, USD, EUR)

Los emoji tampoco se tocan.

## Inglés (establecido)

| Español | Inglés |
|---|---|
| billetera | wallet |
| cuenta | account |
| movimiento | transaction |
| egreso / ingreso | expense / income |
| saldo | balance (`saldo actual` → current balance) |
| monto | amount |
| rubro / subrubro | category / subcategory |
| presupuesto | budget |
| sobre | envelope (budget envelope) |
| ahorro | savings |
| inversión | investment |
| tarjeta | card (`tarjeta de crédito` → credit card) |
| cuota | installment (`en cuotas` → in installments) |
| resumen de tarjeta | card statement |
| conciliación / conciliar | reconciliation / reconcile |
| pendiente de aprobación | pending approval |
| saneamiento | cleanup (the debt-cleanup module) |
| supervivencia | survival (the financial-resilience module) |
| escudo de tiempo | time shield |
| licuadora | blender (the inflation module) |
| hormigas | ants (small recurring expense) |
| podadora | mower (the expense-cutting module) |
| ROI Emocional | Emotional ROI (keep "ROI") |
| día ancla | anchor day |
| base cero | zero base |
| modo libertad | free mode (the forward-looking budget) |
| fuente de ingreso | income source |
| origen / destino | source / destination |
| corretaje / comisión | brokerage fee / fee |
| plazo fijo | fixed-term deposit |
| cedear | CEDEAR (keep the name) |

## Portugués de Brasil (establecido)

| Español | Português (BR) | Nota |
|---|---|---|
| billetera | **carteira** | nunca "bolsa" |
| cuenta | conta | |
| movimiento | **transação** | |
| egreso / ingreso | **despesa / receita** | `fuente de ingreso` → **fonte de renda** (son dos cosas distintas) |
| saldo | saldo | `saldo actual` → saldo atual |
| monto | valor | o "quantia" |
| rubro / subrubro | **categoria / subcategoria** | la jerarquía se unificó como "Subcategoria" (38 keys, 0 "Subconta") |
| presupuesto | **orçamento** | |
| sobre | **envelope** | o envelope de reserva |
| ahorro | **poupança** | |
| inversión | **investimento** | |
| tarjeta | **cartão** | `tarjeta de crédito` → cartão de crédito |
| cuota | **parcela** | **NUNCA "cota"**: en PT es otra cosa |
| resumen de tarjeta | **extrato do cartão** | una sola forma en todo el diccionario |
| conciliación / conciliar | **conciliação / conciliar** | |
| pendiente de aprobación | **pendente de aprovação** | o "quarentena" |
| saneamiento | **saneamento** | |
| supervivencia | **sobrevivência** | |
| escudo de tiempo | **escudo de tempo** | |
| licuadora | **liquidificador** | módulo de inflação |
| hormigas | **formigas** | gasto pequeno e recorrente |
| podadora | **podadeira** | |
| ROI Emocional | **ROI Emocional** | mantém "ROI" |
| día ancla | **dia âncora** | |
| base cero | **base zero** | |
| modo libertad | **modo liberdade** | |
| tipo de cupo | **tipo de alocação** | "cupo" tiene dos significados: el TIPO de categoría y el LÍMITE. El tipo es "tipo de alocação"; el límite es "Limite" |
| comprobante / recibo | **comprovante** | unificado en 6 keys: es el término financiero de Brasil |
| carga de transacciones | **Lançamento de transações** | unificado en las 4 keys de `reports` |
| cuenta madre | **Conta-Mãe** | una sola forma en todo el diccionario |
| Perro (cuadrante BCG) | **Cão** (plural **Cães**) | el framework BCG tiene la fuente en `src/lib/bcgUtils.ts`: `bcg_dog: { emoji: '🐕' }`. El español "Perro" es ese cuadrante |
| Buzón de Deseos | **Buzão de Deseos** | con tilde, 5 ocurrencias |

### Portugués de Portugal que NO entra

`cota` (cuota) · `renda` (alquiler) · `levantamento` (retiro) ·
`vencimento` (sueldo) · `telemóvel` · `fatura` (factura) · `averbamento`

Ojo: "renda" **sí** es correcto en BR para "renda fixa" (plazo fijo) y para
ingreso. El problema es "renda" para alquiler.

### Español residual en portugués: falso positivo

Estas palabras SON válidas en BR. Marcarlas da falsos positivos:

`celular` · `nenhum` · `extrato` · `cota` (en "cota de uso"? revisar el
contexto: como "cuota" de crédito está prohibida, pero la palabra existe)

Cada idioma necesita **su propia** lista de marcadores. No se comparten: una
palabra que es español residual en inglés es válida en portugués.

## Cómo armar el glosario de un idioma nuevo

1. Recorré `src/locales/es.ts` por secciones y anotá los términos de
   producto: los que aparecen en muchas keys.
2. Para cada uno, decidí el término con el criterio de arriba.
3. Escribilo en el brief **antes** de traducir, como tabla.
4. Después de la primera ronda, ajustá el glosario con lo que encontró la
   refutación: el glosario es un documento vivo dentro del task file.
5. Cada término que seunistó o se cambió, dejá escrito **por qué** y con qué
   evidencia. La próxima traducción arranca de ahí y no repite el debate.
