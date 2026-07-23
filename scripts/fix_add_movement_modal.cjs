const fs = require('fs');
const path = require('path');

const esTsPath = path.join(__dirname, '../src/locales/es.ts');
const pagePath = path.join(__dirname, '../src/components/AddMovementModal/AddMovementModal.tsx');

let esTsContent = fs.readFileSync(esTsPath, 'utf8');
let pageContent = fs.readFileSync(pagePath, 'utf8');

const replacements = [
  { search: "{ label: 'Hace 2 días', offset: 2 }", replace: "{ label: t('movement_days_ago_2'), offset: 2 }" },
  { search: "'Monto inválido'", replace: "t('error_invalid_amount')" },
  { search: ">Crédito<", replace: ">{t('card_type_credit')}<" },
  { search: "Compra en Dólares (USD)", replace: "{t('card_usd_purchase')}" },
  { search: /Cotización actual: \{formatMonto\(cotizacionUsd\.toString\(\), 'ARS'\)\} USD <br\/> Recargo impositivo: \{rPct\}%/g, replace: "{t('card_usd_quote_current', { rate: formatMonto(cotizacionUsd.toString(), 'ARS'), pct: rPct })}" },
  { search: /Cotización: \{formatMonto\(cotizacionUsd\.toString\(\), 'ARS'\)\} USD <br\/> Recargo: \{rPct\}%/g, replace: "{t('card_usd_quote_simple', { rate: formatMonto(cotizacionUsd.toString(), 'ARS'), pct: rPct })}" },
  { search: "2. Categoría", replace: "2. {t('step_category')}" },
  { search: 'placeholder="Buscar categoría..."', replace: 'placeholder={t("placeholder_search_category")}' },
  { search: '+ Ver todas las categorías', replace: '+ {t("btn_see_all_categories")}' },
  { search: 'title="Agregar subcategoría"', replace: 'title={t("title_add_subcategory")}' },
  { search: '>Categoría:<', replace: '>{t("label_category")}:<' },
  { search: '>¿Cuándo?<', replace: '>{t("step_when")}<' },
  { search: '>Categoría<', replace: '>{t("label_category")}<' },
  { search: '🔍 Selecciona una categoría...', replace: '🔍 {t("placeholder_select_category")}' },
  { search: '>Seleccionar Categoría<', replace: '>{t("title_select_category")}<' },
  { search: 'label="Tarjetas de Crédito"', replace: 'label={t("group_credit_cards")}' },
];

const newKeys = {
  movement_days_ago_2: "Hace 2 días",
  error_invalid_amount: "Monto inválido",
  card_usd_purchase: "Compra en Dólares (USD)",
  card_usd_quote_current: "Cotización actual: {rate} USD <br/> Recargo impositivo: {pct}%",
  card_usd_quote_simple: "Cotización: {rate} USD <br/> Recargo: {pct}%",
  step_category: "Categoría",
  placeholder_search_category: "Buscar categoría...",
  btn_see_all_categories: "Ver todas las categorías",
  title_add_subcategory: "Agregar subcategoría",
  label_category: "Categoría",
  step_when: "¿Cuándo?",
  placeholder_select_category: "Selecciona una categoría...",
  title_select_category: "Seleccionar Categoría",
  group_credit_cards: "Tarjetas de Crédito",
};

let keysToAdd = [];
for (const [key, value] of Object.entries(newKeys)) {
  if (!esTsContent.includes(key + ':')) {
    keysToAdd.push(`  ${key}: "${value}",`);
  }
}

if (keysToAdd.length > 0) {
  const appendBlock = `\n  // Refactor AddMovementModal\n${keysToAdd.join('\n')}\n`;
  esTsContent = esTsContent.replace(/};\s*$/g, appendBlock + '};\n');
  fs.writeFileSync(esTsPath, esTsContent, 'utf8');
  console.log(`Added ${keysToAdd.length} keys to es.ts`);
}

replacements.forEach(({ search, replace }) => {
  if (typeof search === 'string') {
    pageContent = pageContent.split(search).join(replace);
  } else {
    pageContent = pageContent.replace(search, replace);
  }
});

fs.writeFileSync(pagePath, pageContent, 'utf8');
console.log('Updated AddMovementModal.tsx');
