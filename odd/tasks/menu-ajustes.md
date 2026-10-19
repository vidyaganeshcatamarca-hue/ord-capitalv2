# Feature: menu-ajustes — Reorganización del menú Ajustes por modo (Simple/Avanzado)

Estado: **SPEC aprobada por el dueño** (S18 y L7 agregados tras la aprobación, a su pedido). La implementación NO está autorizada; todo cambio de código, de filas en Supabase o de RPC requiere OK explícito.
Fuentes: `DOCS/varias/menu_ajustes.md` (PRD orientativo, no vinculante) + decisiones del dueño registradas en `## Log` (verbatim).

## Specs

### S1 — Alcance y principio general
> "Solo trabajamos a nivel de planificación. Toma esto en cuenta para tomar el PRD como sugerencia planificadora, pero no como elemento 100% a ejecutar."

Reorganizar Ajustes en dos árboles por modo: **Simple** y **Avanzado**. Reutilizar los módulos actuales; solo cambia ubicación, nombre visible y visibilidad por modo. Todo submenú conserva su interior actual salvo indicación expresa de esta spec.

### S2 — Árbol Simple
```text
Ajustes (Simple)
├─ Cuenta y seguridad
│  ├─ Perfil (interior actual: nombre, correo, cerrar sesión)
│  └─ Borrado: Borrar mis datos / Borrar la cuenta (regla S15)
├─ Preferencias
│  ├─ Región y formato (interior intacto + bloque Monedas reservado · S18)  — L15: + Carga y registro abajo
│  ├─ Carga y registro (L15: dueño 2026-10-19 — visible TAMBIÉN en Simple)
│  └─ Apariencia (interior intacto)
├─ Ayuda y soporte
│  ├─ Reportar un problema o sugerencia
│  ├─ Mis reportes
│  └─ Tour Guiado
├─ Aplicación
│  ├─ Instalar la app
│  ├─ Mantenimiento
│  └─ Acerca de (Versión · Legal · Plan/Suscripción ✦)
├─ Pasar a Avanzado (oculto si avanzado_disponible = false · L15: con modal de confirmación)
├─ Invitar a un amigo (deshabilitada · Próximamente)
└─ Calificar ORD (deshabilitada · Próximamente)
```

**L15 (2026-10-19, verbatim, dos correcciones del dueño durante el test):**
1. "lo que tienes como carga y registro, aparece en modo avanzado, pero deberia estar en modo simpole" → S2: Carga y registro entra al árbol Simple.
2. "pasar a avanzado merece una confirmacion que evite pasar por error" → S9: la activación pasa por ConfirmModal.

### S3 — Árbol Avanzado
```text
Ajustes (Avanzado)
├─ Cuenta y seguridad
│  ├─ Perfil (interior actual)
│  ├─ Protección con PIN / huella ✦
│  └─ Borrado: Borrar mis datos / Borrar la cuenta (regla S15)
├─ Preferencias
│  ├─ Región y formato (interior intacto + bloque Monedas reservado · S18)
│  ├─ Apariencia (interior intacto)
│  ├─ Notificaciones (interior intacto)
│  └─ Carga y registro
│     ├─ Billeteras predeterminadas (ingreso/egreso)
│     ├─ Movimiento predeterminado (egreso/ingreso)
│     ├─ Orden de billeteras (valor/alfabeto)
│     ├─ OCR (on/off)
│     └─ Voz (on/off)
├─ Datos y operaciones
│  ├─ Configuración del hogar
│  ├─ Presupuesto y ciclo (incluye su toggle "Base cero como inicio")
│  ├─ Importar y exportar movimientos (incluye respaldo y exportación de backups)
│  └─ Volver a Simple
├─ Ayuda y soporte
│  ├─ Reportar un problema o sugerencia
│  ├─ Mis reportes
│  └─ Tour Guiado
├─ Aplicación
│  ├─ Instalar la app
│  ├─ Mantenimiento
│  └─ Acerca de (Versión · Legal · Plan/Suscripción ✦)
├─ Invitar a un amigo (deshabilitada · Próximamente)
└─ Calificar ORD (deshabilitada · Próximamente)
```
✦ = marcado "Próximamente"; no se desarrolla en esta fase.

### S4 — Voz y cuarentena pertenecen a Simple
> "Voz nace con basic y solo se puede ocultar en full. cuarentena tambien es de basic. Habian nacido como intermedias, pero ya no es necesario, ya que si o si deben permanecer en basic."

- Voz siempre disponible en Simple; su toggle existe únicamente en Avanzado → Carga y registro.
- Cuarentena disponible en Simple sin depender de `voz_activada`.
- Cambio de clasificación (**requiere autorización explícita**): filas `app_feature_flags` `menu_carga_voz` y `menu_cuarentena` pasan de `intermedio` + `pref_key='voz_activada'` a `simple` con `pref_key = NULL`. El nivel `intermedio` queda sin uso.

### S5 — Eliminación de OCR autoaprobar
> "si desactivar y eliminar, no deberia existir esa opcion."

- Se elimina el toggle y el comportamiento de autoaprobación OCR de Carga y registro.
- Los valores ya guardados no pueden dejar la autoaprobación activa (normalización a definir en el plan, con autorización).

### S6 — Protección con PIN / huella (placeholder)
> "son funcionalidades a desarrollar en breve . Deja el placeholder vacio (proximamente) asi ya queda organizada la estructura aunque no esten las funcionalidades"
> "corrijo: Pin y huella es del modo avanzado, no va en modo simple."

- Entrada con marca Próximamente, **solo en Avanzado**, dentro de Cuenta y seguridad. No se desarrolla en esta fase. Patrón vigente a reutilizar: pill `config_coming_soon`.

### S7 — Plan / Suscripción (placeholder)
> "plan / suscripcion va en acerda de"

- Vive en Acerca de, en ambos modos, como placeholder Próximamente. No aparece en Cuenta y seguridad.

### S8 — Invitar a un amigo y Calificar ORD
> "si, invitar y calificar quedaran a nivel de los menus de ajustes primarios"

- Entradas raíz al nivel de los menús primarios, mismo patrón visual de fila/tarjeta, deshabilitadas con Próximamente hasta que exista su funcionalidad.
- El bloque de "acciones rápidas" desaparece de Acerca de (la sugerencia queda cubierta por S12).

### S9 — Cambio de modo asimétrico
> "si" (respuesta a la propuesta: asimetría del PRD + ocultamiento si el avanzado no está disponible)

- Simple: "Pasar a Avanzado" como entrada raíz destacada; se oculta si `avanzado_disponible = false` (comportamiento actual de `ModoAppCard`).
- Avanzado: "Volver a Simple" dentro de Datos y operaciones.
- Reemplaza a `ModoAppCard` ("Experiencia de Uso"), hoy huérfano (ningún componente lo renderiza).

### S10 — Terminología visible
> "simple / avanzado en todos lados"

- La UI habla de Simple y Avanzado. "Basic/Full" del PRD es vocabulario interno de planificación, nunca copy visible.
- Toda cadena nueva o renombrada va por `t()` y vive en `src/locales/es.ts` (regla i18n del proyecto; prohibido hardcodear español).

### S11 — Tour Guiado
> "En ayuda y soporte, tienes que agregar un menú que se llame Tutoriales, que es lo que hoy figura como ayuda y que hace el tour por las diferentes pantallas. En lugar de tutoriales, que se llame Tour Guiado."

- Entrada "Tour Guiado" en Ayuda y soporte (ambos modos), mapeando al flujo existente `/ayuda` → `HelpIndexPage` (tour por pantallas).
- El acceso actual desde el menú móvil (BottomNav) se mantiene; fuera del alcance de esta spec.

### S12 — Reportar un problema o sugerencia
- Renombre del módulo actual "Reportar un problema"; mismo módulo (hoy ya incluye el flujo de sugerencias en el mismo formulario); "Mis reportes" sin cambios de interior.

### S13 — Interiores intactos
- Región y formato: país (solo lectura), idioma, decimales, separadores, primer día de semana, formatos de fecha/hora; más el bloque reservado Monedas (S18). El resto del interior intacto.
- Apariencia: tema, tamaño de fuente, ocultar montos, mostrar/ocultar Misterio.
- Notificaciones: 12 categorías; solo en Avanzado (hoy `config_notificaciones` ya está clasificada `avanzado` en la tabla viva).
- Importar/exportar: wizard intacto; en Datos y operaciones; cubre respaldo y exportación de backups.
- Presupuesto y ciclo: intacto, con su toggle "Base cero como inicio"; en Datos y operaciones.
- Legal en Acerca de se mantiene con su estado actual (próximamente).

### S14 — Billeteras, categorías y hogar
- Billeteras y categorías de egresos: fuera de Ajustes (viven en Cuentas); se eliminan los atajos de Carga y registro.
- Hogar: pasa a Datos y operaciones; su botón de retorno debe actualizarse (hoy vuelve a Operativas).

### S15 — Borrado en Cuenta y seguridad (ambas opciones, misma regla)
> "Lo único que agregaría sería la eliminación de la cuenta en la parte de seguridad tal como lo propones. [...] Borrar la cuenta, simplemente se archiva la cuenta por 30 días. Y otra cosa es borrar los datos, que es que la cuenta permanece, pero arranca de cero con datos frescos. Yo te estoy hablando de borrar los datos. Los primeros 10 días el usuario puede hacer sin pin. Pasados los 10 días, el usuario para borrar los datos tiene que poner el pin que ya tiene que haber configurado en el modo avanzado."
> "ambas bajo la misma regla"

- Nueva entrada en Cuenta y seguridad (ambos modos) con DOS opciones bajo la misma regla:
  - **Borrar mis datos**: la cuenta permanece; los datos arrancan de cero.
  - **Borrar la cuenta**: archiva la cuenta 30 días (reutiliza `DeleteAccountCard` / `fn_eliminar_cuenta_usuario`, que hoy agenda el borrado con fecha futura).
- Regla de acceso (ambas opciones): primeros 10 días de uso → sin PIN; desde el día 11 → exige el PIN de seguridad configurado en modo Avanzado (protección contra borrados ajenos desde otro teléfono).
- **Propuestas a confirmar en esta revisión:**
  - (a) Anclaje de los 10 días = fecha de alta del usuario.
  - (b) Transición hasta que el PIN exista: pasados los 10 días sin PIN configurado, la entrada queda bloqueada con hint "configurá tu PIN en modo Avanzado".
- **Pendientes para el plan (con autorización explícita):** RPC nueva para "borrar mis datos" (no existe; se propondrá SQL para tu OK); espejo faltante de `fn_eliminar_cuenta_usuario` en `funcionesSQL/`.

### S16 — Integración con app_feature_flags
- Los grupos del nuevo Ajustes son composición de navegación por modo (`settingsMenu.simple` / `settingsMenu.full` en el front); no se crean filas por grupo en la tabla.
- `app_feature_flags` sigue gobernando visibilidad por funcionalidad (nav y pantallas), con los cambios de S4.
- El hub actual no aplica filtrado por modo; el nuevo lo aplica según `modo` de `fn_obtener_modo_app`.
- Corrección documental pendiente (con OK): el bloque SQL de `funcionesSQL/fn_obtener_modo_app.md` está desactualizado; la rev.4 con filtro de bloqueos está desplegada y fue verificada en vivo.

### S17 — Fuera de alcance
- Desarrollar PIN/huella, suscripción, invitar, calificar y contenido de Legal.
- Rediseño visual de interiores; cambios funcionales de Región y formato, Notificaciones, Presupuesto y ciclo, Importar/exportar.
- El acceso a Ayuda/Tour Guiado desde el menú móvil (se mantiene como está).
- La selección y configuración de segunda y tercera moneda: desarrollo paralelo del agente P3; esta spec solo reserva su lugar (S18).

### S18 — Espacio reservado para monedas en Región y formato (coordinación con P3)
> "la segunda moneda se va a poder configurar tanto elegir otra moneda como lo que ya está que son los decimales y los separadores de miles va a haber una tercera moneda que también se va a poder configurar que arranca vacía pero que también va a tener ese espacio de configuración en la configuración regional"

- Región y formato (Preferencias, ambos modos) conserva su interior actual y gana un bloque reservado **Monedas** con tres slots:
  - **Moneda local**: derivada del país; no configurable desde Ajustes (como hoy).
  - **Segunda moneda**: hoy fija en dólares con sus decimales/separadores; el desarrollo paralelo de monedas la hará seleccionable, conservando el formato existente.
  - **Tercera moneda**: espacio reservado que arranca vacío; selección y formato propios (desarrollo del agente P3).
- Esta spec **solo reserva el lugar** y define el punto de integración; NO desarrolla la lógica de selección de monedas.
- Punto exacto de integración para P3: página de Región y formato (ruta `/configuracion/region`, `src/pages/Configuracion/RegionFormatoPage.tsx`), dentro de Preferencias en ambos árboles.
- Feature doc paralelo de P3: `odd/tasks/monedas-extra-libres.md` (rama `pi/sesion-3`, pausado por el dueño al 2026-10-16). Alineación verificada: extras solo en Configuración (S12 de ese doc), 2ª=USD preseleccionada, 3ª vacía y decimales por moneda (S22) coinciden con este S18.
- Independencia: el desarrollo de P3 no depende de esta reorganización ni viceversa; los placeholders quedan documentados aquí y asentados en Engram.

## Tasks (propuesta — sujeto a la conversación de plan)

| ID | Specs | Ruta | Commit |
|----|-------|------|--------|
| T1 | S1, S2, S3, S9, S10 | Definición `settingsMenu.simple/full` + hub filtrado por modo | pendiente (plan no acordado) |
| T2 | S2, S3, S6, S7, S8, S11, S12, S13, S14 | Grupos: Cuenta y seguridad, Preferencias, Datos y operaciones, Ayuda y soporte, Aplicación | pendiente |
| T3 | S15 | Entrada de borrado (ambas opciones) con regla gracia 15 días + PIN | ca92592 |
| T4 | S5 | Eliminación front de OCR autoaprobar | pendiente |
| T5 | S4, S5, S15, S16 | Backend con autorización explícita: filas feature flags, normalización autoaprobar, RPC borrar datos, espejos | pendiente |
| T6 | S10, S12, S17 | i18n `es.ts` (claves nuevas y renombres) + gate `check-i18n` | pendiente |
| T7 | S18 | Bloque Monedas en Región y formato: placeholders reservados sin lógica de monedas (integración P3) | pendiente |

## Log

- **L1** (pedido original, verbatim): "1. vamos a trabajar con el menú de ajustes vas a leer un PRD en tu carpeta DOCS/varias/menu_ajustes.md . Este documento contiene decisiones que he tomado con mi as istente, más él no conoce el estado interno de la app ni del código, así que puede haber algunas diferencias. Solo trabajamos a nivel de planificación. Toma esto en cuenta para tomar el PRD como sugerencia planificadora, pero no como elemento 100% a ejecutar. Todas las diferencias que tengas con él, las vas a charlar conmigo y vamos a ir definiendo juntos. Quiero que a la vez evalúes la tabla de Superbase que organiza los diferentes tipos de menúes en su calificación, si son full o si son básico. Para que integremos esa tabla con este nuevo formato de reorganización del menú de ajustes de la app, Usar Skill Brainstorming para todo tipo de consultas que debas hacerme . Antes de tocar cualquier cosa nos ponemos de acuerdo, hacemos la spec y planificamos juntos."
- **L2**: PRD leído como sugerencia planificadora; nunca como autorización.
- **L3**: Exploración local: hub compartido sin árboles por modo; `app_feature_flags` clasifica funcionalidades (sin jerarquía ni rutas); `ModoAppCard` y `PerfilPage` huérfanos; `DatosCard` huérfano; rutas de Ajustes sin `FeatureRoute` (ocultar entradas no bloquea URLs).
- **L4**: Verificación Supabase (solo lectura, autorizada): 21 filas en `app_feature_flags` (voz/cuarentena hoy `intermedio` con `pref_key='voz_activada'`; `config_notificaciones` avanzado); `fn_obtener_modo_app` desplegada = rev.4 con filtro de `app_usuario_bloqueos`; `modo_avanzado_habilitado = false`; `app_usuario_bloqueos` existe.
- **L5**: Decisiones del dueño (verbatim en cada S#): voz y cuarentena de Simple (S4); eliminar OCR autoaprobar (S5); placeholders PIN/Plan con "Próximamente" (S6, S7); Plan/suscripción en Acerca de (S7); Invitar/Calificar a nivel de menús primarios (S8); cambio de modo asimétrico (S9); terminología Simple/Avanzado (S10); Tour Guiado en Ayuda y soporte y PIN solo en Avanzado (S6, S11); "aprobado" del árbol consolidado; chequeo final de cobertura solicitado; reglas de borrado con 10 días + PIN (S15); "ambas bajo la misma regla" (S15).
- **L6**: Pendiente: revisión de esta spec por el dueño → conversación de plan → autorizaciones explícitas para backend antes de tocar código o Supabase.
- **L7** (spec aprobada + coordinación P3, verbatim): "la spec está aprobada, quisiera agregar que en paralelo está trabajando un agente IP3 en el desarrollo y la implement ación de una tercera moneda y esa tercera moneda va a tener un campo de configuración en regional en la sección donde ya se configura la segunda moneda y los valores decimales y todo eso, entonces esa configur ación habría que dejar el placeholder y asentado en Engram para cuando P3 trabaje y desarrolle pueda encontrar el lugar exacto a donde poner en configur aciones la configuración del desarrollo que está haciendo así que explícitamente deja un espacio en la configuración regional en donde hoy la moneda local no es configurable desde ajustes la segunda moneda está fija en dólares y vamos a tener el siguiente cambio la segunda moneda se va a poder configurar tanto elegir otra moneda como lo que ya está que son los decimales y los separadores de miles va a haber una tercera moneda que también se va a poder configurar que arranca vacía pero que también va a tener ese espacio de configuración en la configuración regional teniendo esto en cuenta y los placeholder adecuado para que P3 en el desarrollo no dependa de tu desarrollo y puedan desarrollar las dos formas de forma que independ iente así puedes coordinar eso a través de Engram ya que los dos le den Engram estaría bueno". Resultado: S13 ajustado, S18 agregado, T7 propuesto; coordinación asentada en Engram.- **L8** (ejecución aprobada por el dueño): plan aprobado con `gentle-ai-worker` como implementor (reemplaza `bug-fixer`). Fase 0 y Fase 1 ejecutadas: commits `54ae8ab` (docs spec), `da6fd56` (T1: `settingsMenu.ts` por modo + hub filtrado + 33 claves i18n + test 15/15), `39dd05c` (T2+T4: Ayuda y soporte completa con Tour Guiado, renombre S12 data-driven, Plan placeholder en Acerca de (S7) + bloque acciones rápidas eliminado (S8) inline por el orquestador, atajos de Operativas fuera y hogar back-button (S14), toggle OCR autoaprobar fuera del front (S5, normalización backend queda en T5 gated)). Verificaciones por tarea: `node --test` 20/20, `npx tsc --noEmit` limpio, `check-i18n` sin violaciones nuevas (FAIL del script = deuda preexistente verificada contra baseline `produccion`). Coordinación P3: su T1 backend (monedas extra) fue **deployado con aprobación del dueño** el 2026-10-16; espejos `funcionesSQL/fn_obtener_monedas_extra.md`, `fn_configurar_monedas_extra.md`, `fn_obtener_cotizacion.md` + índice 256-258 registrados por este peer (carpetas de conocimiento no versionadas). Pendientes: T3 (borrado), T5 (gated), T6 (barrida i18n formal y cierre), T7 (placeholders bloque Monedas).
- **L9** (T3 implementada): commit `ca92592` en feat/menu-ajustes. Entrada de borrado live en Cuenta y seguridad (ambos árboles, no soon); helper puro `src/lib/accountDeletionGate.ts` (DAY_GRACE_WINDOW=10, límite: bloquea al iniciar el día 11 = 'pasados los 10 días'); anclaje = `auth.user.created_at` (ninguna RPC de usuario expone usuarios.creado_at, verificado); fail-closed si el anclaje no se puede leer. Borrar mis datos: deshabilitado hasta RPC (DELETE_DATA_BACKEND_AVAILABLE=false, T5 gated). Borrar la cuenta: reutiliza DeleteAccountCard/fn_eliminar_cuenta_usuario. Interino aprobado: desde día 11 queda bloqueado con hint 'configurá tu PIN en modo Avanzado' hasta que exista el PIN (S6). Descubierto: `funcionesSQL/fn_eliminar_cuenta_usuario.md` SÍ existe (la nota de deuda de datos.md estaba desactualizada) → T5(d) se reescala a verificación. Gap a decidir por el dueño: la página /privacidad sigue mostrando el borrado de cuenta sin regla (out of scope de esta task); el gate cubre por ahora solo el acceso por Ajustes. Verificación: node --test 30/30 (settingsMenu 22 + gate 8), tsc limpio, i18n sin violaciones nuevas.
- **L10** (revisión de gracia, verbatim): "quiero llevar de 10 días a 15 días la opción del borrado de los datos y de la cuenta". Efecto: `DAY_GRACE_WINDOW` 10 → 15 en `src/lib/accountDeletionGate.ts` (commit posterior a `ca92592`); ambos borrados (datos y cuenta) siguen "ambas bajo la misma regla". Tests de borde actualizados (gracia 0/1/9/15/15.5 días; bloqueo en 16 y 400); verificación: 30/30, tsc limpio.
- **L11** (T7 implementada): commit posterior a `7da9984`. `CurrenciesBlock` placeholder puro agregado en `src/pages/Configuracion/RegionFormatoPage.tsx` tras la tarjeta de Moneda y antes de "Formato de números": 3 filas (local derivada del país usando los valores ya resueltos por la página / segunda hoy fija USD marcada config pendiente / tercera vacía). Sin RPCs de monedas ni lógica (guardrail test `tests/regionCurrenciesBlock.test.js`). 6 claves i18n nuevas. Punto de integración para P3/T8 documentado en comentario dentro de CurrenciesBlock. Correcciones del orquestador sobre el worker: comentario en español movido a inglés (violación scanner) y '*/}' sobrante que rompió tsc. Verificación: node --test 3 suites verde, tsc limpio, i18n sin violaciones nuevas (20 hardcodeados = baseline). Deslizo del worker aceptado: el test nuevo quedó fuera de la lista formal de superficies; contenido additivo test-only revisado.
- **L12** (eliminación /privacidad + backup de usuario, decisión del dueño): los backups pasan a nivel de administración (respaldo de base completa en Supabase, restauración de users desde admin); NO es feature de usuario y además no existe restauración en la app (verificado: decryptJSON solo consulta el visor; no hay import de .backup ni RPC f_restaurar). Eliminado de la rama feat/menu-ajustes: ruta /privacidad (App.tsx), PrivacidadPage (+css), BackupExportCard (+css), BackupViewer (+css) y su entrada de telemetría. DeleteAccountCard SE CONSERVA: lo reutiliza ConfiguracionBorradoCard (gate 15 días/PIN) — el borrado de cuenta queda accesible solo por Ajustes; gap /privacidad resuelto por eliminación. Legales ya viven en Acerca de; export CSV de movimientos sigue en Importar/exportar. Deuda huérfana ligada (fuera de scope, a decidir): PerfilPage (sin ruta) y DatosCard (sin render) aún navegan a /privacidad — URL muerta. RPC fn_exportar_backup_maestro queda (no se toca backend). Verificación: 3 suites + regionCurrenciesBlock verde, tsc limpio, i18n sin violaciones nuevas (20 hardcodeados = baseline; dead keys +16 privacidad_* esperados).
- **L13** (T5 backend ejecutado con OK del dueño: "ejecuta a, b, c y d"): (a) UPDATE `app_feature_flags` — `menu_carga_voz` y `menu_cuarentena` a `modo_minimo='simple'`, `pref_key=NULL` (2 filas; verificado after; nivel `intermedio` queda sin uso). (b) UPDATE `p_preferencias_usuario` — `ocr_auto_aprobar=false` (1 fila afectada: user 3; 0 activos after). (c) RPC nueva `fn_borrar_datos_usuario(text)` creada: borrado de DATOS (cuenta permanece), confirmación `BORRAR DATOS`, guardia backend de 15 días (defensa en profundidad), SECURITY DEFINER con `auth.uid()`, 21 tablas `p_*` limpiadas por user_id en orden de dependencias, retorno jsonb con detalle. Test transaccional `tests/sql/run_borrar_datos_test.js` **3/3 PASS** (identidad fail-closed, orden de validación, existencia) con ROLLBACK; runner y RPC de testing DROPeados post-run (verificado 0 residuos). Espejo `funcionesSQL/fn_borrar_datos_usuario.md`. Índice **260**. (d) Espejos verificados byte-exacto contra producción: `fn_eliminar_cuenta_usuario`, `fn_registrar_movimiento_caja`, `fn_aprobar_cuarentena_v2`, `fn_titulo_transferencia`; `fn_obtener_modo_app` actualizado con encabezado RECONSTRUIDO (2° cp: daño menor de prosa anotado en el incidente; aprendido: preservar prosa). Pendiente de validación humana: ejecución end-to-end de la limpieza real (sesión real del dueño). El front (feat/menu-ajustes) y (a) van juntos a producción.
- **L14** (integración multi-peer, pedido del dueño: "merge de pi2 y merge de pi3 tambien"): (1) **pi/sesion-3 (P3) mergeada** sin conflictos (trae backend formato por moneda overridees jsonb + RPCs y su front T4-T8); dedup de claves i18n posterior (`error_formato_moneda_*` duplicadas por ambos lados; la sección errors queda dueña, commit 44454c1). (2) **feat/pin-huella (PI2) mergeada** — conflicto puntual en App.tsx resuelto manteniendo la retirada de `/configuracion/region` (U2) e ingresando `/configuracion/proteccion` (a0014d0). (3) **Flip aplicado**: `pin_protection` `soon:false` + `target:'target:/configuracion/proteccion'` en el árbol avanzado. (4) **Swap del gate**: `ConfiguracionBorradoCard` consume `useAppLock().lockState === 'activa'` (fuente única de PI2); `PIN_CONFIGURED_FALLBACK` queda como fallback legacy exportado. (5) **Unlock de "Borrar mis datos"**: `DELETE_DATA_BACKEND_AVAILABLE=true` y la opción cableada a `fn_borrar_datos_usuario` (input tipo 'BORRAR DATOS' estilo DeleteAccountCard + ConfirmModal danger + reload al terminar, la cuenta queda con onboarding fresco). Verificación final integrada: 4 suites settings/gate/monedas/format 100% verde, tsc limpio, i18n 0 violaciones nuevas (249 USED-NOT-DEFINED = deuda preexistente familia/hogar + 2 nuevas legítimas resueltas). Confirmed commits: 44454c1 (dedup), a0014d0 (merge PI2), 0818880 (flip+swap+unlock).
- **L16** (bug 10, dueño con captura 60f9cce5, 2026-10-19): "Dentro de cuenta y seguridad tenemos perfil que es una rama colapsada y después tenemos borrado de datos y cuentas, debería ser otra rama colapsable en donde tenemos dos ítems que es el borrado de datos y el borrado de la cuenta como dos sub-ítems de borrado de datos y cuentas. Entonces colapsamos todo dentro de borrado de datos y cuentas y al expandir se nos abre la posibilidad de ver borrado de mis datos y borrado de la cuenta." Efecto: commit `0698096` — data_deletion interceptado por `DeletionInlineCard` (SettingsCollapsible colapsada con ConfiguracionBorradoCard adentro, gate 15 días/PIN intacto); título de entrada `settings_entry_data_deletion` = "Borrado de datos y cuentas". Test RED→GREEN (36/36). Verificado: tsc limpio, i18n sin violaciones nuevas.
