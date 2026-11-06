# Tarjetas — corrida FULL+DEEP de cierre de cobertura (run d)

Continúa la auditoría `bx-full-tarjetas-20261030-c` sin repetirla: solo los 27 untested, 8 blocked y 3 partial.
Fixtures preparados por la UI sobre la cuenta `vidyaganeshcatamarca@gmail.com` (identidad verificada, moneda efectiva ARS).

## Specs

- **S1** — «Ejecutar una nueva corrida FULL + DEEP orientada a completar la cobertura pendiente de Tarjetas.»
- **S2** — «No repetir toda la auditoría desde cero.»
- **S3** — «Recuperar la matriz de 56 requisitos y concentrarse en los 27 NOT TESTED, 8 BLOCKED y 3 PARTIAL.»
- **S4** — «Conservar los hallazgos confirmados anteriores como antecedentes. Repetir pruebas ya realizadas únicamente cuando sea necesario por dependencias, cambios de código o verificación del estado.»
- **S5** — «Antes de ejecutar, preparar mediante la UI los escenarios de datos necesarios: tarjetas, cuotas, vencimientos, pagos, refinanciaciones y reversiones.»
- **S6** — «Las operaciones de registro financiero están autorizadas para el usuario seleccionado mediante `--user`, después de verificar su identidad. No requieren autorización individual.»
- **S7** — «Detectar la moneda efectiva del usuario. No asumir ARS.»
- **S8** — «Si alguna precondición sólo puede crearse mediante escritura directa en Supabase, describir la intervención y solicitar autorización específica antes de realizarla. Las consultas de lectura permitidas pueden utilizarse como evidencia.»
- **S9** — «Registrar estado inicial, operaciones efectuadas, persistencia, restauraciones y datos residuales.»
- **S10** — «Utilizar la nueva trazabilidad completa, incluyendo director, Hunters, llamadas individuales, presupuestos, navegador y errores.»
- **S11** — «Generar los dos informes Markdown en la carpeta del PRD: `-bugs.md`: resultados funcionales y cobertura; `-traza.md`: ejecución técnica completa de Bug Explorer.»
- **S12** — «Distinguir cobertura de esta nueva corrida y cobertura acumulada respaldada por las auditorías anteriores. No sumar requisitos duplicados ni presentar evidencias antiguas como observaciones nuevas.»
- **S13** — «No corregir código funcional de ORD Capital. No modificar el arnés durante la auditoría.»
- **S14** — «Usar los presupuestos y la concurrencia ya configurados. No repetir escenarios por el simple hecho de consumir herramientas.»

## Tasks

- **T1** · S1-S4 · Preflight (servidor, ego, identidad, moneda, recursos) y matriz de pendientes verificada · commit: n/a (auditoría)
- **T2** · S5, S9 · Preparar fixtures por UI y registrar estado inicial (tarjeta A con cierre/vence/límites, tarjeta B sin límites, 4 cuotas impagas, favor, cuota vencida) · n/a
- **T3** · S3, S6 · Hunter S-01/S-02: alta (nombre, día 32, tarjeta sin límites), edición con null y vaciado de banco · n/a
- **T4** · S3, S6 · Hunter S-03: archivar con deuda rechazado, archivar tras saldar, reactivar, sin deuda sin alerta · n/a
- **T5** · S3, S6 · Hunter S-07/S-05: resumen anterior, favor por moneda, cuota vencida crítica, bloque anterior con favor, complemento de cuotas · n/a
- **T6** · S3, S6 · Hunter S-08: objetivo anterior/actual, objetivo sin cuotas, saldo insuficiente, cuenta duplicada · n/a
- **T7** · S3, S6 · Hunter S-09/S-10: favor total, resumen real, excedente, adelanto, pago parcial + refinanciación + borrado · n/a
- **T8** · S3, S6 · Hunter S-12/S-13/S-04: carga histórica (validaciones, sin gasto, deshacer), termómetro sin capacidad y sin datos, recargo 0 vs 30 · n/a
- **T9** · S8 · S-06 (R-LM-07): describir la escritura en Supabase necesaria y pedir autorización específica · n/a
- **T10** · S9 · Restauración y datos residuales verificados · n/a
- **T11** · S10-S12 · `-bugs.md` y `-traza.md` en la carpeta del PRD, con cobertura de la corrida vs acumulada · n/a
- **T12** · S10-S13 · Telemetría, limpieza de Task Spaces, cierre del run sin tocar código ni arnés · n/a

## Log

- **L1** — Pedido del dueño, verbatim:

> # BUG EXPLORER — CONTINUACIÓN DE COBERTURA DE TARJETAS
>
> Ejecutar una nueva corrida FULL + DEEP orientada a completar la cobertura pendiente de Tarjetas.
>
> Utilizar como punto de partida:
>
> `docs/varias/ajustes/prd-tarjetas.md`
>
> `docs/varias/bug-explorer-tarjetas-bx-full-tarjetas-20261030-c.md`
>
> **No repetir toda la auditoría desde cero.**
>
> Objetivos:
>
> 1. Recuperar la matriz de 56 requisitos y concentrarse en los 27 NOT TESTED, 8 BLOCKED y 3 PARTIAL.
> 2. Conservar los hallazgos confirmados anteriores como antecedentes. Repetir pruebas ya realizadas únicamente cuando sea necesario por dependencias, cambios de código o verificación del estado.
> 3. Antes de ejecutar, preparar mediante la UI los escenarios de datos necesarios: tarjetas, cuotas, vencimientos, pagos, refinanciaciones y reversiones.
> 4. Las operaciones de registro financiero están autorizadas para el usuario seleccionado mediante `--user`, después de verificar su identidad. No requieren autorización individual.
> 5. Detectar la moneda efectiva del usuario. No asumir ARS.
> 6. Si alguna precondición sólo puede crearse mediante escritura directa en Supabase, describir la intervención y solicitar autorización específica antes de realizarla. Las consultas de lectura permitidas pueden utilizarse como evidencia.
> 7. Registrar estado inicial, operaciones efectuadas, persistencia, restauraciones y datos residuales.
> 8. Utilizar la nueva trazabilidad completa, incluyendo director, Hunters, llamadas individuales, presupuestos, navegador y errores.
> 9. Generar los dos informes Markdown en la carpeta del PRD:
>    - `-bugs.md`: resultados funcionales y cobertura.
>    - `-traza.md`: ejecución técnica completa de Bug Explorer.
> 10. Distinguir cobertura de esta nueva corrida y cobertura acumulada respaldada por las auditorías anteriores. No sumar requisitos duplicados ni presentar evidencias antiguas como observaciones nuevas.
>
> No corregir código funcional de ORD Capital. No modificar el arnés durante la auditoría.
>
> Usar los presupuestos y la concurrencia ya configurados. No repetir escenarios por el simple hecho de consumir herramientas.
>
> **Prioridad: completar la cobertura pendiente y demostrar que Bug Explorer puede generar sus propios escenarios de prueba de manera autónoma.**

- **L2** — Estado inicial verificado (30-10-2026 20:2xZ): rama `feat/i18n-pt-br`, último commit `db88831`; `src/pages/Tarjetas/` y `funcionesSQL/` sin cambios respecto del run c ⇒ los hallazgos confirmados siguen vigentes como antecedentes y solo se repiten por dependencia.
- **L3** — Moneda efectiva detectada en la app (Ajustes > Región y formato): principal **ARS · peso argentino** «derivada de tu país» 🇦🇷; segunda **USD**; tercera **BRL**; separadores miles `.` y decimal `,`; decimales por moneda ARS 0, USD 1, BRL 2. No se asume nada.
- **L4** — Identidad verificada antes de escribir: Ajustes > Cuenta y seguridad > Perfil muestra `vidyaganeshcatamarca@gmail.com`; `identityGate` devuelve `identity=match`, `dispatch=true`.
