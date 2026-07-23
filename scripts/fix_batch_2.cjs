const fs = require('fs');
const path = require('path');

const esTsPath = path.join(__dirname, '../src/locales/es.ts');

const newKeys = {
  // AddCategoryModal
  title_create_category: "🏷️ Crear Categoría",
  desc_create_category: "Crea una categoría principal o agrégala bajo un rubro existente.",
  label_subcategory_child: "Subcategoría Hija",
  label_budget_classification: "Clasificación Presupuestaria",
  option_saving_desc: "Ahorro (Metas, previsión)",
  option_investment_desc: "Inversión (Activos financieros)",
  label_theme_color: "Color Temático",

  // BilleterasPage
  error_invalid_opening_balance: "Saldo de apertura inválido",
  error_name_empty: "El nombre no puede estar vacío",
  error_archive_active_balance: "No se puede archivar una cuenta con saldo activo. Vacíala antes de archivar.",
  alert_unreconciled_10_days: "Lleva más de 10 días sin conciliar. ",
  alert_no_movements_60_days: "Sin movimientos en 60 días (candidata a archivar).",
  badge_prevision_fund: "Fondo Previsión",
  option_usd_currency: "Dólares Estadounidenses (USD)",
  label_theoretical_balance: "Saldo Teórico (App)",
  confirm_archive_wallet: "¿Estás seguro de que deseas archivar la cuenta \"{name}\"? No aparecerá en el listado activo.",
};

let esTsContent = fs.readFileSync(esTsPath, 'utf8');

let keysToAdd = [];
for (const [key, value] of Object.entries(newKeys)) {
  if (!esTsContent.includes(key + ':')) {
    keysToAdd.push(`  ${key}: "${value}",`);
  }
}

if (keysToAdd.length > 0) {
  const appendBlock = `\n  // Refactor Billeteras y Categorias\n${keysToAdd.join('\n')}\n`;
  esTsContent = esTsContent.replace(/};\s*$/g, appendBlock + '};\n');
  fs.writeFileSync(esTsPath, esTsContent, 'utf8');
  console.log(`Added ${keysToAdd.length} keys to es.ts`);
}

// ------------------- REPLACE AddCategoryModal -------------------
const catModalPath = path.join(__dirname, '../src/components/AddMovementModal/AddCategoryModal.tsx');
let catModalContent = fs.readFileSync(catModalPath, 'utf8');

const catReplacements = [
  { search: '🏷️ Crear Categoría', replace: '{t("title_create_category")}' },
  { search: 'Crea una categoría principal o agrégala bajo un rubro existente.', replace: '{t("desc_create_category")}' },
  { search: 'Subcategoría Hija', replace: '{t("label_subcategory_child")}' },
  { search: 'Clasificación Presupuestaria', replace: '{t("label_budget_classification")}' },
  { search: 'Ahorro (Metas, previsión)', replace: '{t("option_saving_desc")}' },
  { search: 'Inversión (Activos financieros)', replace: '{t("option_investment_desc")}' },
  { search: 'Color Temático', replace: '{t("label_theme_color")}' },
];

catReplacements.forEach(({ search, replace }) => {
  catModalContent = catModalContent.split(search).join(replace);
});
fs.writeFileSync(catModalPath, catModalContent, 'utf8');

// ------------------- REPLACE BilleterasPage -------------------
const billeterasPath = path.join(__dirname, '../src/pages/Billeteras/BilleterasPage.tsx');
let billeterasContent = fs.readFileSync(billeterasPath, 'utf8');

const billeterasReplacements = [
  { search: "'Saldo de apertura inválido'", replace: "t('error_invalid_opening_balance')" },
  { search: "'El nombre no puede estar vacío'", replace: "t('error_name_empty')" },
  { search: "'No se puede archivar una cuenta con saldo activo. Vacíala antes de archivar.'", replace: "t('error_archive_active_balance')" },
  { search: "'Lleva más de 10 días sin conciliar. '", replace: "t('alert_unreconciled_10_days')" },
  { search: "'Sin movimientos en 60 días (candidata a archivar).'", replace: "t('alert_no_movements_60_days')" },
  { search: "Fondo Previsión", replace: "{t('badge_prevision_fund')}" },
  { search: "Dólares Estadounidenses (USD)", replace: "{t('option_usd_currency')}" },
  { search: "Saldo Teórico (App)", replace: "{t('label_theoretical_balance')}" },
  { search: /`¿Estás seguro de que deseas archivar la cuenta "\$\{selectedBilletera\?\.nombre\}"\? No aparecerá en el listado activo\.`/g, replace: "t('confirm_archive_wallet', { name: selectedBilletera?.nombre })" },
];

billeterasReplacements.forEach(({ search, replace }) => {
  if (typeof search === 'string') {
    billeterasContent = billeterasContent.split(search).join(replace);
  } else {
    billeterasContent = billeterasContent.replace(search, replace);
  }
});
fs.writeFileSync(billeterasPath, billeterasContent, 'utf8');
