const fs = require('fs');
const path = require('path');

const esTsPath = path.join(__dirname, '../src/locales/es.ts');
const pagePath = path.join(__dirname, '../src/pages/Tarjetas/TarjetasPage.tsx');

let esTsContent = fs.readFileSync(esTsPath, 'utf8');
let pageContent = fs.readFileSync(pagePath, 'utf8');

const replacements = [
  { search: "'🟡 Precaución'", replace: "t('card_status_caution')" },
  { search: "`⚠️ Vence en ${dias} días. Acción inmediata requerida.`", replace: "t('card_due_critical', { dias })" },
  { search: "`🟠 Vence en ${dias} días. Pago urgente.`", replace: "t('card_due_urgent', { dias })" },
  { search: "`🟡 Vence en ${dias} días.`", replace: "t('card_due_caution', { dias })" },
  { search: "`Vence en ${dias} días`", replace: "t('card_due_normal', { dias })" },
  { search: "'El sistema necesita más datos (mínimo 30 días) para analizar tu capacidad de pago.'", replace: "t('card_learning_data')" },
  { search: "'Tienes saldo hoy, pero tus gastos fijos son altos. Mantén reservas.'", replace: "t('card_sufficient_balance_high_expenses')" },
  { search: "'Tu saldo actual no alcanza para cubrir la próxima cuota. Revisá tu situación.'", replace: "t('card_insufficient_balance_deficit')" },
  { search: "'Tu tarjeta está en buen estado. Seguí así.'", replace: "t('card_status_ok')" },
  { search: "'Ingresa un monto válido'", replace: "t('error_invalid_amount')" },
  { search: "'Tarjeta reactivada con éxito'", replace: "t('card_reactivated_success')" },
  { search: 'aria-label="Menú tarjeta"', replace: 'aria-label={t("aria_label_card_menu")}' },
  { search: '⚙️ Configura los límites para ver el análisis completo →', replace: '⚙️ {t("card_configure_limits_analysis")} →' },
  { search: 'Límite mensual utilizado', replace: '{t("card_monthly_limit_used")}' },
  { search: '💰 Límite Disponible', replace: '💰 {t("card_available_limit")}' },
  { search: '📅 Próximo Vencimiento', replace: '📅 {t("card_next_due_date")}' },
  { search: 'Día {venc.dia_vencimiento} ({venc.dias_para_vencimiento} días)', replace: '{t("card_due_date_format", { day: venc.dia_vencimiento, days: venc.dias_para_vencimiento })}' },
  { search: '📊 Termómetro de Estrés', replace: '📊 {t("card_stress_thermometer")}' },
  { search: 'Índice estrés', replace: '{t("card_stress_index")}' },
  { search: 'Próxima cuota', replace: '{t("card_next_installment")}' },
  { search: 'Sin datos suficientes para el análisis.', replace: '{t("card_insufficient_data_analysis")}' },
  { search: '¿Archivar "${targetCard?.nombre_tarjeta}"? Solo deberías hacerlo si no tiene compromisos pendientes.', replace: 't("card_archive_confirm_pending", { name: targetCard?.nombre_tarjeta })' },
  { search: '{v.dias_para_vencimiento} días', replace: '{t("card_days_format", { days: v.dias_para_vencimiento })}' },
  { search: '<h3>Sin tarjetas todavía</h3>', replace: '<h3>{t("card_empty_state_title")}</h3>' },
  { search: 'Agregá tu primera tarjeta para gestionar tus deudas y cuotas', replace: '{t("card_empty_state_desc")}' },
  { search: "a.tipo_deuda === 'tarjeta' ? 'Tarjeta de Crédito' : 'Préstamo/Deuda'", replace: "a.tipo_deuda === 'tarjeta' ? t('card_type_credit') : t('card_type_loan')" },
  { search: 'Necesitás al menos un ciclo completo de uso para ver la comparativa mensual', replace: '{t("card_need_full_cycle_comparative")}' },
  { search: /🎉 ¡Excelente disciplina! Redujiste tu uso un \$\{Math\.abs\(Number\(c\.variacion_porcentual\)\)\.toFixed\(0\)\}% este mes\./g, replace: "🎉 t('card_excellent_discipline_reduced', { pct: Math.abs(Number(c.variacion_porcentual)).toFixed(0) })" },
  { search: '¿Archivar "${targetCard?.nombre_tarjeta}"? Esta acción es reversible desde ajustes.', replace: 't("card_archive_confirm_reversible", { name: targetCard?.nombre_tarjeta })' },
  { search: '<label className="tarjeta-form-label">Día de Cierre</label>', replace: '<label className="tarjeta-form-label">{t("card_form_closing_day")}</label>' },
  { search: '<label className="tarjeta-form-label">Día de Vencimiento</label>', replace: '<label className="tarjeta-form-label">{t("card_form_due_day")}</label>' },
  { search: '<label className="tarjeta-form-label">Límite Mensual Un Pago ($) (Opcional)</label>', replace: '<label className="tarjeta-form-label">{t("card_form_monthly_limit_optional")}</label>' },
  { search: '<label className="tarjeta-form-label">Límite para Compras en Cuotas ($) (Opcional)</label>', replace: '<label className="tarjeta-form-label">{t("card_form_installments_limit_optional")}</label>' },
  { search: '<label className="tarjeta-form-label">% Recargo Dólar (Opcional)</label>', replace: '<label className="tarjeta-form-label">{t("card_form_usd_surcharge_optional")}</label>' },
];

const newKeys = {
  card_status_caution: "🟡 Precaución",
  card_due_critical: "⚠️ Vence en {dias} días. Acción inmediata requerida.",
  card_due_urgent: "🟠 Vence en {dias} días. Pago urgente.",
  card_due_caution: "🟡 Vence en {dias} días.",
  card_due_normal: "Vence en {dias} días",
  card_learning_data: "El sistema necesita más datos (mínimo 30 días) para analizar tu capacidad de pago.",
  card_sufficient_balance_high_expenses: "Tienes saldo hoy, pero tus gastos fijos son altos. Mantén reservas.",
  card_insufficient_balance_deficit: "Tu saldo actual no alcanza para cubrir la próxima cuota. Revisá tu situación.",
  card_status_ok: "Tu tarjeta está en buen estado. Seguí así.",
  card_reactivated_success: "Tarjeta reactivada con éxito",
  aria_label_card_menu: "Menú tarjeta",
  card_configure_limits_analysis: "Configura los límites para ver el análisis completo",
  card_monthly_limit_used: "Límite mensual utilizado",
  card_available_limit: "Límite Disponible",
  card_next_due_date: "Próximo Vencimiento",
  card_due_date_format: "Día {day} ({days} días)",
  card_stress_thermometer: "Termómetro de Estrés",
  card_stress_index: "Índice estrés",
  card_next_installment: "Próxima cuota",
  card_insufficient_data_analysis: "Sin datos suficientes para el análisis.",
  card_archive_confirm_pending: "¿Archivar \"{name}\"? Solo deberías hacerlo si no tiene compromisos pendientes.",
  card_days_format: "{days} días",
  card_empty_state_title: "Sin tarjetas todavía",
  card_empty_state_desc: "Agregá tu primera tarjeta para gestionar tus deudas y cuotas",
  card_type_credit: "Tarjeta de Crédito",
  card_type_loan: "Préstamo/Deuda",
  card_need_full_cycle_comparative: "Necesitás al menos un ciclo completo de uso para ver la comparativa mensual",
  card_excellent_discipline_reduced: "¡Excelente disciplina! Redujiste tu uso un {pct}% este mes.",
  card_archive_confirm_reversible: "¿Archivar \"{name}\"? Esta acción es reversible desde ajustes.",
  card_form_closing_day: "Día de Cierre",
  card_form_due_day: "Día de Vencimiento",
  card_form_monthly_limit_optional: "Límite Mensual Un Pago ($) (Opcional)",
  card_form_installments_limit_optional: "Límite para Compras en Cuotas ($) (Opcional)",
  card_form_usd_surcharge_optional: "% Recargo Dólar (Opcional)",
};

let keysToAdd = [];
for (const [key, value] of Object.entries(newKeys)) {
  if (!esTsContent.includes(key + ':')) {
    keysToAdd.push(`  ${key}: "${value}",`);
  }
}

if (keysToAdd.length > 0) {
  const appendBlock = `\n  // Refactor TarjetasPage\n${keysToAdd.join('\n')}\n`;
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
console.log('Updated TarjetasPage.tsx');
