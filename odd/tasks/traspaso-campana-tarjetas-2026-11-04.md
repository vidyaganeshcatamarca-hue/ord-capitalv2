# TRASPASO — Campaña de pruebas y correcciones de Tarjetas (usuario 20)

> **Leer esto primero después de una compactación.** Escrito el 2026-11-04 antes de
> compactar el contexto. Todo lo que sigue está verificado contra la base desplegada o
> contra el navegador; lo que no está verificado, dice que no lo está.
>
> Documento hermano con el detalle por spec y el log de la conversación:
> `odd/tasks/tarjetas-campana-pagos-u20.md`.

---

## 1. Qué se está haciendo

El dueño pidió dos cosas en la misma tanda:

1. Encontrar la causa del único hallazgo que la auditoría de Tarjetas dejó sin resolver (**R-PG-11**,
   «adelantar cuotas futuras»).
2. Una **campaña de pruebas exhaustivas** sobre el módulo de pagos con tarjeta, contra el **usuario 20**
   (cuenta real, no sandbox), desde Ego Browser o Supabase, buscando defectos no detectados.
   Escenarios: pago mínimo y recálculo de cuotas, banco con valor distinto (mayor y menor), pagar de
   más, adelantar/asignar cuotas, cancelar cuotas futuras, casos de rotura.

Regla que agregó después: **arreglar cada bug a medida que aparece**, porque el arreglo puede cambiar
las pruebas siguientes.

## 2. Entorno

| Qué | Dónde / cómo |
|---|---|
| Worktree de trabajo | `C:\temp\Antigravity\ORD Capital v2\Personal-2`, rama `fix/tarjetas-moneda-y-textos` |
| Server local de pruebas | **http://localhost:5175** (`npm run dev -- --port 5175 --strictPort`, job de background) |
| Ojo | el **5173 lo sirve `Personal-3`**, que NO tiene estos arreglos |
| Perfil de Ego Browser | `Profile 7` «bug-explorer» (`profiles()` lo lista; `taskSpace(name, { profileId })`) |
| Espacio del agente | `campana-pagos-u20` (id 4), página `p1`. Todas las pruebas **en móvil**: 390x844 vía `Emulation.setDeviceMetricsOverride` |
| Cuenta | usuario **20** · `auth_id 742e8a18-5d39-4f32-ac30-1d43f838c932` · `arielderenovsky@yahoo.com` · login **por mail**, no Google (funciona en localhost) |
| Guard de identidad | antes de escribir, leer `localStorage` (`*-auth-token`) y comparar `user.id` con ese `auth_id`. La auditoría anterior tuvo una escritura cruzada por confiar en el perfil |
| Scripts de Ego | `scratch/ego-campana-u20/round-NN.mjs`, se corren con `ego-browser nodejs < archivo`. Refrescar `setDeviceMetricsOverride` en cada round |
| SQL | `scratch/*.mjs` + `.sql`; `node scratch/run.mjs ./archivo.sql` ejecuta vía Management API (lee `.env.local`) |
| Espejos de funciones | viven en `Personal/funcionesSQL/` (gitignoreado). Se actualizaron varios; ver §6 |

**Credenciales:** en `.env.local` (`ACCESS_TOKEN`, `VITE_SUPABASE_URL`). La clave del usuario 20 la dio
el dueño en el chat y **no se copia a ningún archivo**.

## 3. Línea base del usuario 20 (para verificar reversiones)

| Dato | Valor |
|---|---|
| Tarjetas | 953 MC BNA · 954 MC UALA · 955 AMEX · 956 NARANJA X · 957 VISA BNA |
| Cuotas impagas al inicio | 953: 31 · 954: **5** · 956: 6 · 957: 1 (ver §3.1) |
| Saldo a favor | 956: 95.152,43 · 957: 1.127.369,15 · 954: 0 |
| Billetera usada para pagar | **1794 «lemon»** (ARS 2.024.096,00) |
| Cuotas de la 954 | 6472 (34.333,33 · 7/11) · 6473 (34.333,33 · 7/12) · 6496 (48.000 · 7/12) · 6474 (34.333,33 · 7/1/27) |

**Revertir un pago:** `fn_eliminar_pago_tarjeta_grupo(p_pago_caja_id)` como el usuario, y después
verificar: cajas del pago y sus ajustes en 0, cuotas de vuelta a impagas, billetera exacta, favor 0,
`p_pagos_tarjeta_log` sin la fila.

### 3.1 Corrección de datos del 2026-11-04 (autorizada por el dueño)

Cuotas **948** (user 30, tarjeta 8) y **6500** (user 20, tarjeta 954), ambas 48.000 con vencimiento
2026-11-07, estaban `pagado = true`. El dueño indicó dejarlas impagas en las dos cuentas: dentro de un
ciclo no puede convivir una cuota paga con una pendiente salvo que sea un adelanto.

- Estado después: 954 queda con **5 impagas** y deuda **199.000,00**; tarjeta 8 del user 30 igual.
- Billetera lemon 1794 intacta en **2.024.096,00**; favor de la 954 en 0.
- **Revertir:** `update p_cuotas_detalle set pagado = true where cuota_id in (948, 6500);`
- ⚠️ `pago_caja_id IS NULL` **no** prueba que no hubiera pago: en el user 30 hay 24 cuotas pagadas y
  **ninguna** tiene caja; en el user 1 hay 199 sin caja. La columna nunca se pobló en el histórico.

## 4. Lo desplegado en Supabase (todo probado con transacciones revertidas)

| Cambio | Función | Qué hace |
|---|---|---|
| **C-N1** | `fn_gestionar_compra_cuotas` (5 args) | ya no escribe `'ARS'` fijo: lee `moneda_iso` de la tarjeta y cae a la moneda del usuario |
| **C-N2** | `fn_registrar_gasto_tarjeta` (10 args) | `IF NOT FOUND` → `error_card_not_found`; no inventa ciclo ni escribe sobre tarjetas ajenas |
| **F-04** | `fn_reporte_termometro_tarjeta` | la próxima cuota se calcula **antes** del corte por antigüedad; con menos de 30 días ya no muestra 0 |
| **F-10** | `fn_editar_tarjeta_credito` | `banco = CASE WHEN p_banco IS NULL THEN banco ELSE NULLIF(p_banco,'') END`: se puede borrar el banco |
| **H1** | `fn_liquidar_ciclo_tarjeta_multi` | el refinanciado exige **≥ 1 unidad**: ni el redondeo del modal (0,0033) ni un pago corto por centavos crean una cuota |
| **R-PG-11** | `fn_registrar_pago_tarjeta_multi` | la validación del adelanto corre **antes** de liquidar; adelantar la próxima cuota ya no devuelve «cuota inválida» |
| **S8** | `fn_registrar_pago_tarjeta_multi` | si el usuario declara resumen real del banco, el pago debe cubrirlo: si no, `error_resumen_real_no_cubierto` |
| **S8b** | `fn_registrar_pago_tarjeta_multi` | la diferencia contra el banco es **gasto** (ajuste), nunca saldo a favor; solo lo pagado **por encima** del resumen va a favor |
| **B** | `fn_liquidar_ciclo_tarjeta_multi` + pago | con resumen declarado, las cuotas del resumen se **saldan enteras** y el faltante **no se refinancia** (`p_no_refinanciar`); la diferencia se corrige hacia abajo con un ajuste de **ingreso** en `cat_card_diff` |
| **F-37** | `fn_registrar_pago_tarjeta_multi` + trigger `fn_t_limpiar_dependencias_caja` | la cuota adelantada **conserva** `p_caja_id` (vínculo con la compra) y la reversión la **desmarca** en vez de borrarla; `cuotas_adelantadas` del log se vuelve a impaga. Antes se borraba la cuota y se corrompía el compromiso del mes |

⚠️ `fn_liquidar_ciclo_tarjeta_multi` cambió de firma: ahora tiene un 10º parámetro
`p_no_refinanciar boolean DEFAULT false`. **La versión de 9 argumentos fue eliminada** (solo la llamaba
`fn_registrar_pago_tarjeta_multi`, actualizada en la misma transacción).

## 5. Commits (rama `fix/tarjetas-moneda-y-textos`)

```
286fadd feat(tarjetas): require the payment to cover the declared bank statement
c1af0fe fix(tarjetas): require a whole unit before announcing a payment surplus
cdf3dc1 fix(tarjetas): let the user clear a card's bank
787b226 fix(tarjetas): render the archive confirmation text instead of its source
639b646 fix(tarjetas): reject out-of-range closing and due days in the card form
9727a2f feat(i18n): add error_card_not_found in es, en and pt
1548541 fix(tarjetas): use the user's local currency in the stress thermometer
67cf2e9 fix(format): never publish an unresolved format context
```

`tsc --noEmit` verde en todos. **No se hizo push ni cherry-pick** (falta decisión del dueño).

## 6. Verificaciones hechas (y con qué)

- **C-N1**: barrido global tarjeta vs cuota (única discordancia: las 6 cuotas del fixture, ya borradas);
  A/B con y sin el cambio en transacción revertida.
- **C-N2**: tarjeta inexistente → `error_card_not_found`; tarjeta ajena → idem; tarjeta propia → crea.
- **F-08**: A/B en **producción** con la cuenta 198, con capturas; el bloque detrás del modal pasaba de
  `495,833.33 GBP` a `495.833 ARS`.
- **F-01**: **descartado** con números: el total de deuda cierra al centavo; el «25,01» era comparar
  deuda total contra consumo del ciclo.
- **R-PG-11**: pago + adelanto de la cuota propia → aceptado; cuota ajena e inexistente → rechazadas.
- **H1**: 3 transacciones separadas: exacto → 0; corto por 0,50 → 0; faltante real → refi exacto.
- **S8**: banco 40.000 + pago 34.333 → rechazo; pago 40.000 → acepta. En **móvil/5175** el confirm queda
  deshabilitado con «faltan $ 5.667» y ya no aparece el aviso viejo.
- **B**: banco 30.000 + pago 30.000 → cuota saldada, refinanciado 0, ajuste de ingreso 4.333,33, favor 0.
  Regresión: banco mayor sigue dando egreso (5.666,67); sin resumen declarado no hay ajustes.

## 7. Pendiente

**Decisiones abiertas**
- **#20**: con banco 80.000 y pago 80.000 se asentó un **egreso de 45.666,67** porque la ventana solo
  saldó la cuota del 7/11 (las de diciembre son del resumen siguiente). Confirmar si es lo esperado.
- **#13**: la cifra «Installments» por tarjeta no cuadra: MC UALA muestra **−ARS 34.333**, NARANJA X
  muestra **0** con 401.192 impagos, VISA BNA muestra el límite completo. Falta determinar la métrica.

**Escenarios de la campaña sin ejecutar**: pagar de más con banco igual (#7), pagar de más con banco
distinto (#8), adelantar/asignar cuotas (#9), cancelar cuotas futuras (#10), casos de rotura (#11),
reversión final y comparación contra la línea base (#12).
- **#16**: probar si elegir la cuenta descarta el importe a pagar tipeado (el campo del banco sí acepta
  el tipeo real; la selección de `lemon` por script no registró el click, hay que resolver el selector).

**Deuda de espejos**: `Personal/funcionesSQL/fn_liquidar_ciclo_tarjeta_multi.md` y
`fn_registrar_pago_tarjeta_multi.md` quedaron en la versión de **R-PG-11/H1**: les falta S8, S8b, B y el
parámetro nuevo.

## 8. Modelo del resumen del ciclo (decidido por el dueño, 2026-11-04)

Reglas que gobiernan toda corrección de este módulo:

1. **La app es un registro de gastos.** El banco factura **un resumen por ciclo, por tarjeta**.
2. **Dos puertas, no una lista:** «pago resumen anterior» y «pago resumen actual». Botones distintos,
   caminos distintos, el mismo modal. El usuario **no** elige de una lista de resúmenes.
3. **El resumen se cancela entero**: se imputan todas las cuotas del ciclo. No se cancelan cuotas sueltas.
4. **Dentro de un ciclo no convive una cuota paga con una pendiente**, salvo que el usuario haya
   adelantado una. Cualquier otro caso es un error de ciclo.
5. **Una cuota adelantada queda fuera del resumen siguiente**: ya está paga, no vuelve a entrar.
6. **El número del banco es el total del resumen del ciclo** y manda para el gasto registrado: si el
   banco cobró 80.000 sobre un registro de 82.333,33, se registran 80.000 y las cuotas valen 82.333,33.
7. **La diferencia se registra como ajuste aparte** (opción A, categoría `cat_card_diff`), nunca
   reescribiendo el monto de las cuotas: el descuento del banco es un hecho del banco, no una
   modificación de la compra.
8. **El descuento aplica al total del resumen**, no a una cuota puntual.
9. **Si el banco cobró más**, incluye cuotas viejas que el usuario no cargó: esa plata **salió de verdad**
   y se registra como gasto real, no como saldo a favor.
10. **La plata que sale de la caja coincide con lo que el banco cobró**, no con lo que dice el registro.

**Implementación pendiente:** hoy el número del banco se compara contra la **suma de impagas de la
ventana**, y debe compararse contra el **total del resumen del ciclo**. El backend ya expone ambos
números (`resumen_anterior_total_*` y `resumen_anterior_a_pagar_*`).

## 9. Cómo retomar

1. Leer este archivo y `odd/tasks/tarjetas-campana-pagos-u20.md` (log L1–L6).
2. Verificar que el server local sigue vivo: `curl -sf http://localhost:5175/` (si no, relanzarlo).
3. Reabrir el espacio de Ego `campana-pagos-u20` y **volver a verificar la identidad** antes de escribir.
4. Medir la línea base del §3 y comparar: si algo no coincide, **revertir antes de seguir**.
5. Continuar por la lista de pendientes del §7, en el orden que el dueño indique.
