ALTER TABLE public.completions
ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT false;

UPDATE public.completions
SET skipped = false
WHERE skipped IS NULL;
