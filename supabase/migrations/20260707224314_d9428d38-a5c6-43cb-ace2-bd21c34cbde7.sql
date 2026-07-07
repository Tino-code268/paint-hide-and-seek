
-- PROFILES
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'player_' || substr(NEW.id::text, 1, 8))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROOMS
CREATE TABLE public.rooms (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','finished')),
  map_name text NOT NULL DEFAULT 'warehouse',
  max_players integer NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms readable by authenticated" ON public.rooms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can create rooms" ON public.rooms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "host can update room" ON public.rooms
  FOR UPDATE TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);
CREATE POLICY "host can delete room" ON public.rooms
  FOR DELETE TO authenticated USING (auth.uid() = host_id);

-- ROOM PLAYERS
CREATE TABLE public.room_players (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_ready boolean NOT NULL DEFAULT false,
  role text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
CREATE INDEX room_players_room_id_idx ON public.room_players(room_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_players TO authenticated;
GRANT ALL ON public.room_players TO service_role;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_players readable by authenticated" ON public.room_players
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "user joins as self" ON public.room_players
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user updates own row" ON public.room_players
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user or host removes row" ON public.room_players
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.host_id = auth.uid())
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_players REPLICA IDENTITY FULL;
