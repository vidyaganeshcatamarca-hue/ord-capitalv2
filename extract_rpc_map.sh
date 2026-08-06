#!/bin/bash

# Define the root directory
ROOT="/C/temp/Antigravity/ORD Capital v2/Personal/src"

# Find all files matching pattern
FILES=$(find "$ROOT" -type f \( -name "*.tsx" -o -name "*.ts" \) -exec grep -l "supabase\.rpc(" {} \; | sort -u)

declare -A file_rpc_counts
declare -A rpc_to_files
declare -A rpc_call_sites

echo "## Per-file RPC usage"
echo ""
echo "| File | RPCs (unique) | Total calls |"
echo "|------|---------------|-------------|"

for file in $FILES; do
    # Extract all RPC calls from this file with line numbers and count them
    declare -A rpc_names_in_file
    
    while IFS=: read -r linenum content; do
        # Use grep to extract the function name(s) from each line that contains supabase.rpc()
        # Pattern: supabase.rpc('function_name') or supabase.rpc("function_name")
        matches=$(echo "$content" | grep -oE "supabase\.rpc\(['\"]([^'\"\)]+)['\"]\)" | sed -E "s/supabase\.rpc\(['\"]([^'\"\)]+)['\"]\)/\1/")
        if [ -n "$matches" ]; then
            for rpc in $matches; do
                ((rpc_names_in_file[$rpc]++))
            done
        fi
    done < <(grep -n "supabase\.rpc(" "$file")
    
    # Only show files that have at least one RPC call
    if [ ${#rpc_names_in_file[@]} -gt 0 ]; then
        unique_rpcs=$(printf "%s\n" "${!rpc_names_in_file[@]}" | sort | tr '\n' ', ' | sed 's/, $//')
        total_calls=$(echo "${#rpc_names_in_file[@]}" | bc)  # No, careful: we need sum of counts
        
        # Calculate actual total by summing up all matches on the file level using a direct count
        # But simple grep -c won't work if a line has multiple RPCs. Let's do it differently.
        
        # Count total occurrences by searching for 'supabase.rpc(' and counting lines with that pattern
        # but we need sum of counts not unique lines
        
        # Actually simpler: grep the file again and count ALL matches per line, then sum
        total=0
        while IFS=: read -r linenum content; do
            count=$(echo "$content" | grep -oE "supabase\.rpc\(['\"]([^'\"\)]+)['\"]\)" | wc -l)
            ((total+=count))
        done < <(grep -n "supabase\.rpc(" "$file")
        
        echo "| \`$(basename $file)\` | $unique_rpcs | $total |"
    fi
    
    unset rpc_names_in_file
done

echo ""
echo "## Top 3 most-called RPCs"
echo ""
echo "| Rank | RPC | Calls | Files | Call sites |"
echo "|------|-----|-------|-------|------------|"

# Count occurrences of each RPC and get all file references
declare -A rpc_occurrences
declare -A rpc_file_lines

while IFS=: read -r fpath linenum content; do
    # Extract any RPC names on this line that match supabase.rpc('...') or supabase.rpc("...")
    while IFS= read -r rpc; do
        if [ -n "$rpc" ]; then
            ((rpc_occurrences[$rpc]++))
            
            # Build file:line entry - convert to relative path
            rel_path="${fpath#*Personal/src/}"  # Remove leading prefix
            key="${rel_path}:${linenum}"
            rpc_file_lines["$rpc"]+="$key, "
        fi
    done < <(echo "$content" | grep -oE "supabase\.rpc\(['\"]([^'\"\)]+)['\"]\)" | sed -E "s/supabase\.rpc\(['\"]([^'\"\)]+)['\"]\)/\1/")
done < <(grep -n "supabase\.rpc(" $FILES)

# Sort and show top 3
for rpc in "${!rpc_occurrences[@]}"; do
    echo "$rpc | ${rpc_occurrences[$rpc]}"
done | sort -t '|' -k2 -rn | head -3 | while IFS='|' read -r rpc count; do
    ((rank++))
    
    # Count unique files for this RPC
    files_in_rpc=$(echo "${rpc_file_lines[$rpc]}" | tr ',' '\n' | sed 's/:[0-9]*$//' | sort -u | wc -l)
    
    # Format call sites list (remove trailing comma and space)
    call_sites="${rpc_file_lines[$rpc]%?, }"
    
    echo "| $rank | \`$rpc\` | $count | $files_in_rpc | $call_sites |"
done

echo ""
echo "DONE"
