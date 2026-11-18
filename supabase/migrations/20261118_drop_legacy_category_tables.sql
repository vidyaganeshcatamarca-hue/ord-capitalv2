-- Drop the legacy category translation prototype.
--
-- `p_categorias_plantilla` (9 rows) and `p_categorias_traduccion` (6 rows) are a
-- superseded prototype that predates the mechanism actually in use. They are
-- actively misleading because they disagree with it:
--
--   * their keys are Spanish (`cat_alimentos_hogar`) while the live system uses
--     English keys in p_estructuras_egresos.nombre_cuenta (`cat_food_home`);
--   * their tipo_cupo values are Spanish (`necesidad`, `deseo`) and would
--     violate p_estructuras_egresos_tipo_cupo_check (need/want/tithe/
--     investment/saving) if anything ever joined them to the live data;
--   * nothing localizes from them: translations live in src/locales/{es,en,pt}.ts
--     and are resolved through src/lib/catalogRegistry.ts.
--
-- Verified before removal (scripts/prestamos/verify-legacy-categories.mjs):
--   C1 no foreign key from any other table points at them;
--   C2 no view or materialized view references them;
--   C3 zero deployed functions mention them, out of 54 that touch the loans
--      tables and their neighbours;
--   C4 no triggers;
--   C7 fn_exportar_backup_maestro does not enumerate tables dynamically, so the
--      removal cannot break the backup.
--
-- Reversal: start_info/rollback_categorias_legacy.sql recreates both tables and
-- reinserts all 15 rows.

BEGIN;

-- p_categorias_traduccion holds the only foreign key, pointing at
-- p_categorias_plantilla, so it goes first. Dropping it also drops its policies.
DROP TABLE IF EXISTS public.p_categorias_traduccion;
DROP TABLE IF EXISTS public.p_categorias_plantilla;

COMMIT;
