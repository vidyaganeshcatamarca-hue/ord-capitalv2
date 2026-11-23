# Traspaso — retomar Pareja y llevar la copropiedad al resto del producto

Para la sesión que tome esto: **no vuelvas a diseñar el modelo**. Ya está decidido por el
dueño, ya está implementado en préstamos y verificado con tests. Tu trabajo es copiar el
patrón donde falta.

---

## 1. La regla, en palabras del dueño

No la reformules. Estas dos citas son la especificación:

> "Categorías, inversiones, ahorros y deudas, se pueden compartir con una pareja solo las
> que se deciden compartir, es decir, el usuario puede tener de todas ellas lo privado y
> lo compartido, y su pareja igual, lo privado y lo compartido."

> "Cuando yo comparto con la pareja una deuda o cualquier otra cosa, no lo hago para que
> esa persona pueda ver algo privado mía, sino que lo que yo comparto es compartir entre
> los dos. Los dos podemos modificar esa deuda aportando dinero."

> "Si la deuda es compartida entre los dos, los dos son dueños y se comportan como dueños,
> pudiendo hacer todas las funcionalidades que un dueño tiene sobre esa deuda."

**Compartir es copropiedad, no visibilidad.** Ese fue el error conceptual que se cometió
una vez; no lo repitas. Si escribís un comentario que diga "visible para la pareja", está
mal.

Modelo: `hogar_id` NULL = privado del `user_id`. `hogar_id` con valor = de los dos.

---

## 2. Qué está hecho y verificado

| Pieza | Estado |
|---|---|
| Columnas `hogar_id` | En `p_estructuras_egresos`, `p_caja`, `p_presupuestos` desde antes; agregadas en `p_inversiones`, `p_sobres`, `p_prestamos` por `20261121a` |
| `p_prestamos.contraparte_user_id` | FK a `usuarios`, para el caso distinto de "la contraparte ES una persona concreta" |
| Guardia de pertenencia | `20261121b`: no se puede colgar una fila de un hogar ajeno. Error `error_hogar_no_pertenece`, con clave en es/en/pt |
| Lectura de préstamos | `20261121c`: 16 funciones, 37 aserciones |
| Escritura de préstamos | `20261121d`: 5 funciones, 37 aserciones |
| Puntaje de Vínculos con dos respondedores | `20261121e`: 8 aserciones, rojo capturado antes del verde |

Tests: `tests/prestamos/copropiedad-lectura-transaccional.sql`,
`copropiedad-escritura-transaccional.sql`, `vinculos-puntaje-copropiedad-transaccional.sql`,
`compartir-por-item-transaccional.sql`. Correr con
`node tests/prestamos/run-transaccional.mjs <archivo>` — `query.mjs` no acepta un archivo
grande como argumento y `apply-sql.mjs` trunca la respuesta.

---

## 3. El patrón a copiar

**Derivación del hogar**, idéntica en todos lados:

```sql
SELECT hogar_id INTO v_hogar_id
FROM public.p_hogar_participantes WHERE user_id = v_user_id;
```

**Predicado**, tanto para leer como para escribir:

```sql
(row.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND row.hogar_id = v_hogar_id))
```

Si el llamante no tiene hogar, `v_hogar_id` es NULL, la segunda rama es falsa y todo
degrada a `user_id = v_user_id`. **Esa es la garantía de no regresión** y hay que
probarla, no argumentarla.

Implementaciones de referencia que ya estaban en el repo antes de este trabajo:
`fn_obtener_arbol_categorias` (lectura), `fn_eliminar_movimiento_caja` (escritura, con
`es_compartido AND hogar_id = ...`), `fn_transferir_entre_sobres`.

---

## 4. Lo que falta, por área

### Inversiones
Escrituras: `fn_aportar_inversion`, `fn_liquidar_inversion`, `fn_eliminar_inversion`,
`fn_actualizar_valor_inversion`, `fn_rescatar_inversion`.
Lecturas: `fn_reporte_cartera_inversiones`, `fn_reporte_estado_inversiones`,
`fn_reporte_historial_inversiones`, `fn_reporte_detalle_inversion`,
`fn_reporte_patrimonio_inversiones`, `fn_reporte_distribucion_activos`.
Ninguna acepta `hogar_id` todavía: primero hay que sumarlo a la RPC de alta/edición de
inversión, o la columna queda muerta igual que estuvo la de préstamos un rato.

### Sobres
Escrituras: `fn_sobre_aportar`, `fn_sobre_editar`, `fn_sobre_archivar`,
`fn_sobre_desarchivar`, `fn_sobre_editar_movimiento`, `fn_sobre_rescatar`,
`fn_sobre_rendimiento_registrar`, `fn_sobre_rendimiento_editar`, `fn_sobres_reordenar`,
`fn_sobres_orden_automatico`, `fn_transferir_entre_sobres`.
Lecturas: `fn_sobres_listar`, `fn_sobre_detalle`, `fn_sobre_porciones`,
`fn_sobres_reservas_virtuales`.
Ojo: `p_sobres` **no lo clona nadie** hoy (`fn_clonar_usuario_admin` no lo copia). Es un
hueco preexistente, registrado en `odd/tasks/defectos-clon-sobres-cuarentena.md`.

### Categorías
Ya tiene `hogar_id` y ya tiene lectores que lo respetan. Faltan las escrituras:
`fn_modificar_cuenta_egreso`, `fn_modificar_subcuenta_egreso`,
`fn_eliminar_estructura_egreso`, `fn_migrar_y_eliminar_estructura_egreso`,
`fn_actualizar_utilidad_subcuenta`, `fn_actualizar_flexibilidad_subcuenta`,
`fn_actualizar_calificacion_bcg`.

### Sección Pareja (frontend)
`PrestamosParejaPage` está conectándose a `fn_reporte_hogar_balances()` en paralelo a este
documento. Si llegás y sigue diciendo "no disponible", esa tarea no terminó.

---

## 5. Trampas medidas, no supuestas

- **El clon** tiene que dejar `hogar_id` en NULL al copiar: el hogar del origen no existe
  en el destino. Ya está hecho para préstamos, inversiones y sobres (`20261121a`).
- **El reset de datos** (`fn_borrar_datos_usuario`) borra por `user_id` y está bien así:
  borra mis compartidos y no toca los del otro.
- **`p_billeteras` usa `es_compartida`**, no `hogar_id`. Son dos convenciones conviviendo;
  no las unifiques sin decisión del dueño.
- **`p_prestamos_pagos` no tiene `hogar_id`.** Por eso corregir y borrar un pago quedó
  acotado a quien pagó y no al dueño de la deuda: ensancharlo dejaría reescribir el
  movimiento de caja del otro hacia la billetera propia mientras la operación sigue
  nombrando al pagador original. Decisión del dueño: **se queda así**.
- **El pagador manda.** `p_prestamos_pagos.user_id` y `p_caja.user_id` son del que llama,
  y la billetera se valida contra él. Si B paga la deuda compartida de A, la plata sale de
  B y el saldo de A no se mueve.
- **Borrar es bilateral y está bien.** Si uno quita la deuda compartida, desaparece para
  los dos. No agregues permisos ni confirmaciones que el dueño no pidió.
- **`fn_saneamiento_vinculos_responder`**: las respuestas son del préstamo, no de cada
  integrante (`p_prestamos_vinculos` es único por `prestamo_id, criterio`). Queda un límite
  conocido: una respuesta que colisionó en la fila del co-dueño conserva a ese como autor,
  así que el segundo no puede retirar esa respuesta sola. El puntaje sí es correcto.
- **El contexto de formato** del módulo de préstamos no tiene publicador: en carga fría las
  fechas salen en español en todas sus pantallas. Es un problema de raíz del módulo, no de
  una pantalla, y montar el publicador cambia además cómo se ve la moneda. **Decisión
  pendiente del dueño**, no la tomes por tu cuenta.

---

## 6. Preguntas que siguen siendo del dueño

1. ¿Los ahorros y las inversiones deben poder compartirse, o cada uno ve lo suyo? De eso
   depende que valga la pena tocar esas dos áreas.
2. ¿Qué estrategia de locale y moneda quiere para todo el módulo de préstamos?
3. `fn_reporte_mapa_acreedores()` está roto en producción (`42703 posicion_cuota`) y
   arreglarlo exige decidir qué debe sumar ese reporte.

---

## 7. Cómo verificar sin romper nada

1. Todo test nuevo va en transacción con `ROLLBACK` y con usuarios descartables creados
   adentro (`gen_random_uuid()` como `auth_id`, `creado_at` retrocedido, `modo_app`
   obligatorio, `nombre`/`login`/`password` NOT NULL). **Nunca leas ni bloquees filas de un
   usuario real.**
2. Después de cada cambio, corré las suites de `tests/prestamos/` y las de i18n.
3. El orquestador corre `npx tsc --noEmit` y la suite completa; los subagentes no.
4. Comparar contra la base: la rama tiene 14 fallos preexistentes idénticos a
   `origin/produccion`. Si aparece uno distinto, es tuyo.
