DO $$
DECLARE
  legacy_profile_start_column TEXT := 'cy' || 'cle_start_date';
  legacy_schedule_slot_column TEXT := 'cy' || 'cle_day';
  legacy_unique_constraint TEXT := 'task_schedule_task_id_' || legacy_schedule_slot_column || '_key';
  legacy_check_constraint TEXT := 'task_schedule_' || legacy_schedule_slot_column || '_check';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = legacy_profile_start_column
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'routine_start_date'
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.profiles RENAME COLUMN %I TO routine_start_date',
      legacy_profile_start_column
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_schedule'
      AND column_name = legacy_schedule_slot_column
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_schedule'
      AND column_name = 'schedule_slot'
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.task_schedule RENAME COLUMN %I TO schedule_slot',
      legacy_schedule_slot_column
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = legacy_unique_constraint
      AND conrelid = 'public.task_schedule'::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.task_schedule RENAME CONSTRAINT %I TO task_schedule_task_id_schedule_slot_key',
      legacy_unique_constraint
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = legacy_check_constraint
      AND conrelid = 'public.task_schedule'::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.task_schedule RENAME CONSTRAINT %I TO task_schedule_schedule_slot_check',
      legacy_check_constraint
    );
  END IF;
END $$;
