0. Solo accedes a las tablas de supabase con las funciones RPC proporcionadas, nunca directamente desde el codigo. Si necesitas crear una funcion nueva que no existe para cubrir una funcionalidad necesaria, pides permiso, presentas el codigo y explicas el motivo. 
1. No Modificaras funciones, codigo ni tablas en supabase sin autorizacion
2. Usaras tu directorio start_info para buscar instruccion sobre cada fase en prompt fase X.docx
3. Usa Prompt UI completo.docx para la creacion de pantallas y toda la experiencia UI / UX
4. tablas todas.md contiene la estructura de todas las tablas
5. encontraras todas las funciones y triggers del backend en la carpeta 'funcionesSQL' con sus respectivos codigos fuente en SQL. La carpeta 'funcionesSQL' es exclusivamente el espejo de funciones RPC/triggers y archivos directamente relacionados a esas funciones. Nunca guardes ahi scripts de migracion, fixes completos, tests, propuestas SQL agrupadas ni archivos auxiliares. Cuando una RPC nueva o modificada ya fue creada en Supabase, registra/modifica solamente su archivo espejo correspondiente en 'funcionesSQL' y actualiza 'start_info/indice de funciones.md' si es una funcion nueva.
6. tienes python en C:\temp\miniconda3
7. Siempre que propones crear un nueva funcion RPC en Supabase, cuando te confirmo que ha sido creada, debes agregarla/modificarla a tu base de conocimiento en el archivo correspondiente en el directorio 'funcionesSQL' y tambien si es una funcion nueva agregarla en start_info/indice de funciones.md

8. Si agregas datos de prueba en supabase durante el testeo o correccion de funciones RPC, al terminar el test siempre hacer ROLLBACK para que no quede nada en la base de datos.
9. Prohibido hardcodear en idioma español codigo , mensajes, en funciones, o codigo fuente del tipo que sea. Toda la mensajeria se administra via i18n a traves de es.ts (para español)
10. Para escribir tests con codigo, usa exclusivamente la carpeta 'tests'.

11. **Tests transaccionales contra Supabase (Regla TDD)**: Para validar una nueva RPC, cambio de contrato, o bug, crea un test SQL transaccional con ROLLBACK. El flujo autonomo es:
   - **Pedir autorizacion explicita** al usuario para crear un RPC de testing temporal en Supabase antes de ejecutarlo. No crees nada sin OK.
   - **Crear el runner**: el RPC de testing debe ejecutar todas las aserciones (insufficient balance, saldos intactos, no insercion, wallet not found, cross-currency, same wallet, smoke OK) en una sola transaccion y devolver `jsonb` con `result: PASS|FAIL` y `detail: [{assertion, ok, error}, ...]`.
   - **Ejecutar via Management API** con `ACCESS_TOKEN` (PAT) de Supabase. Endpoint: `POST https://api.supabase.com/v1/projects/{project_ref}/database/query` con body `{"query": "..."}`. Cargar `ACCESS_TOKEN`, `SUPABASE_URL` y `DATABASE_URL` desde `.env.local`.
   - **Conexion DB directa**: el proyecto esta en `aws-1-sa-east-1`. La `DATABASE_URL` correcta es `postgresql://postgres.{project_ref}:{password}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres`. El host `db.*` directo solo responde por IPv6 y no es alcanzable desde esta maquina. Actualizar `.env.local` con la cadena del Transaction pooler.
   - **Borrar el runner** apenas termine el test con `DROP FUNCTION IF EXISTS public.fn_run_transfer_insufficient_test();` via la misma Management API. El RPC de testing NUNCA debe quedar en Supabase.
   - **Reutilizar el script `tests/sql/run_transfer_test.js`** (o el equivalente) como plantilla: automatiza create/execute/drop. Pattern: archivo `.sql` con el runner + archivo `.js` que lo ejecuta via Management API. El script `.js` carga `.env.local` y exporta las variables antes de invocar `node`.
   - **Solo correr tests transaccionales (con ROLLBACK)**, nunca dejar datos de prueba en las tablas del usuario. La regla 8 de CleanUp se mantiene: si necesitas datos auxiliares, asegurate de revertir todo antes de cerrar el test.
