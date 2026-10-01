// Restaurar los 3 cierres del SQL dentro del script
const fs = require('fs');
const f = 'temp_sql/apply_fn_cargar_sanitize2.cjs';
let s = fs.readFileSync(f, 'utf8');
const needle = '+ ' + String.fromCharCode(34) + "''" + String.fromCharCode(34) + " + '));'";
const repl = '+ ' + String.fromCharCode(34) + "''" + String.fromCharCode(34) + " + ')))'";
const count = s.split(needle).length - 1;
console.log('matches:', count);
if (count === 1) { s = s.split(needle).join(repl); fs.writeFileSync(f, s); console.log('restaurado'); }
else process.exit(1);
