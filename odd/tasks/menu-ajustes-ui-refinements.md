# Feature: menu-ajustes-ui-refinements — Refinamientos de UI del menú Ajustes

Estado: **PLANNING para revisión del dueño** (fidéalmente lo pediste, no les toques nada hasta que el dueño apruebe).
Fuentes: 4 decisiones del dueño del 2026-10-16 a la noche; PRD orientativo.
Vinculada a: `odd/tasks/menu-ajustes.md` (rama feat/menu-ajustes).

## Specs

### S1 — Secciones raíz colapsadas (acordeón) en hub
> "Cada sección debe ser un desplegable que arranca comprimido y al hacer clic despliega toda su funcionalidad ... Tal cual, por ejemplo, el botón perfil."

- Las 4/5 secciones de raíz (Cuenta y seguridad / Preferencias / Datos y operaciones / Ayuda y soporte / Aplicación) se renderizan **comprimidas** con header tap-to-expand (mismo patrón visual que ya usan `MiCuentaCard` y `AparienciaCard`).
- El contenido visible por modo no cambia: en Simple colapsadas muestran lo de S2, en Avanzado lo de S3.
- Dentro de ellas, los prototipos internos también arrancan colapsados:
  - **Cuenta y seguridad** → Perfil (colapsado), Borrado de datos (colapsado), Borrado de cuenta (colapsado).
  - **Preferencias** → Región y formato, Apariencia, Notificaciones, Carga y registro, todos colapsados.
  - **Ayuda y soporte** → Reportar un problema o sugerencia, Mis reportes, Tour Guiado.
  - **Aplicación** → Instalar la app, Mantenimiento, Acerca de (y su interior colapsado a su vez).
- Estilo: mantener el mismo estilo de tarjeta (icon, título, chevron) con estados aria-expanded/aria-controls ya existentes.
- Independiente del modo (misma lógica de colapso en Simple y Avanzado), aplica a ambos.

### S2 — Región y formato: reordenar Formato de números por moneda
> "Decimales moneda local, separador de miles moneda local, un espacio, una barra/línea que divida, luego decimales segunda moneda, separador miles segunda moneda, otra línea separadora, y lo mismo para la tercera moneda."

- Desaparece el bloque único de 4 selects (decimales local / decimales USD / separador miles / separador decimal).
- Se reorganiza en **3 secciones por moneda** separadas por `<hr>` o línea visual:
  1) **Moneda local**: decimales + separador de miles.
  2) **Segunda moneda**: decimales + separador de miles.
  3) **Tercera moneda**: decimales + separador de miles (self-contained, vacío si no tiene moneda).
- La imagen adjuntada me dejó pendiente la salida de `config_preview` — la asignación de separadores por moneda NO existe todavía en backend (p_preferencias_usuario tiene separadores globales hoy), es un decor cambio estructural antes de P3/T8 (que verá movidas como `monedas_extra`).
- Los labels dejan de decir "USD" genérico: pasan a `Moneda local` / `Segunda moneda` / `Tercera moneda` (+ flag/emoji/nombre de la moneda si la hay; P3/T8 llena los nombres reales).

### S3 — Región y formato: abrir inline como Apariencia (no `/configuracion/region` standalone)
> "En región y formato se abre una pantalla nueva que parece otra cosa. Podés hacer que copie el estándar de apertura de apariencia."

- La **tarjeta de Región y formato se integra al hub** como tarjeta desplegable inline (header tap-to-expand, mismo estilo AparienciaCard).
- `RegionFormatoPage` (pantalla completa actual) deja de ser el destino: su interior se convierte en un componente reutilizable (mismo markup) montado dentro de la tarjeta.
- Ruta `/configuracion/region` queda deshabilitada/redirigida a `/configuracion` (mantener compat si existían enlaces externos; anotar en el commit).
- El **bloque Monedas (S18)** se reubica dentro del contenido desplegable — P3/T8 (p_panels) sigue teniendo el punto de integración estable (función `CurrenciesBlock` + integra en el nodo de la tarjeta, no en una página aparte).

### S4 — Acerca de: abrir inline + Legal apunta a `/legal/*.html` con modal
> "Al abrir [Acerca de], tenemos la misma situación: se abre una pantalla nueva en lugar de hacer una apertura elegante como con Apariencia. ... Legal términos y condiciones y política de privacidad: apuntá a los archivos HTML ya disponibles, usados en el onboarding."

- La **tarjeta de Acerca de se integra al hub como tarjeta desplegable inline** (mismo estándar que AparienciaCard).
- Su interior (Versión, Legal, Plan/Suscripción placeholder) vive en la tarjeta — `/configuracion/acerca` deja de ser necesaria como página standalone; la ruta se redirige a `/configuracion`.
- **Legal ya existe como modal**: `LegalDocModal` (`tyc` | `privacidad`) ya carga `/legal/tyc.html` / `/legal/privacidad.html` con `iframe` y telemetría de apertura (`registrarAperturaLegal`). El cambio es solo wire up: las filas de Legal en la tarjeta desplegada abren `LegalDocModal` (en vez de "próximamente").
- Archivos `public/legal/tyc.html` y `public/legal/privacidad.html` ya existen (usados en onboarding); la modal no genera trabajo nuevo.

## Tasks (propuesta)

| ID | Specs | Alcance |
|----|-------|---------|
| U1 | S1 | Convertir los grupos raíz + submenus internos en desplegables (patrón MiCuentaCard/AparienciaCard) |
| U2 | S3, S4 | Región y formato y Acerca de: integrarlas como tarjetas inline; redirigir sus rutas; Legal usa `LegalDocModal` |
| U3 | S2 | Región y formato: Formato de números reorganizado por moneda (local / segunda / tercera) con divisores |
| U4 | S2, S3 | i18n de las claves nuevas/renombradas + retirar dígitos viejos |

## Log

- **L1** (pedido original, verbatim): "1. Cada sección debe ser un desplegable que arranca comprimido y al hacer clic despliega toda su funcionalidad (…) Tal cual, por ejemplo, el botón perfil, así debe ser el botón cuenta y seguridad y al abrirlo se despliega dentro del perfil borrado de datos cuenta, borrado de datos, perdón, y borrado de la cuenta. Cada uno de ellos también arrancan comprimidos y al tocarlo se despliega la información que ellos contienen. Lo mismo sucede para preferencias, lo mismo para ayuda de soporte, lo mismo para aplicación. Y en el mismo nivel encontramos invitar a un amigo y calificar ORD que ellas no tienen despliegue.
2. En región y formato se abre una pantalla nueva y en la sección de monedas en formato de números pusiste primero decimales de moneda local, decimales de USD, dólares, luego separadores de miles de ambas monedas sin indicar cuál es cuál. Prefiero que lo hagas de la siguiente manera. Decimales, moneda local, separador de miles, moneda local, un espacio, una barra, una línea, algo que divida y luego decimales, segunda moneda, separador de miles, segunda moneda, otra línea separadora y lo mismo para la tercera moneda.
3. [imagen adjuntada] Fíjate que cuando clickeamos en apariencia, en lugar de abrirse una ventana nueva, se abre y se despliega dentro de la misma ventana todo su contenido. Eso es bastante más bonito que lo que sucede en región y formato, que se abre una ventana nueva que parece otra cosa . Si puedes hacer que región y formato copie el estándar de apertura de apariencia sería muy bueno.
4. Al abrir, tenemos la misma situación. Se abre una pantalla nueva en lugar de hacer una apertura elegante como hacíamos con apariencia aquí dentro de legal términos y condiciones y política de privacidad directamente puedes apuntar a los archivos HTML que ya tienes disponible en la aplicación son los mismos que usamos para el onboarding"
- **L2**: PRELIMINARES verificados por el orquestador: (a) Región y formato hoy es pantalla standalone con país solo lectura; (b) Renders/Modales Interiores legal: `LegalDocModal` + `LegalDocModal.css` NA `/ legal/*.html` usados en onboarding y consentimiento — **no hay que crear nada nuevo**; (c) Los grupos del hub no son desplegables hoy; (d) MiCuentaCard y AparienciaCard ya usan el patrón desplegable (ejemplo exacto que pide el dueño).