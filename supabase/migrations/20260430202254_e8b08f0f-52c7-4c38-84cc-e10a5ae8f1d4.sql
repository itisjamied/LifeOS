-- Step 1: identify duplicate tasks (keep the canonical one per user+name)
WITH ranked AS (
  SELECT id, user_id, name,
         row_number() OVER (
           PARTITION BY user_id, name
           ORDER BY sort_order ASC, created_at ASC, id ASC
         ) AS rn
  FROM public.tasks
),
dup_ids AS (
  SELECT id FROM ranked WHERE rn > 1
)
-- Step 2: delete dependent rows first (no FKs, so manual)
DELETE FROM public.completions WHERE task_id IN (SELECT id FROM dup_ids);

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, name
           ORDER BY sort_order ASC, created_at ASC, id ASC
         ) AS rn
  FROM public.tasks
),
dup_ids AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM public.task_schedule WHERE task_id IN (SELECT id FROM dup_ids);

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, name
           ORDER BY sort_order ASC, created_at ASC, id ASC
         ) AS rn
  FROM public.tasks
),
dup_ids AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM public.task_variants WHERE task_id IN (SELECT id FROM dup_ids);

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, name
           ORDER BY sort_order ASC, created_at ASC, id ASC
         ) AS rn
  FROM public.tasks
),
dup_ids AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM public.tasks WHERE id IN (SELECT id FROM dup_ids);

-- Step 3: prevent future duplicates at the database level
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_user_name_unique UNIQUE (user_id, name);