-- Loans / saneamiento rebuild — stage 1a: additive schema only.
--
-- Design notes (all verified against the deployed catalog, see
-- odd/tasks/prestamos-saneamiento-rebuild.md):
--
--   * p_prestamos already has 0 rows, so every column here is added with a
--     default and no backfill is needed or possible.
--   * p_prestamos_tipo_flujo_check already accepts 'debo' AND 'me_deben', so the
--     direction needs no migration.
--   * p_prestamos_estado_check already accepts 'pagado', which is the state the
--     spec calls "Saldado". Only 'eliminado' (logical deletion, §3.3 / AC-08)
--     has to be added.
--   * Installments and payments get their own tables. p_cuotas_detalle is the
--     card installment table: it has no per-installment capital or interest
--     columns, its 757 rows are all cards, and none carries a prestamo_id. It
--     cannot express an amortization schedule.
--   * Money movement is NOT written by these tables. p_caja already has the
--     trigger tr_actualizar_saldo_p_caja_integral, which owns
--     p_billeteras.saldo_actual. No RPC may touch a wallet balance directly, and
--     that is how the "no duplicate discount" requirement is met.
--
-- Non-destructive: adds columns, adds two tables, replaces one CHECK with a
-- strict superset of itself.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. p_prestamos: the fields the spec needs and the table does not have
-- ---------------------------------------------------------------------------

ALTER TABLE public.p_prestamos
    ADD COLUMN IF NOT EXISTS saldo_al_ingreso    numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS modalidad           text    NOT NULL DEFAULT 'libre',
    ADD COLUMN IF NOT EXISTS condicion_interes   text    NOT NULL DEFAULT 'desconocido',
    ADD COLUMN IF NOT EXISTS interes_total_acordado numeric,
    ADD COLUMN IF NOT EXISTS tasa_informada      boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS puntos_vinculo      smallint,
    ADD COLUMN IF NOT EXISTS eliminado_at        timestamp with time zone;

COMMENT ON COLUMN public.p_prestamos.saldo_al_ingreso IS
    'Pending balance at the moment the loan was registered in ORD. Separates "paid inside ORD" (saldo_al_ingreso - saldo_actual) from the pending balance, so pre-existing repayments are never presented as ORD operations.';
COMMENT ON COLUMN public.p_prestamos.modalidad IS
    'cuotas | vencimiento_unico | libre. "libre" has no dates and can never be overdue.';
COMMENT ON COLUMN public.p_prestamos.condicion_interes IS
    'ninguno | importe_final | tasa | desconocido. Unknown is not the same as a real 0%.';
COMMENT ON COLUMN public.p_prestamos.tasa_informada IS
    'Distinguishes an explicitly entered rate (including a real 0%) from a rate that was never informed. tasa_anual_tna defaults to 0, so it cannot express the difference; existing rows keep false rather than being reinterpreted.';
COMMENT ON COLUMN public.p_prestamos.puntos_vinculo IS
    'Result of the Vinculos questionnaire for personal creditors: 0, 3, 5, 6, 8 or 11. NULL for institutional loans and unscored loans.';
COMMENT ON COLUMN public.p_prestamos.eliminado_at IS
    'Logical deletion of a settled loan from the visible history. The row survives so p_caja references stay valid.';

ALTER TABLE public.p_prestamos
    DROP CONSTRAINT IF EXISTS p_prestamos_modalidad_check,
    ADD  CONSTRAINT p_prestamos_modalidad_check
         CHECK (modalidad = ANY (ARRAY['cuotas'::text, 'vencimiento_unico'::text, 'libre'::text])),
    DROP CONSTRAINT IF EXISTS p_prestamos_condicion_interes_check,
    ADD  CONSTRAINT p_prestamos_condicion_interes_check
         CHECK (condicion_interes = ANY (ARRAY['ninguno'::text, 'importe_final'::text, 'tasa'::text, 'desconocido'::text])),
    DROP CONSTRAINT IF EXISTS p_prestamos_puntos_vinculo_check,
    ADD  CONSTRAINT p_prestamos_puntos_vinculo_check
         CHECK (puntos_vinculo IS NULL OR puntos_vinculo = ANY (ARRAY[0,3,5,6,8,11]));

-- estado: strict superset of the existing allowed set, plus 'eliminado'.
ALTER TABLE public.p_prestamos
    DROP CONSTRAINT IF EXISTS p_prestamos_estado_check,
    ADD  CONSTRAINT p_prestamos_estado_check
         CHECK (estado = ANY (ARRAY['activo'::text, 'archivado'::text, 'pagado'::text,
                                    'refinanciado'::text, 'pendiente'::text, 'parcial'::text,
                                    'cancelado'::text, 'eliminado'::text]));

CREATE INDEX IF NOT EXISTS idx_p_prestamos_user_flujo_estado
    ON public.p_prestamos (user_id, tipo_flujo, estado);

-- ---------------------------------------------------------------------------
-- 2. p_prestamos_cuotas: the installment schedule, only for modalidad='cuotas'
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.p_prestamos_cuotas (
    cuota_id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prestamo_id         bigint NOT NULL REFERENCES public.p_prestamos(prestamo_id) ON DELETE CASCADE,
    user_id             bigint NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    numero_cuota        integer NOT NULL,
    fecha_vencimiento   date    NOT NULL,
    monto_cuota         numeric NOT NULL,
    capital_componente  numeric,
    interes_componente  numeric,
    moneda              text    NOT NULL,
    creado_at           timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT p_prestamos_cuotas_numero_positivo CHECK (numero_cuota > 0),
    CONSTRAINT p_prestamos_cuotas_monto_positivo  CHECK (monto_cuota > 0),
    CONSTRAINT p_prestamos_cuotas_componentes_no_negativos
        CHECK ((capital_componente IS NULL OR capital_componente >= 0)
           AND (interes_componente IS NULL OR interes_componente >= 0)),
    CONSTRAINT p_prestamos_cuotas_numero_unico UNIQUE (prestamo_id, numero_cuota)
);

COMMENT ON TABLE public.p_prestamos_cuotas IS
    'Installment schedule for loans registered with modalidad = cuotas. A NULL interes_componente means the interest portion is unknown, which is not the same as zero.';
COMMENT ON COLUMN public.p_prestamos_cuotas.capital_componente IS
    'Capital portion of this installment, when known. NULL = not informed.';
COMMENT ON COLUMN public.p_prestamos_cuotas.interes_componente IS
    'Interest portion of this installment, when known. NULL = not informed; the simulation refuses to estimate interest savings when this is NULL.';

CREATE INDEX IF NOT EXISTS idx_p_prestamos_cuotas_prestamo_fecha
    ON public.p_prestamos_cuotas (prestamo_id, fecha_vencimiento);

-- ---------------------------------------------------------------------------
-- 3. p_prestamos_pagos: the loan-side record of a payment or collection
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.p_prestamos_pagos (
    pago_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prestamo_id         bigint NOT NULL REFERENCES public.p_prestamos(prestamo_id) ON DELETE CASCADE,
    user_id             bigint NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    p_caja_id           bigint REFERENCES public.p_caja(p_caja_id) ON DELETE CASCADE,
    direccion           text   NOT NULL,
    fecha               date   NOT NULL,
    billetera_id        bigint REFERENCES public.p_billeteras(billetera_id) ON DELETE SET NULL,
    moneda_billetera    text   NOT NULL,
    monto_billetera     numeric NOT NULL,
    moneda_prestamo     text   NOT NULL,
    monto_aplicado      numeric NOT NULL,
    capital_aplicado    numeric,
    interes_aplicado    numeric,
    interes_excedente   numeric,
    nota                text,
    estado              text   NOT NULL DEFAULT 'activo',
    corregido_at        timestamp with time zone,
    creado_at           timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT p_prestamos_pagos_direccion_check CHECK (direccion = ANY (ARRAY['pago'::text, 'cobro'::text])),
    CONSTRAINT p_prestamos_pagos_estado_check    CHECK (estado = ANY (ARRAY['activo'::text, 'anulado'::text])),
    CONSTRAINT p_prestamos_pagos_montos_no_negativos
        CHECK (monto_billetera > 0 AND monto_aplicado >= 0
           AND (capital_aplicado  IS NULL OR capital_aplicado  >= 0)
           AND (interes_aplicado  IS NULL OR interes_aplicado  >= 0)
           AND (interes_excedente IS NULL OR interes_excedente >= 0))
);

COMMENT ON TABLE public.p_prestamos_pagos IS
    'Loan-side record of a payment (direccion = pago, loan in Debo) or a collection (direccion = cobro, loan in Me deben). The cash leg lives in p_caja; this table holds the loan math. One row per operation, so correcting an operation edits one row instead of duplicating movements.';
COMMENT ON COLUMN public.p_prestamos_pagos.monto_billetera IS
    'Amount actually debited or credited in the wallet currency. Requirement (a) of the multi-currency rule.';
COMMENT ON COLUMN public.p_prestamos_pagos.monto_aplicado IS
    'Amount recognised against the loan balance, in the loan currency. Requirement (b). Never derived from an invented exchange rate.';
COMMENT ON COLUMN public.p_prestamos_pagos.interes_excedente IS
    'Excess of an overpayment/overcollection explicitly confirmed by the user as previously unregistered interest. Never inferred.';
COMMENT ON COLUMN public.p_prestamos_pagos.p_caja_id IS
    'Cash movement backing this operation. ON DELETE CASCADE: if the cash leg disappears the operation disappears with it, and the balance is recomputed from the surviving rows.';

CREATE INDEX IF NOT EXISTS idx_p_prestamos_pagos_prestamo_estado
    ON public.p_prestamos_pagos (prestamo_id, estado, fecha);
CREATE INDEX IF NOT EXISTS idx_p_prestamos_pagos_caja
    ON public.p_prestamos_pagos (p_caja_id);

-- One active operation per cash movement: prevents recording the same money twice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_p_prestamos_pagos_caja_activa
    ON public.p_prestamos_pagos (p_caja_id)
    WHERE estado = 'activo' AND p_caja_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Row level security: same shape as every other table in this module
-- ---------------------------------------------------------------------------

ALTER TABLE public.p_prestamos_cuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p_prestamos_pagos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_security_definer_access ON public.p_prestamos_cuotas;
DROP POLICY IF EXISTS deny_direct_anon_access       ON public.p_prestamos_cuotas;
CREATE POLICY allow_security_definer_access ON public.p_prestamos_cuotas
    FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY deny_direct_anon_access ON public.p_prestamos_cuotas
    FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS allow_security_definer_access ON public.p_prestamos_pagos;
DROP POLICY IF EXISTS deny_direct_anon_access       ON public.p_prestamos_pagos;
CREATE POLICY allow_security_definer_access ON public.p_prestamos_pagos
    FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY deny_direct_anon_access ON public.p_prestamos_pagos
    FOR ALL TO anon USING (false) WITH CHECK (false);

COMMIT;
