CREATE OR REPLACE FUNCTION public.fn_compare_versions(p_a TEXT, p_b TEXT)
RETURNS INT LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE
  a text[];
  b text[];
  ai INT;
  bi INT;
  i INT;
BEGIN
  a := string_to_array(COALESCE(p_a, '0'), '.');
  b := string_to_array(COALESCE(p_b, '0'), '.');
  FOR i IN 1..2 LOOP
    ai := COALESCE(NULLIF(a[i], '')::int, 0);
    bi := COALESCE(NULLIF(b[i], '')::int, 0);
    IF ai > bi THEN RETURN 1; END IF;
    IF ai < bi THEN RETURN -1; END IF;
  END LOOP;
  RETURN 0;
END;
$function$
