// Deuda preexistente: RPC de billeteras con nombre incorrecto (3 sitios)
const fs = require('fs');

const OLD_CALL = "('fn_obtener_billeteras_ordenadas_por_uso')";
const NEW_CALL = "('fn_obtener_billeteras_ordenadas', { p_orden: 'valor' })";

const files = [
  ['src/components/AddMovementModal/AddMovementModal.tsx', 2],
  ['src/pages/Inversiones/InversionesPage.tsx', 1],
];

for (const [file, expected] of files) {
  let src = fs.readFileSync(file, 'utf8');
  const count = src.split(OLD_CALL).length - 1;
  if (count !== expected) {
    console.error('ABORT ' + file + ': se esperaban ' + expected + ' matches, hay ' + count);
    process.exit(1);
  }
  src = src.split(OLD_CALL).join(NEW_CALL);
  fs.writeFileSync(file, src);
  console.log(file.split('/').pop() + ': ' + count + ' llamada(s) corregida(s)');
}

// contextBuilder ya no debe tener el nombre viejo
const cb = fs.readFileSync('src/voice/contextBuilder.ts', 'utf8');
console.log('contextBuilder limpio:', !cb.includes(OLD_CALL));
