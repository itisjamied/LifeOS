
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  cycle_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Tasks (categories like "oral am", "skin am")
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7aa9d6',
  sort_order INT NOT NULL DEFAULT 0,
  time_of_day TEXT NOT NULL DEFAULT 'am', -- 'am' | 'pm' | 'any'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks all" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Variants (X / ● / ★ etc per task) with their sub-steps
CREATE TABLE public.task_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol TEXT NOT NULL,         -- 'x' | 'dot' | 'star' | 'bar'
  label TEXT NOT NULL,          -- e.g. "treatment wash"
  steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- ["brush","scrape"]
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.task_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own variants all" ON public.task_variants FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Schedule: which variant is assigned to which day-of-cycle (1..28) for each task
CREATE TABLE public.task_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  cycle_day INT NOT NULL CHECK (cycle_day BETWEEN 1 AND 28),
  variant_id UUID REFERENCES public.task_variants ON DELETE CASCADE,
  UNIQUE (task_id, cycle_day)
);
ALTER TABLE public.task_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own schedule all" ON public.task_schedule FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Completions per actual date
CREATE TABLE public.completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks ON DELETE CASCADE,
  date DATE NOT NULL,
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- which sub-steps done
  done BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, task_id, date)
);
ALTER TABLE public.completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own completions all" ON public.completions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX completions_user_date_idx ON public.completions(user_id, date);
CREATE INDEX schedule_task_idx ON public.task_schedule(task_id);
CREATE INDEX variants_task_idx ON public.task_variants(task_id);

-- updated_at trigger for profiles
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
