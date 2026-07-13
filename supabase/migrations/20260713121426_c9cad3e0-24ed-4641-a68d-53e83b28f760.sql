ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname TEXT;
UPDATE public.profiles SET nickname = username WHERE nickname IS NULL;
ALTER TABLE public.profiles ALTER COLUMN nickname SET NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, username, nickname)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'player_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'nickname', NEW.raw_user_meta_data->>'username', 'player_' || substr(NEW.id::text, 1, 8))
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();