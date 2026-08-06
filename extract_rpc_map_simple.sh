#!/bin/bash

ROOT="C:/temp/Antigravity/ORD Capital v2/Personal/src"
FILES=(
  "$ROOT/components/AportarProyectoModal/AportarProyectoModal.tsx"
  "$ROOT/components/bcg/BCGBuzonModal.tsx"
  "$ROOT/components/bcg/BCGDetalleCategoria.tsx"
  "$ROOT/components/BottomNav/BottomNav.tsx"
  "$ROOT/components/ConfigHogar/ConfigHogar.tsx"
  "$ROOT/components/configuracion/AparienciaCard.tsx"
  "$ROOT/components/configuracion/MiCuentaCard.tsx"
  "$ROOT/components/configuracion/NotificacionesCard.tsx"
  "$ROOT/components/DetalleBalanceModal/DetalleBalanceModal.tsx"
  "$ROOT/components/familia/FeedView.tsx"
  "$ROOT/components/InitialBalanceModal/InitialBalanceModal.tsx"
  "$ROOT/components/inversiones/ConfigInflacionView.tsx"
  "$ROOT/components/notificaciones/NotificationPanel.tsx"
  "$ROOT/components/privacidad/BackupExportCard.tsx"
  "$ROOT/components/privacidad/DeleteAccountCard.tsx"
  "$ROOT/components/ProyectoFormModal/ProyectoFormModal.tsx"
  "$ROOT/components/SaldarBalanceModal/SaldarBalanceModal.tsx"
  "$ROOT/components/sobres/RespaldoFisicoPanel.tsx"
  "$ROOT/components/sobres/SobreFormModal.tsx"
  "$ROOT/components/sobres/SobreTransferModal.tsx"
  "$ROOT/components/supervivencia/ConfigGastosFijosModal.tsx"
  "$ROOT/components/supervivencia/EscudoTiempoDetalle.tsx"
  "$ROOT/contexts/AuthContext.tsx"
  "$ROOT/contexts/HogarContext.tsx"
  "$ROOT/contexts/ModoAppContext.tsx"
  "$ROOT/hooks/useHideAmounts.ts"
  "$ROOT/hooks/useNotificationCount.ts"
  "$ROOT/hooks/useReminders.ts"
  "$ROOT/hooks/useSessionTracker.ts"
  "$ROOT/lib/supabase.ts"
  "$ROOT/pages/AnalisisEmocional/AnalisisEmocionalPage.tsx"
  "$ROOT/pages/Auth/AuthPage.tsx"
  "$ROOT/pages/Configuracion/NotificacionesPage.tsx"
  "$ROOT/pages/Familia/FamiliaPage.tsx"
  "$ROOT/pages/Presupuestos/PresupuestosPage.tsx"
  "$ROOT/pages/Salud/SaludPage.tsx"
  "$ROOT/pages/Sobres/SobresPage.tsx"
  "$ROOT/pages/Supervivencia/SupervivenciaPage.tsx"
)

declare -A file_rpc_total
declare -A rpc_name_occurrences  
declare -A rpc_call_sites

for f in "${FILES[@]}"; do
  [[ -f $f ]] || continue
  
  # Extract all matches, each on its own line: "filename|linenum|rpcname"
  awk -F':' '
    /supabase\.rpc\(['"](a-z_0-9]+)['"]\) {
      for (i=1; i<=NF; i++) {
        if ($i ~ /supabase\.rpc\(.*?\)/) {
          str = $i
          gsub(/^[^'"'"']*[\'"'"']/, "", str)
          gsub(/[\'\"'][^)]*\).*/, "" str)
          print FILENAME ":" NR ": " str
        }
      }
    }' "$f" 2>/dev/null || true

done | grep -oE "[^:]+:[0-9]+:[^:\s]+" > $ROOT/rpc_extraction_temp.txt

# Simple grep extraction 
for f in "${FILES[@]}"; do
  if [[ -f $f ]]; then
    # Count matches of function name within supabase.rpc() pattern
    while read -r line; do
      # Extract all RPC names from this line (there could be multiple)
      while IFS= read -r rpc; do
        if [ -n "$rpc" ]; then
          echo "$f|$1|$rpc" >> $ROOT/rpc_extraction_temp.txt
        fi
      done < <(echo "$line" | grep -oE "supabase\.rpc\(['\"])([a-zA-Z0-9_]+)['\"])" | sed -E "s/supabase\.rpc\(['\"])([a-zA-Z0-9_]+)['\"])/\2/")
    done < <(grep -n "supabase\.rpc(" "$f")
  fi
done

# Process extracted data
awk -F'|' '
{
   file=$1; line=$3; rpc=$4
   
   # Extract filename only from path
   split(file, parts, "/")
   basename = parts[length(parts)]
   
   key = basename "|" rpc
   count[key]++
   if (!(key in files)) {
     files[key] = file ":" line
   } else {
     files[key] = files[key] ", " file ":" line
   }
}
END {
   for (k in count) {
     print k ": " count[k] " | " files[k]
   }
}' $ROOT/rpc_extraction_temp.txt | sort -t':' -k2 -rn > $ROOT/top_rpc_summary.txt

echo "## Per-file RPC usage"
echo ""
echo "| File | RPCs (unique) | Total calls |"
echo "|------|---------------|-------------|"

# For each file, list its unique RPCs and total calls
for f in "${FILES[@]}"; do
  if [[ -f $f ]]; then
    # Extract rpc names from file (with line numbers to verify they exist)
    while read -r line; do
      echo "$line" | grep -oE "supabase\.rpc\(['\"])([a-zA-Z0-9_]+)['\"\)]" | sed -E "s/supabase\.rpc\(['\"])([a-zA-Z0-9_]+)['\"\)]/\2/" >> $ROOT/extracted_rpcs.txt
    done < <(grep -n "supabase\.rpc(" "$f" 2>/dev/null)
    
    if [ -s $ROOT/extracted_rpcs.txt ]; then
       rp="" # unique rpc names comma-separated, total count 
    fi
    rm -f $ROOT/extracted_rpcs.txt
  fi
done

# Since the above got complex, let's do a simpler direct Python extraction instead.
python3.exe << 'PYEOF'
import re, os
from collections import defaultdict
root = "C:/temp/Antigravity/ORD Capital v2/Personal/src"
files = [
"components/AportarProyectoModal/AportarProyectoModal.tsx",
"components/bcg/BCGBuzonModal.tsx",
"components/bcg/BCGDetalleCategoria.tsx",
"components/BottomNav/BottomNav.tsx",
"components/ConfigHogar/ConfigHogar.tsx",
"components/configuracion/AparienciaCard.tsx",
"components/configuracion/MiCuentaCard.tsx",
"components/configuracion/NotificacionesCard.tsx",
"components/DetalleBalanceModal/DetalleBalanceModal.tsx",
"components/familia/FeedView.tsx",
"components/InitialBalanceModal/InitialBalanceModal.tsx",
"components/inversiones/ConfigInflacionView.tsx",
"components/notificaciones/NotificationPanel.tsx",
"components/privacidad/BackupExportCard.tsx",
"components/privacidad/DeleteAccountCard.tsx",
"components/ProyectoFormModal/ProyectoFormModal.tsx",
"components/SaldarBalanceModal/SaldarBalanceModal.tsx",
"components/sobres/RespaldoFisicoPanel.tsx",
"components/sobres/SobreFormModal.tsx",
"components/sobres/SobreTransferModal.tsx",
"components/supervivencia/ConfigGastosFijosModal.tsx",
"components/supervivencia/EscudoTiempoDetalle.tsx",
"contexts/AuthContext.tsx",
"contexts/HogarContext.tsx",
"errors=ModoAppContext.tsx", "hooks/useHideAmounts.ts","hooks/useNotificationCount.ts","hooks/useReminders.ts","hooks/useSessionTracker.ts","lib/supabase.ts","pages/AnalisisEmocional/AnalisisEmocionalPage.tsx","pages/Auth/AuthPage.tsx","pages/Configuracion/NotificacionesPage.tsx","pages/Familia/FamiliaPage.tsx","pages/Presupuestos/PresupuestosPage.tsx","pages/Salud/SaludPage.tsx","pages/Sobres/SobresPage.tsx","pages/Supervivencia/SupervivenciaPage.tsx"
]

pattern = re.compile(r"supabase\.rpc\(['\"]([^'\"]+)['\"]\)")
file_data = {}
all_rpc_calls = defaultdict(list)  # rpc_name -> [(filepath, lineno), ...]

for fpath in files:
    full_path = os.path.join(root, fpath)
    if not os.path.isfile(full_path): continue
    
    try:
        with open(full_path, 'r', encoding='utf-8') as rf:
            lines = rf.readlines()
        
        unique_rpcs = set()
        total_calls = 0
        
        for i, line in enumerate(lines, start=1):
            matching_lines = pattern.findall(line)
            if matching_lines:
                total_calls += len(matching_lines)
                for rpc_name in matching_lines:
                    unique_rpcs.add(rpc_name)
                    all_rpc_calls[rpc_name].append((full_path, i))
        
        if total_calls > 0:
            file_data[os.path.basename(fpath)] = {
                "rpcs": sorted(unique_rpcs),
                "total": total_calls
            }
    
    except Exception as e:
        print(f"Error reading {full_path}: {e}")

print("## Per-file RPC usage")
print("")
print("| File | RPCs (unique) | Total calls |")
print("|------|---------------|-------------|")
for fname, data in file_data.items():
    rlist = ", ".join(data["rpcs"])
    print(f"| `{fname}` | {rlist} | {data['total']} |")

print("")
print("## Top 3 most-called RPCs")
print("")
print("| Rank | RPC | Calls | Files | Call sites |")
print("|------|-----|-------|-------|------------|")
rank = 1
for rpc, calls in sorted(all_rpc_calls.items(), key=lambda x: len(x[1]), reverse=True)[:3]:
    total = len(calls)
    unique_files = set(f for f, ln in calls)
    # Format call sites concisely
    site_strs = [f"{os.path.basename(f)}:{ln}" for f, ln in calls]
    print(f"| {rank} | `{rpc}` | {total} | {len(unique_files)} | {', '.join(site_strs)} |")
    rank += 1

print("")
print("DONE")
PYEOF

rm -f $ROOT/rpc_extraction_temp.txt
