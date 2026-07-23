const fs = require('fs');
const path = require('path');

const esTsPath = path.join(__dirname, '../src/locales/es.ts');

const newKeys = {
  // CategoriasPage
  cat_saving_label: "Ahorro", // might already exist, checking
  cat_saving_desc: "Metas, previsión",
  cat_investment_label: "Inversión",
  cat_investment_desc: "Activos financieros",
  // AddMovementModal
  movement_days_ago_2: "Hace 2 días", // might exist
  // PerfilPage
  success_logout: "Sesión cerrada correctamente",
  error_logout: "Error al cerrar sesión: ",
  btn_logout: "Cerrar Sesión",
};

let esTsContent = fs.readFileSync(esTsPath, 'utf8');
let keysToAdd = [];
for (const [key, value] of Object.entries(newKeys)) {
  if (!esTsContent.includes(key + ':')) {
    keysToAdd.push(`  ${key}: "${value}",`);
  }
}
if (keysToAdd.length > 0) {
  const appendBlock = `\n  // Remaining 6 fixes\n${keysToAdd.join('\n')}\n`;
  esTsContent = esTsContent.replace(/};\s*$/g, appendBlock + '};\n');
  fs.writeFileSync(esTsPath, esTsContent, 'utf8');
}

// 1. CategoriasPage
const categoriasPath = path.join(__dirname, '../src/pages/Categorias/CategoriasPage.tsx');
let categoriasContent = fs.readFileSync(categoriasPath, 'utf8');
categoriasContent = categoriasContent.replace(
  "{ value: 'saving',     label: 'Ahorro',     desc: 'Metas, previsión' },",
  "{ value: 'saving',     label: t('cat_saving_label'),     desc: t('cat_saving_desc') },"
);
categoriasContent = categoriasContent.replace(
  "{ value: 'investment', label: 'Inversión',  desc: 'Activos financieros' },",
  "{ value: 'investment', label: t('cat_investment_label'),  desc: t('cat_investment_desc') },"
);
fs.writeFileSync(categoriasPath, categoriasContent, 'utf8');

// 2. AddMovementModal
const addMovementPath = path.join(__dirname, '../src/components/AddMovementModal/AddMovementModal.tsx');
let addMovementContent = fs.readFileSync(addMovementPath, 'utf8');
addMovementContent = addMovementContent.replace(
  "{ label: 'Hace 2 días',offset: 2 },",
  "{ label: t('movement_days_ago_2'), offset: 2 },"
);
fs.writeFileSync(addMovementPath, addMovementContent, 'utf8');

// 3. PerfilPage
const perfilPath = path.join(__dirname, '../src/pages/Perfil/PerfilPage.tsx');
let perfilContent = fs.readFileSync(perfilPath, 'utf8');
perfilContent = perfilContent.replace(
  "showToast('Sesión cerrada correctamente', 'success');",
  "showToast(t('success_logout'), 'success');"
);
perfilContent = perfilContent.replace(
  "showToast('Error al cerrar sesión: ' + (error.message || error), 'error');",
  "showToast(t('error_logout') + (error.message || error), 'error');"
);
perfilContent = perfilContent.replace(
  "Cerrar Sesión",
  "{t('btn_logout')}"
);
fs.writeFileSync(perfilPath, perfilContent, 'utf8');

console.log('Fixed the remaining 6 hardcoded strings.');
