const fs = require('fs');
const path = require('path');

const esTsPath = path.join(__dirname, '../src/locales/es.ts');
const pagePath = path.join(__dirname, '../src/pages/Presupuestos/PresupuestosPage.tsx');

let esTsContent = fs.readFileSync(esTsPath, 'utf8');
let pageContent = fs.readFileSync(pagePath, 'utf8');

const replacements = [
  { search: "'AHORRO E INVERSIÓN'", replace: "t('budget_label_saving_investment')" },
  { search: "'PROYECCIÓN DEL MES'", replace: "t('budget_projection_month')" },
  { search: "'¡BASE CERO ALCANZADO! ✅'", replace: "t('budget_zero_base_reached')" },
  { search: "'SOBRE-ASIGNACIÓN'", replace: "t('budget_over_allocation')" },
  { search: "'Estás presupuestando dinero que no tienes'", replace: "t('budget_over_allocation_desc')" },
  { search: "'Ingresa un monto válido'", replace: "t('error_invalid_amount')" },
  { search: /`No puedes asignar más\. Disponible: \$\{formatMonto\(saldoAsignar \?\? 0\)\}`/g, replace: "t('budget_error_exceeds_available', { amount: formatMonto(saldoAsignar ?? 0) })" },
  { search: "'No puedes asignar más del saldo disponible'", replace: "t('budget_error_exceeds_available_simple')" },
  { search: "'No puedes transferir más de lo disponible en el sobre origen'", replace: "t('budget_error_transfer_exceeds')" },
  { search: /`✅ Se cubrió el déficit con disponible para asignar`/g, replace: "t('budget_success_deficit_covered')" },
  { search: "'El día ancla debe estar entre 1 y 31'", replace: "t('budget_error_invalid_anchor_day')" },
  { search: "'🎯 Modo Base Cero activado. ¡A presupuestar!'", replace: "t('budget_success_base_cero_activated')" },
  { search: "'Proyección calculada en base a ingresos, porcentajes de distribución y gastos comprometidos de tarjetas.'", replace: "t('budget_projection_info')" },
  { search: "{ key: 'ahorro', emoji: '💎', label: 'Ahorro/Inversión' }", replace: "{ key: 'ahorro', emoji: '💎', label: t('budget_rule_ahorro') }" },
  { search: "'✅ Total: 100% — ¡Perfecto!'", replace: "t('budget_rules_total_perfect')" },
  { search: '<div className="dia-ancla-label">📅 Día de inicio del ciclo</div>', replace: '<div className="dia-ancla-label">{t("budget_golden_rules_anchor_day")}</div>' },
  { search: '<div className="modal-subtitulo">Estás por activar un compromiso serio</div>', replace: '<div className="modal-subtitulo">{t("budget_golden_rules_modal_subtitle")}</div>' },
  { search: 'Cada peso deberá tener un destino asignado antes de gastarlo.', replace: '{t("budget_golden_rules_modal_point1")}' },
  { search: 'Si gastas de más en una categoría, deberás quitarle a otra.', replace: '{t("budget_golden_rules_modal_point2")}' },
  { search: 'El sistema te confrontará visualmente con las consecuencias (sin bloquear).', replace: '{t("budget_golden_rules_modal_point3")}' },
  { search: 'aria-label="Información"', replace: 'aria-label={t("aria_label_info")}' },
  { search: '<h3>Sin categorías de presupuesto</h3>', replace: '<h3>{t("budget_empty_state_title")}</h3>' },
  { search: 'Crea categorías con tipo de cupo (Necesidad / Deseo / Ahorro)', replace: '{t("budget_empty_state_desc1")}' },
  { search: 'en la sección de <strong>Categorías</strong> para empezar a presupuestar.', replace: '{t("budget_empty_state_desc2")}' },
  { search: 'Entendido</button>', replace: '{t("btn_understood")}</button>' },
  { search: "⚠️ Arrastre: -{`$${Math.round(arrastre).toLocaleString('es-AR')}`}", replace: "⚠️ {t('budget_carryover_warning')}: -{`$${Math.round(arrastre).toLocaleString('es-AR')}`}" },
];

const newKeys = {
  budget_label_saving_investment: "AHORRO E INVERSIÓN",
  budget_projection_month: "PROYECCIÓN DEL MES",
  budget_zero_base_reached: "¡BASE CERO ALCANZADO! ✅",
  budget_over_allocation: "SOBRE-ASIGNACIÓN",
  budget_over_allocation_desc: "Estás presupuestando dinero que no tienes",
  error_invalid_amount: "Ingresa un monto válido",
  budget_error_exceeds_available: "No puedes asignar más. Disponible: {amount}",
  budget_error_exceeds_available_simple: "No puedes asignar más del saldo disponible",
  budget_error_transfer_exceeds: "No puedes transferir más de lo disponible en el sobre origen",
  budget_success_deficit_covered: "✅ Se cubrió el déficit con disponible para asignar",
  budget_error_invalid_anchor_day: "El día ancla debe estar entre 1 y 31",
  budget_success_base_cero_activated: "🎯 Modo Base Cero activado. ¡A presupuestar!",
  budget_projection_info: "Proyección calculada en base a ingresos, porcentajes de distribución y gastos comprometidos de tarjetas.",
  budget_rules_total_perfect: "✅ Total: 100% — ¡Perfecto!",
  budget_golden_rules_anchor_day: "📅 Día de inicio del ciclo",
  budget_golden_rules_modal_subtitle: "Estás por activar un compromiso serio",
  budget_golden_rules_modal_point1: "Cada peso deberá tener un destino asignado antes de gastarlo.",
  budget_golden_rules_modal_point2: "Si gastas de más en una categoría, deberás quitarle a otra.",
  budget_golden_rules_modal_point3: "El sistema te confrontará visualmente con las consecuencias (sin bloquear).",
  aria_label_info: "Información",
  budget_empty_state_title: "Sin categorías de presupuesto",
  budget_empty_state_desc1: "Crea categorías con tipo de cupo (Necesidad / Deseo / Ahorro)",
  budget_empty_state_desc2: "en la sección de <strong>Categorías</strong> para empezar a presupuestar.",
  btn_understood: "Entendido",
  budget_carryover_warning: "Arrastre",
};

// Add keys to es.ts if missing
let keysToAdd = [];
for (const [key, value] of Object.entries(newKeys)) {
  if (!esTsContent.includes(key + ':')) {
    keysToAdd.push(`  ${key}: "${value}",`);
  }
}

if (keysToAdd.length > 0) {
  // Find a good place to inject, like after PresupuestosPage section
  // Let's just append before the last '};'
  const appendBlock = `\n  // Refactor PresupuestosPage\n${keysToAdd.join('\n')}\n`;
  esTsContent = esTsContent.replace(/};\s*$/g, appendBlock + '};\n');
  fs.writeFileSync(esTsPath, esTsContent, 'utf8');
  console.log(`Added ${keysToAdd.length} keys to es.ts`);
}

// Replace in page
replacements.forEach(({ search, replace }) => {
  if (typeof search === 'string') {
    pageContent = pageContent.split(search).join(replace);
  } else {
    pageContent = pageContent.replace(search, replace);
  }
});

// Fix strong tags that got split
pageContent = pageContent.replace('{t("budget_empty_state_desc2")}', 'en la sección de <strong>{t("menu_categorias")}</strong> para empezar a presupuestar.');

fs.writeFileSync(pagePath, pageContent, 'utf8');
console.log('Updated PresupuestosPage.tsx');
