-- Loans / saneamiento rebuild — stage 3: close the live money-loss path.
--
-- The deployed fn_registrar_pago_extra_deuda has three defects, all confirmed in
-- its actual body (not just in the SQL mirror):
--
--   1. It INSERTs the p_caja row BEFORE the UPDATE and never checks whether the
--      UPDATE matched anything. A wrong or foreign id therefore debits the wallet,
--      writes an expense, and returns success while no loan is reduced. That is
--      the concrete way the module can take money without recording the debt.
--   2. It clamps with GREATEST(0, saldo_actual - p_monto), so the excess of an
--      overpayment vanishes: the wallet is charged in full and the difference is
--      never recorded.
--   3. It finds the debt category with ILIKE '%deuda%' ... LIMIT 1, which can pick
--      any user category whose name happens to contain "deuda".
--
-- Rather than fixing those in place and leaving two divergent implementations,
-- this makes the old function a thin compatibility shim over
-- fn_prestamo_registrar_pago. Same signature, same return value, so the current
-- UI keeps working, but there is now exactly one implementation of the logic.
--
-- Consequence, deliberately accepted: an overpayment now raises
-- error_overpayment_confirmation_required instead of silently eating the excess.
-- Refusing is reversible; keeping the money is not. The rebuilt UI will offer the
-- confirmation the spec requires.
--
-- This also neutralises the calendar identifier confusion at the entry point: a
-- cuota_id that is not a prestamo_id no longer debits anything, it raises.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_registrar_pago_extra_deuda(
    p_deuda_id            bigint,
    p_monto               numeric,
    p_billetera_origen_id bigint,
    p_fecha               date DEFAULT CURRENT_DATE,
    p_nota                text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_moneda text;
BEGIN
    -- A wallet that does not exist yields no currency; the delegate raises
    -- error_wallet_not_found before using it, so this is only a safety net.
    SELECT b.moneda INTO v_moneda
    FROM public.p_billeteras b
    WHERE b.billetera_id = p_billetera_origen_id;

    RETURN public.fn_prestamo_registrar_pago(
        p_prestamo_id         => p_deuda_id,
        p_billetera_id        => p_billetera_origen_id,
        p_monto_billetera     => p_monto,
        p_moneda_billetera    => COALESCE(NULLIF(trim(v_moneda), ''), 'ARS'),
        p_monto_aplicado      => p_monto,
        p_fecha               => p_fecha,
        p_nota                => p_nota,
        p_confirmar_excedente => false
    );
END;
$$;

COMMENT ON FUNCTION public.fn_registrar_pago_extra_deuda IS
    'Compatibility shim over fn_prestamo_registrar_pago. Kept because the current UI calls it; it no longer writes anything itself, so a bad id raises instead of debiting a wallet without reducing a loan.';

COMMIT;
