CREATE OR REPLACE FUNCTION public.fn_generar_variacion_color(p_color_base_hex text, p_posicion_hijo integer, p_total_hijos integer DEFAULT 10)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
AS $function$
DECLARE
    v_hex text;
    v_r int; v_g int; v_b int;
    v_r_norm float; v_g_norm float; v_b_norm float;
    v_cmax float; v_cmin float; v_delta float;
    v_h float := 0; v_s float := 0; v_l float := 0;
    v_q float; v_p float;
    v_t_r float; v_t_g float; v_t_b float;
    v_step float;
    v_r_out int; v_g_out int; v_b_out int;
    
    -- Variables para inline hue_to_rgb (para R, G, B por separado)
    v_temp float;
    v_result float;
BEGIN
    -- 1. Parsear HEX a RGB (soporta #RRGGBB o RRGGBB)
    v_hex := ltrim(p_color_base_hex, '#');
    IF length(v_hex) != 6 THEN
        RETURN p_color_base_hex; -- Si el formato es inválido, devolver el original
    END IF;
    
    v_r := ('x' || substr(v_hex, 1, 2))::bit(8)::int;
    v_g := ('x' || substr(v_hex, 3, 2))::bit(8)::int;
    v_b := ('x' || substr(v_hex, 5, 2))::bit(8)::int;
    
    -- 2. Normalizar RGB a [0, 1]
    v_r_norm := v_r / 255.0;
    v_g_norm := v_g / 255.0;
    v_b_norm := v_b / 255.0;
    
    v_cmax := GREATEST(v_r_norm, v_g_norm, v_b_norm);
    v_cmin := LEAST(v_r_norm, v_g_norm, v_b_norm);
    v_delta := v_cmax - v_cmin;
    
    -- 3. Calcular Luminosidad (L)
    v_l := (v_cmax + v_cmin) / 2.0;
    
    -- 4. Calcular Saturación (S) y Hue (H)
    IF v_delta = 0 THEN
        v_h := 0;
        v_s := 0;
    ELSE
        -- Saturación
        IF v_l < 0.5 THEN
            v_s := v_delta / (v_cmax + v_cmin);
        ELSE
            v_s := v_delta / (2.0 - v_cmax - v_cmin);
        END IF;
        
        -- Hue
        IF v_cmax = v_r_norm THEN
            v_h := (v_g_norm - v_b_norm) / v_delta;
            IF v_g_norm < v_b_norm THEN v_h := v_h + 6; END IF;
        ELSIF v_cmax = v_g_norm THEN
            v_h := ((v_b_norm - v_r_norm) / v_delta) + 2;
        ELSE
            v_h := ((v_r_norm - v_g_norm) / v_delta) + 4;
        END IF;
        v_h := v_h / 6.0;
    END IF;
    
    -- 5. APLICAR VARIACIÓN DE LUMINOSIDAD según posición del hijo
    -- Distribuye hijos en un rango L: [0.25, 0.75] para asegurar legibilidad
    IF p_total_hijos > 1 THEN
        v_step := 0.50 / (p_total_hijos - 1);
        v_l := 0.25 + (p_posicion_hijo * v_step);
    ELSE
        v_l := 0.50;
    END IF;
    
    -- 6. HSL a RGB (conversión inline sin función anidada)
    IF v_s = 0 THEN
        -- Acromático (gris)
        v_r_norm := v_l;
        v_g_norm := v_l;
        v_b_norm := v_l;
    ELSE
        -- Calcular q y p
        IF v_l < 0.5 THEN
            v_q := v_l * (1.0 + v_s);
        ELSE
            v_q := v_l + v_s - (v_l * v_s);
        END IF;
        v_p := 2.0 * v_l - v_q;
        
        -- === Calcular R (inline hue_to_rgb) ===
        v_temp := v_h + (1.0/3.0);
        IF v_temp < 0 THEN v_temp := v_temp + 1; END IF;
        IF v_temp > 1 THEN v_temp := v_temp - 1; END IF;
        
        IF v_temp < (1.0/6.0) THEN
            v_result := v_p + (v_q - v_p) * 6.0 * v_temp;
        ELSIF v_temp < 0.5 THEN
            v_result := v_q;
        ELSIF v_temp < (2.0/3.0) THEN
            v_result := v_p + (v_q - v_p) * ((2.0/3.0) - v_temp) * 6.0;
        ELSE
            v_result := v_p;
        END IF;
        v_r_norm := v_result;
        
        -- === Calcular G (inline hue_to_rgb) ===
        v_temp := v_h;
        IF v_temp < 0 THEN v_temp := v_temp + 1; END IF;
        IF v_temp > 1 THEN v_temp := v_temp - 1; END IF;
        
        IF v_temp < (1.0/6.0) THEN
            v_result := v_p + (v_q - v_p) * 6.0 * v_temp;
        ELSIF v_temp < 0.5 THEN
            v_result := v_q;
        ELSIF v_temp < (2.0/3.0) THEN
            v_result := v_p + (v_q - v_p) * ((2.0/3.0) - v_temp) * 6.0;
        ELSE
            v_result := v_p;
        END IF;
        v_g_norm := v_result;
        
        -- === Calcular B (inline hue_to_rgb) ===
        v_temp := v_h - (1.0/3.0);
        IF v_temp < 0 THEN v_temp := v_temp + 1; END IF;
        IF v_temp > 1 THEN v_temp := v_temp - 1; END IF;
        
        IF v_temp < (1.0/6.0) THEN
            v_result := v_p + (v_q - v_p) * 6.0 * v_temp;
        ELSIF v_temp < 0.5 THEN
            v_result := v_q;
        ELSIF v_temp < (2.0/3.0) THEN
            v_result := v_p + (v_q - v_p) * ((2.0/3.0) - v_temp) * 6.0;
        ELSE
            v_result := v_p;
        END IF;
        v_b_norm := v_result;
    END IF;
    
    -- 7. Convertir RGB normalizado a [0, 255] y luego a HEX
    v_r_out := LEAST(255, GREATEST(0, round(v_r_norm * 255)::int));
    v_g_out := LEAST(255, GREATEST(0, round(v_g_norm * 255)::int));
    v_b_out := LEAST(255, GREATEST(0, round(v_b_norm * 255)::int));
    
    RETURN '#' || 
           lpad(to_hex(v_r_out), 2, '0') || 
           lpad(to_hex(v_g_out), 2, '0') || 
           lpad(to_hex(v_b_out), 2, '0');
END;
$function$