-- ============================================================================
-- 96 — OCR: idempotencia de la cuarentena por `ocr_job_id`
--
-- PRD OCR definitivo §52, §123. Voice sólo tiene idempotencia de cliente; OCR
-- necesita las DOS capas: guardia en el frontend y garantía en la base.
--
-- La fila padre de cuarentena lleva `origen = 'ocr'` y el job en
-- `metadata.ocr_job_id` (NUNCA `metadata.job_id`, que es la señal de Voice —
-- PRD §51). El índice único parcial hace imposible que dos despachos del mismo
-- job creen dos cuarentenas, incluso con concurrencia real.
--
-- Nota: se indexa por expresión (`metadata->>'ocr_job_id'`) y sólo para filas
-- OCR y estados vivos. Una fila `rechazado` se conserva fuera del índice para
-- permitir que un reenvío legítimo del usuario (mismo comprobante, decisión
-- nueva) pueda volver a entrar.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_cuarentena_ocr_job
    ON public.p_caja_cuarentena (user_id, (metadata->>'ocr_job_id'))
    WHERE origen = 'ocr' AND estado <> 'rechazado';

CREATE INDEX IF NOT EXISTS ix_cuarentena_ocr_estado
    ON public.p_caja_cuarentena (user_id, estado)
    WHERE origen = 'ocr';
