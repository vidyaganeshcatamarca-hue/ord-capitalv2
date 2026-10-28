-- 118 — Bitcoin: el capital vuelve a 600.000
--
-- Decisión del dueño: en Bitcoin puso 600.000 en total.
--
-- Los movimientos que lo respaldan ya existen y suman exactamente eso:
--   p_caja 5156  2026-10-20  investment_prefix: Bitcoin        500.000
--   p_caja 5340  2026-10-26  investment_contribution: Bitcoin  100.000
--                                                            -----------
--                                                             600.000
--
-- El capital quedó en 700.000 porque ese aporte se creó con
-- fn_aportar_inversion, que suma el monto en los dos lados (capital y valor),
-- cuando el capital ya lo incluía. El valor de mercado (550.000) y lo retirado
-- (250.000) no se tocan: el valor es lo que la posición vale hoy y los retiros
-- son movimientos reales.
--
-- Efecto: capital neto 600.000 - 250.000 = 350.000 y ganancia
-- 550.000 + 250.000 - 600.000 = +200.000 (antes decía +100.000).
--
-- NO se borra ninguna fila: los dos movimientos "investment_prefix: Prueba" de
-- 100 cada uno (p_caja 5186 y 5209) siguen ahí, por eso este UPDATE no suma
-- p_caja: la suma daría 600.200. Quedan como ruido visible en el historial de
-- Bitcoin, pendientes de una decisión aparte.
--
-- Guarda doble: solo si el capital ES 700.000 y el usuario es el dueño del dato.

UPDATE public.p_inversiones
   SET monto_invertido_original = 600000
 WHERE inversion_id = 1
   AND user_id = 1
   AND monto_invertido_original = 700000;
