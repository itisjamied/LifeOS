ALTER TABLE public.journal_note_pages
ADD COLUMN IF NOT EXISTS entry_date DATE;

ALTER TABLE public.journal_note_pages
ADD COLUMN IF NOT EXISTS entry_time TIME;

UPDATE public.journal_note_pages
SET
  entry_date = journal_notes.entry_date,
  entry_time = journal_notes.entry_time
FROM public.journal_notes
WHERE journal_note_pages.note_id = journal_notes.id
  AND (journal_note_pages.entry_date IS NULL OR journal_note_pages.entry_time IS NULL);

ALTER TABLE public.journal_note_pages
ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE,
ALTER COLUMN entry_date SET NOT NULL,
ALTER COLUMN entry_time SET DEFAULT (now()::time),
ALTER COLUMN entry_time SET NOT NULL;

CREATE INDEX IF NOT EXISTS journal_note_pages_entry_date_idx
ON public.journal_note_pages(user_id, entry_date);
