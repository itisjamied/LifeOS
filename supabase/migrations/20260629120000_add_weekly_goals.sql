CREATE TABLE public.weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  week_start DATE NOT NULL,
  intention TEXT NOT NULL DEFAULT '',
  daily_goals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

ALTER TABLE public.weekly_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own weekly goals all" ON public.weekly_goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX weekly_goals_user_week_idx ON public.weekly_goals(user_id, week_start DESC);

CREATE TRIGGER weekly_goals_updated_at BEFORE UPDATE ON public.weekly_goals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
