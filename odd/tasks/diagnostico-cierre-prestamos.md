# Diagnóstico de cierre — Préstamos y Saneamiento

Documento de investigación. **No contiene decisiones tomadas ni propone implementar nada.**
Los cinco capítulos están completos y verificados contra código y base.

---

## Resumen ejecutivo

**1. Mapa de acreedores.** Está roto en producción y **no lo usa nadie**: cero consumidores en
el frontend, cero llamadas desde otras RPC. Su consulta de origen menciona una columna que no
existe. No afecta a ninguna pantalla del módulo.

**2. Panel Familia.** Dos defectos reales, y **son independientes de Préstamos**: la pantalla de
Préstamos no comparte componentes ni fuentes con Familia. Uno es cosmético (nombres que caen a un
genérico); el otro es más serio: **formatea todo con ARS fijo**, o sea que puede mostrar un número
con la moneda equivocada.

**3. Los 14 fallos.** Son 14 tests en 7 archivos, y **los 14 son idénticos a los que fallan en
`origin/produccion`**. Ninguno toca el módulo. Dos son los que más ruido hacen y conviene mirar
primero: el de i18n, que compara el español contra un maestro que ya cambió, y el de settings, que
espera un mapa de iconos que no existe. El conteo pasó de 6 archivos a 14 tests porque antes se
reportaba por archivo y ahora se cuenta por test.

**4. Desvinculación.** Desvincularse **no reparte la copropiedad: la deja entera en manos del creador.** El
invitado pierde de vista todo lo compartido y el creador conserva el control. Y el balance
compartido vuelve a cero porque la conciliación de disolución se convierte en el último corte.
Hallazgo mayor: **la interfaz nunca envía `p_hogar_id`**, así que hoy no se puede crear un préstamo
compartido desde la aplicación.

**5. Borrado de datos.** La rutina cubre 44 tablas con 46 pares y **deja afuera `p_presupuestos_cierre`**
(7 filas reales, todas con usuario, cero claves foráneas): sobreviven a un reset exitoso sin error
ni aviso, porque el post-condition sólo verifica las tablas que enumera. Los bloqueos de
`p_billeteras` y `p_sobre_movimientos` que se informaron **ya no existen**: el `replica` desactiva
también los triggers de integridad. La cifra "23 tablas" no corresponde a ninguna medición
reproducible.

---

# Capítulo 1 — `fn_reporte_mapa_acreedores()`

## Situación actual comprobada

La función devuelve siete columnas pensadas para un gráfico de reparto de deuda:

```
acreedor_id bigint, nombre_acreedor text, tipo_deuda text,
monto_total numeric, porcentaje_total numeric, color text, icono text
```

Es decir: "a quién le debés, cuánto, qué porcentaje del total representa y con qué color e ícono
se dibuja". Claramente nació para una visualización, no para un listado.

**Consumidores: ninguno.** La búsqueda en todo el repositorio devuelve:

| Aparición | Qué es |
|---|---|
| `funcionesSQL/fn_reporte_mapa_acreedores.md` | su espejo |
| `start_info/indice de funciones.md:240` | el índice |
| `supabase/migrations/20261121c_*.sql` | dos anclas donde **yo** le agregué el predicado de copropiedad |
| `tests/prestamos/copropiedad-lectura-transaccional.sql:404` | una aserción **mía** que verifica sus predicados leyendo el código, porque ejecutarla es imposible |

Cero referencias en `src/`. Ninguna otra función RPC la invoca. Ningún proceso automático la llama.

## Problema o riesgo

Levanta `42703: column "posicion_cuota" does not exist`. La columna que busca no existe en
`p_compromisos_tarjeta`, cuya forma real es `compromiso_id, tarjeta_id, user_id, monto_cuota,
mes_periodo, pagado, creado_at`. El cuerpo fue escrito contra un esquema anterior de cuotas.

Consecuencia real: **ninguna**, porque no tiene consumidores. Es código muerto que falla.

## Evidencia

- Cuerpo desplegado vía `pg_get_functiondef`; el error se reprodujo dos veces en esta sesión.
- `grep -rn "mapa_acreedores"` sobre el repo, excluyendo `node_modules`.
- La aserción 31 de `copropiedad-lectura-transaccional.sql` documenta que la función no es
  ejecutable y verifica sus predicados por análisis del fuente.

## ¿Está reemplazada?

Parcialmente. El módulo nuevo cubre el **qué** pero no el **cómo se dibuja**:

| Necesidad original | Dónde vive hoy |
|---|---|
| Cuánto debo y a quién | `fn_prestamos_listar`, `fn_prestamos_resumen` |
| Reparto porcentual por acreedor | **no existe** en el módulo nuevo |
| Estrategia de ataque a deudas | `fn_saneamiento_plan` (Math / Emotional / Relationships) |
| Color e ícono por acreedor | **no existe** |

Así que la funcionalidad está **reemplazada en sustancia pero no en presentación**: el gráfico
de reparto no tiene sustituto.

## Alternativas

**Corregirla.** Reemplazar `posicion_cuota` por la agregación correcta sobre `p_compromisos_tarjeta`.
Consecuencia: hay que decidir qué debe sumar (¿cuotas impagas del período? ¿todo el saldo del
compromiso?), y eso es una decisión de producto, no técnica. Riesgo bajo: no hay consumidores que
puedan romperse.

**Conservarla sin uso.** Consecuencia: queda una función que falla y que cualquiera puede invocar
para recibir un error. No daña, pero ensucia el catálogo y engaña a quien la vea listada.

**Retirarla.** Consecuencia: se pierde el único lugar donde existe el concepto de reparto
porcentual por acreedor. Si mañana se quiere ese gráfico, se escribe de nuevo.

## Recomendación técnica (no es decisión)

No retirarla todavía. Antes conviene responder si el gráfico de reparto por acreedor está en la
visión del producto; si no lo está, retirarla es lo más honesto. Si lo está, corregirla exige fijar
primero qué suma.

## Decisión pendiente del responsable

¿El reparto porcentual de deuda por acreedor es una funcionalidad que se quiere? Sí → hay que definir
qué suma. No → retirar la función y su espejo del índice.

---

# Capítulo 2 — Errores del panel Familia

## Situación actual comprobada

Archivo: `src/pages/Familia/FamiliaPage.tsx`.

**Defecto 1 — nombres genéricos.** La pantalla declara su tipo con `deudor_nombre` y
`acreedor_nombre` (líneas 19-20) y los lee así (líneas 102-103), pero la RPC devuelve
`nombre_deudor` y `nombre_acreedor`. Al no coincidir, ambos llegan `undefined` y la línea 184-185
cae al texto genérico `familia_integrante_generico`. **No es un nombre vacío: es un genérico que
oculta el nombre real.**

**Defecto 2 — moneda fija.** La línea 53 formatea con `currency: 'ARS'` escrito a mano. Aplica a
**todos** los importes de la pantalla: saldo del balance, montos del feed, aportes y presupuesto de
proyectos. Si el hogar mezcla monedas, el número se muestra con el símbolo equivocado.

## Problema o riesgo

El defecto 2 es el que importa: no produce un saldo incorrecto en la base, pero **sí puede mostrar
un número con la moneda de otro**. Es exactamente el tipo de error que el módulo de Préstamos
decidió no cometer: cuando el contrato no informa moneda, se dice, no se inventa.

El defecto 1 degrada la información sin corromperla: se ve "un integrante" en lugar de "Ariel".

## ¿Afecta a Préstamos?

**No.** Verificado en dos frentes:

- `PrestamosParejaPage.tsx` no importa nada de `src/pages/Familia/`. Sus imports son `useHogar`,
  `formatCurrencyNumber`, `montoONoCalculable` y utilidades del módulo de préstamos.
- La sección Pareja usa `fn_reporte_hogar_balances` y `fn_prestamos_listar`; Familia usa además
  `fn_reporte_hogar_feed` y `fn_reporte_proyectos_compartidos`. Comparten **una** fuente,
  `fn_reporte_hogar_balances`, pero no los componentes ni el formateo.

Corolario: arreglar Familia no toca nada de Préstamos, y arreglar Préstamos no arregla Familia.
Comparten la RPC, y la RPC está bien: el error está en cómo la pantalla la consume.

## Evidencia

- `grep -n "deudor_nombre|nombre_deudor|ARS|formatMoney" src/pages/Familia/FamiliaPage.tsx`
- `grep -n "^import" src/pages/Prestamos/PrestamosParejaPage.tsx`
- Contrato de `fn_reporte_hogar_balances`: `RETURNS TABLE(user_id_deudor, nombre_deudor,
  user_id_acreedor, nombre_acreedor, monto_deuda)`.

## Recomendación técnica

Son dos correcciones pequeñas y de bajo riesgo, ambas dentro de `src/pages/Familia/`, sin tocar
componentes compartidos. El defecto 2 conviene arreglarlo con la misma regla que el módulo de
Préstamos ya aplica: si el contrato no trae moneda, no se inventa.

## Decisión pendiente del responsable

Confirmar que quedan **fuera del cierre** de Préstamos y se registran para el trabajo de Familia.
Si se prefiere incluirlos, el defecto 2 es el que justifica hacerlo ahora.

---

# Capítulo 3 — Los 14 fallos de la suite

## Cómo se contó

Ejecución reproducible, mismas condiciones en ambas ramas:

```
find tests -name "*.test.js" -not -path "*/node_modules/*" | sort | xargs node --test
```

**Rama actual:** 1029 tests, 1015 pasan, **14 fallan**.
**`origin/produccion` (c592f68):** 1026 tests, 1007 pasan, **19 fallan**.

La comparación es por **conjunto de nombres**, no por número. Resultado: las 14 fallas de la rama
son un **subconjunto exacto** de las de la base. Regresiones nuevas: **ninguna**.

**Por qué antes se hablaba de 6 y ahora de 14.** No cambió nada del producto: antes se contaba por
*archivo* y ahora por *test*. Siete archivos alojan catorce tests. Además, los 5 fallos extra de la
base son archivos que dependen de `node_modules` y en el worktree de comparación no estaba; pasan
en la rama, fallan allí por entorno, no por código.

## Inventario

| # | Archivo | Test | Esperaba | Obtuvo | Categoría | ¿Toca Préstamos? |
|---|---|---|---|---|---|---|
| 1 | `budget-detalle-asignacion` | la tarjeta entera abre el DETALLE, y el botón abre la asignación (S1) | clic en la tarjeta navega al detalle | "la fila abre el detalle" | Prueba desactualizada o selector cambiado | No |
| 2 | `cuarentena/un-solo-aviso` | la Home monta un solo aviso de cuarentena | un único aviso | "la Home no monta el aviso unico" | **Defecto funcional posible** | No |
| 3 | `cuarentena/un-solo-aviso` | el aviso único cuenta todo lo pendiente y abre la bandeja | conteo total + navegación | falla el conteo | **Defecto funcional posible** | No |
| 4 | `i18n/translation-ledger` | the recorded Spanish matches the master dictionary right now | ledger al día | esperaba `stale: 0` | **Prueba desactualizada**: el maestro cambió | Indirecto (i18n del módulo) |
| 5 | `i18n/translation-update` | a language with no pending work produces an empty delta | delta vacío | no coincide | Prueba desactualizada | Indirecto |
| 6 | `i18n/translation-update` | a new key and a changed Spanish are both detected | detecta ambos | no coincide | Prueba desactualizada | Indirecto |
| 7 | `i18n/translation-update` | scenario 1: the text of an existing key changed | detecta el cambio | no coincide | Prueba desactualizada | Indirecto |
| 8 | `i18n/translation-update` | scenario 2: a new key appeared | detecta el alta | no coincide | Prueba desactualizada | Indirecto |
| 9 | `i18n/translation-update` | scenario 3: a key was removed | detecta la baja | no coincide | Prueba desactualizada | Indirecto |
| 10 | `i18n/translation-update` | the update cycle ends with a ledger that says nothing is pending | cierre limpio | no coincide | Prueba desactualizada | Indirecto |
| 11 | `icon-wrappers/test-runner-exit-status` | (falla a nivel de archivo) | el runner propaga el estado | no lo propaga | **Prueba de infraestructura** | No |
| 12 | `lightModeSettings` | the settings surface never paints itself with a dark-only colour token | ningún token oscuro en claro | `GastosRecurrentesPage.css: green` | **Defecto visual real, menor** | No |
| 13 | `settingsMenu` | advanced Datos y operaciones holds hogar, presupuesto, import/export, volver a simple (S3/S9/S14) | los cuatro ítems | estructura distinta | Prueba desactualizada | No |
| 14 | `settingsMenu` | GROUP_ICONS covers every top-level group id (U1/S1) | el mapa existe | "the hub must define a GROUP_ICONS map" | **Prueba desactualizada**: el mapa no existe | No |

## Gravedad

- **Bloqueo funcional:** ninguno.
- **Defecto funcional real:** #2 y #3 (aviso único de cuarentena) y #12 (token oscuro en tema claro).
  Ninguno pertenece a Préstamos.
- **Prueba desactualizada:** #1, #4-#10, #13, #14. Diez de catorce.
- **Infraestructura de pruebas:** #11.
- **Diagnóstico incierto:** ninguno queda sin hipótesis, aunque #1 y #13 conviene confirmarlos
  leyendo el test antes de tocarlo.

## Impacto sobre el cierre del módulo

Ninguno de los 14 toca Préstamos y Saneamiento: ni una de las siete suites del módulo figura en la
lista. **No comprometen el cierre.** Sí conviene registrar que #4-#10 son la razón por la que el
candado de traducciones no está protegiendo nada hoy: un ledger desactualizado deja pasar cambios
de español sin marcarlos.

## Decisión pendiente del responsable

Ninguna para el cierre. Para el mantenimiento: ¿se corrige el ledger de i18n primero (porque es el
que vigila a los demás), o se atienden los dos funcionales de cuarentena?

---

# Capítulo 5 — Auditoría integral del borrado de datos de usuario

## Situación actual comprobada

**Cuerpo desplegado verificado hoy:** 46 pares `tabla|columna` sobre 44 tablas distintas, más un
borrado incondicional de `p_hogar_participantes`, cinco borrados condicionales de hogar, una
anonimización y dos re-inserts. El nombre muerto `p_preferencias_notificaciones` ya no aparece.

**El "23" no se sostiene.** No existe ninguna lista con 23 entradas: el espejo `.md` describe la
versión original (21 tablas, un argumento, la palabra `'BORRAR DATOS'`), y el cuerpo vigente tiene
46 pares. La cifra no corresponde a ninguna medición reproducible.

## Problema o riesgo: cuatro huecos, uno silencioso

**1. `p_presupuestos_cierre` — el hueco grave, y es silencioso.**

| Evidencia | Valor |
|---|---|
| Filas | 7 |
| Con `user_id` no nulo | 7 |
| Claves foráneas | **0** (sólo `PRIMARY KEY (cierre_id)`) |
| ¿La rutina la borra? | **No** |

Es la única tabla del universo sin ninguna constraint referencial. Como el post-condition de la
rutina sólo re-verifica las tablas que enumera, **no puede detectarla**: el usuario recibe
`borrado_datos_ok` y siete cierres de presupuesto suyos siguen en la base.

**2. Tablas de la app madre sin cubrir:** `caja`, `cuentas_egresos`, `productos`, `vendedores`.
Tienen `user_id` con FK a `usuarios`. El espejo las declara fuera de alcance por ser libros del
negocio, pero eso contradice el propósito declarado del reset: "la cuenta arranca de cero". Hoy
tienen 0 filas, así que el riesgo es teórico hasta que se usen.

**3. `admin_audit_log` y `admin_clone_destinos_permitidos`** conservan `origen_user_id`,
`destino_user_id` y `destino_user_id` sin FK. Son registros de responsabilidad administrativa, no
datos del usuario; quedan como decisión, no como omisión.

**4. Medios en storage:** `app_reportes` se borra de la tabla con triggers apagados, pero las
capturas y audios del bucket `reportes` quedan huérfanos: `fn_limpia_media_reporte` fue retirado el
2026-10-02 y la limpieza quedó sólo del lado del front.

## Por qué los bloqueos que se informaron ya no bloquean

Los cuatro `RESTRICT` de `p_sobre_movimientos` y el de su auditoría **no pueden dispararse**: el
paso 3 de la rutina hace `SET LOCAL session_replication_role = replica`, que desactiva también los
triggers de integridad referencial. El orden de la lista igual los respeta, así que sobreviviría
con triggers encendidos. Lo mismo vale para los `NO ACTION` de `p_caja_cuarentena` y
`p_gastos_recurrentes`.

El único bloqueo duro que queda es el inverso: `session_replication_role` exige privilegio, y si el
owner de la función dejara de ser `postgres`, la rutina fallaría con `42501` antes de borrar nada.

## Diferenciación de los dos procesos

| | `fn_borrar_datos_usuario` | `fn_eliminar_cuenta_usuario` |
|---|---|---|
| Palabra | `ERASE` | `DELETE` |
| Efecto | borra filas; **la cuenta sigue viva**; recrea preferencias y config de notificaciones | `deleted_at = now()+30d`, `estado_cuenta='pendiente_eliminacion'` |
| Guardia | 15 días + PIN con espera de 24 h | rechaza si ya está programada |
| Reversión | irreversible | ninguna hasta que corra el cron |
| Mecanismo | enumeración + triggers apagados | cascada con triggers encendidos, vía `fn_limpieza_cuentas_eliminadas` |

Son dos caminos con filosofías opuestas. Cualquier tabla nueva hay que agregarla al **primero**
manualmente; el segundo se entera solo por cascade.

## Matriz de tablas

Tratamiento propuesto. **Ninguno está aprobado.**

| Tabla | Módulo | Datos | ¿La borra hoy? | Dependencias | Tratamiento | Justificación |
|---|---|---|---|---|---|---|
| `p_prestamos` | Préstamos | deudas propias y compartidas | Sí (`user_id`) | `contraparte_user_id` SET NULL | Eliminar | Datos financieros propios |
| `p_prestamos_cuotas` | Préstamos | plan de cuotas | Sí | → préstamos CASCADE | Eliminar | Hijo del préstamo |
| `p_prestamos_pagos` | Préstamos | pagos y cobros | Sí | → caja CASCADE | Eliminar | Registro propio |
| `p_prestamos_vinculos` | Préstamos | respuestas de saneamiento | Sí | → préstamos CASCADE | Eliminar | Personales |
| `p_caja` | Movimientos | movimientos de dinero | Sí (2 columnas) | 9 triggers | Eliminar | Núcleo financiero |
| `p_billeteras` | Billeteras | billeteras y saldos | Sí | self-FK respaldo | Eliminar | Núcleo financiero |
| `p_caja_cuarentena` | OCR | tickets pendientes | Sí | 3 NO ACTION | Eliminar | Datos propios |
| `p_tarjetas_credito` | Tarjetas | tarjetas | Sí | — | Eliminar | Datos financieros |
| `p_cuotas_detalle` | Tarjetas | cuotas | Sí | → caja CASCADE | Eliminar | Datos financieros |
| `p_compromisos_tarjeta` | Tarjetas | compromisos | Sí | → tarjetas CASCADE | Eliminar | Datos financieros |
| `p_pagos_tarjeta_log` | Tarjetas | log de pagos | Sí | → caja CASCADE | Eliminar | Datos financieros |
| `p_ingresos` | Ingresos | fuentes de ingreso | Sí | — | Eliminar | Datos financieros |
| `p_inversiones` | Inversiones | inversiones | Sí | → billeteras CASCADE | Eliminar | Datos financieros |
| `p_estructuras_egresos` | Presupuestos | árbol de categorías | Sí | self-FK, 5 triggers | Eliminar | Configuración propia |
| `p_presupuestos` | Presupuestos | presupuestos | Sí | → estructuras/hogares | Eliminar | Datos propios |
| `p_presupuestos_config` | Presupuestos | porcentajes | Sí | — | Eliminar | Configuración |
| `p_presupuestos_historial` | Presupuestos | histórico de asignaciones | Sí | sin FK | Eliminar | Datos propios |
| **`p_presupuestos_cierre`** | Presupuestos | **cierres históricos** | **NO** | **sin FK** | **Eliminar** | **Hueco real: 7 filas sobreviven** |
| `p_gastos_fijos_config` | Presupuestos | plantilla fija | Sí | → estructuras | Eliminar | Configuración |
| `p_inyecciones_presupuesto` | Presupuestos | inyecciones | Sí | → billeteras | Eliminar | Datos propios |
| `p_gastos_recurrentes` | Recurrentes | gastos recurrentes | Sí | 2 NO ACTION | Eliminar | Datos propios |
| `p_conciliaciones` | Conciliación | conciliaciones | Sí | → billeteras | Eliminar | Datos propios |
| `p_sobres` | Sobres | sobres + `hogar_id` | Sí | UNIQUE(sobre,moneda) | Eliminar | Datos propios |
| `p_sobre_movimientos` | Sobres | movimientos | Sí | 4 RESTRICT | Eliminar | Datos financieros |
| `p_sobre_movimientos_auditoria` | Sobres | auditoría de sobres | Sí | RESTRICT | Eliminar | Auditoría propia del usuario |
| `p_hogar_participantes` | Hogar | pertenencia | Sí, siempre | → hogares | Eliminar | Es el acceso, no el dato |
| `p_hogar_pagos` | Hogar | pagos entre integrantes | Sólo si el hogar queda vacío | 2 CASCADE | **Pendiente** | Afecta el saldo del otro |
| `p_hogar_conciliaciones` | Hogar | conciliaciones | Sólo si queda vacío | CASCADE | **Pendiente** | Idem |
| `p_hogar_invitaciones` | Hogar | invitaciones | Sólo si queda vacío | 2 CASCADE | Eliminar del creador | Tokens propios |
| `p_hogares` | Hogar | cabecera | Sólo sin participantes | sin columna de usuario | Conservar mientras haya otro | Objeto compartido |
| `p_proyectos_compartidos` | Proyectos | proyectos del hogar | Sólo por hogar | → hogares | Conservar mientras haya otro | Objeto compartido |
| `p_grupo_familiar` | Familia | familiares | Sí | referenciado por `p_caja` | Eliminar | Nombres de terceros |
| `p_preferencias_usuario` | Preferencias | preferencias UI | Sí + re-insert | 2 SET NULL | Eliminar y recrear | Configuración |
| `p_config_region` | Región | región y moneda | Sí | — | Eliminar y recrear | Configuración |
| `p_config_bola_nieve` | Estrategia | config | Sí | — | Eliminar | Configuración |
| `p_config_inflacion` | Estrategia | inflación | Sí | — | Eliminar | Configuración |
| `p_historico_score_salud` | Score | histórico | Sí | — | Eliminar | Datos propios |
| `p_recordatorios` | Recordatorios | texto libre | Sí | — | Eliminar | Personales |
| `p_pin_seguridad` | Seguridad | hash de PIN | Sí | — | Eliminar | Secreto |
| `p_notificaciones_config` | Notificaciones | config | Sí + re-insert | — | Eliminar y recrear | Configuración |
| `p_notificaciones_enviadas` | Notificaciones | avisos | Sí | — | Eliminar | Personales |
| `p_legal_consentimientos` | Legal | consentimientos | Sí | — | **Pendiente** | Posible deber de conservación, sin evidencia normativa verificada |
| `p_feedback_usuario` | Soporte | feedback | Sí | — | Anonimizar | El producto sirve sin autor |
| `app_reportes` | Soporte | reportes + media | Sí (tabla) | → usuarios CASCADE | Anonimizar + borrar media | La media queda huérfana en storage |
| `app_usuario_bloqueos` | Core | bloqueos | Sí | CASCADE | Eliminar | Operativo |
| `p_referidos` | Referidos | invitador/invitado | Sí ×2 | 2 CASCADE | Anonimizar saliente, eliminar entrante | El saliente es contabilidad de growth |
| `p_app_sessions` | Telemetría | sesiones | Sí | CASCADE | Eliminar | Conducta |
| `p_telemetry_events` | Telemetría | eventos | Sí | FK `NOT VALID` | Eliminar | Conducta |
| `p_telemetry_cps_snapshots` | Telemetría | snapshots | Sí | — | Eliminar | Conducta |
| `p_telemetry_user_metrics` | Telemetría | métricas | Sí | — | Eliminar | Conducta |
| `p_webhook_queue` | Integraciones | cola | Sí | — | Eliminar | Datos propios |
| `p_ia_global_suggestions` | OCR/IA | mapeos globales | Anonimiza | CASCADE | Conservar anonimizada | Mapa compartido entre usuarios |
| `usuarios` | Identidad | la cuenta | No (correcto) | raíz | Conservar | El reset no borra la cuenta |
| `caja`, `cuentas_egresos`, `productos`, `vendedores` | App madre | libros del negocio | No | CASCADE a usuarios | **Pendiente** | Hoy 0 filas; contradice "arranca de cero" si se usan |
| `admin_audit_log`, `admin_clone_destinos_permitidos` | Admin | responsabilidad admin | No | sin FK | Conservar | No son datos del usuario |

## Orden de operaciones necesario

1. **Verificar el PIN** si la cuenta supera los 15 días. Nada se borra antes.
2. **Desactivar triggers** (`session_replication_role = replica`), que es lo que hoy hace que los
   `RESTRICT` y `NO ACTION` no disparen.
3. **Borrar igual de hijo a padre**: si algún día se quita el `replica`, el orden tiene que seguir
   siendo correcto. Hoy lo es.
4. **Hogar**: borrar la pertenencia siempre; el contenido del hogar sólo si no queda ningún otro
   participante.
5. **Anonimizar** lo que sobrevive a propósito (mapeos globales, feedback, referidos salientes).
6. **Recrear** preferencias y configuración de notificaciones.
7. **Verificar el post-condition** sobre todas las tablas enumeradas — y hoy esa verificación no
   alcanza a `p_presupuestos_cierre` porque no está en la lista.

## Recomendación técnica (no es decisión)

Agregar `p_presupuestos_cierre` es la única corrección que el inventario justifica sin discusión:
un hueco silencioso, con datos reales, que ninguna verificación detecta. Y conviene que el
post-condition recorra el universo desde el catálogo en vez de una lista escrita a mano, para que
la próxima tabla nueva no vuelva a abrir el mismo agujero.

## Decisión pendiente del responsable

1. ¿Se agrega `p_presupuestos_cierre` al borrado? (Recomendación: sí.)
2. ¿Las cuatro tablas de la app madre entran o se declaran explícitamente fuera?
3. `p_legal_consentimientos`: ¿se borra o se conserva? Requiere posición legal, no técnica.
4. Los medios del bucket `reportes`: ¿se limpian o se acepta que queden huérfanos?

---

# Capítulo 4 — Desvinculación de Pareja

## Situación actual comprobada

**Cómo nace:** `fn_inicializar_hogar` y `fn_generar_codigo_invitacion` crean el hogar con un
participante `rol='creador'`; `fn_aceptar_invitacion` suma al `rol='invitado'`.

**Cómo muere:** sólo por `fn_desvincular_pareja`, que es la única que llama la interfaz
(`src/components/ConfigHogar/ConfigHogar.tsx:111`). Y hace tres cosas:

1. exige que el llamante sea el **creador**;
2. inserta una conciliación de cierre (`tipo='disolucion'`, monto 0);
3. borra **sólo** la fila del participante `rol='invitado'`.

No borra el hogar, no limpia pagos, conciliaciones ni invitaciones, y no toca los proyectos
compartidos. **El hogar sobrevive con el creador adentro.**

**Nada pone `hogar_id` en NULL.** No existe un solo `UPDATE ... hogar_id = NULL` en el repositorio.
Todas las filas compartidas conservan su `hogar_id` después de la desvinculación.

## Problema o riesgo: la asimetría

El acceso se deriva de `p_hogar_participantes`. Al irse el invitado:

- **el invitado** queda sin hogar → su `v_hogar_id` es NULL → **pierde de vista todo lo compartido**,
  aunque las filas sigan existiendo;
- **el creador** sigue siendo miembro → **conserva acceso total** a esas mismas filas.

Es decir: desvincularse no reparte la copropiedad, la **deja entera en manos de uno**. El que se va
no puede ver, editar ni cobrar lo que era suyo en común, y el que se queda puede seguir operando
sobre ello.

Además, la conciliación `disolucion` que se inserta pasa a ser el último corte, así que
`fn_reporte_hogar_balances` **vuelve el balance a cero**: el historial de quién debía qué queda
fuera de la ventana de cálculo.

## Los cuatro tipos, tras desvincularse

| Tipo | Qué pasa hoy |
|---|---|
| **a) Privado** (`hogar_id` NULL) | Sin efecto. Sigue siendo de su dueño, íntegro. |
| **b) Compartido** (`hogar_id` seteado) | El creador conserva todo; el invitado pierde listar, editar, pagar y eliminar. La fila y sus pagos siguen vivos, inalcanzables para él. |
| **c) Con `contraparte_user_id`** | Independiente del hogar: nada lo limpia. La bandera `contraparte_integrante` pasa a `false`, así que el préstamo sale del grupo de Pareja del que se fue. |
| **d) Balance de gastos compartidos** | El invitado ya no puede invocarlo (early return). El creador lo ve en cero por la conciliación de disolución. |

**Dato que cambia el peso de todo esto:** la interfaz **nunca envía `p_hogar_id`**. La búsqueda en
`src/` sólo encuentra un comentario en `types.ts`. O sea que hoy **no existe forma de crear un
préstamo compartido desde la aplicación**: sólo llamando la RPC a mano. La copropiedad de préstamos
está implementada y probada, pero **no es alcanzable por el usuario**. Eso es un hueco de producto
que conviene mirar antes de decidir la política de desvinculación.

## Evidencia

- `funcionesSQL/fn_desvincular_pareja.md` (cuerpo), `src/components/ConfigHogar/ConfigHogar.tsx:111`.
- `grep "hogar_id = NULL"` sobre el repo: 0 coincidencias.
- Predicado de acceso en `20261121d:17-25`; `fn_prestamos_listar.md:57`.
- `grep "p_hogar_id" src/`: sólo un comentario.
- `fn_disolver_hogar` (sin llamadas desde `src/`) borra todos los participantes y deja el hogar
  sin miembros y sin código: ese hogar queda **inalcanzable para siempre**.

## Alternativas

**A — Siguen accesibles y administrables por ambos hasta su cancelación.**
Ventaja: respeta que la deuda es de los dos y no castiga al que se va. Riesgo: dos personas que
acaban de separarse conservan poder de edición y borrado sobre el mismo registro; cualquiera puede
destruirlo. Requiere que el acceso no dependa de `p_hogar_participantes` sino de una marca propia
del préstamo. Complejidad: alta, porque hoy toda la copropiedad se deriva del hogar.

**B — La desvinculación separa la administración, conservando obligaciones e historial.**
Ventaja: nadie pierde el registro de lo que pagó; cada uno conserva lectura. Riesgo: hay que
definir quién puede editar y quién sólo leer, y qué pasa con los pagos posteriores (¿a qué billetera
van?). Complejidad: media, pero exige una noción de "ex-copropiedad" que hoy no existe.

**C — Alternativas que surgen de la arquitectura:**
- **C1.** Al desvincular, copiar el préstamo compartido a cada integrante como privado, con el saldo
  pendiente congelado y el historial en sólo lectura. Ventaja: nadie pierde nada y no hay poder
  compartido después. Riesgo: duplica filas y hay que decidir qué pasa si uno sigue pagando.
- **C2.** Antes de permitir la desvinculación, **exigir que no queden préstamos compartidos vivos**
  (saldarlos o convertirlos). Ventaja: no hay estado ambiguo. Riesgo: bloquea la separación por una
deuda, que es justo cuando la gente quiere separarse.
- **C3.** Congelar el préstamo compartido: nadie edita, ambos leen y ambos pueden registrar pagos
  hasta saldarlo. Ventaja: el historial queda íntegro y el poder destructivo desaparece. Riesgo:
  hay que implementar un estado "congelado" nuevo.

## Recomendación técnica (no es decisión)

Antes de elegir política conviene resolver un hueco previo: **la copropiedad no es alcanzable
desde la interfaz**. Decidir qué pasa al desvincularse sobre algo que el usuario todavía no puede
crear es resolver el problema en el orden equivocado. Y hay una asimetría que no depende de la
política elegida: hoy el que se va pierde todo y el que se queda conserva todo, lo cual no es una
decisión sino un efecto colateral.

## Decisión pendiente del responsable

1. ¿Se habilita primero la creación de préstamos compartidos desde la interfaz, o se define la
   política de desvinculación antes?
2. De las alternativas A, B, C1, C2 o C3: ¿cuál gobierna qué pasa con un préstamo compartido cuando
   la pareja se separa?
3. La conciliación de disolución hoy **pone el balance compartido en cero**. ¿Es intencional que la
   historia de quién debía qué desaparezca del cálculo?
