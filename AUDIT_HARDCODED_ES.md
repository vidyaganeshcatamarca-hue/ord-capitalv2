# Auditoria de Hardcodeo en Espanol - Solo UI

**Alcance:** `Personal/` (codigo fuente de la app, excluyendo tests y scripts)

**Archivo permitido con espanol hardcoded:** `src/locales/es.ts`

**Filtro aplicado:** Solo mensajes visibles al usuario (UI). Texto hardcodeado en:
- JSX (entre tags, atributos, labels)
- String literals que el usuario ve (toasts, alerts, prompts)
- Valores `defaultValue` de funciones de i18n (fallbacks visibles)
- Object properties UI (`label`, `desc`, `placeholder`, etc.)

**Excluido del informe:**
- Comentarios: `//`, `/* */`, `/** */`, `{/* */}`, HTML, JSDoc, lineas de bloque
- `console.log / error / warn` (solo developer)
- `throw new Error(...)` (solo developer)
- Nombres de funciones RPC (`fn_xxx`, `p_xxx`, `rpc.xxx`)
- Identificadores de variables/campos que contienen espanol (`miVariableConCredito`)
- Tests (`tests/*`) y scripts (`scripts/*`)
- Carpetas de testeo, docs, presentaciones, HTML estatico

## Resumen

| Metrica | Valor |
|---------|-------|
| Archivos UI con hardcodeo | **6** |
| Total lineas con hardcodeo UI | **10** |

## Archivos afectados (ordenados por cantidad)

| # | Archivo | Lineas |
|---|---------|--------|
| 1 | `src\pages\Perfil\PerfilPage.tsx` | 3 |
| 2 | `src\pages\Presupuestos\PresupuestosPage.tsx` | 2 |
| 3 | `src\pages\Categorias\CategoriasPage.tsx` | 2 |
| 4 | `src\components\supervivencia\RadarAsfixiaDetalle.tsx` | 1 |
| 5 | `src\components\AddMovementModal\AddCategoryModal.tsx` | 1 |
| 6 | `src\components\AddMovementModal\AddMovementModal.tsx` | 1 |

---

## Detalle por archivo

### `src\pages\Perfil\PerfilPage.tsx`  (3 lineas)

- L20  `showToast('Sesión cerrada correctamente', 'success');`
- L22  `showToast('Error al cerrar sesión: ' + (error.message \|\| error), 'error');`
- L152  `Cerrar Sesión`

### `src\pages\Presupuestos\PresupuestosPage.tsx`  (2 lineas)

- L812  `<p>{t('budget_opcion_asignar_todo_desc', { monto: formatMonto(saldoAsignar ?? 0) }) \|\| `Mueve los ${formatMonto(saldoAsignar ?? 0)} libres aquí`}</p>`
- L1110  `{t('budget_golden_rules_modal_liquidity_info', { monto: formatMonto(liquidezActivacion) }) \|\| `Tienes ${formatMonto(liquidezActivacion)} de liquidez real. Distribución sugerida según tus % de Distribución de Ingresos:`}`

### `src\pages\Categorias\CategoriasPage.tsx`  (2 lineas)

- L15  `{ value: 'saving',     label: 'Ahorro',     desc: 'Metas, previsión' },`
- L16  `{ value: 'investment', label: 'Inversión',  desc: 'Activos financieros' },`

### `src\components\supervivencia\RadarAsfixiaDetalle.tsx`  (1 linea)

- L23  `const DIAS_SEMANA = [t('day_short_lu', {defaultValue:'Lu'}), t('day_short_ma', {defaultValue:'Ma'}), t('day_short_mi', {defaultValue:'Mi'}), t('day_short_ju', {defaultValue:'Ju'}), t('day_short_vi', {defaultValue:'Vi'}), t('day_short_sa', {...`

### `src\components\AddMovementModal\AddCategoryModal.tsx`  (1 linea)

- L99  `showToast(t('success_category_created', { defaultValue: 'Categoría creada exitosamente' }), 'success')`

### `src\components\AddMovementModal\AddMovementModal.tsx`  (1 linea)

- L86  `{ label: 'Hace 2 días',offset: 2 },`

