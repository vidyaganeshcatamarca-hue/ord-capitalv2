#!/usr/bin/env bash
# wiki_update_function.sh – Helper script to streamline the Wiki‑Four ingestion workflow
# This script does **NOT** perform any automatic code generation; it only guides the developer
# through the required manual steps that must be executed by the LLM (or the developer).
#
# Usage:
#   ./scripts/wiki_update_function.sh <function-name>
#
# Steps performed (mirroring the Wiki‑Four INGEST operation):
#   1️⃣ Open/create the markdown page for the function under `wiki/conceptos/`.
#   2️⃣ Populate the front‑matter using the official template (tags, tipo, fuentes, fechas, keywords).
#   3️⃣ Add a clear description, signature, example usage and related wikilinks.
#   4️⃣ Save the file via an *atomic write* (write to .tmp, validate, mv).
#   5️⃣ Append an entry to `wiki/log.md` documenting the creation or update.
#   6️⃣ Run the lint/index script to refresh `.index.json`:
#        node audit_and_index.js
#   7️⃣ Commit the changes (optional).
#
# NOTE: The actual editing of the markdown file must be done manually or via the LLM.
# This script only prints the checklist so that the developer can tick‑off each item.

if [ -z "$1" ]; then
  echo "Error: missing function name. Provide the function identifier as the first argument."
  exit 1
fi

FUNC="$1"
PAGE="wiki/conceptos/${FUNC}.md"
TMP="${PAGE}.tmp"

cat <<EOF
--- Wiki‑Four ingestion checklist for function: ${FUNC} ---

1️⃣ Create or open the page: ${PAGE}
2️⃣ Ensure front‑matter includes:
   tags: [funcion, rpc]
   tipo: funcion
   fuentes: ["indice de funciones.md"]
   fecha_creacion: $(date +%F)
   fecha_actualizacion: $(date +%F)
   keywords: [${FUNC}]
3️⃣ Add description, signature, examples, and at least 8 wikilinks.
4️⃣ Save via atomic write (write to ${TMP}, validate, then mv to ${PAGE}).
5️⃣ Append to wiki/log.md:
   ## [$(date +%F)] ingest | Función ${FUNC} ${FUNC_EXISTS:+actualizada}creada
   - Página: [[${FUNC}]]
   - Fuente: src/database/funciones.sql (o equivalente)
6️⃣ Run lint/index:
   node audit_and_index.js
7️⃣ (Opcional) git add ${PAGE} wiki/log.md && git commit -m "wiki: ${FUNC} ${FUNC_EXISTS:+update}added"

--- End of checklist ---
EOF

exit 0
