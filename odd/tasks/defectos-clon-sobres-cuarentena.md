# Defectos detectados fuera del alcance de Préstamos

Encontrados mientras se trabajaba en el módulo de Préstamos y Saneamiento. **No se
corrigieron**: pertenecen a otros módulos y tocan funciones compartidas. Quedan acá para
que no se pierdan y para que no se confundan con regresiones del trabajo de préstamos.

Estado de esta ficha: descripción con la evidencia que la originó. Ninguno fue
reproducido todavía con un test; el primero en tomar cada uno debe reproducirlo antes de
arreglarlo.

---

## D1 — El clon de usuario no limpia los movimientos de Sobres

**Dónde:** `fn_clonar_usuario_admin` (`supabase/migrations/20261118m_clonar_usuario_prestamos.sql`
extiende el clon; el barrido del destino es anterior).

**Qué pasa:** al clonar, la función vacía las tablas del usuario destino antes de copiar
las del origen. Esa lista de barrido no incluye `p_sobre_movimientos`, así que los
movimientos de sobre del destino sobreviven al clonado y quedan mezclados con los del
origen recién copiados.

**Por qué importa:** un clon deja de ser una copia fiel del origen. Los saldos de sobre
del destino pasan a ser la suma de dos historias distintas.

**Qué lo confirma:** `p_sobre_movimientos` tiene FK `RESTRICT` contra `p_sobres` y contra
`p_billeteras`, así que además puede bloquear el borrado de las billeteras del destino en
ese mismo barrido, según el orden.

**Cómo reproducirlo:** clonar sobre un destino que ya tenga al menos un movimiento de
sobre, y comparar el conteo de `p_sobre_movimientos` del destino contra el del origen
después del clon.

---

## D2 — `p_caja_cuarentena` choca con su índice único al clonar

**Dónde:** `fn_clonar_usuario_admin`, mismo barrido.

**Qué pasa:** si el usuario origen tiene filas en `p_caja_cuarentena`, el clonado hacia un
destino intenta insertarlas y colisiona con un índice único de esa tabla.

**Por qué importa:** el clonado falla entero y no deja copia parcial utilizable.

**Cómo reproducirlo:** cargar cuarentena en el origen, clonar al destino, observar el
error de unicidad.

---

## D3 — `p_borrar_datos_usuario`: resuelto, se deja constancia

No es un defecto abierto. Se documenta acá sólo para que nadie lo vuelva a reportar como
nuevo: la rutina de borrado de datos del usuario fallaba siempre (primero por FK
`RESTRICT` de sobres contra billeteras, después por una tabla inexistente en su lista) y
desde `20261119a`/`20261119b`/`20261119c` borra de verdad, en el orden correcto, con
verificación de post-condición y bajo la regla S15 de PIN.
