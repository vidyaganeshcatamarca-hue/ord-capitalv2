const fs = require('fs');
const path = require('path');

const esTsPath = path.join(__dirname, '../src/locales/es.ts');

const newKeys = {
  // ErrorBoundary
  error_boundary_title: "Algo salió mal",
  error_boundary_desc: "Ocurrió un error inesperado al renderizar esta sección. Hemos registrado el incidente para solucionarlo pronto.",
  btn_reload_app: "Recargar aplicación",
  // EditMovementModal
  error_invalid_amount_positive: "Por favor, ingresa un importe válido mayor a cero.",
  group_credit_cards: "Tarjetas de Crédito", // Re-using if exists, wait, let's just make sure it's here
  option_select_category: "Selecciona categoría",
  // SubcuentaModal
  label_icon: "Ícono", // already exists
  bcg_calibration_title: "🎯 Calibración BCG (Fase 6)",
  // BilleteraDetailModal
  title_latest_movements: "Últimos Movimientos",
  // ConfigHogar
  invite_home_message: "Te invito a unirte a mi hogar en ORD Capital. Usa este código: {codigo}",
  // BCGDetalleCategoria
  bcg_no_data: "No hay datos de la categoría seleccionada.",
  // BCGPodora
  bcg_per_year: "/ año",
  bcg_current_shield: "Escudo actual: {dias} días",
  error_html2canvas_unavailable: "📷 html2canvas no disponible. Próximamente.",
  // BCGHormigas
  mailbox: "Buzón",
  // BCGResumenCuadrantes
  bcg_dog_desc: "${m}/mes te están drenando",
  // EscudoTiempoDetalle & Widget
  shield_per_day: "/día",
  shield_days: "{dias} días",
  // LicuadoraDetalle
  inflation_badge: "📈 Inflación",
  // RadarAsfixiaDetalle
  radar_heatmap_aria: "Mapa de calor 30 días",
  // ModoAppContext
  error_advanced_mode_disabled: "El modo avanzado no está habilitado globalmente",
  // AnalisisEmocionalPage
  emotional_analysis_advanced_tip: "💡 Algunas funciones avanzadas requieren pareja vinculada (se completan en próximas etapas).",
  // HomePage
  home_alert_asfixia: "⚠️ Días de Asfixia Financiera próximos"
};

let esTsContent = fs.readFileSync(esTsPath, 'utf8');
let keysToAdd = [];
for (const [key, value] of Object.entries(newKeys)) {
  if (!esTsContent.includes(key + ':')) {
    keysToAdd.push(`  ${key}: "${value}",`);
  }
}
if (keysToAdd.length > 0) {
  const appendBlock = `\n  // Refactor Remaining\n${keysToAdd.join('\n')}\n`;
  esTsContent = esTsContent.replace(/};\s*$/g, appendBlock + '};\n');
  fs.writeFileSync(esTsPath, esTsContent, 'utf8');
}

// Map files to replacements
const filesToFix = [
  {
    file: '../src/components/ErrorBoundary/ErrorBoundary.tsx',
    replacements: [
      { search: "Algo salió mal", replace: "{t('error_boundary_title')}" },
      { search: "Ocurrió un error inesperado al renderizar esta sección. Hemos registrado el incidente para solucionarlo pronto.", replace: "{t('error_boundary_desc')}" },
      { search: "Recargar aplicación", replace: "{t('btn_reload_app')}" }
    ]
  },
  {
    file: '../src/components/EditMovementModal/EditMovementModal.tsx',
    replacements: [
      { search: "'Por favor, ingresa un importe válido mayor a cero.'", replace: "t('error_invalid_amount_positive')" },
      { search: 'label="Tarjetas de Crédito"', replace: 'label={t("group_credit_cards")}' },
      { search: "Selecciona categoría", replace: "{t('option_select_category')}" }
    ]
  },
  {
    file: '../src/components/SubcuentaModal/SubcuentaModal.tsx',
    replacements: [
      { search: '<label className="cat-label">Ícono</label>', replace: '<label className="cat-label">{t("label_icon")}</label>' },
      { search: '🎯 Calibración BCG (Fase 6)', replace: '{t("bcg_calibration_title")}' }
    ]
  },
  {
    file: '../src/components/BilleteraDetailModal/BilleteraDetailModal.tsx',
    replacements: [
      { search: 'Últimos Movimientos', replace: '{t("title_latest_movements")}' }
    ]
  },
  {
    file: '../src/components/ConfigHogar/ConfigHogar.tsx',
    replacements: [
      { search: /`Te invito a unirte a mi hogar en ORD Capital\. Usa este código: \$\{codigo\.codigo\}`/g, replace: "t('invite_home_message', { codigo: codigo.codigo })" }
    ]
  },
  {
    file: '../src/components/bcg/BCGDetalleCategoria.tsx',
    replacements: [
      { search: 'No hay datos de la categoría seleccionada.', replace: '{t("bcg_no_data")}' }
    ]
  },
  {
    file: '../src/components/bcg/BCGPodora.tsx',
    replacements: [
      { search: '/ año', replace: '{t("bcg_per_year")}' },
      { search: /Escudo actual: \{lineaBase\.escudo_dias_actual\} días/g, replace: "{t('bcg_current_shield', { dias: lineaBase.escudo_dias_actual })}" },
      { search: "'📷 html2canvas no disponible. Próximamente.'", replace: "t('error_html2canvas_unavailable')" }
    ]
  },
  {
    file: '../src/components/bcg/BCGHormigas.tsx',
    replacements: [
      { search: "'Buzón'", replace: "t('mailbox')" }
    ]
  },
  {
    file: '../src/components/bcg/BCGResumenCuadrantes.tsx',
    replacements: [
      { search: /\$\{m\}\/mes te están drenando/g, replace: "${t('bcg_dog_desc', { m })}" }
    ]
  },
  {
    file: '../src/components/supervivencia/EscudoTiempoDetalle.tsx',
    replacements: [
      { search: '{formatMoneyARS(escudo.burn_rate_supervivencia)}/día', replace: '{formatMoneyARS(escudo.burn_rate_supervivencia)}{t("shield_per_day")}' },
      { search: '{esc.dias} días', replace: '{t("shield_days", { dias: esc.dias })}' }
    ]
  },
  {
    file: '../src/components/supervivencia/EscudoTiempoWidget.tsx',
    replacements: [
      { search: '{formatMoneyARS(escudo.burn_rate_supervivencia)}/día', replace: '{formatMoneyARS(escudo.burn_rate_supervivencia)}{t("shield_per_day")}' }
    ]
  },
  {
    file: '../src/components/supervivencia/LicuadoraDetalle.tsx',
    replacements: [
      { search: '📈 Inflación', replace: '{t("inflation_badge")}' }
    ]
  },
  {
    file: '../src/components/supervivencia/RadarAsfixiaDetalle.tsx',
    replacements: [
      { search: "'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'", replace: "t('day_short_lu', {defaultValue:'Lu'}), t('day_short_ma', {defaultValue:'Ma'}), t('day_short_mi', {defaultValue:'Mi'}), t('day_short_ju', {defaultValue:'Ju'}), t('day_short_vi', {defaultValue:'Vi'}), t('day_short_sa', {defaultValue:'Sá'}), t('day_short_do', {defaultValue:'Do'})" },
      { search: 'aria-label="Mapa de calor 30 días"', replace: 'aria-label={t("radar_heatmap_aria")}' }
    ]
  },
  {
    file: '../src/contexts/ModoAppContext.tsx',
    replacements: [
      { search: "'El modo avanzado no está habilitado globalmente'", replace: "t('error_advanced_mode_disabled')" }
    ]
  },
  {
    file: '../src/pages/AnalisisEmocional/AnalisisEmocionalPage.tsx',
    replacements: [
      { search: '💡 Algunas funciones avanzadas requieren pareja vinculada (se completan en próximas etapas).', replace: '{t("emotional_analysis_advanced_tip")}' }
    ]
  },
  {
    file: '../src/pages/Home/HomePage.tsx',
    replacements: [
      { search: '⚠️ Días de Asfixia Financiera próximos', replace: '{t("home_alert_asfixia")}' }
    ]
  }
];

let filesFixed = 0;
filesToFix.forEach(item => {
  const fullPath = path.join(__dirname, item.file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    let original = content;
    item.replacements.forEach(({ search, replace }) => {
      if (typeof search === 'string') {
        content = content.split(search).join(replace);
      } else {
        content = content.replace(search, replace);
      }
    });
    if (content !== original) {
      fs.writeFileSync(fullPath, content, 'utf8');
      filesFixed++;
    }
  }
});
console.log(`Updated ${filesFixed} files.`);
