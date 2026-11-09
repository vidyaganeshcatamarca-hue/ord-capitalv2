-- ============================================================================
-- Ahorro / Sobres — modelo de verdad del dinero. Opción A: atribución derivada.
--
-- PRD: docs/ahorro/ORD_Ahorro_Sobres_PRD_Funcional_Consolidado_2026-11-06.md
--      DF-01..DF-07 (modalidad, multibilletera, moneda por sobre),
--      DF-16..DF-19 (historial, corrección, archivado),
--      DF-21..DF-24 (rendimiento manual + ingreso único).
--
-- Alcance: SÓLO creación de estructura. No borra, no modifica y no migra datos.
-- Los sobres legacy (p_billeteras.es_fondo_prevision) se migran en un paso
-- posterior y su fila original se conserva (PRD §13, advertencia de migración).
--
-- Por qué tablas nuevas y no "evolucionar" p_billeteras: con el sobre modelado
-- como billetera, el dinero sale de la billetera de origen y la atribución se
-- pierde. DF-02 (varias billeteras por sobre), DF-03 (modalidad por aporte) y
-- DF-04/DF-05 (rescate a origen con reparto explícito) son imposibles sin un
-- registro de movimientos que conserve billetera + modalidad por porción.
--
-- Idempotente: se puede correr dos veces sin efecto adicional.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Sobres
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.p_sobres (
    sobre_id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             bigint NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    nombre              text   NOT NULL,
    moneda              text   NOT NULL,

    -- DF-06: meta y fecha son opcionales e independientes. Sólo el nombre obliga.
    monto_meta          numeric(16,2),
    fecha_objetivo      date,

    -- DF-14/DF-15: el plan vigente corre desde la creación o la última
    -- replanificación. De acá salen la espera inicial y el avance esperado.
    plan_inicio_at      date   NOT NULL DEFAULT CURRENT_DATE,

    -- DF-26: orden inicial por grupos + arrastre persistente del usuario.
    -- Densidad baja a propósito: se ordena por (orden, sobre_id).
    orden               integer NOT NULL DEFAULT 0,
    orden_manual        boolean NOT NULL DEFAULT false,

    -- DF-18/DF-19: archivado definitivo, sin reactivación y sin pausa.
    archivado_at        timestamptz,

    icono               text   NOT NULL DEFAULT '💰',

    creado_at           timestamptz NOT NULL DEFAULT now(),
    actualizado_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT p_sobres_nombre_no_vacio CHECK (length(btrim(nombre)) > 0),
    CONSTRAINT p_sobres_moneda_no_vacia  CHECK (length(btrim(moneda)) > 0),
    CONSTRAINT p_sobres_meta_positiva    CHECK (monto_meta IS NULL OR monto_meta > 0),

    -- Habilita la FK compuesta de abajo: la moneda del movimiento no puede
    -- diferir de la del sobre (DF-07, "sin conversiones").
    CONSTRAINT p_sobres_sobre_moneda_uq  UNIQUE (sobre_id, moneda)
);

CREATE INDEX IF NOT EXISTS p_sobres_user_activos_idx
    ON public.p_sobres (user_id, orden, sobre_id) WHERE archivado_at IS NULL;

CREATE INDEX IF NOT EXISTS p_sobres_user_archivados_idx
    ON public.p_sobres (user_id, archivado_at DESC) WHERE archivado_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Movimientos: aporte | rescate | rendimiento
--
-- El saldo del sobre y la porción viva de cada (billetera, modalidad) se
-- derivan sumando esta tabla. Una sola fuente de verdad: no hay un segundo
-- saldo materializado que pueda desincronizarse.
--
-- Signo: `importe` es siempre positivo; el efecto lo da `tipo`.
--   aporte      -> suma al sobre, reduce el disponible de la billetera de origen
--   rescate     -> resta del sobre, devuelve el disponible a su billetera de origen
--   rendimiento -> suma al sobre como dinero nuevo, crea UN ingreso en p_caja
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.p_sobre_movimientos (
    movimiento_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sobre_id           bigint NOT NULL REFERENCES public.p_sobres(sobre_id) ON DELETE RESTRICT,
    user_id            bigint NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    tipo               text   NOT NULL CHECK (tipo IN ('aporte','rescate','rendimiento')),

    -- Siempre positivo. DF-04/DF-05: el rescate nunca se expresa en negativo.
    importe            numeric(16,2) NOT NULL CHECK (importe > 0),
    moneda             text   NOT NULL,

    -- Origen del aporte / destino del rescate / reserva real que generó el
    -- rendimiento. Siempre obligatoria: no hay porción sin billetera de origen
    -- (DF-02). Verificado en la base: no existen sobres previos que migrar.
    billetera_id       bigint NOT NULL REFERENCES public.p_billeteras(billetera_id) ON DELETE RESTRICT,

    -- DF-01/DF-03: real externa o virtual en ORD, decidido en CADA aporte.
    modalidad          text   NOT NULL CHECK (modalidad IN ('real','virtual')),

    -- DF-21: una reserva real puede generar rendimientos. Se marca en el aporte
    -- y habilita "Registrar rendimiento" para esa porción.
    genera_rendimiento boolean NOT NULL DEFAULT false,

    -- DF-23: fecha de registro en OR Ord, sin selector en el flujo.
    fecha              date   NOT NULL DEFAULT CURRENT_DATE,

    -- DF-22: el rendimiento crea UNA fila de p_caja tipo 'income'
    -- ("Rendimientos de ahorros"). Editar el rendimiento edita esa misma fila
    -- (DF-28): nunca se inserta un segundo ingreso.
    caja_id            bigint REFERENCES public.p_caja(p_caja_id) ON DELETE SET NULL,

    -- DF-17/DF-28: corrección del movimiento original, no un movimiento nuevo.
    corrige_a          bigint REFERENCES public.p_sobre_movimientos(movimiento_id) ON DELETE SET NULL,

    creado_at          timestamptz NOT NULL DEFAULT now(),
    actualizado_at     timestamptz NOT NULL DEFAULT now(),

    -- DF-07 estructural: la moneda del movimiento coincide con la del sobre.
    CONSTRAINT p_sobre_mov_sobre_moneda_fk
        FOREIGN KEY (sobre_id, moneda) REFERENCES public.p_sobres (sobre_id, moneda) ON DELETE RESTRICT,

    -- Toda porción exige billetera de origen (DF-02) y modalidad (DF-03).
    -- Un rendimiento sólo puede provenir de una reserva real (DF-21).
    CONSTRAINT p_sobre_mov_origen CHECK (
        (tipo IN ('aporte','rescate') AND modalidad IN ('real','virtual'))
        OR (tipo = 'rendimiento' AND modalidad = 'real')
    ),

    -- Sólo una reserva real puede generar rendimientos, y un movimiento de
    -- rendimiento siempre los genera.
    CONSTRAINT p_sobre_mov_rendimiento CHECK (
        (NOT genera_rendimiento OR modalidad = 'real')
        AND (tipo <> 'rendimiento' OR genera_rendimiento)
    )
);

CREATE INDEX IF NOT EXISTS p_sobre_mov_sobre_idx
    ON public.p_sobre_movimientos (sobre_id, fecha DESC, movimiento_id DESC);

-- Para el total reservado por billetera + modalidad, que alimenta Presupuesto
-- y Conciliación (DF-01: la virtual se resta, la real no).
CREATE INDEX IF NOT EXISTS p_sobre_mov_billetera_idx
    ON public.p_sobre_movimientos (billetera_id, moneda, tipo);

CREATE INDEX IF NOT EXISTS p_sobre_mov_caja_idx
    ON public.p_sobre_movimientos (caja_id) WHERE caja_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Auditoría de correcciones (DF-17, DF-28, §8.2)
--    Guarda el antes/después del movimiento editado. No es un movimiento más:
--    no afecta saldos y no aparece en el historial del usuario.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.p_sobre_movimientos_auditoria (
    auditoria_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    movimiento_id    bigint NOT NULL REFERENCES public.p_sobre_movimientos(movimiento_id) ON DELETE RESTRICT,
    user_id          bigint NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    datos_anteriores jsonb  NOT NULL,
    datos_nuevos     jsonb  NOT NULL,
    motivo           text,
    creado_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS p_sobre_mov_auditoria_idx
    ON public.p_sobre_movimientos_auditoria (movimiento_id, creado_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Permisos: mismo patrón que p_billeteras.
--    Hoy ninguna tabla se lee directo desde el cliente: todo pasa por RPC
--    SECURITY DEFINER (AGENTS.md regla 0). Estas tablas siguen esa regla.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.p_sobres                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.p_sobre_movimientos            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.p_sobre_movimientos_auditoria  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON public.p_sobres, public.p_sobre_movimientos, public.p_sobre_movimientos_auditoria
    TO postgres, service_role;

GRANT USAGE, SELECT
    ON SEQUENCE public.p_sobres_sobre_id_seq,
                 public.p_sobre_movimientos_movimiento_id_seq,
                 public.p_sobre_movimientos_auditoria_auditoria_id_seq
    TO postgres, service_role;

ALTER TABLE public.p_sobres                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p_sobre_movimientos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p_sobre_movimientos_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_security_definer_access ON public.p_sobres;
DROP POLICY IF EXISTS deny_direct_anon_access       ON public.p_sobres;
CREATE POLICY allow_security_definer_access ON public.p_sobres
    FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY deny_direct_anon_access ON public.p_sobres
    FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS allow_security_definer_access ON public.p_sobre_movimientos;
DROP POLICY IF EXISTS deny_direct_anon_access       ON public.p_sobre_movimientos;
CREATE POLICY allow_security_definer_access ON public.p_sobre_movimientos
    FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY deny_direct_anon_access ON public.p_sobre_movimientos
    FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS allow_security_definer_access ON public.p_sobre_movimientos_auditoria;
DROP POLICY IF EXISTS deny_direct_anon_access       ON public.p_sobre_movimientos_auditoria;
CREATE POLICY allow_security_definer_access ON public.p_sobre_movimientos_auditoria
    FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY deny_direct_anon_access ON public.p_sobre_movimientos_auditoria
    FOR ALL TO anon USING (false) WITH CHECK (false);

COMMENT ON TABLE public.p_sobres IS
    'Ahorro / Sobres. Un proyecto financiero es un sobre con meta (DF-32). Reemplaza el modelo p_billeteras.es_fondo_prevision.';
COMMENT ON TABLE public.p_sobre_movimientos IS
    'Aportes, rescates y rendimientos. El saldo del sobre y la porción viva por billetera+modalidad se derivan de acá.';
COMMENT ON TABLE public.p_sobre_movimientos_auditoria IS
    'Antes/después de cada corrección de movimiento (DF-17, DF-28). No afecta saldos.';

COMMIT;
