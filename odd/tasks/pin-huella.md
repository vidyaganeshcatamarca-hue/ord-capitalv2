# Feature: pin-huella — Protección con PIN / huella para el acceso a la app

Estado: **Diseño de producto acordado con el dueño** en esta conversación (Log L2). La ejecución de T2+ está autorizada; el backend (T5) queda **gated** al OK explícito del dueño sobre el SQL.
Fuentes: pedidos del dueño en esta conversación (verbatim en `## Log`); contratos de integración con el peer menu-ajustes registrados por Engram y en L3.

## Specs

### S1 — Alcance y objetivo (verbatim del dueño)
> "Lo que quiero que planifiquemos y desarrollemos juntos es la implementación de la protección con PIN y huella para móvil, si es que el móvil lo tiene, del acceso a la app. Esto tiene la intención de proteger la app de la mirada de alguien que puede compartir el teléfono con sus hijos o con su compañera y no quiere que se acceda a sus datos protegiendo el acceso a la app con un PIN si lo tiene guardado o con la huella biométrica si la tiene registrada en su teléfono. El PIN funciona tanto para PC como para móvil y la huella funciona en móvil que lo tenga disponible."

Bloqueo de acceso a la app: PIN disponible en PC y móvil; huella solo en dispositivos que la soporten.

### S2 — Ubicación, visibilidad y modo
> "El procedimiento tiene que ser simple, el usuario accede al menú dentro de ajustes, cuentas y seguridad, protección con pin huella. Esto lo va a tener activado cuando tenga el modo avanzado, el modo full avanzado, porque es una opción del modo avanzado. Y ahí va a cargar el pin o la huella directamente. La puede habilitar o la puede deshabilitar también. Para deshabilitarla evidentemente se le va a pedir el pin guardado o la huella."

- Entrada en Ajustes → Cuenta y seguridad, visible y configurada solo en modo Avanzado (la entrada `pin_protection` del árbol avanzado, hoy placeholder `soon: true` del peer menu-ajustes).
- El flip de la entrada (`soon` fuera + target al componente propio) se hace en esta rama, como unidad con la implementación (contrato peer menu-ajustes).
- Terminología visible: Simple / Avanzado (nunca Basic/Full).

### S3 — PIN: formato y almacenamiento
- PIN de **4 dígitos**.
- Guardado **por cuenta en Supabase** como hash (bcrypt) en **tabla/columna dedicada** (nunca `p_preferencias_usuario`); verificación y configuración **solo por RPC** con `auth.uid()` dentro de la función (RPC-only: nada de `supabase.from()` desde el front para este dominio).
- El mismo PIN y estado sirven en PC y en cualquier móvil (por cuenta, por dispositivo se valida contra el mismo servidor).
- El estado activo (`tiene_pin`, cooldown) se consulta al servidor al arrancar; no vive en banderas locales.

### S4 — Huella/biometría: por dispositivo, vía principal
- WebAuthn platform authenticator en web/PWA (móvil), plugin `@capacitor-community/biometrics`/equivalente para builds nativos futuros (hoy no existe carpeta android/ ni capacitor.config).
- La huella es **credencial por dispositivo**: se habilita por dispositivo (puede estar habilitada en uno y no en otro).
- En la pantalla de bloqueo es **o PIN o huella** (decisión del dueño: "es o pin o huella. Es raro que teniendo huella elija pin" [L2]). Con huella habilitada y disponible se muestra como vía principal; "Usar PIN" queda como alternativa explícita (no flujo automático en cascada).
- Si la huella no está disponible en el dispositivo, falla o se cancela, el usuario continúa con la vía alternativa que elija (PIN), y viceversa.
- Activar huella exige PIN vigente; desactivar exige resolver el bloqueo (ver S8).

### S5 — Momentos en que exige el bloqueo
> "Apertura + background >1 min (recomendado)" (decisión del dueño, L2)

- Al abrir la app (arranque con sesión) **y** al volver de segundo plano tras más de 60 s de estar en background.
- Siempre que exista sesión en el dispositivo: **sin** bypass para sesión recién creada (el re-login con Google no desbloquea: el dueño descartó la capa "re-login" porque con OAuth es puerta abierta para quien tenga el teléfono).
- El bloqueo, una vez activado, aplica en **todos los modos** (Simple y Avanzado); su configuración solo vive en Avanzado (decisión del dueño, L2: "Bloqueo en todos los modos (rec.)").

### S6 — Intentos fallidos y bloqueo
> decisión del dueño, L2/L4: "Sin cierre, retry con backoff", "10 intentos mal", "24 horas"

- Backoff creciente entre intentos: 5 s → 10 s → 20 s (y así sucesivamente hasta el umbral).
- Al **10.º intento inválido total**: bloqueo de **24 horas**, impuesto **server-side** (contador de intentos y fecha/duración en Supabase; nada limpiable borrando datos locales del dispositivo/PWA).
- La pantalla de bloqueo durante el cooldown muestra cuándo vuelve a poder restaurarse el acceso (derivado del servidor).
- La app no se vuelve usable durante el cooldown (el dueño decidió "dejar la app sin poder usarse" en ese lapso; restauración en 24 h, L4).

### S7 — Restauración del PIN
> decisión del dueño (idea del dueño, refinada): "Podemos dejar la app 2 dias sin poder usarse y luego se restaura sola nuevamente, borrando el pin viejo y pidiendo colocar uno nuevo" [L4], luego "24 horas"

- Al vencer el bloqueo, el **servidor borra el hash del PIN** y la app pide **definir un PIN nuevo** antes de dejar entrar.
- La huella puede reactivar el PIN (decisión del dueño: "Pero si lo hace, la huella puede reactivar el pin" [L4]): un desbloqueo por huella valida al dueño en ese dispositivo y cancela el cooldown dejando el PIN operativo de nuevo.
- Recuperación del dueño que olvidó el PIN: huella en ese dispositivo o esperar el cooldown; no hay otra capa (sin re-login; sin preguntas secretas; el PIN no se restaura en claro porque solo vive como hash).

### S8 — Desactivar la protección
> "La puede habilitar o la puede deshabilitar también. Para deshabilitarla evidentemente se le va a pedir el pin guardado o la huella." (verbatim, L1)

Deshabilitar exige resolver el bloqueo con el PIN guardado o con la huella (si está habilitada en ese dispositivo). Cambiar el PIN exige el PIN vigente (o desbloqueo por huella según S4/S7).

### S9 — Backend gated (requiere OK explícito del dueño)
> Contrato peer menu-ajustes: "si necesitás RPC nueva presentá el SQL y esperá OK del dueño (nada tocado aún de PIN en Supabase); espejo funcionesSQL + índice después de deployar; nunca en main/produccion"

- **GATED**: 1 tabla dedicada (hash de PIN, intentos fallidos, `bloqueado_hasta`, estado) + RPCs `fn_configurar_pin`, `fn_verificar_pin`, `fn_tiene_pin` (nombres tentativos a validar en el SQL que se presente) + espejos en `funcionesSQL/` + índice, después del deploy.
- RPC-only, `auth.uid()` dentro de las funciones; bcrypt del lado servidor.
- Sin este backend, el front de configuración no puede ir a producción (feature apagado o fuera, según se decida al presentar el SQL).

### S10 — Integración con el gate de borrado (peer menu-ajustes, su S15)
- El feature publica **una sola fuente de verdad** para `hasPinConfigured` (hook/contexto de esta rama, backeado por RPC o estado derivado de `fn_tiene_pin`).
- El gate de P1 (`src/lib/accountDeletionGate.ts`, regla del dueño: 15 días de gracia; desde el día 16 exige PIN) reemplaza `PIN_CONFIGURED_FALLBACK` por esa fuente; a cargo de P1 sobre su rama cuando esta esté lista (aviso por Engram).

### S11 — i18n
- Toda cadena nueva o renombrada va por `t()` en `src/locales/es.ts` (claves `settings_entry_pin_protection` y `settings_entry_pin_protection_desc` ya existen de P1; agregar las de pantallas propias). Prohibido hardcodear español.

### S12 — Ruta y navegación
- Página plana en `/configuracion/proteccion` (convención de subpáginas de Ajustes: planas bajo `/configuracion/<slug>`), registrada en `src/App.tsx`, `ConfigBackButton` por defecto (vuelve a `/configuracion`).
- Las rutas de configuración hoy NO usan `FeatureRoute`: el gating es de árbol/visibilidad; las guardas de sesión del lado de estos componentes.

## Tasks

| ID | Specs | Ruta | Commit |
|----|-------|------|--------|
| T1 | S1–S12 (doc) | Rama `feat/pin-huella` (independiente, desde HEAD de `pi/sesion-2` en Personal-2) + este doc + mirror Engram | este commit |
| T2 | S5, S6, S7 | `src/lib/appLock.ts` (lib pura: política de bloqueo, ventana 60 s, backoff, cooldown) + tests `tests/` | `node --test tests/appLock.test.js` 8/8, tsc limpio; commit en esta rama |
| T3 | S4, S5, S6 | LockScreen + contexto de bloqueo + hookup arranque/background | 13/13 (appLock 8 + appLockGate 5), tsc limpio; commit 9cedea3; sentinel PIN_BACKEND_ENABLED=false hasta T5 |
| T4 | S2, S4, S8, S11, S12 | Pantalla de configuración `/configuracion/proteccion` + flip `pin_protection` (contrato P1) + i18n | pendiente |
| T5 | S3, S9 | **GATED (OK del dueño)**: tabla dedicada + RPCs + espejos + índice post-deploy | pendiente |
| T6 | S10 | Fuente única `hasPinConfigured` publicada + aviso a P1 por Engram (su gate la consume en su rama) | pendiente (tras T5) |
| T7 | — | Verificación integral (node --test, tsc, i18n) + cierre con árbol integrado de P1 | pendiente |

## Log

- **L1** (pedido original, verbatim): "1. Estamos refaccionando el menú de ajustes en otra sección en paralelo, en este momento, lo está haciendo P1 en la carpeta personal. Lo que quiero que planifiquemos y desarrollemos juntos es la implementación de la protección con PIN y huella para móvil, si es que el móvil lo tiene, del acceso a la app. Esto tiene la intención de proteger la app de la mirada de alguien que puede compartir el teléfono con sus hijos o con su compañera y no quiere que se acceda a sus datos protegiendo el acceso a la app con un PIN si lo tiene guardado o con la huella biométrica si la tiene registrada en su teléfono. El PIN funciona tanto para PC como para móvil y la huella funciona en móvil que lo tenga disponible. 2. El procedimiento tiene que ser simple, el usuario accede al menú dentro de ajustes, cuentas y seguridad, protección con pin huella. Esto lo va a tener activado cuando tenga el modo avanzado, el modo full avanzado, porque es una opción del modo avanzado. Y ahí va a cargar el pin o la huella directamente. La puede habilitar o la puede deshabilitar también. Para deshabilitarla evidentemente se le va a pedir el pin guardado o la huella. Esta funcionalidad es la que tienes que implementar. Planifiquemos, hazme las preguntas que me tengas que hacer con la skill brainstorming. Y si tienes que ajustar algo con el agente P1, está corriendo y te puedes comunicar con él directamente o a través de Engram, como lo hagas, para que te pueda responder. Sobre todo para el placeholder que te tenga que dejar, si bien ya lo tiene cubierto, para que puedas coordinar si tienes que coordinar algo con él."
- **L2** (decisiones del dueño por questionario): (a) PIN por cuenta en Supabase con hash + RPCs (elegido sobre local puro); (b) huella completa: WebAuthn web/PWA + plugin Capacitor nativo, fallback a PIN; (c) bloqueo en apertura + background >1 min; (d) intentos fallidos sin cierre de sesión, backoff creciente; (e) PIN de 4 dígitos; (f) bloqueo activo en todos los modos, configuración solo en Avanzado.
- **L3** (coordenadas de integración con peer menu-ajustes, clone Personal, rama feat/menu-ajustes): entrada `pin_protection` (soon:true) ya declarada en src/config/settingsMenu.ts ACCOUNT_SECURITY avanzado; flip a cargo de este feature en esta rama (viaja con la implementación; P1 corre verificación del árbol integrado al mergearse, tests de contrato en tests/ gitignored local); ruta pactada `/configuracion/proteccion`; fuente única `hasPinConfigured` publicada por este feature para su `accountDeletionGate.ts` (PIN_CONFIGURED_FALLBACK); dominios: su T5 no toca PIN; guardas: RPC-only + auth.uid(), SQL gated al OK del dueño, espejos funcionesSQL, nunca main/produccion, verificación pesada solo orquestador; claves i18n `settings_entry_pin_protection*` ya existen; patrón de registro de subpáginas en src/App.tsx.
- **L4** (recuperación del PIN olvidado, verbatim): Pregunta del dueño: "que hacemos cuando alguien se olvida el pin, como se restaura?" — corrección del dueño a la propuesta de capas: "tengo otra idea. como la mayoria van a entrar con google y esta cuenta no pide password, si mi hijo me saca el telefono e intenta entrar y no sabe el pin. Podemos dejar la app 2 dias sin poder usarse y luego se restaura sola nuevamente, borrando el pin viejo y pidiendo colocar uno nuevo. que te parece?" — Ajuste del agente: contador y cooldown server-side (no limpiables localmente); restauro automático pidiendo PIN nuevo; huella reactiva el PIN. Confirmaciones del dueño: "10 intentos mal. te corrijo, es o pin o huella. Es raro que teniendo huella elija pin. Pero si lo hace, la huella puede reactivar el pin" y "24 horas". Consecuencia: capa "re-login" descartada; sin bypass por sesión fresca (S5).
- **L5** (ramificación): decisión del dueño: "Estoy pensando que me gustaría una rama independiente, no sé por qué quieres poner una rama hija de menú ajustes." → rama `feat/pin-huella` independiente desde el HEAD de `pi/sesion-2` (Personal-2); el flip de la entrada viaja con esta implementación; integración al merge.
- **L6** (luz verde): "avanza" — aprobado iniciar T1; T5 sigue gated al OK del SQL.