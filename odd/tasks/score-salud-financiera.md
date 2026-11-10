# Score de salud financiera — hallazgos y decisión pendiente

**Estado:** módulo en **pre-desarrollo**. El dueño pidió dejarlo para cuando se desarrolle.
**No tocar hasta entonces.** Este documento existe para que el trabajo futuro no empiece de cero.

## Lo que se encontró (2026-11-10)

### La especificación existe y es otra cosa

En `C:\temp\Antigravity\ORD Capital v2\Personal\start_info\Prompt_fase10.md` el score está especificado con **6 dimensiones y máximos**:

| Dimensión | Máximo | Qué mide |
|---|---|---|
| liquidez | 25 | días de escudo |
| disciplina | 25 | categorías evaluadas |
| deuda | 17.5 | ratio de deuda |
| calidad | 12.5 | porcentaje de estrellas |
| crecimiento | 10 | — |
| higiene | 10 | billeteras conciliadas sobre el total |

**No existe ninguna dimensión de ahorro en la especificación.**

### Lo implementado no coincide

`fn_reporte_score_salud_financiera` calcula 5 dimensiones con otros pesos:

| Dimensión implementada | Peso | Cómo se calcula |
|---|---|---|
| protección | 15% | `fn_reporte_escudo_tiempo()` en tramos: 180+ días → 100, 90+ → 75, 30+ → 50, resto 25 |
| presupuesto | 25% | **constante 75, nunca se calcula** |
| deuda | 25% | 0 de deuda → 100; si no, `100 − (deuda / 10000)` |
| crecimiento | 15% | **constante 50, nunca se calcula** |
| ahorro | 20% | leía billeteras con `es_fondo_prevision = true` |

Consecuencias medidas:

- **El 40% del peso del score es fijo.** Verificado que `v_score_presupuesto` y `v_score_crecimiento` sólo se declaran y se leen: no hay otra asignación en toda la función. Dos usuarios con finanzas opuestas pueden sacar casi el mismo número.
- **Faltan dos dimensiones especificadas**: calidad (estrellas) e higiene (conciliaciones).
- **"Ahorro" no estaba especificado**: lo inventó quien implementó, con un quinto del peso.
- Como no existe ninguna billetera con `es_fondo_prevision = true`, ese 20% daba **0 siempre**, y el score de todo usuario quedaba topeado en 80 sobre 100.

### Lo que se intentó y se revirtió

Se corrigió el componente de ahorro para que leyera sobres (commit `fb71fc5`, con 6 aserciones transaccionales: 0 → 50 → global 55→65 → 100 → sin meta 100 → archivado 0). **Se revirtió** (`eade5d0`, más la reversión en la base) porque:

1. La métrica no está especificada: cumple la meta declarada, e ignora el ahorro sin meta, que para el dueño es ahorro igual.
2. Decir "no hace falta convertir monedas porque es un ratio" tapaba que sumar ahorros de monedas distintas exige conversión real. La app tiene `p_cotizaciones_historico` / `valor_por_usd`, pero sólo está resuelta para dólar en `fn_reporte_safe_to_spend`.

## Lo que hay que decidir antes de escribir código

1. **¿El score sigue la especificación de 6 dimensiones, o la implementación de 5?** Son distintas en nombres, pesos y cantidad.
2. **Si se mantiene la implementación, ¿qué mide "ahorro"?** Un porcentaje necesita denominador: la meta sólo sirve para los sobres que la tienen, y un sobre libre no tiene ninguna. Las opciones que se barajaron, con el ejemplo de 100.000 de ingreso, 30.000 en un sobre con meta de 60.000 y 20.000 en un sobre libre:
   - **Ahorro sobre ingresos**: 50.000 / 100.000 = 50%. Cuenta todo. Requiere ingresos del período.
   - **Meses de cobertura**: 50.000 / 40.000 de gasto mensual = 1,25 meses. Cuenta todo, no es porcentaje.
   - **Parte del patrimonio guardada**: 50.000 / 200.000 = 25%. Cuenta todo, no requiere ingresos, pero castiga al que tiene mucha liquidez.
3. **Conversión de monedas**: cualquiera de las tres la necesita. Hoy no hay una función general de conversión, sólo la de dólar.

## Nota de alcance

El módulo de ahorro y sobres **no depende del score**. El único punto de contacto era que el score leía billeteras con la bandera vieja del modelo anterior; ese lazo quedó intacto y sin cambios, esperando este módulo.
