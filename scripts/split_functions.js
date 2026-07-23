const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, 'Funciones.md');
const OUTPUT_DIR = __dirname;

// Leer archivo completo
const content = fs.readFileSync(INPUT_FILE, 'utf8');

// Encontrar todas las funciones usando patrones de tabla markdown
// Cada funcion empieza con: | fn_nombre | funcion | CREATE...
// y termina con: END;\n$function$\n<espacios> |

// Estrategia: buscar lineas que comienzan con "| fn_" y contienen "funcion"
const lines = content.split('\n');
const functions = [];
let currentName = null;
let currentCodeLines = [];
let inFunction = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detectar inicio de nuevo: comienza con "| fn_" y tiene " | funcion |"
    if (!inFunction && /^\| fn_[\w]+ +\| funcion \|/.test(line)) {
        inFunction = true;
        currentName = line.match(/^\|(fn_[\w]+)/)?.[1];
        // La línea también contiene la primera parte del SQL
        const restOfLine = line.replace(/^\||\|.*$/, '').trim();
        
        if (restOfLine && !restOfLine.startsWith('|')) {
            currentCodeLines = [restOfLine];
        } else {
            currentCodeLines = [];
        }
        continue;
    }
    
    if (inFunction) {
        currentCodeLines.push(line);
        
        // Detectar fin de función: "$function$" seguido de espacios y luego "|" al final
        let isEndOfFunction = false;
        let remainingText = '';
        
        for (let j = i; j < lines.length; j++) {
            if (lines[j].includes('$function$')) {
                // Obtener lo que hay después de $function$ en esta línea
                const idx = lines[j].indexOf('$function$') + '$function$'.length;
                remainingText = lines[j].substring(idx).trim();
                
                // Si el resto es solo espacios o "|" o vacío, es el final
                isEndOfFunction = true;
                i += remainingText.length === 0 ? 0 : (lines.slice(j+1).every(l => l.trim().replace('|', '').replace(/\s/g,'').length === 0) || lines[j].trim().replace('$function$','').trim() === '' || /^\|?\s*\|?\s*$/.test(remainingText));
                
                // En realidad verificamos: lo que viene despues de $function$ es solo espacios + | o vacío
                const after = lines[j].substring(idx).replace(/\|/g,'').trim();
                i = j; // ajustar para no repetir lineas en el bucle exterior
                
                break;
            }
        }
        
        if (isEndOfFunction) {
            functions.push({ name: currentName, code: currentCodeLines.join('\n') });
            inFunction = false;
            currentName = null;
            currentCodeLines = [];
        }
    }
}

console.log(`Total funciones encontradas: ${functions.length}`);

// Limpiar cada función del código SQL
let totalWritten = 0;
for (const fn of functions) {
    let code = fn.code;
    
    // Eliminar lineas vacías que solo tengan espacios triviales o "|"
    // La línea con el nombre de la función: "| fn_xxx | funcion |..." -> eliminar todo antes del SQL
    // Quitar primera linea si es el header de tabla
    if (currentName === null) continue;
    
    code = code.replace(/^[|\s]*\| *fn_[\w]+ +\| *\n?/, '');
    
    // Limpiar líneas vacías que son solo espacios y "|" al final de cada línea original
    code = code.replace(/[ \t]*\|[ \t]*/gmi, (match) => {
        const trimmed = match.trim();
        if (trimmed === '' || trimmed === '|' || trimmed.length <= 1) return '';
        return '\n';
    });
    
    // Eliminar lineas completamente vacías que quedaron de la limpieza excesiva
    code = code.split('\n').filter(l => l.trim() !== '').join('\n');
    
    // Limpiar espacios al final de cada línea
    const cleanedLines = code.split('\n').map(l => l.replace(/[ \t]+$/, ''));
    code = cleanedLines.join('\n').trim();
    
    const outFile = path.join(OUTPUT_DIR, `${fn.name}.md`);
    fs.writeFileSync(outFile, code + '\n', 'utf8');
    totalWritten++;
}

console.log(`Archivos generados: ${totalWritten}`);
