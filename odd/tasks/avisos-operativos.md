# Avisos operativos y bandeja de la campanita

Estado: implementado y en producción desde 2026-11-12.
Funciones: `fn_encolar_aviso`, `fn_notificaciones_contar` y los cinco productores.
Cron: `avisos-productores-00-utc` y `avisos-productores-12-utc` (00:00 y 12:00 UTC).

Este documento explica **qué** avisa el sistema, **cuándo** y **por qué** con esos umbrales. Sin él, dentro de tres meses nadie sabe por qué la deuda avisa a 7 días y la tarjeta a 3.

---

## Specs

### S1 — Un solo punto de encolado

Todo aviso nace de `fn_encolar_aviso`. Ningún productor escribe en `p_notificaciones_enviadas` por su cuenta.

La función:
- respeta la preferencia del usuario leyendo `cat_<categoria>` de `p_notificaciones_config` **por nombre**, así una categoría nueva no obliga a tocarla;
- es idempotente por `dedupe_key`: si el cron corre dos veces, devuelve la misma fila y no duplica;
- no la puede llamar el cliente: `EXECUTE` solo para `service_role` y `postgres`.

### S2 — Los productores no mandan texto

Mandan `tipo_notificacion` y `metadata` con los números. El cliente traduce con `resolveNotifKeys` y las claves `notif_*_titulo` / `notif_*_mensaje` de `src/locales`. Nada de español hardcodeado en el backend.

Si un tipo no está mapeado, el cliente muestra el `titulo` crudo de la fila. Por eso los productores dejan `titulo` vacío: prefiere el texto traducido, nunca el vacío.

### S3 — Productor: cuarentena

| | |
|---|---|
| Función | `fn_aviso_cuarentena` |
| Tipo | `cuarentena_pendiente` |
| Categoría | `cuarentena` |
| Mira | `p_caja_cuarentena` con `estado = 'pendiente'` y `creado_at` de más de **24 horas** |
| Dedupe | `cuarentena:<pendientes>:<fecha UTC>` |
| Prioridad | 10 |
| Vence | mañana |

**Por qué 24 horas:** el FAB del Home informa al instante, apenas el usuario mira. Si además avisáramos en el momento, sería la misma información por dos canales. El aviso mide otra cosa: *esto quedó trabado un día*. Si el usuario entra y lo resuelve, el aviso nunca nace.

**El dedupe incluye el conteo** a propósito: si después de un aviso aparece un lote nuevo de pendientes, se genera un aviso nuevo en vez de quedar silenciado.

**El desglose viene en tres contadores.** `fn_reporte_alertas_home` separa los pendientes por `tipo`: **egresos** (`expense` y `card_expense`), **ingresos** (`income`) y **otros** (transferencias y filas sin tipo). La fila del Home los suma, así que el número es el total real de movimientos esperando revisión. Antes los tres salían de un `COUNT` sin filtro y el de ingresos estaba escrito en cero a mano: el total era correcto pero el desglose mentía.

### S4 — Productor: vencimiento de tarjeta

| | |
|---|---|
| Función | `fn_aviso_vencimiento_tarjeta` |
| Tipo | `vencimiento_tarjeta` |
| Categoría | `vencimientos` |
| Mira | `p_tarjetas_credito` con `dia_vencimiento` a **3 días o menos** |
| Condición extra | la tarjeta tiene **cuotas impagas** en esa ventana |
| Dedupe | `vencimiento_tarjeta:<fecha UTC>` |
| Prioridad | 10 |

**Por qué exige cuotas impagas:** avisar que una tarjeta vence cuando no hay nada que pagar es ruido. El aviso tiene que servir para actuar.

**Por qué 3 días:** es el mismo umbral que ya usaba la alerta del Home, para que alerta y aviso no se contradigan.

### S5 — Productor: deuda por vencer

| | |
|---|---|
| Función | `fn_aviso_deuda_por_vencer` |
| Tipo | `deuda_por_vencer` |
| Categoría | `deuda` |
| Mira | `p_prestamos` con `proximo_vencimiento` entre hoy y **7 días** |
| Estados | solo `activo`, `pendiente` y `parcial` |
| Dedupe | `deuda_por_vencer:<fecha UTC>` |
| Prioridad | 15 |

**Por qué 7 y no 3:** una deuda da más margen de acción que una tarjeta; el usuario puede transferir, refinanciar o hablar con el acreedor.

**Por qué excluye `pagado`, `cancelado`, `archivado` y `refinanciado`:** no hay nada que pagar o el compromiso ya se reemplazó por otro.

### S6 — Productor: categoría en rojo (base cero)

| | |
|---|---|
| Función | `fn_aviso_categoria_en_rojo` |
| Tipo | `categoria_en_rojo` |
| Categoría | `presupuesto` |
| Mira | `p_presupuestos` del ciclo actual, donde el consumo supera `monto_limite` |
| Condición extra | el usuario está en `modo_presupuesto = 'base_cero'` |
| Dedupe | `categoria_en_rojo:<fecha UTC>` |
| Prioridad | 25 |

**Por qué solo base cero:** en modo anticipado el presupuesto es una referencia, no una asignación. Pasarse no es un problema del mismo tamaño. En base cero cada peso tiene destino, y pasarse significa que algo no se cubrió.

**Por qué replica en vez de reusar:** `fn_reporte_presupuestos_mensuales` ya calcula esto por categoría, pero depende de `auth.uid()`. El cron corre como `service_role` y no tiene usuario. **Si esa función cambia, hay que actualizar este productor.**

### S7 — Productor: ahorro en riesgo

| | |
|---|---|
| Función | `fn_aviso_ahorro_en_riesgo` |
| Tipo | `ahorro_en_riesgo` |
| Categoría | `ahorro` |
| Mira | `p_sobres` con meta y fecha, en semáforo **rojo** |
| Condición extra | el sobre está dentro de la ventana de la Definición 32 |
| Dedupe | `ahorro_en_riesgo:<fecha UTC>` |
| Prioridad | 20 |

**Semáforo rojo** = el saldo es menos del **60%** de lo esperado a esa altura del plan. Se calcula como en `fn_sobre_plan`:

```
esperado = saldo_base + (meta − saldo_base) × (días_transcurridos / días_totales)
avance   = saldo / esperado
verde ≥ 0,85 · amarillo ≥ 0,60 · rojo < 0,60
```

**Período de gracia:** el semáforo no se evalúa hasta pasados 7 días si el plazo es menor a un mes, o 1 mes en los demás casos. Antes de eso el sobre está en `plan_started` y no tiene sentido juzgarlo.

**Ventana (Definición 32, ratificada por el dueño):** 7 días de anticipación si el plazo total es menor a 6 meses; 14 días desde 6 meses.

**El aviso exige las dos cosas:** rojo **y** dentro de la ventana. Rojo lejos de la fecha todavía tiene tiempo de corregirse; cerca de la fecha sin rojo va bien encaminado.

### S8 — Alerta y aviso no se duplican

Un hecho aparece **una sola vez** en la campanita, en una de estas dos formas:

| Forma | Qué es | Se actualiza sola | Tiene hora |
|---|---|---|---|
| **Alerta** | Un estado que se calcula al abrir | sí | no |
| **Aviso** | Un registro que se entregó | no | sí |

**Cuentas desconciliadas es solo alerta.** El dueño lo decidió así: el estado vivo alcanza y un registro del mismo hecho sería leer dos veces lo mismo.

**Cuarentena es alerta y aviso, con 24 horas de diferencia.** No se siente repetido porque miden cosas distintas: uno dice "tenés 4", el otro "hace un día que tenés 4".

### S9 — La alerta de billeteras mide una sola cosa

`fn_reporte_alertas_home` cuenta las billeteras activas cuya **última conciliación tiene más de 10 días**.

Quedaron afuera, por decisión del dueño:
- **saldo negativo:** no existe la posibilidad de tener una billetera en negativo;
- **cuenta nunca conciliada:** sin una fecha previa no hay antigüedad que medir;
- **días de asfixia:** el radar no se implementa todavía, devuelve 0.

### S10 — Dos corridas por día

`fn_avisos_ejecutar` corre los cinco productores y devuelve cuántos encoló cada uno. Lo llaman dos jobs de `pg_cron`: **00:00 y 12:00 UTC**.

**Por qué dos y no una:** la app es global y "primera hora" no existe para todos los husos. Dos corridas cubren el planeta sin que nadie pase más de 12 horas sin ser evaluado. Y el `dedupe_key` diario evita que la segunda duplique: solo atrapa lo que apareció en las últimas 12 horas.

**Costo medido:** 29 ms la corrida completa con 83 usuarios. Dos por día son 58 ms diarios.

---

## Lo que NO se hace

| No se hace | Por qué |
|---|---|
| Plazo fijo vencido | `p_inversiones` no tiene fecha de vencimiento ni tipo de inversión. El dueño además lo retiró: no se necesita. |
| Días de asfixia | El radar no se implementa todavía. |
| Aviso para cuentas desconciliadas | El dueño eligió alerta sola. |
| Enganche al hogar, cuenta en rojo | Fueron descartados en la ratificación original. |

---

## Deudas conocidas

**La alerta de billeteras usa `CURRENT_DATE` (UTC).** Para husos extremos, "más de 10 días" puede correrse uno. No hay zona horaria por usuario en el modelo; solo país.

**Los productores replican lógica que vive en funciones con `auth.uid()`.** `fn_aviso_categoria_en_rojo` replica `fn_reporte_presupuestos_mensuales` y `fn_aviso_ahorro_en_riesgo` replica `fn_sobre_plan`. Si esas funciones cambian su fórmula, los productores quedan desactualizados sin avisar.

---

## Log

- **L1** (dueño, verbatim): "los avisos de cuarentena los quites las notificaciones" — retiro inicial, porque el FAB ya la informa.
- **L2** (dueño, verbatim): "Estoy repensando lo que te dije de sacarlo… Si el usuario no va a la pantalla home donde va el FAB que avisa o si entra un gasto recurrente y el usuario tiene la app cerrada y en el futuro la APK le tengo que notificar" — se reabre.
- **L3** (dueño): opción A con **24 horas**. El aviso mide persistencia, no existencia.
- **L4** (dueño, sobre billeteras): "te dije que no hay posibilidad de tener billeteras en negativo. Lo de cuentas nuevas no conciliadas tampoco iría, solo queda la frase de chequeo de conciliaciones de más de 10 días sin hacerse."
- **L5** (dueño): "Días de asfixia, no estamos implementando eso todavía."
- **L6** (dueño): "alerta" — cuentas desconciliadas queda como alerta sola, sin aviso.
- **L7** (dueño, Definición 32): "7 dias en proyectos de menos de 6 meses y 14 en proyectos de mas de 6 meses".
- **L8** (dueño): "quita esta notificacion, no la necesitamos" — plazo fijo vencido retirado.
