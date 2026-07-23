const fs = require('fs');
const path = require('path');

const esTsPath = path.join(__dirname, '../src/locales/es.ts');
const pagePath = path.join(__dirname, '../src/pages/Categorias/CategoriasPage.tsx');

const newKeys = {
  // CategoriasPage
  cat_saving_label: "Ahorro",
  cat_saving_desc: "Metas, previsión",
  cat_investment_label: "Inversión",
  cat_investment_desc: "Activos financieros",
  placeholder_category_food: "Ej: Alimentación",
  label_budget_classification: "Clasificación Presupuestaria", // already exists
  label_icon: "Ícono",
  label_desc_optional: "Descripción (opcional)",
  placeholder_search_category: "Buscar categoría...", // already exists
  cat_empty_title: "Sin categorías",
  cat_child_empty: "Sin subcuentas aún",
  title_delete_category: "Eliminar Categoría",
  confirm_delete_category: "¿Estás seguro de que deseas eliminar la categoría \"{name}\"? No se podrá recuperar.",
  success_category_deleted: "Categoría eliminada",
  cat_empty_desc: "Crea las categorías de donde proviene tu dinero (Salario, Freelance, Alquiler…)",
  title_categories: "Categorías",
};

let esTsContent = fs.readFileSync(esTsPath, 'utf8');

let keysToAdd = [];
for (const [key, value] of Object.entries(newKeys)) {
  if (!esTsContent.includes(key + ':')) {
    keysToAdd.push(`  ${key}: "${value}",`);
  }
}

if (keysToAdd.length > 0) {
  const appendBlock = `\n  // Refactor CategoriasPage\n${keysToAdd.join('\n')}\n`;
  esTsContent = esTsContent.replace(/};\s*$/g, appendBlock + '};\n');
  fs.writeFileSync(esTsPath, esTsContent, 'utf8');
  console.log(`Added ${keysToAdd.length} keys to es.ts`);
}

let pageContent = fs.readFileSync(pagePath, 'utf8');

const replacements = [
  { search: "{ value: 'saving', label: 'Ahorro', desc: 'Metas, previsión' }", replace: "{ value: 'saving', label: t('cat_saving_label'), desc: t('cat_saving_desc') }" },
  { search: "{ value: 'investment', label: 'Inversión', desc: 'Activos financieros' }", replace: "{ value: 'investment', label: t('cat_investment_label'), desc: t('cat_investment_desc') }" },
  { search: 'placeholder="Ej: Alimentación"', replace: 'placeholder={t("placeholder_category_food")}' },
  { search: '<label className="cat-label">Clasificación Presupuestaria</label>', replace: '<label className="cat-label">{t("label_budget_classification")}</label>' },
  { search: '<label className="cat-label">Ícono</label>', replace: '<label className="cat-label">{t("label_icon")}</label>' },
  { search: '<label className="cat-label">Descripción (opcional)</label>', replace: '<label className="cat-label">{t("label_desc_optional")}</label>' },
  { search: "ahorro: 'Ahorro', inversion: 'Inversión',", replace: "ahorro: t('cat_saving_label'), inversion: t('cat_investment_label')," },
  { search: 'placeholder="Buscar categoría..."', replace: 'placeholder={t("placeholder_search_category")}' },
  { search: '<div className="cat-empty-title">Sin categorías</div>', replace: '<div className="cat-empty-title">{t("cat_empty_title")}</div>' },
  { search: '<div className="cat-hijo-empty">Sin subcuentas aún</div>', replace: '<div className="cat-hijo-empty">{t("cat_child_empty")}</div>' },
  { search: 'title="Eliminar Categoría"', replace: 'title={t("title_delete_category")}' },
  { search: /`¿Estás seguro de que deseas eliminar la categoría "\$\{deleteConfirm\.nombre\}"\? No se podrá recuperar\.`/g, replace: "t('confirm_delete_category', { name: deleteConfirm.nombre })" },
  { search: "'Categoría eliminada'", replace: "t('success_category_deleted')" },
  { search: '<div className="cat-empty-desc">Crea las categorías de donde proviene tu dinero (Salario, Freelance, Alquiler…)</div>', replace: '<div className="cat-empty-desc">{t("cat_empty_desc")}</div>' },
  { search: '<h1 className="font-display cat-page-title">Categorías</h1>', replace: '<h1 className="font-display cat-page-title">{t("title_categories")}</h1>' },
];

replacements.forEach(({ search, replace }) => {
  if (typeof search === 'string') {
    pageContent = pageContent.split(search).join(replace);
  } else {
    pageContent = pageContent.replace(search, replace);
  }
});

fs.writeFileSync(pagePath, pageContent, 'utf8');
console.log('Updated CategoriasPage.tsx');
