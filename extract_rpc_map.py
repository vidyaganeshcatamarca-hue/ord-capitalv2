import re
from collections import defaultdict, OrderedDict
from pathlib import Path

root_dir = "C:\\temp\\Antigravity\\ORD Capital v2\\Personal\\src"

# List of files found in command 1
files = [
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\AportarProyectoModal\AportarProyectoModal.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\bcg\BCGBuzonModal.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\bcg\BCGDetalleCategoria.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\BottomNav\BottomNav.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\ConfigHogar\ConfigHogar.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\configuracion\AparienciaCard.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\configuracion\MiCuentaCard.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\configuracion\NotificacionesCard.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\DetalleBalanceModal\DetalleBalanceModal.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\familia\FeedView.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\InitialBalanceModal\InitialBalanceModal.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\inversiones\ConfigInflacionView.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\notificaciones\NotificationPanel.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\privacidad\BackupExportCard.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\privacidad\DeleteAccountCard.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\ProyectoFormModal\ProyectoFormModal.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\SaldarBalanceModal\SaldarBalanceModal.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\sobres\RespaldoFisicoPanel.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\sobres\SobreFormModal.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\sobres\SobreTransferModal.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\supervivencia\ConfigGastosFijosModal.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\components\supervivencia\EscudoTiempoDetalle.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\contexts\AuthContext.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\contexts\HogarContext.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\contexts\ModoAppContext.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\hooks\useHideAmounts.ts",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\hooks\useNotificationCount.ts",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\hooks\useReminders.ts",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\hooks\useSessionTracker.ts",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\lib\supabase.ts",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\pages\AnalisisEmocional\AnalisisEmocionalPage.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\pages\Auth\AuthPage.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\pages\Configuracion\NotificacionesPage.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\pages\Familia\FamiliaPage.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\pages\Presupuestos\PresupuestosPage.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\pages\Salud\SaludPage.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\pages\Sobres\SobresPage.tsx",
    r"C:\temp\Antigravity\ORD Capital v2\Personal\src\pages\Supervivencia\SupervivenciaPage.tsx",
]

# Pattern to match supabase.rpc('function_name')
pattern = re.compile(r"supabase\.rpc\('([^']+)")

# Per-file data
file_data = {}  # file -> list of RPC calls (with line numbers) for full trace

for filepath in files:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        rpcs_in_file = []
        unique_rpc_names = set()
        
        for i, line in enumerate(lines, start=1):
            matches = pattern.findall(line)
            if matches:
                for match in matches:
                    unique_rpc_names.add(match)
                
                # Capture all RPC names on this line with their positions
                for m in re.finditer(pattern.pattern, line):
                    rpc_name = m.group(1)
                    rpcs_in_file.append((i, rpc_name))
        
        if unique_rpc_names:  # Only include files that have at least one RPC call
            file_data[filepath] = {
                'unique': sorted(unique_rpc_names),
                'total': len(rpcs_in_file),
                'call_sites': rpcs_in_file
            }
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

# Build per-file table output
print("## Per-file RPC usage")
print("")
print("| File | RPCs (unique) | Total calls |")
print("|------|---------------|-------------|")

for filepath in file_data.keys():
    file = Path(filepath).name
    rpcs = ", ".join(file_data[filepath]['unique'])
    total = file_data[filepath]['total']
    print(f"| `{file}` | {rpcs} | {total} |")

print("")

# Build top 3 RPCs overall
all_rpc_calls = defaultdict(list)  # rpc_name -> [(filepath, line_num), ...]

for filepath, data in file_data.items():
    for line_num, rpc_name in data['call_sites']:
        all_rpc_calls[rpc_name].append((filepath, line_num))

# Sort by total calls descending
sorted_rpcs = sorted(all_rpc_calls.items(), key=lambda x: len(x[1]), reverse=True)

print("## Top 3 most-called RPCs")
print("")
print("| Rank | RPC | Calls | Files | Call sites |")
print("|------|-----|-------|-------|------------|")

for rank, (rpc_name, call_sites) in enumerate(sorted_rpcs[:3], start=1):
    total_calls = len(call_sites)
    unique_files = set(filepath for filepath, _ in call_sites)
    files_count = len(unique_files)
    
    # Format call sites as file:line pairs
    call_site_strs = []
    for fp, ln in call_sites:
        short_path = f"C:\\temp\\Antigravity\\ORD Capital v2\\Personal\\src\\" + Path(fp).relative_to("C:\\temp\\Antigravity\\ORD Capital v2\\Personal\\src").as_posix()
        # Shorten too much - just use simpler representation
        try:
            rel_path = Path(fp).relative_to(r"C:\temp\Antigravity\ORD Capital v2\Personal")
            call_site_strs.append(f"{rel_path.as_posix()}:{ln}")
        except ValueError:
            # Fallback if relative path fails
            call_site_strs.append(f"{fp}:{ln}")
    
    files_display = ", ".join(unique_files)
    print(f"| {rank} | `{rpc_name}` | {total_calls} | {files_count} | {', '.join(call_site_strs)} |")

print("")
print("DONE")
