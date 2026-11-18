-- Respaldo de las tablas legacy de categorias, previo a su eliminacion.
-- Generado por scripts/prestamos/verify-legacy-categories.mjs
-- Proyecto: bjszdmheddcxjdhcvibi
-- p_categorias_plantilla: 9 filas
-- p_categorias_traduccion: 6 filas
--
-- Reversion: ejecutar este bloque completo. Recrea ambas tablas y sus filas.

CREATE TABLE IF NOT EXISTS public.p_categorias_plantilla (
    key_categoria text NOT NULL PRIMARY KEY,
    tipo_cupo     text NOT NULL,
    icono_default text,
    color_default text,
    es_sistema    boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.p_categorias_traduccion (
    key_categoria          text NOT NULL,
    idioma                 text NOT NULL,
    nombre_localizado      text NOT NULL,
    descripcion_localizada text,
    PRIMARY KEY (key_categoria, idioma)
);

INSERT INTO public.p_categorias_plantilla
    (key_categoria, tipo_cupo, icono_default, color_default, es_sistema)
VALUES
    ('cat_alimentos_hogar', 'necesidad', '🛒', '#0284C7', false),
    ('cat_educacion', 'necesidad', '🎓', '#6366F1', false),
    ('cat_finanzas', 'necesidad', '📊', '#3B82F6', false),
    ('cat_misterio', 'deseo', '⚠️', '#64748B', true),
    ('cat_ocio_placer', 'deseo', '🎭', '#EC4899', false),
    ('cat_salud', 'necesidad', '🏥', '#10B981', false),
    ('cat_tecnologia', 'deseo', '💻', '#8B5CF6', false),
    ('cat_transporte', 'necesidad', '🚗', '#F59E0B', false),
    ('cat_vivienda', 'necesidad', '🏠', '#EF4444', false);

INSERT INTO public.p_categorias_traduccion
    (key_categoria, idioma, nombre_localizado, descripcion_localizada)
VALUES
    ('cat_alimentos_hogar', 'en', 'Food & Home', 'Daily consumption and home maintenance expenses.'),
    ('cat_alimentos_hogar', 'es', 'Alimentos-Hogar', 'Gastos de consumo diario y mantenimiento del hogar.'),
    ('cat_misterio', 'en', 'Mystery/Forget', '️ DO NOT DELETE: Automatic reconciliation adjustments.'),
    ('cat_misterio', 'es', 'Misterio/Olvido', '⚠️ NO BORRAR: Ajustes automáticos de conciliación.'),
    ('cat_ocio_placer', 'en', 'Leisure & Pleasure', 'Discretionary expenses for enjoyment.'),
    ('cat_ocio_placer', 'es', 'Ocio y Placer', 'Gastos discrecionales para disfrutar.');

