# Batch post-voz II — 9 hallazgos del dueno (2026-09-29)

Branch `feature/voice-v1-frontend`. Base HEAD `3b17e8c`. Fuente: screenshots + lectura de codigo.
Regla 0/1: TODA modificacion Supabase se presenta primero y solo con OK.

## B1 — Moneda perdida en gasto de cuenta USD por voz (BUG de datos)
- Evidencia: Home muestra "Vivienda / Ashram card / $ -150" (deberia US$ -150). Cargo 150 USD por voz a wallet Ashram card (USD).
- Codigo: `p_caja` NO tiene columna moneda, tiene `es_usd boolean`. `fn_aprobar_cuarentena_v2` expense insert: `es_usd = (v_rec.moneda = 'USD')` — usa la moneda GUARDADA EN LA FILA DE CUARENTENA (que el flujo de voz probablemente graba como ARS), no la moneda de la BILLETERA elegida.
- Home timeline (HomePage ~1589): `moneda = isCardPayment && m.moneda==='USD' ? USD : walletCurrencyMap[nombre_billetera] ?? ARS` — el mapa si reconoceria Ashram card; hay que ver como viajaron los datos.
- Plan: probe de la fila de cuarentena + de p_caja.es_usd -> fix backend: es_usd deriva de moneda de la billetera origen en la aprobacion (y verificar insert en fn_cargar_movimientos_voz). Exito = US$ -150 en Home y en billetera.
- Espejo: fn_aprobar_cuarentena_v2.md. TEST DO-block obligatorio.

## B2 — Selector de categoria del editor = tree del filtro de Home
- Evidencia: el filtro de Home (modal "Seleccionar categoria") muestra padres con chevron expandible y hijos indentados; el editor usa un select nativo con optgroup (fix interino 915430a).
- Plan: reutilizar/extraer el componente de arbol del filtro de Home y usarlo como selector de categoria en EditarCuarentenaModal (gasto). El income queda en select simple con placeholder oculto (B6).
- Ojo: anti-colision catalogo (t en nombres seed, literales intactos) se conserva.

## B3 — Botones de item cuarentena simetricos + tap en el item abre edicion
- Evidencia: Editar (angosto) vs Rechazar (ancho) vs Aprobar (medio).
- Plan: CSS flex-1 iguales en las 3 (CuarentenaPage + BandejaCuarentena) + onClick del cuerpo de la card abre Editar (los botones siguen cortando el click via stopPropagation).

## B4 — Una sola pantalla de cuarentena
- Evidencia: /cuarentena (CuarentenaPage: cards pendientes/total + aprobar todos estilo propio) vs Bandeja de Entrada (componente BandejaCuarentena con chips Todos/OCR/recurrentes/voz y botones apagados).
- Dueno: la entrada desde Home debe ir a la BANDEJA con filtro Todos por defecto.
- Plan: /cuarentena renderiza BandejaCuarentena (los alert-items de Home ya navegan a /cuarentena); CuarentenaPage queda fuera del route activo. Verificar FAB de voz y deep-links.

## B5 — Card de ingreso/transferencia en cuarentena: titulo y color
- Evidencia: card "Sin detalle / Sin detalle / $ 1.000.000 en ROJO / Mercado Pago / Ingreso".
- Plan: para tipo income: titulo = billetera destino (Mercado Pago), monto EN VERDE (+), subtitulo el detalle si existe. Transferencias: mismos criterios por pata (egreso rojo, acreditacion verde).

## B6 — "Seleccionar fuente de ingreso" aparece como opcion
- Evidencia: dropdown del editor de ingreso muestra 4 filas con radio: el placeholder + Avisos/Changuitas/Sueldo.
- Plan: label explicita del campo + placeholder con `<option value="" disabled hidden>` para que no aparezca en la lista de opciones.

## B7 — Sugerencia de monto destino en transferencia cross-currency
- Evidencia: editor transferencia Mercado Pago ARS -> Dolar app USD: "monto de destino" vacio con placeholder "Requerido para transferencias entre monedas".
- Existe fn_obtener_cotizacion_usd() (p_divisas.valor_por_usd, moneda default del usuario) — espejo funcionesSQL/fn_obtener_cotizacion_usd.md.
- Plan: si destino vacio, precargar sugerencia: ARS->USD = monto/cotizacion, USD->ARS = monto*cotizacion. Editable por el usuario despues. Solo frontend (modal), el backend recibe el monto resuelto.

## B8 — Titulo de transferencias cross-currency: compra/venta de dolares
- Evidencia: Home muestra pata egress "Sin categoria / Mercado Pago / $ -100.000" y acreditacion "+US$ 65,0 / Ingreso" (deberia ser Compra de dolares / Venta de dolares).
- MECANISMO EXISTENTE: el timeline hace `t(m.detalle)` — los detalles especiales ya son claves i18n (card_summary_*)!
- Plan: en la aprobacion de cuarentena (y en la transfer manual si aplica) escribir detalle = clave i18n `transfer_compra_dolares` / `transfer_venta_dolares` segun direccion de monedas de las billeteras. Verificar que todos los consumidores de detalle envuelvan con t(). Presentar SQL antes de ejecutar (regla 0).

## B9 — Badge de campana cuenta tipos, no objetos + tap limpia
- Evidencia: campana 11 pero panel muestra 2 grupos (Cuarentena 9 + Desconciliadas 2).
- Codigo: HomePage 972 `totalAlertas = alerts?.total_alertas ?? 0` (sumatoria backend). Panel = filas condicionales.
- Plan: badge y header cuentan FILAS del panel (2). Tap en fila ya navega; agregar "descartada" (localStorage por tipo) para no volver a mostrar hasta que el conteo CREZCA (semantica de visto). Confirmar semantica con dueno.

## Estado
Resueltos 2026-09-29 (commits): B1 moneda (6504444 + fn_aprobar_cuarentena_v2 + fn_reporte_movimientos_recientes live, test PASS), B2 arbol (7733856), B3 botones/tap (a6b5821), B4 unificacion (fe4bab7, CuarentenaPage eliminada), B5 card ingreso (7bc4c95), B6 placeholder (9a1edb9), B7 sugerencia (d0efcaf), B8 compra/venta (dd99f6e + SQL live, test PASS 4/4, sin retro por decision del dueno), B9 badge/dismiss (a18e428).
Pendiente: dueno prueba la ronda; cherry-pick+push a produccion cuando pida.
