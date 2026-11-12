# 📑 Índice de Funciones RPC

Este archivo contiene la lista de todas las funciones RPC espejo del proyecto. Los códigos fuente correspondientes en formato SQL se encuentran en la carpeta [funcionesSQL](../funcionesSQL/).

## 🔍 Listado de Funciones RPC

1. [fn_aceptar_invitacion](../funcionesSQL/fn_aceptar_invitacion.md)
2. [fn_actualizar_calificacion_bcg](../funcionesSQL/fn_actualizar_calificacion_bcg.md)
3. [fn_actualizar_flexibilidad_subcuenta](../funcionesSQL/fn_actualizar_flexibilidad_subcuenta.md)
4. [fn_actualizar_nombre_usuario](../funcionesSQL/fn_actualizar_nombre_usuario.md)
5. [fn_actualizar_preferencia_notificacion](../funcionesSQL/fn_actualizar_preferencia_notificacion.md)
6. [fn_actualizar_preferencia_usuario](../funcionesSQL/fn_actualizar_preferencia_usuario.md)
7. [fn_actualizar_proporcion_hogar](../funcionesSQL/fn_actualizar_proporcion_hogar.md)
8. [fn_actualizar_saldo_billetera](../funcionesSQL/fn_actualizar_saldo_billetera.md)
9. [fn_actualizar_saldo_billetera_integral](../funcionesSQL/fn_actualizar_saldo_billetera_integral.md)
10. [fn_actualizar_utilidad_subcuenta](../funcionesSQL/fn_actualizar_utilidad_subcuenta.md)
11. [fn_actualizar_valor_inversion](../funcionesSQL/fn_actualizar_valor_inversion.md)
12. [fn_analizar_y_marcar_hormigas](../funcionesSQL/fn_analizar_y_marcar_hormigas.md)
13. [fn_aprobar_cuarentena](../funcionesSQL/fn_aprobar_cuarentena.md)
14. [fn_aprobar_gastos_cuarentena_lote](../funcionesSQL/fn_aprobar_gastos_cuarentena_lote.md)
15. [fn_archivar_billetera](../funcionesSQL/fn_archivar_billetera.md)
16. [fn_archivar_fondo_prevision](../funcionesSQL/fn_archivar_fondo_prevision.md)
17. [fn_archivar_tarjeta_credito](../funcionesSQL/fn_archivar_tarjeta_credito.md)
18. [fn_asignar_dinero_a_presupuesto](../funcionesSQL/fn_asignar_dinero_a_presupuesto.md)
19. [fn_asignar_presupuesto](../funcionesSQL/fn_asignar_presupuesto.md)
20. [fn_buscar_movimientos](../funcionesSQL/fn_buscar_movimientos.md)
21. [fn_calcular_arrastre_deuda](../funcionesSQL/fn_calcular_arrastre_deuda.md)
22. [fn_calcular_cuota_sobre](../funcionesSQL/fn_calcular_cuota_sobre.md)
23. [fn_calcular_inflacion_mensual](../funcionesSQL/fn_calcular_inflacion_mensual.md)
24. [fn_calcular_rendimiento_plazo_fijo](../funcionesSQL/fn_calcular_rendimiento_plazo_fijo.md)
25. [fn_calcular_y_guardar_score_diario](../funcionesSQL/fn_calcular_y_guardar_score_diario.md)
26. [fn_configurar_gastos_fijos](../funcionesSQL/fn_configurar_gastos_fijos.md)
27. [fn_configurar_inflacion](../funcionesSQL/fn_configurar_inflacion.md)
28. [fn_configurar_modo_presupuesto](../funcionesSQL/fn_configurar_modo_presupuesto.md)
29. [fn_configurar_onboarding_final](../funcionesSQL/fn_configurar_onboarding_final.md)
30. [fn_configurar_porcentajes_hogar](../funcionesSQL/fn_configurar_porcentajes_hogar.md)
31. [fn_configurar_region_usuario](../funcionesSQL/fn_configurar_region_usuario.md)
32. [fn_configurar_reglas_oro](../funcionesSQL/fn_configurar_reglas_oro.md) — al guardar con `p_pct_diezmo` > 0 crea rubro padre de sistema `cat_tithe` (tipo_cupo 'tithe') si no existe ninguno; idempotente, el rubro persiste si el % vuelve a 0 (2026-10-15)
32a. [fn_completar_saldo_inicial_billetera](../funcionesSQL/fn_completar_saldo_inicial_billetera.md)
33. [fn_crear_billetera](../funcionesSQL/fn_crear_billetera.md)
34. [fn_crear_billetera_inicial](../funcionesSQL/fn_crear_billetera_inicial.md)
34a. [fn_crear_billeteras_iniciales](../funcionesSQL/fn_crear_billeteras_iniciales.md)
34b. [fn_crear_recordatorio](../funcionesSQL/fn_crear_recordatorio.md)
35. [fn_crear_categorias_defecto_usuario](../funcionesSQL/fn_crear_categorias_defecto_usuario.md)
36. [fn_crear_cuenta_egreso](../funcionesSQL/fn_crear_cuenta_egreso.md)
37. [fn_crear_cuenta_madre_ahorro](../funcionesSQL/fn_crear_cuenta_madre_ahorro.md)
38. [fn_crear_feedback](../funcionesSQL/fn_crear_feedback.md)
39. [fn_crear_fondo_prevision](../funcionesSQL/fn_crear_fondo_prevision.md)
40. [fn_crear_gasto_recurrente](../funcionesSQL/fn_crear_gasto_recurrente.md)
41. [fn_crear_ingreso_personalizado](../funcionesSQL/fn_crear_ingreso_personalizado.md)
42. [fn_crear_inversion](../funcionesSQL/fn_crear_inversion.md)
43. [fn_crear_proyecto_compartido](../funcionesSQL/fn_crear_proyecto_compartido.md)
44. [fn_crear_subcuenta_egreso](../funcionesSQL/fn_crear_subcuenta_egreso.md)
45. [fn_crear_subcuenta_predeterminada](../funcionesSQL/fn_crear_subcuenta_predeterminada.md)
46. [fn_crear_tarjeta_credito](../funcionesSQL/fn_crear_tarjeta_credito.md)
47. [fn_debug_get_source](../funcionesSQL/fn_debug_get_source.md)
48. [fn_debug_triggers](../funcionesSQL/fn_debug_triggers.md)
49. [fn_desarchivar_tarjeta_credito](../funcionesSQL/fn_desarchivar_tarjeta_credito.md)
50. [fn_desvincular_pareja](../funcionesSQL/fn_desvincular_pareja.md)
51. [fn_disolver_hogar](../funcionesSQL/fn_disolver_hogar.md)
52. [fn_disparar_procesamiento_voz](../funcionesSQL/fn_disparar_procesamiento_voz.md)
52a. [fn_delete_public_usuario_from_auth](../funcionesSQL/fn_delete_public_usuario_from_auth.md)
52b. [fn_cargar_movimientos_voz](../funcionesSQL/fn_cargar_movimientos_voz.md) *(nueva: carga N movimientos de voz a p_caja_cuarentena con origen='voz', valida FKs con el usuario; reemplaza a fn_disparar_procesamiento_voz; retorna estado por item)*
52c. [fn_aprobar_cuarentena_v2](../funcionesSQL/fn_aprobar_cuarentena_v2.md) *(nueva: rutea aprobación de cuarentena por tipo (expense/income/transfer/card_expense), con doble inserción para transfer cross-currency; reemplaza a fn_aprobar_cuarentena)*
52d. [fn_aprobar_cuarentena_lote_v2](../funcionesSQL/fn_aprobar_cuarentena_lote_v2.md) *(nueva: aprueba varias filas de cuarentena con manejo de errores por item; invoca fn_aprobar_cuarentena_v2 y normaliza error_key)*
52e. [fn_editar_cuarentena_v2](../funcionesSQL/fn_editar_cuarentena_v2.md) *(nueva: edición libre de cualquier campo de una fila de cuarentena pending, con validación de FKs; reemplaza a fn_editar_cuarentena)*
53. [fn_distribuir_rendimientos_proporcional](../funcionesSQL/fn_distribuir_rendimientos_proporcional.md)
54. [fn_editar_billetera](../funcionesSQL/fn_editar_billetera.md)
55. [fn_editar_cuarentena](../funcionesSQL/fn_editar_cuarentena.md)
56. [fn_editar_fondo_prevision](../funcionesSQL/fn_editar_fondo_prevision.md)
57. [fn_editar_gasto_cuarentena](../funcionesSQL/fn_editar_gasto_cuarentena.md)
58. [fn_editar_gasto_recurrente](../funcionesSQL/fn_editar_gasto_recurrente.md)
59. [fn_editar_ingreso_personalizado](../funcionesSQL/fn_editar_ingreso_personalizado.md)
60. [fn_editar_movimiento_caja](../funcionesSQL/fn_editar_movimiento_caja.md)
61. [fn_editar_tarjeta_credito](../funcionesSQL/fn_editar_tarjeta_credito.md)
62. [fn_ejecutar_conciliacion](../funcionesSQL/fn_ejecutar_conciliacion.md) — nuevo parámetro opcional `p_fecha date DEFAULT CURRENT_DATE`: los ajustes (superávit/fuga) en p_caja usan la fecha LOCAL del dispositivo en vez de UTC (2026-10-16, bug batch conciliaciones); overload viejo de 2 args eliminado
63. [fn_eliminar_compromiso_tarjeta](../funcionesSQL/fn_eliminar_compromiso_tarjeta.md)
64. [fn_eliminar_cuenta_usuario](../funcionesSQL/fn_eliminar_cuenta_usuario.md)
65. [fn_eliminar_estructura_egreso](../funcionesSQL/fn_eliminar_estructura_egreso.md)
66. [fn_migrar_y_eliminar_estructura_egreso](../funcionesSQL/fn_migrar_y_eliminar_estructura_egreso.md)
67. [fn_eliminar_gasto_recurrente](../funcionesSQL/fn_eliminar_gasto_recurrente.md)
67. [fn_eliminar_movimiento_caja](../funcionesSQL/fn_eliminar_movimiento_caja.md)
68. [fn_eliminar_notificacion](../funcionesSQL/fn_eliminar_notificacion.md)
69. [fn_exportar_backup_maestro](../funcionesSQL/fn_exportar_backup_maestro.md)
70. [fn_exportar_datos_usuario_rango](../funcionesSQL/fn_exportar_datos_usuario_rango.md)
71. [fn_exportar_pasaporte_financiero](../funcionesSQL/fn_exportar_pasaporte_financiero.md)
72. [fn_generar_codigo_invitacion](../funcionesSQL/fn_generar_codigo_invitacion.md)
73. [fn_generar_codigo_referido](../funcionesSQL/fn_generar_codigo_referido.md)
74. [fn_generar_insights_salud](../funcionesSQL/fn_generar_insights_salud.md)
75. [fn_generar_recurrentes_hoy](../funcionesSQL/fn_generar_recurrentes_hoy.md)
76. [fn_generar_variacion_color](../funcionesSQL/fn_generar_variacion_color.md)
77. [fn_gestionar_compra_cuotas](../funcionesSQL/fn_gestionar_compra_cuotas.md)
78. [fn_get_default_currency](../funcionesSQL/fn_get_default_currency.md)
79. [fn_handle_new_user](../funcionesSQL/fn_handle_new_user.md)
80. [fn_handle_new_user_region](../funcionesSQL/fn_handle_new_user_region.md)
81. [fn_inicializar_hogar](../funcionesSQL/fn_inicializar_hogar.md)
82. [fn_limpieza_cuentas_eliminadas](../funcionesSQL/fn_limpieza_cuentas_eliminadas.md)
83. [fn_liquidar_inversion](../funcionesSQL/fn_liquidar_inversion.md)
84. [fn_listar_categorias_ingreso](../funcionesSQL/fn_listar_categorias_ingreso.md)
85. [fn_listar_gastos_recurrentes](../funcionesSQL/fn_listar_gastos_recurrentes.md)
86. [fn_listar_integrantes_familiares](../funcionesSQL/fn_listar_integrantes_familiares.md)
87. [fn_listar_proyectos_activos](../funcionesSQL/fn_listar_proyectos_activos.md)
88. [fn_marcar_cuotas_pagadas](../funcionesSQL/fn_marcar_cuotas_pagadas.md)
89. [fn_marcar_notificacion_leida](../funcionesSQL/fn_marcar_notificacion_leida.md)
90. [fn_marcar_todas_leidas](../funcionesSQL/fn_marcar_todas_leidas.md)
91. [fn_modificar_cuenta_egreso](../funcionesSQL/fn_modificar_cuenta_egreso.md)
92. [fn_modificar_subcuenta_egreso](../funcionesSQL/fn_modificar_subcuenta_egreso.md)
93. [fn_obtener_arbol_categorias](../funcionesSQL/fn_obtener_arbol_categorias.md)
94. [fn_obtener_billeteras_activas](../funcionesSQL/fn_obtener_billeteras_activas.md)
94a. [fn_obtener_billeteras_ordenadas](../funcionesSQL/fn_obtener_billeteras_ordenadas.md)
94b. [fn_obtener_cuenta_madre_ahorro](../funcionesSQL/fn_obtener_cuenta_madre_ahorro.md)
95. [fn_obtener_config_presupuesto](../funcionesSQL/fn_obtener_config_presupuesto.md)
96. [fn_obtener_estadisticas_referidos](../funcionesSQL/fn_obtener_estadisticas_referidos.md)
97. [fn_obtener_fechas_ciclo_presupuesto](../funcionesSQL/fn_obtener_fechas_ciclo_presupuesto.md)
98. [fn_obtener_notificaciones_no_leidas](../funcionesSQL/fn_obtener_notificaciones_no_leidas.md)
98b. [fn_obtener_nombre_usuario](../funcionesSQL/fn_obtener_nombre_usuario.md)
99. [fn_obtener_preferencias_notificaciones](../funcionesSQL/fn_obtener_preferencias_notificaciones.md)
100. [fn_obtener_preferencias_usuario](../funcionesSQL/fn_obtener_preferencias_usuario.md)
100b. [fn_obtener_region_usuario](../funcionesSQL/fn_obtener_region_usuario.md)
101. [fn_obtener_saldo_a_asignar](../funcionesSQL/fn_obtener_saldo_a_asignar.md)
102. [fn_obtener_saldo_disponible_para_asignar](../funcionesSQL/fn_obtener_saldo_disponible_para_asignar.md)
103. [fn_obtener_saldo_pasivo_tarjetas](../funcionesSQL/fn_obtener_saldo_pasivo_tarjetas.md)
104. [fn_obtener_subcuentas_por_rubro](../funcionesSQL/fn_obtener_subcuentas_por_rubro.md)
105. [fn_obtener_techo_presupuestario](../funcionesSQL/fn_obtener_techo_presupuestario.md)
106. [fn_onboarding_completo_usuario](../funcionesSQL/fn_onboarding_completo_usuario.md)
107. [fn_recalcular_saldos_billeteras](../funcionesSQL/fn_recalcular_saldos_billeteras.md)
107b. [fn_listar_recordatorios](../funcionesSQL/fn_listar_recordatorios.md)
108. [fn_rechazar_cuarentena](../funcionesSQL/fn_rechazar_cuarentena.md)
109. [fn_registrar_gasto_tarjeta](../funcionesSQL/fn_registrar_gasto_tarjeta.md)
110. [fn_registrar_movimiento_caja](../funcionesSQL/fn_registrar_movimiento_caja.md)
111. [fn_registrar_pago_extra_deuda](../funcionesSQL/fn_registrar_pago_extra_deuda.md)
112. [fn_registrar_pago_pareja](../funcionesSQL/fn_registrar_pago_pareja.md)
113. [fn_registrar_pago_tarjeta](../funcionesSQL/fn_registrar_pago_tarjeta.md) *(firmas v2: +p_cuotas_adelantar bigint[] opcional; maneja sobrante con saldo_a_favor y cancelación de cuotas futuras)*
113b. [fn_registrar_pago_tarjeta_multi](../funcionesSQL/fn_registrar_pago_tarjeta_multi.md) *(nueva: pago multi-billetera p_pagos jsonb + p_resumen_real opcional; v2 liquidación centralizada vía fn_liquidar_ciclo_tarjeta; retorna p_caja_id primera línea)*
113c. [fn_liquidar_ciclo_tarjeta](../funcionesSQL/fn_liquidar_ciclo_tarjeta.md) *(nueva helper: liquidación de ciclo con monto total; invocada por trigger de pago simple y por RPC multi)*
113d. [fn_liquidar_ciclo_tarjeta_multi](../funcionesSQL/fn_liquidar_ciclo_tarjeta_multi.md) *(nueva helper Fase 2: liquidación multi-moneda ARS/USD — recibe p_pagos_aplicados jsonb con clasificación origen→target y conversión ya aplicada; consume/aplica saldo_a_favor por moneda; refina shortfall por moneda; acredita sobrante a favor por moneda; registra cotizacion/recargo/pagos_aplicados en p_pagos_tarjeta_log)*
114. [fn_reporte_alertas_home](../funcionesSQL/fn_reporte_alertas_home.md)
115. [fn_reporte_bcg_estrategia_recorte](../funcionesSQL/fn_reporte_bcg_estrategia_recorte.md)
116. [fn_reporte_bcg_roi_emocional](../funcionesSQL/fn_reporte_bcg_roi_emocional.md)
117. [fn_reporte_bola_nieve_estado](../funcionesSQL/fn_reporte_bola_nieve_estado.md)
118. [fn_reporte_bola_nieve_estrategia](../funcionesSQL/fn_reporte_bola_nieve_estrategia.md)
119. [fn_reporte_calendario_financiero](../funcionesSQL/fn_reporte_calendario_financiero.md)
120. [fn_reporte_cartera_inversiones](../funcionesSQL/fn_reporte_cartera_inversiones.md)
121. [fn_reporte_comparativa_tarjetas](../funcionesSQL/fn_reporte_comparativa_tarjetas.md)
122. [fn_reporte_compromisos_tarjeta
- fn_registrar_cuotas_historicas(p_tarjeta_id, p_detalle, p_cantidad, p_monto_cuota, p_mes_inicio, p_moneda, p_estructura_egreso_id opc) → bigint carga_id — carga de cuotas de ciclos anteriores (huerfanas con descripción/carga_id; sin p_caja)
- fn_eliminar_carga_cuotas_historicas(p_carga_id) → int — deshace la carga solo si nada pagado (revierte compromisos)
](../funcionesSQL/fn_reporte_compromisos_tarjeta.md)
123. [fn_reporte_cuarentena_pendientes](../funcionesSQL/fn_reporte_cuarentena_pendientes.md)
124. [fn_reporte_desglose_balance](../funcionesSQL/fn_reporte_desglose_balance.md)
125. [fn_reporte_desviacion_misterio](../funcionesSQL/fn_reporte_desviacion_misterio.md)
126. [fn_reporte_detalle_inversion](../funcionesSQL/fn_reporte_detalle_inversion.md)
127. [fn_reporte_detector_licuadora](../funcionesSQL/fn_reporte_detector_licuadora.md)
128. [fn_reporte_distribucion_billeteras](../funcionesSQL/fn_reporte_distribucion_billeteras.md)
128b. [fn_reporte_distribucion_activos](../funcionesSQL/fn_reporte_distribucion_activos.md)
129. [fn_reporte_escudo_tiempo](../funcionesSQL/fn_reporte_escudo_tiempo.md)
130. [fn_reporte_estado_fondos_prevision](../funcionesSQL/fn_reporte_estado_fondos_prevision.md)
130b. [fn_reporte_desglose_balance](../funcionesSQL/fn_reporte_desglose_balance.md)
131. [fn_reporte_estado_inversiones](../funcionesSQL/fn_reporte_estado_inversiones.md)
132. [fn_reporte_evolucion_presupuesto](../funcionesSQL/fn_reporte_evolucion_presupuesto.md)
133. [fn_reporte_feed_compartido](../funcionesSQL/fn_reporte_feed_compartido.md)
135. [fn_reporte_gasto_por_integrante](../funcionesSQL/fn_reporte_gasto_por_integrante.md)
136. [fn_reporte_gastos_fijos_mensuales](../funcionesSQL/fn_reporte_gastos_fijos_mensuales.md)
137. [fn_reporte_gastos_hormiga](../funcionesSQL/fn_reporte_gastos_hormiga.md)
138. [fn_reporte_gastos_hormiga_2](../funcionesSQL/fn_reporte_gastos_hormiga_2.md)
139. [fn_reporte_gastos_por_rubro_cupo](../funcionesSQL/fn_reporte_gastos_por_rubro_cupo.md)
140. [fn_reporte_historial_abonos_pareja](../funcionesSQL/fn_reporte_historial_abonos_pareja.md)
141. [fn_reporte_historial_inversiones](../funcionesSQL/fn_reporte_historial_inversiones.md)
142. [fn_reporte_historial_pagos_tarjetas](../funcionesSQL/fn_reporte_historial_pagos_tarjetas.md)
143. [fn_reporte_historico_score](../funcionesSQL/fn_reporte_historico_score.md)
144. [fn_reporte_hogar_balances](../funcionesSQL/fn_reporte_hogar_balances.md)
145. [fn_reporte_hogar_feed](../funcionesSQL/fn_reporte_hogar_feed.md)
146. [fn_reporte_limite_seguro_deuda](../funcionesSQL/fn_reporte_limite_seguro_deuda.md)
147. [fn_reporte_mapa_acreedores](../funcionesSQL/fn_reporte_mapa_acreedores.md)
148. [fn_reporte_mapa_tarjetas](../funcionesSQL/fn_reporte_mapa_tarjetas.md)
149. [fn_reporte_movimientos_por_billetera](../funcionesSQL/fn_reporte_movimientos_por_billetera.md)
150. [fn_reporte_movimientos_recientes](../funcionesSQL/fn_reporte_movimientos_recientes.md)
151. [fn_reporte_patrimonio_inversiones](../funcionesSQL/fn_reporte_patrimonio_inversiones.md)
152. [fn_reporte_patrimonio_neto](../funcionesSQL/fn_reporte_patrimonio_neto.md)
153. [fn_reporte_patrimonio_neto_consolidado](../funcionesSQL/fn_reporte_patrimonio_neto_consolidado.md)
154. [fn_reporte_plan_ataque_deudas](../funcionesSQL/fn_reporte_plan_ataque_deudas.md)
155. [fn_reporte_podadora_bcg](../funcionesSQL/fn_reporte_podadora_bcg.md)
156. [fn_reporte_presupuestos_mensuales](../funcionesSQL/fn_reporte_presupuestos_mensuales.md)
157. [fn_reporte_proyeccion_presupuestaria](../funcionesSQL/fn_reporte_proyeccion_presupuestaria.md)
158. [fn_reporte_proyecto_detalle](../funcionesSQL/fn_reporte_proyecto_detalle.md)
159. [fn_reporte_proyectos_compartidos](../funcionesSQL/fn_reporte_proyectos_compartidos.md)
160. [fn_reporte_proyectos_hogar](../funcionesSQL/fn_reporte_proyectos_hogar.md)
161. [fn_reporte_punto_equilibrio](../funcionesSQL/fn_reporte_punto_equilibrio.md)
162. [fn_reporte_radar_asfixia](../funcionesSQL/fn_reporte_radar_asfixia.md)
163. [fn_reporte_ranking_categorias](../funcionesSQL/fn_reporte_ranking_categorias.md)
164. [fn_reporte_rendimiento_vs_inflacion](../funcionesSQL/fn_reporte_rendimiento_vs_inflacion.md)
165. [fn_reporte_resumen_cuadrantes](../funcionesSQL/fn_reporte_resumen_cuadrantes.md)
168. [fn_reporte_safe_to_spend](../funcionesSQL/fn_reporte_safe_to_spend.md)
169. [fn_reporte_salud_billeteras](../funcionesSQL/fn_reporte_salud_billeteras.md)
170. [fn_reporte_score_salud_financiera](../funcionesSQL/fn_reporte_score_salud_financiera.md)
171. [fn_reporte_simulador_escenarios](../funcionesSQL/fn_reporte_simulador_escenarios.md)
172. [fn_reporte_simulador_impacto](../funcionesSQL/fn_reporte_simulador_impacto.md)
173. [fn_reporte_sobres_detalle](../funcionesSQL/fn_reporte_sobres_detalle.md) — firma extendida con `monto_asignado_anterior` y `monto_gastado_anterior` (2026-08-05, fix bug modo anticipado); firma extendida con `gasto_promedio_6m` — promedio gasto últimos 6 ciclos, solo meses con cargas (2026-10-15, bug batch presupuestos); semaforo modo anticipado no penaliza arrastre del ciclo anterior (2026-10-16)
174. [fn_reporte_tarjetas_archivadas](../funcionesSQL/fn_reporte_tarjetas_archivadas.md)
175. [fn_reporte_termometro_presupuestos](../funcionesSQL/fn_reporte_termometro_presupuestos.md)
176. [fn_reporte_termometro_tarjeta](../funcionesSQL/fn_reporte_termometro_tarjeta.md)
177. [fn_reporte_timeline_proyeccion](../funcionesSQL/fn_reporte_timeline_proyeccion.md)
178. [fn_reporte_top_categorias_mes](../funcionesSQL/fn_reporte_top_categorias_mes.md)
179. [fn_reporte_top_fuentes_ingreso](../funcionesSQL/fn_reporte_top_fuentes_ingreso.md) *(NUEVA Fase — Donut de fuentes de ingreso en Billeteras)*
180. [fn_reporte_variacion_intermensual](../funcionesSQL/fn_reporte_variacion_intermensual.md)
180. [fn_reporte_vencimientos_tarjetas](../funcionesSQL/fn_reporte_vencimientos_tarjetas.md) *(v2: +columna saldo_a_favor; monto_a_pagar neto de saldo)*
181. [fn_saldar_balance_hogar](../funcionesSQL/fn_saldar_balance_hogar.md)
182. [fn_simular_pago_extra](../funcionesSQL/fn_simular_pago_extra.md)
183. [fn_sugerir_distribucion_activacion](../funcionesSQL/fn_sugerir_distribucion_activacion.md)
184. [fn_t_capturar_porcentajes_hogar](../funcionesSQL/fn_t_capturar_porcentajes_hogar.md)
185. [fn_t_limpiar_dependencias_caja](../funcionesSQL/fn_t_limpiar_dependencias_caja.md)
186. [fn_tr_asignar_color_subcuenta_nueva](../funcionesSQL/fn_tr_asignar_color_subcuenta_nueva.md)
187. [fn_tr_procesar_pago_tarjeta](../funcionesSQL/fn_tr_procesar_pago_tarjeta.md)
188. [fn_tr_propagar_color_padre](../funcionesSQL/fn_tr_propagar_color_padre.md)
189. [fn_transferir_entre_sobres](../funcionesSQL/fn_transferir_entre_sobres.md) — ahora delega en fn_disponible_transferible (2026-11, ronda 10): dejo de tener la formula copiada y gano la guarda de modo, asi que en libertad ya no suma arrastre
189a. [fn_p_caja_snapshot_moneda](../funcionesSQL/fn_p_caja_snapshot_moneda.md) *(NUEVA 2026-10: trigger BEFORE INSERT/UPDATE sobre p_caja; congela valor_local con la tasa de p_divisas del momento; moneda resuelta desde la billetera o es_usd; excluye transfer; editar monto re-congela con la tasa del dia)*
189b. [fn_valor_a_moneda_local](../funcionesSQL/fn_valor_a_moneda_local.md) *(NUEVA 2026-10: helper STABLE; convierte un monto a la moneda local de p_config_region cruzando por USD en p_divisas; identidad factor 1; cotizacion faltante devuelve NULL, nunca inventa)*
190. [fn_trigger_crear_preferencias_notificaciones](../funcionesSQL/fn_trigger_crear_preferencias_notificaciones.md)
191. [fn_trigger_crear_preferencias_usuario](../funcionesSQL/fn_trigger_crear_preferencias_usuario.md)
192. [fn_verificar_estado_hogar](../funcionesSQL/fn_verificar_estado_hogar.md)
193. [fn_verificar_status_onboarding](../funcionesSQL/fn_verificar_status_onboarding.md)
194. [fn_vincular_hogar_invitado](../funcionesSQL/fn_vincular_hogar_invitado.md)
195. [fn_vincular_sobre_a_respaldo](../funcionesSQL/fn_vincular_sobre_a_respaldo.md)
195b. [fn_toggle_recordatorio](../funcionesSQL/fn_toggle_recordatorio.md)
196. [fn_gestionar_deuda](../funcionesSQL/fn_gestionar_deuda.md)
197. [fn_actualizar_estrategia_bola_nieve](../funcionesSQL/fn_actualizar_estrategia_bola_nieve.md)
210. [fn_obtener_modo_app](../funcionesSQL/fn_obtener_modo_app.md) *(rev.5 2026-10-19: testing da capacidad de cambiar sin forzar modo, parse de lista strip-all-whitespace; rev.4 filtro anti-abuso NOT EXISTS sobre app_usuario_bloqueos, rows a mano del dueño; prioridad bloqueo > preferencia > modo; no RPC)*
211. [fn_activar_modo_avanzado](file:///C:/temp/Antigravity/ORD%20Capital%20v2/Personal/funcionesSQL/fn_activar_modo_avanzado.md) *(rev.2 2026-10-19: con switch OFF, usuarios de testing pueden activar; espejo reescrito desde producción con pg_get_functiondef)*
212. [fn_desactivar_modo_avanzado](../funcionesSQL/fn_desactivar_modo_avanzado.md)
213. [fn_iniciar_sesion_app](../funcionesSQL/fn_iniciar_sesion_app.md)
214. [fn_pausar_sesion_app](../funcionesSQL/fn_pausar_sesion_app.md)
215. [fn_reanudar_sesion_app](../funcionesSQL/fn_reanudar_sesion_app.md)
216. [fn_finalizar_sesion_app](../funcionesSQL/fn_finalizar_sesion_app.md)
217. [fn_marcar_crash_sesion](../funcionesSQL/fn_marcar_crash_sesion.md)
218. [fn_resumen_uso_app](../funcionesSQL/fn_resumen_uso_app.md)
219. [fn_clonar_usuario_admin](../funcionesSQL/fn_clonar_usuario_admin.md) *(admin/QA; clona el escenario de un usuario origen al sandbox user_id=20; service_role only; soporta p_dry_run)*
220. [fn_registrar_ajuste_diferencia_tarjeta](../funcionesSQL/fn_registrar_ajuste_diferencia_tarjeta.md) *(registra ajuste de diferencia banco-vs-tarjeta en cuenta de sistema cat_card_diff, misma estructura que cat_mystery; auto-crea la categoría si no existe; acumulable en p_caja tipo adjustment)*
221. [fn_registrar_consentimiento_legal](../funcionesSQL/fn_registrar_consentimiento_legal.md) *(nueva: registra consentimiento legal TyC + Privacidad del usuario autenticado; idempotente, resuelve identidad con auth.uid(), COALESCE preserva primer timestamp; retorna {ok})* — **tanda 2 telemetría**: firma ampliada con `p_opened_terms`/`p_opened_privacy` boolean opcionales (marcan apertura de los documentos legales en el gate, para derivar funnel de onboarding); usa columnas `usuarios.opened_terms`/`opened_privacy`
223. [fn_check_app_version](../funcionesSQL/fn_check_app_version.md) *(nueva: chequea versión de app en cold start; resuelve identidad con auth.uid(), sella usuarios.app_version, lee p_app_version_policy y retorna tri-state {ok|update_available|update_required} + store_url + mandatory)*
224. [fn_telemetry_ingest](../funcionesSQL/fn_telemetry_ingest.md) *(nueva: ingesta por lotes de telemetría BASIC v1; recibe array jsonb de hasta 50 eventos, valida mínimos, descarta properties >2KB, idempotente por event_id (ON CONFLICT DO NOTHING); escribe p_telemetry_events (tabla nueva, RLS sin políticas); retorna {accepted, duplicates, invalid}; SECURITY DEFINER con auth.uid())*
225. [fn_admin_session](../funcionesSQL/fn_admin_session.md) *(nueva: primitiva de identidad y rol de ORD Admin; valida auth.uid() contra la allowlist admin_usuarios con roles viewer/admin; sin JWT devuelve error_unauthorized y no deja registro, si la identidad no esta en la allowlist deja resultado=denied en admin_audit_log y devuelve error_admin_only, si es valida deja resultado=ok y marca ultimo_acceso_at; SECURITY DEFINER porque admin_usuarios tiene RLS sin politicas y REVOKE desde cliente; el rol anon esta revocado)*

226. [fn_config_num](../funcionesSQL/fn_config_num.md) *(nueva: helper de lectura numerica de app_global_config con default; usada por el motor CPS para pesos, targets y cortes configurables sin redeploy)*
227. [fn_telemetry_refresh_user_metrics](../funcionesSQL/fn_telemetry_refresh_user_metrics.md) *(nueva: upsert set-based de p_telemetry_user_metrics para todos los usuarios; 16 metricas consolidadas de sesiones/p_caja/billeteras/categorias/conciliaciones/tarjetas/presupuestos/p_telemetry_events; schedulada pg_cron diario 13:00 UTC; SECURITY DEFINER)*
228. [fn_telemetry_cps_snapshot_weekly](../funcionesSQL/fn_telemetry_cps_snapshot_weekly.md) *(nueva: calcula CPS 0-100 cps_basic_v1 con pesos de app_global_config e inserta 1 snapshot semanal por usuario en p_telemetry_cps_snapshots con categoria y metrics_snapshot; schedulada pg_cron lunes 14:00 UTC; SECURITY DEFINER)*
229. [fn_admin_resumen_global](../funcionesSQL/fn_admin_resumen_global.md) *(nueva: reporte agregado de la pantalla Resumen del ORD Admin (PRD §19.1); gate via fn_admin_session, metricas de ventana desde p_app_sessions/p_telemetry_events, uso real con la definicion del motor de metrics sobre p_caja, retencion D7/30/60/90 por cohorte de alta, CPS del ultimo snapshot por usuario; high_potential_free/trial NULL hasta que exista usuarios.plan_tipo; SECURITY DEFINER, anon revocado, audita filtros en admin_audit_log)*

230. [fn_admin_buscar_usuarios](../funcionesSQL/fn_admin_buscar_usuarios.md) *(nueva: listado paginado de la pantalla Usuarios del ORD Admin (PRD §19.9); gate fn_admin_session, busqueda por email/user_id, filtros CPS/modulo/actividad/plataforma/version/cohorte, metricas desde p_telemetry_user_metrics, CPS del ultimo snapshot, solo user_id+email como identidad, cero importes, SECURITY DEFINER con anon revocado, auditoria de filtros)*

231. [fn_admin_ficha_usuario](../funcionesSQL/fn_admin_ficha_usuario.md) *(nueva: ficha individual de comportamiento del ORD Admin (PRD §20); gate fn_admin_session, campos desde p_telemetry_user_metrics + ultimo CPS, timeline de 8 hitos con proxy de onboarding por p_config_region y conciliacion aproximada por estado de billetera, cero importes, plan NULL, SECURITY DEFINER anon revocado, auditoria por user_id consultado)*

232. [fn_admin_funnel_onboarding](../funcionesSQL/fn_admin_funnel_onboarding.md) *(nueva: funnel de onboarding del ORD Admin (PRD §19.2) por cohorte de alta, 12 pasos derivados de ESTADO con origen por paso (eventos legales/onboarding aun no instrumentados), timing alta-primer_movimiento con p50 crudo y post-alta y n_pre_alta, SECURITY DEFINER gate fn_admin_session, anon revocado, auditoria con ventana)*

233. [fn_admin_uso](../funcionesSQL/fn_admin_uso.md) *(nueva: pantalla Uso del ORD Admin (PRD §19.3); totales + serie diaria sesiones/usuarios/segundos/movimientos + por_plataforma + sesiones_crashed_pct como calidad de cierre (99% crashed = bug de la app de usuario), movimientos con la definicion del motor de metrics, SECURITY DEFINER gate fn_admin_session, anon revocado, auditoria con filtros)*
234. [fn_crear_reporte](../funcionesSQL/fn_crear_reporte.md) *(nueva: alta de reporte de bug de 'Reportar un problema' (spec odd/tasks/bloqueo-y-reportes.md); INSERT todo-o-nada en app_reportes con titulo 5..150 + cuerpo = descripcion 10..4000 O transcripcion_audio de la voice API (invisible al usuario); media paths del bucket privado 'reportes'; pantalla/version/plataforma auto; limite 5 reportes/usuario/24h; SECURITY DEFINER, RLS deny-all)*

235. [fn_obtener_mis_reportes](../funcionesSQL/fn_obtener_mis_reportes.md) *(nueva: 'Mis reportes' del usuario; ultimos 50 creado_el DESC, EXCLUYE estado='descartado'; NO expone transcripcion_audio; devuelve respuesta_admin/estado/ tiene_audio/media para card expandible; SECURITY DEFINER)*

236. [fn_eliminar_mi_reporte](../funcionesSQL/fn_eliminar_mi_reporte.md) *(nueva: DELETE propio solo si estado='nuevo' (reportes no tomados son borrables por su autor); sin edicion; media se limpia por policies de storage desde el front; SECURITY DEFINER)*


237. [fn_admin_navegacion](../funcionesSQL/fn_admin_navegacion.md) *(nueva: pantalla Navegacion del ORD Admin (PRD §19.4); transiciones desde Home y top-20 origen-destino desde main_module_opened, modulos por sesion, interacciones de Home (filtros/donut/recientes), correcciones desde Home; SECURITY DEFINER gate fn_admin_session, anon revocado, auditoria con filtros)*

238. [fn_admin_funciones](../funcionesSQL/fn_admin_funciones.md) *(nueva: pantalla Funciones del ORD Admin (PRD §19.5); billeteras/categorias/conciliacion/tarjetas/presupuesto desde la foto diaria de p_telemetry_user_metrics, conciliacion con doble senal por_eventos vs por_billetera porque p_conciliaciones subestima, SECURITY DEFINER gate fn_admin_session, anon revocado, auditoria)*

239. [fn_marcar_crash_sesion](../funcionesSQL/fn_marcar_crash_sesion.md) *(redefinida L1: ya no marca todo crashed; dos ramas segun evidencia de background -> completed o posible_crash heuristica; CHECK de p_app_sessions ampliado, reetiquetado historico 852/1359, fuente canonica en ord-admin/admin/sql/telemetria; fix preexistente cast numeric en fn_resumen_uso_app)*
240. [fn_limpia_media_reporte](../funcionesSQL/fn_limpia_media_reporte.md) *(nueva trigger: limpieza automática de las capturas del bucket privado 'reportes' al pasar estado a resuelto/descartado (UPDATE OF estado) y al DELETE del reporte; corre como postgres y bypassea RLS del storage; sin cron; decisión dueño 2026-10-02)*

240. [fn_iniciar_sesion_app](../funcionesSQL/fn_iniciar_sesion_app.md) *(redefinida L1: cierra huerfanas con regla de dos ramas completed/posible_crash en vez de crashed a ciegas — era el segundo escritor de crashed falsos; recuperacion de segundos intacta; baseline cero de crashes desde 01/10 por decision del usuario; fuente canonica en ord-admin/admin/sql/telemetria)*

241. [fn_admin_retencion](../funcionesSQL/fn_admin_retencion.md) *(nueva: pantalla del ORD Admin; matriz cohortes de alta x D7/30/60/90 con acceso y uso real, elegibles solo con ventana transcurrida; SECURITY DEFINER gate fn_admin_session, anon revocado, auditoria)*

242. [fn_admin_potencial](../funcionesSQL/fn_admin_potencial.md) *(nueva: pantalla del ORD Admin; dist CPS vigente por ultimo snapshot + evolucion semanal + lista HP/VHP, planes null por decision ④; SECURITY DEFINER gate fn_admin_session, anon revocado, auditoria)*

243. [fn_admin_errores](../funcionesSQL/fn_admin_errores.md) *(nueva: pantalla del ORD Admin; top app_error honesto (sin pantalla/operacion: no instrumentados) + embudo voz completo con tasa de fallo de admision; SECURITY DEFINER gate fn_admin_session, anon revocado, auditoria)*

244. [fn_admin_reportes](../funcionesSQL/fn_admin_reportes.md) *(nueva: pantalla del ORD Admin; seccion Reportes del PRD nuevas: modos derivados de app_reportes, backlog, top pantallas, open-rate 7d, privacidad estricta sin leer contenido; SECURITY DEFINER gate fn_admin_session, anon revocado, auditoria)*
245. [fn_archivar_fuente_ingreso](../funcionesSQL/fn_archivar_fuente_ingreso.md) *(nueva: activar/desactivar fuente de ingreso del usuario; columna p_ingresos.activo; par bug 3)*
246. [fn_eliminar_fuente_ingreso](../funcionesSQL/fn_eliminar_fuente_ingreso.md) *(nueva: DELETE real solo si p_caja no tiene cuenta_ingreso_id; si hay movimientos raise error_income_source_has_movements; par bug 3)*
247. [fn_reporte_serie_tarjetas](../funcionesSQL/fn_reporte_serie_tarjetas.md) *(nueva: serie de uso de tarjetas por ciclo de presupuesto, max 6 ciclos, ciclo_index 0 = actual; alimenta el mini-grafo de 6 barras del tab Comparativa; par revision semantica del tab)*

248. [fn_admin_config_guardar/listar](../funcionesSQL/fn_admin_config_guardar.md) *(nuevas: primera familia mutante del panel Admin; kill-switch admin_escritura_habilitado, rol admin estricto, diff anterior->nuevo auditado, validaciones por familia de clave)*
249. [fn_admin_policy_guardar](../funcionesSQL/fn_admin_policy_guardar.md) *(nueva: editor de p_app_version_policy con las mismas politicas de escritura; lectura via fn_admin_config_listar)*

250. [fn_exportar_movimientos](../funcionesSQL/fn_exportar_movimientos.md) *(nueva: dataset canónico para export de movimientos; piernas cross-currency emitidas como fila \"transfer\" con pairing rank-to-rank; sin monto_destino porque el import no acepta transferencias multi-moneda — decisión del dueño)*

251. [fn_obtener_estado_legal](../funcionesSQL/fn_obtener_estado_legal.md) *(nueva, Tanda 0 versionado legal: estado legal del usuario autenticado en una llamada; versión vigente por `fn_compare_versions` + flags + `pending_action` derivado por documento (fallo seguro sin ningún 'aceptado' → require_acceptance, guard de la versión vigente, notify, none, defensivo sin fila); SECURITY DEFINER con auth.uid(), anon revocado)*

252. [fn_registrar_notificacion_legal](../funcionesSQL/fn_registrar_notificacion_legal.md) *(nueva, Tanda 0 versionado legal: sella el evento 'notificado' de la versión vigente de términos y privacidad al cerrar el modal no bloqueante; idempotente por (user_id, doc_type, version); SECURITY DEFINER con auth.uid(), anon revocado)*

253. [fn_admin_legal_versiones_listar](../funcionesSQL/fn_admin_legal_versiones_listar.md) *(nueva, Tanda 0 versionado legal, ORD Admin: lista el catálogo `legal_document_version` con flags, `es_vigente` (por `fn_compare_versions`) y conteos de aceptación/aviso por versión; gate fn_admin_session como primera línea, auditoría, anon revocado; sin STABLE porque el gate escribe)*

254. [fn_admin_legal_version_publicar](../funcionesSQL/fn_admin_legal_version_publicar.md) *(nueva, Tanda 0 versionado legal, ORD Admin: única vía de escritura de `legal_document_version`; rol admin estricto + kill-switch; valida doc_type, formato de versión x.y[.z] (error_valor_invalido), downgrade con `fn_compare_versions` (error_legal_version_downgrade) e inmutabilidad de flags de la vigente (error_legal_version_immutable); noop sin write ni auditoría; gate fn_admin_session, anon revocado)*

255. [fn_obtener_paises](../funcionesSQL/fn_obtener_paises.md) *(nueva, WU1 onboarding pais/idioma/moneda: catalogo de los paises con `soportado = true`, con su moneda local, decimales y simbolo, y su formato regional (separadores, primer dia de semana, formato de fecha y hora). Sin nombres de pais a proposito: los resuelve el cliente con Intl.DisplayNames para no mantener 249 nombres por idioma. STABLE, SECURITY DEFINER, anon revocado)*

256. [fn_obtener_monedas_extra](../funcionesSQL/fn_obtener_monedas_extra.md) *(nueva, feature agente P3 monedas-extra-libres, deployada 2026-10-16 con aprobacion del dueño: devuelve las monedas extra efectivas del usuario como jsonb, default `["USD"]`; normalizada uppercase/trim, sin duplicados ni la moneda local; lee `p_config_region.monedas_extra` (columna jsonb NOT NULL DEFAULT '["USD"]'). STABLE, SECURITY DEFINER con auth.uid(), anon revocado)*

257. [fn_configurar_monedas_extra](../funcionesSQL/fn_configurar_monedas_extra.md) *(nueva, feature agente P3 monedas-extra-libres, deployada 2026-10-16: upsert de monedas extra del usuario en `p_config_region` (hasta 2); anti-bypass por `cardinality` (rechaza text[][] dimensional); valida contra catalogo `p_divisas`, no local, sin duplicados; bloquea quitar una extra con `p_billeteras` activas (`error_monedas_extra_has_wallets`); serializa con FOR UPDATE contra `fn_crear_billetera*`. Errores JSON: `error_monedas_extra_limite/local/duplicada/invalida/has_wallets`. SECURITY DEFINER con auth.uid(), anon revocado)*

258. [fn_obtener_cotizacion](../funcionesSQL/fn_obtener_cotizacion.md) *(nueva, feature agente P3 monedas-extra-libres, deployada 2026-10-16: cotizacion generica origen/destino por pivote USD con `p_divisas.valor_por_usd`; `fecha` = la mas vieja de las dos `ultima_actualizacion`; misma moneda → `(1.00, NULL)`; moneda ausente o tasa 0 → `(NULL, NULL)`, nunca 1.00 encubierto. STABLE, SECURITY DEFINER, anon revocado)*

259. [fn_titulo_transferencia](../funcionesSQL/fn_titulo_transferencia.md) *(nueva, feature agente P3 monedas-extra-libres, deploy 75 del 2026-10-16 con aprobacion del dueño: helper IMMUTABLE de títulos de transferencia; mismo árbol que src/lib/transferTitles.ts; USD legacy keys + JSON {key,params} para extras; consumida por fn_registrar_movimiento_caja y fn_aprobar_cuarentena_v2; corrige v_moneda_local sin asignar del legado via fn_get_default_currency)*

260. [fn_borrar_datos_usuario](../funcionesSQL/fn_borrar_datos_usuario.md) *(nueva, menu-ajustes S15/T5c, creada 2026-10-16 con OK del dueño: borrado de DATOS del usuario — cuenta permanece, datos p_* en cero; guardia backend 15 días (defensa en profundidad del gate front); confirmación 'BORRAR DATOS'; SECURITY DEFINER auth.uid(); retorno jsonb con detalle de filas por tabla; test transaccional 3/3 PASS con runner y RPC de testing DROPeados post-run)*

261. [fn_obtener_divisas_cotizadas](../funcionesSQL/fn_obtener_divisas_cotizadas.md) *(nueva, feature agente P3 monedas-extra-libres, deploy 77 del 2026-10-16 con aprobacion del dueño: catálogo text[] de divisas cotizadas de p_divisas con ultima_actualizacion — 51 con USD siempre presente; STABLE SQL SECURITY DEFINER; grafo para el selector de segunda/tercera moneda de BloqueMonedas)*

262. [fn_configurar_formato_moneda](../funcionesSQL/fn_configurar_formato_moneda.md) *(nueva, deploy 78: MERGE del override de formato por moneda extra en p_config_region.monedas_formateo (jsonb); guarda del peer: rechaza moneda que no es local ni extra activa (error_formato_moneda_moneda_invalida); decimales 0-4, separadores no vacíos y distintos; local/USD siguen en p_preferencias_usuario sin migración)*

263. [fn_obtener_formato_moneda](../funcionesSQL/fn_obtener_formato_moneda.md) *(nueva, deploy 78 → **rev.79 2026-10-19**: mapa RESUELTO jsonb {CODE:{decimales,separador_miles,separador_decimal}} con SOLO monedas del usuario; si extras vacío, USD vuelve como 2ª default (regla del dueño, S13); local hereda de p_preferencias_usuario; consumida por el peer menu-ajustes U3)*

264. [p_pin_seguridad](../funcionesSQL/p_pin_seguridad.md) *(nueva, feature agente PI2 pin-huella T5, deployada 2026-10-16 con aprobación del dueño y smokes 13/13: hash bcrypt via extensions.crypt/gen_salt + intentos_fallidos + bloqueado_hasta + estado sin_pin/activa/en_cooldown/restaurar; RLS sin FORCE — definers owner; espejo escrito por PI2 en funcionesSQL del clone Personal conforme a la regla anti-cp del incidente)*

265. [fn_tiene_pin](../funcionesSQL/fn_tiene_pin.md) *(nueva, PI2 T5: indica si el usuario autenticado tiene PIN activo; RPC-only con auth.uid(); fuente de hasPinConfigured junto a fn_obtener_estado_app_lock del contexto AppLock de PI2)*

266. [fn_verificar_pin](../funcionesSQL/fn_verificar_pin.md) *(nueva, PI2 T5: valida el PIN; devuelve FILAS para caminos esperados (RAISE revierte contador con la transacción); RAISE solo para maluso NoAuth/sin pin/formato)*

267. [fn_configurar_pin](../funcionesSQL/fn_configurar_pin.md) *(nueva, PI2 T5: setea el PIN (hash bcrypt), estado activa; RPC-only auth.uid())*

268. [fn_reactivar_pin](../funcionesSQL/fn_reactivar_pin.md) *(nueva, PI2 T5: reactivación tras cooldown; RPC-only auth.uid())*

269. [fn_desactivar_pin](../funcionesSQL/fn_desactivar_pin.md) *(nueva, PI2 T5: desactiva el PIN; RPC-only auth.uid())*

270. [fn_borrar_gasto_recurrente](../funcionesSQL/fn_borrar_gasto_recurrente.md) *(nueva, PRD gastos recurrentes R-GR-46: borrado DEFINITIVO; devuelve cuántas ocurrencias pendientes se perdieron; NO toca p_caja ni el saldo. Para pausar usar fn_eliminar_gasto_recurrente)*

271. [fn_pausar_gasto_recurrente](../funcionesSQL/fn_pausar_gasto_recurrente.md) *(nueva, PRD gastos recurrentes RN-31/RN-32: pausa con motivo y reactiva tocando solo activo, motivo_pausa y pausado_at; evita reenviar la fila entera y perder nombre propio o billetera)*

272. [fn_recurrente_proxima_ocurrencia](../funcionesSQL/fn_recurrente_proxima_ocurrencia.md) *(nueva, tanda 8: la aritmética de la próxima fecha del patrón en un solo lugar — semanal, mensual con recorte al último día del mes, anual con 29/02→28, única y tarjeta con cierre-3; la comparten el motor, el alta y la edición)*

273. [fn_generar_recurrentes_usuario](../funcionesSQL/fn_generar_recurrentes_usuario.md) *(nueva, tanda 8: el motor de recurrentes POR USUARIO; se llama al abrir la app y resuelve sólo el atraso de la sesión usando la columna p_gastos_recurrentes.proxima_ocurrencia; reemplaza al cron global fn_generar_recurrentes_hoy, que queda como backfill manual)*
274. [fn_ocr_categoria_id](../funcionesSQL/fn_ocr_categoria_id.md) *(nueva, PRD OCR §8/§105: resuelve el id real del nodo final `ocr_unrecognized` del usuario y lo provisiona si falta; interno, recibe user_id ya resuelto)*

275. [fn_obtener_categoria_ocr_no_reconocidos](../funcionesSQL/fn_obtener_categoria_ocr_no_reconocidos.md) *(nueva, PRD OCR §8: RPC pública que devuelve ese id al frontend; identidad por auth.uid())*

276. [fn_cargar_ticket_ocr_cuarentena](../funcionesSQL/fn_cargar_ticket_ocr_cuarentena.md) *(nueva, PRD OCR §47/§50/§52: aterriza un ticket OCR terminado en UNA fila de cuarentena con todos los items; idempotente por metadata.ocr_job_id con advisory lock + índice único; nunca escribe metadata.job_id, que es la señal de Voice)*

277. [fn_guardar_ticket_ocr_cuarentena](../funcionesSQL/fn_guardar_ticket_ocr_cuarentena.md) *(nueva, PRD OCR §17: persiste el borrador corregido del ticket sin crear movimientos y sin sacarlo de pendiente; conserva ocr_job_id y original_result desde la fila, valida categorías/billetera/tarjeta vigentes)*

278. [fn_confirmar_ticket_ocr_cuarentena](../funcionesSQL/fn_confirmar_ticket_ocr_cuarentena.md) *(nueva, PRD OCR §58: 1 fila → N grupos → N movimientos en una sola transacción; agrupa por categoría final, manda lo no clasificado al fallback, reparte el descuento general proporcional, cierra centavos en el grupo mayor y rechaza un desvío material; cuotas completas si es tarjeta)*

279. [fn_tr_proteger_categoria_ocr](../funcionesSQL/fn_tr_proteger_categoria_ocr.md) *(nueva, PRD OCR §8: trigger BEFORE UPDATE que impide renombrar o re-cuelgar `ocr_unrecognized`. NO bloquea DELETE a propósito: fn_borrar_datos_usuario hace DELETE directo y un trigger abortaría el borrado de cuenta)*


189c. [fn_disponible_transferible](../funcionesSQL/fn_disponible_transferible.md) *(NUEVA 2026-11, ronda 10: helper con la UNICA formula del disponible transferible de un sobre. Base cero arrastra salvo el ciclo de activacion, libertad no arrastra, y nunca descuenta a los hijos. El COALESCE dentro del CASE es obligatorio: sin fila en el ciclo anterior el SELECT INTO deja NULL y `GREATEST(NULL, 0)` devuelve 0, con lo que un sobre con techo quedaba en cero)*
189d. [fn_disponibles_transferibles](../funcionesSQL/fn_disponibles_transferibles.md) *(NUEVA 2026-11, ronda 10: devuelve estructura_id y disponible de todas las filas en UNA sola llamada, para que la pantalla deje de calcular el disponible por su cuenta)*
280. [fn_encolar_aviso](../funcionesSQL/fn_encolar_aviso.md) *(NUEVA 2026-11: unico punto de encolado de avisos. Respeta la preferencia del usuario por categoria leyendo cat_<categoria> de p_notificaciones_config, es idempotente por dedupe_key y NO se le concede a authenticated: solo service_role y postgres)*
281. [fn_notificaciones_contar](../funcionesSQL/fn_notificaciones_contar.md) *(NUEVA 2026-11: cantidad real de avisos operativos sin leer y sin vencer, para que el badge no traiga 50 filas al cliente. Excluye la familia engage: Engage no suma al badge)*
284. [fn_aviso_vencimiento_tarjeta](../funcionesSQL/fn_aviso_vencimiento_tarjeta.md) *(NUEVA 2026-11: tercer productor. Avisa 3 dias antes, solo si la tarjeta tiene cuotas impagas: avisar que vence una tarjeta sin nada que pagar es ruido)*
285. [fn_aviso_deuda_por_vencer](../funcionesSQL/fn_aviso_deuda_por_vencer.md) *(NUEVA 2026-11: cuarto productor. Avisa 7 dias antes una deuda viva (activo, pendiente o parcial); pagado, cancelado, archivado y refinanciado no avisan)*
286. [fn_aviso_categoria_en_rojo](../funcionesSQL/fn_aviso_categoria_en_rojo.md) *(NUEVA 2026-11: quinto productor. Categoria de egreso que gasto mas de lo asignado en el ciclo, SOLO en modo base cero. Replica la logica de fn_reporte_presupuestos_mensuales porque esa depende de auth.uid y el cron corre como service_role)*
287. [fn_aviso_ahorro_en_riesgo](../funcionesSQL/fn_aviso_ahorro_en_riesgo.md) *(NUEVA 2026-11: sexto productor. Sobre en semaforo rojo a 7 dias (plazo menor a 6 meses) o 14 dias (desde 6 meses) de la fecha objetivo, Definicion 32. Replica el calculo de fn_sobre_plan sin auth.uid)*
288. [fn_avisos_ejecutar](../funcionesSQL/fn_avisos_ejecutar.md) *(NUEVA 2026-11: unica entrada del cron. Corre los cinco productores y devuelve cuantos encolo cada uno. Cuarentena NO esta: la informa el FAB del Home)*
282. [fn_aviso_cuarentena](../funcionesSQL/fn_aviso_cuarentena.md) *(NUEVA 2026-11, vuelve con la regla de 24 h: el FAB del Home informa al instante; este aviso solo nace si el pendiente sigue sin resolver 24 horas despues, y su dedupe_key incluye el conteo para que un lote nuevo genere un aviso nuevo)*
