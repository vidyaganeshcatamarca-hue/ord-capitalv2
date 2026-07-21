# Auditoria de Hardcodeo en Espanol - Solo UI

**Alcance:** `Personal/` (codigo fuente de la app, excluyendo tests y scripts)

**Archivo permitido con espanol hardcoded:** `src/locales/es.ts`

**Filtro aplicado:** Solo mensajes visibles al usuario (UI).

**Excluido del informe:**
- Comentarios (`//`, `/* */`, `/** */`, JSDoc, HTML)
- `console.log / error / warn` (logs de developer)
- `throw new Error(...)` (errores de developer en tests/code)
- Nombres de funciones RPC (`fn_xxx`, `p_xxx`, `rpc.xxx`)
- Tests (`tests/*`) y scripts (`scripts/*`) -- no son codigo de UI

## Resumen

| Metrica | Valor |
|---------|-------|
| Archivos UI con hardcodeo | **20** |
| Total lineas con hardcodeo UI | **63** |

## Archivos afectados (ordenados por cantidad)

| # | Archivo | Lineas |
|---|---------|--------|
| 1 | `src\components\AddMovementModal\AddMovementModal.tsx` | 11 |
| 2 | `src\pages\Home\HomePage.tsx` | 9 |
| 3 | `src\pages\Auth\AuthPage.tsx` | 5 |
| 4 | `src\pages\Tarjetas\TarjetasPage.tsx` | 4 |
| 5 | `src\pages\Presupuestos\PresupuestosPage.tsx` | 4 |
| 6 | `src\pages\Categorias\CategoriasPage.tsx` | 3 |
| 7 | `src\pages\Billeteras\BilleterasPage.tsx` | 3 |
| 8 | `src\pages\Configuracion\RegionFormatoPage.tsx` | 3 |
| 9 | `src\components\AddMovementModal\AddCategoryModal.tsx` | 3 |
| 10 | `src\pages\Perfil\PerfilPage.tsx` | 2 |
| 11 | `src\pages\Configuracion\NotificacionesPage.tsx` | 2 |
| 12 | `src\components\bcg\BCGDetalleCategoria.tsx` | 2 |
| 13 | `src\components\SideNav\SideNav.tsx` | 2 |
| 14 | `src\App.tsx` | 2 |
| 15 | `src\pages\Configuracion\PreferenciasOperativasPage.tsx` | 2 |
| 16 | `src\components\BottomNav\BottomNav.tsx` | 2 |
| 17 | `src\components\bcg\BCGScatterPlot.tsx` | 1 |
| 18 | `src\components\configuracion\AparienciaCard.tsx` | 1 |
| 19 | `src\components\EditMovementModal\EditMovementModal.tsx` | 1 |
| 20 | `src\components\supervivencia\RadarAsfixiaDetalle.tsx` | 1 |

---

## Detalle por archivo

### `src\components\AddMovementModal\AddMovementModal.tsx`  (11 lineas)

- L86  { label: 'Hace 2 días',offset: 2 },
- L956  {/* COLUMNA 2: CATEGORÍA (Solo para Gastos) */}
- L980  {/* Selector de proyectos (sólo si tiene pareja y hay proyectos) */}
- L1261  {/* Toggle compartido (Fase 4) — sólo gastos, sólo si tiene pareja */}
- L1390  {/* Cuándo (Fecha) */}
- L1482  {/* Categoría (solo para egresos) */}
- L1536  {/* Las 5 categorías más usadas recientemente */}
- L1838  {/* Cuotas si es tarjeta (Móvil) */}
- L1921  {/* Cuándo (Fecha) */}
- L1959  {/* Toggle compartido (Fase 4) — sólo gastos, sólo si tiene pareja */}
- L1992  {/* ── BOTÓN STICKY DE CONFIRMACIÓN ── */}

### `src\pages\Home\HomePage.tsx`  (9 lineas)

- L830  {/* Layout Principal de Dos Columnas en PC (Observación 1) */}
- L835  {/* ── TOTAL HERO (Observación 2) ── */}
- L854  {/* Ocultar dólares si es cero */}
- L867  {/* ── SECCIÓN DE BILLETERAS ── */}
- L904  {/* Explicación textual sutil al lado del semáforo (Observación 3) */}
- L932  {/* RECORDATORIO: Mapear preferencia global 'ocultar_fugas_misterio' a base de datos en Fase de Configuración Global */}
- L959  {/* Columna Derecha: Categorías y Actividad */}
- L961  {/* ── ANILLO / TOP CATEGORÍAS ── */}
- L1174  {/* ── MODAL CONCILIACIÓN RÁPIDA ── */}

### `src\pages\Auth\AuthPage.tsx`  (5 lineas)

- L297  {/* SLIDE 2: AUTENTICACIÓN */}
- L554  {/* SLIDE 4: TU RITMO (DÍA ANCLA) */}
- L567  {/* Selector de Día Ancla (Spinner/Grid) */}
- L588  {/* Preview Reactivo Dinámico */}
- L606  {/* SLIDE 5: CONTRATO PSICOLÓGICO */}

### `src\pages\Tarjetas\TarjetasPage.tsx`  (4 lineas)

- L543  {/* Menú contextual */}
- L582  {/* Widget de Límite Disponible */}
- L593  {/* Próximo Vencimiento */}
- L613  {/* Termómetro de Estrés */}

### `src\pages\Presupuestos\PresupuestosPage.tsx`  (4 lineas)

- L812  <p>{t('budget_opcion_asignar_todo_desc', { monto: formatMonto(saldoAsignar ?? 0) }) \|\| `Mueve los ${formatMonto(saldoAsignar ?? 0)} libres aquí`}</p>
- L1028  {/* Día ancla */}
- L1110  {t('budget_golden_rules_modal_liquidity_info', { monto: formatMonto(liquidezActivacion) }) \|\| `Tienes ${formatMonto(liquidezActivacion)} de liquidez real. Distribución sugerida según tus % de Distribución de Ingresos:`}
- L1236  {/* Botón asignar */}

### `src\pages\Categorias\CategoriasPage.tsx`  (3 lineas)

- L15  { value: 'saving',     label: 'Ahorro',     desc: 'Metas, previsión' },
- L16  { value: 'investment', label: 'Inversión',  desc: 'Activos financieros' },
- L365  {/* Barra búsqueda + botón nuevo */}

### `src\pages\Billeteras\BilleterasPage.tsx`  (3 lineas)

- L271  {/* Switcher de menús unificados */}
- L338  {/* ── LISTADO DE BILLETERAS (Grilla en PC / Lista en móvil) ── */}
- L403  {/* Divisor estético */}

### `src\pages\Configuracion\RegionFormatoPage.tsx`  (3 lineas)

- L170  {/* País e Idioma */}
- L208  {/* Formato de números */}
- L248  {/* Primer día de la semana */}

### `src\components\AddMovementModal\AddCategoryModal.tsx`  (3 lineas)

- L99  showToast(t('success_category_created', { defaultValue: 'Categoría creada exitosamente' }), 'success')
- L118  {/* Selector de Tipo de Categoría */}
- L138  {/* Rubro Padre (Solo para Subcategoría) */}

### `src\pages\Perfil\PerfilPage.tsx`  (2 lineas)

- L20  showToast('Sesión cerrada correctamente', 'success');
- L22  showToast('Error al cerrar sesión: ' + (error.message \|\| error), 'error');

### `src\pages\Configuracion\NotificacionesPage.tsx`  (2 lineas)

- L179  {/* ── Captura rápida persistente ── */}
- L217  {/* ── Categorías ── */}

### `src\components\bcg\BCGDetalleCategoria.tsx`  (2 lineas)

- L133  <strong>{formatMoneyARS(0 /* se llenaría con datos reales de la subcuenta */)}</strong>
- L230  {/* Próximamente (Etapa 5): fetch de los últimos 3 gastos en p_caja filtrados por estructura_egreso_id */}

### `src\components\SideNav\SideNav.tsx`  (2 lineas)

- L31  {/* Botón principal de acción */}
- L47  {/* Items de navegación */}

### `src\App.tsx`  (2 lineas)

- L83  {/* Navegación inferior para mobile (<768px) */}
- L149  {/* Rutas públicas */}

### `src\pages\Configuracion\PreferenciasOperativasPage.tsx`  (2 lineas)

- L109  {/* Atajos de navegación */}
- L195  {/* Automatización */}

### `src\components\BottomNav\BottomNav.tsx`  (2 lineas)

- L114  {/* FAB Central para añadir movimiento */}
- L151  {/* Botón Menú (Borde inferior derecho) */}

### `src\components\bcg\BCGScatterPlot.tsx`  (1 linea)

- L66  {/* Líneas de corte */}

### `src\components\configuracion\AparienciaCard.tsx`  (1 linea)

- L71  {/* ── Cabecera (acordeón) ── */}

### `src\components\EditMovementModal\EditMovementModal.tsx`  (1 linea)

- L423  {/* Categoría (Solo Egreso) */}

### `src\components\supervivencia\RadarAsfixiaDetalle.tsx`  (1 linea)

- L23  const DIAS_SEMANA = [t('day_short_lu', {defaultValue:'Lu'}), t('day_short_ma', {defaultValue:'Ma'}), t('day_short_mi', {defaultValue:'Mi'}), t('day_short_ju', {defaultValue:'Ju'}), t('day_short_vi', {defaultValue:'Vi'}),...

