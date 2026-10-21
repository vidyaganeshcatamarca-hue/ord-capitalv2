// Collect the keys the translators flagged as uncertain, so the refuters work
// on a bounded list instead of the whole dictionary.
//
//   node scripts/i18n/uncertain.mjs [target]
//
// Output: scratch/<target>-uncertain.json
//
// The FLAGGED lists come from the "least certain" keys each translator
// reported. The SHARED_CONCEPTS are the product terms that must be
// translated the same way in every section, whichever language it is.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const TARGET_LANG = process.argv[2] ?? 'en'
const INPUT = path.resolve(`scratch/${TARGET_LANG}-input`)
const OUTPUT = path.resolve(`scratch/${TARGET_LANG}-output`)

/**
 * The keys each translator reported as least certain. Empty for a language
 * whose translators reported nothing specific.
 */
const FLAGGED = {
  en: {
    'category_keys.json': [
      'cat_greengrocer', 'cat_fresh_foods', 'cat_dry_goods', 'cat_bazaar',
      'cat_hygiene', 'initial_balance_mother_account', 'cat_misterio',
      'cat_non_alc_drinks', 'cat_alcohol_drinks',
    ],
    'war_room.json': [
      'war_radar_mensaje_criticos', 'war_escudo_config_label_promedio',
      'war_escudo_recomendacion', 'war_licuadora_insight_negativo',
      'war_licuadora_insight_positivo', 'war_podora_mensaje_con',
      'war_safe_subtitulo',
    ],
    'bcg.json': [
      'bcg_eje_y_label', 'bcg_hormiga_reto_titulo', 'bcg_buzon_modal_titulo',
      'bcg_hormiga_estado_transfer_desc', 'bcg_podora_sin_metas',
      'bcg_hormiga_total_label', 'bcg_clasif_extremo',
    ],
    'saneamiento.json': [
      'saneamiento_ataquewidget_fin_estimada', 'saneamiento_cuota_mensual',
      'saneamiento_origen', 'saneamiento_estrategia_relationships',
      'saneamiento_estrategia_relationships_desc', 'cuarentena_tipo_card_expense',
      'saneamiento_calendario_vacio_desc',
    ],
    'errors-1.json': [
      'error_sum_must_be_zero', 'card_legacy_delete_btn', 'error_carga_not_found',
      'calc_key_backspace', 'home_filter_period_custom',
      'card_legacy_created_toast', 'error_carga_tiene_pagos',
    ],
    'errors-4.json': ['voice_load_failed', 'menu_cuarentena'],
    'inversiones-1.json': [
      'msg_beat_inflation', 'label_tna', 'tab_track_record',
      'disclaimer_new_investment', 'notif_balance_threshold',
      'config_modo_app_title', 'config_fugas_title',
      'privacidad_section_export', 'type_cedear', 'privacidad_delete_confirm_body',
    ],
    'inversiones-3.json': [
      'card_capacity_label', 'option_saving_desc', 'cat_saving_desc',
      'config_ie_summary_cats_parent_created',
    ],
    'reports.json': [
      'pantalla_tickets', 'pantalla_grupo_aprobar', 'reporte_tipo_bug',
      'reporte_envio_demora',
    ],
    'voice.json': [
      'hold_to_send', 'record_hint', 'recording_max', 'seconds_left',
      'mic_denied', 'mic_unavailable', 'fab_a11y',
    ],
    'wallets.json': [],
    'tour.json': [],
  },
  pt: {
    'category_keys.json': [
      'cat_misterio', 'cat_dry_goods', 'cat_bazaar', 'cat_greengrocer',
      'cat_butcher', 'cat_deli_cheese', 'cat_hygiene', 'cat_housing',
      'cat_clothing', 'initial_balance_mother_account', 'card_summary_payment_split',
    ],
    'voice.json': ['processing', 'mic_busy', 'mic_unavailable', 'record_hint', 'fab_a11y'],
    'wallets.json': ['sem_dato_dudoso', 'sem_sin_conciliar', 'empty_desc', 'health_alert_negative_balance'],
    'tour.json': ['home.step7.title', 'home.step10.howTo', 'home.step2.howTo', 'trigger.label'],
    'errors-1.json': [
      'error_no_orphan_savings_funds', 'card_form_limit_one_payment_label',
      'card_legacy_delete_btn', 'error_carga_tiene_pagos', 'error_carga_not_found',
      'mystery_leak_warning', 'fugas_misterio_ocultado_toast', 'fugas_misterio_ocultar_tooltip',
      'hero_title_safe_to_spend', 'error_sum_must_be_zero', 'pay_overpay_favor_restante',
      'label_current', 'hero_title_to_assign',
    ],
    'errors-2.json': [
      'budget_resumen_cupos_title', 'budget_empty_desc', 'label_carryover_short',
      'budget_option_fill_gap_title', 'activate_base_cero_terms_1',
      'pay_resumen_real_falta', 'budget_mode_anticipado', 'budget_mode_base_cero_short',
      'golden_rules_settings_title', 'card_detail_due_day_in',
      'unit_subaccounts_singular', 'unit_subaccounts_plural',
    ],
    'errors-3.json': [
      'wallets_maintenance_required', 'confirm_archive_wallet_msg', 'confirm_delete_category_msg',
      'confirm_approve_all_msg',
    ],
    'errors-4.json': ['voice_load_failed', 'voice_generic_error', 'voice_network_error'],
    'inversiones-1.json': [
      'btn_liquidate', 'modal_liquidate_title', 'type_plazo_fijo', 'placeholder_active_name',
      'label_gain', 'notif_cat_hogar', 'notif_balance_threshold', 'config_hogar',
      'config_hogar_desc', 'config_fugas_title', 'holding_days', 'notif_ios_unsupported',
      'label_tna',
    ],
    'inversiones-2.json': [
      'config_mostrar_misterio', 'recordatorio_dia_l', 'recordatorio_dia_m',
      'recordatorio_dia_x', 'recordatorio_dia_j', 'recordatorio_dia_v',
      'recordatorio_dia_s', 'recordatorio_dia_d',
      'config_ie_reconcile_new_account_cupo', 'config_operational_desc',
      'config_country_locked', 'card_next_installment_due', 'config_ocr_enabled',
      'config_ie_reconcile_reinstate',
    ],
    'inversiones-3.json': [
      'config_hogar', 'config_ie_summary_cats_parent_created', 'budget_carryover_warning',
      'card_form_monthly_limit_optional', 'card_form_usd_surcharge_optional',
      'budget_empty_state_desc1', 'config_voice_enabled', 'card_status_healthy',
      'config_ocr_auto_approve', 'budget_golden_rules_modal_point1',
    ],
    'inversiones-4.json': [],
    'reports.json': ['pantalla_tickets', 'pantalla_carga', 'pantalla_grupo_carga'],
    'saneamiento.json': [
      'saneamiento_simular_aviso', 'cuarentena_campo_cuenta_ingreso',
      'cuarentena_ambig_fuente_ingreso', 'saneamiento_error_cuenta_ingreso_requerida',
      'saneamiento_bandejawidget_titulo', 'card_cmp_legend_up', 'card_cmp_legend_down',
      'saneamiento_tipo_cuota_prestamo', 'saneamiento_foto_titulo', 'saneamiento_foto_alt',
    ],
    'war_room.json': [
      'war_licuadora_insight_negativo', 'war_podora_titulo', 'war_podora_label_potencial',
      'war_podora_mensaje_con', 'war_podora_mensaje_sin', 'war_safe_sin_billeteras',
      'war_radar_titulo', 'war_radar_leyenda_rojo', 'war_radar_sin_billeteras',
      'war_radar_detalle_pagina_titulo', 'war_escudo_detalle_kicker',
    ],
    'bcg.json': [],
  },
}

/**
 * The product concepts that must read the same in every section. The needle
 * is matched against the SPANISH source, so the list is language-neutral.
 */
const SHARED_CONCEPTS = {
  'cuarentena': 'the quarantine metaphor',
  'buzon de': 'the "wish mailbox" metaphor',
  'sobre de': 'the savings envelope',
  podora: 'the mower metaphor',
  'radar de asfixia': 'the suffocation radar',
  'base cero': 'the zero base budget',
  'plazo fijo': 'fixed-term deposit',
  cedear: 'CEDEAR',
  'fondo de prevision': 'provision fund',
  'modo libertad': 'free mode',
  resumen: 'card statement',
  'cuenta madre': 'parent account',
  conciliacion: 'reconciliation',
  'escudo de tiempo': 'time shield',
}

const out = []
for (const file of readdirSync(OUTPUT).filter((f) => f.endsWith('.json'))) {
  const chunk = JSON.parse(readFileSync(path.join(OUTPUT, file), 'utf-8'))
  const es = JSON.parse(readFileSync(path.join(INPUT, file), 'utf-8'))
  const flagged = FLAGGED[TARGET_LANG]?.[file] ?? []
  const entries = {}

  for (const key of flagged) {
    if (!chunk.entries[key]) continue
    entries[key] = { es: es.entries[key].es, [TARGET_LANG]: chunk.entries[key].es }
  }

  // The shared concepts: every key whose Spanish contains one of them.
  for (const [key, value] of Object.entries(chunk.entries)) {
    const source = es.entries[key]?.es ?? ''
    for (const [needle, concept] of Object.entries(SHARED_CONCEPTS)) {
      if (source.toLowerCase().includes(needle)) {
        entries[key] = { es: source, [TARGET_LANG]: value.es, concept }
        break
      }
    }
  }

  if (Object.keys(entries).length) {
    out.push({ file, section: chunk.section, entries })
  }
}

const total = out.reduce((a, o) => a + Object.keys(o.entries).length, 0)
const payload = { target: TARGET_LANG, sections: out, total }
const target = path.resolve(`scratch/${TARGET_LANG}-uncertain.json`)
writeFileSync(target, JSON.stringify(payload, null, 2), 'utf-8')
console.log(`written: ${target}`)
console.log(`sections: ${out.length} | keys: ${total}`)
for (const s of out) console.log(`  ${s.file} ${Object.keys(s.entries).length}`)
