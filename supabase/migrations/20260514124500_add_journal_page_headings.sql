ALTER TABLE public.journal_note_pages
ADD COLUMN IF NOT EXISTS heading TEXT NOT NULL DEFAULT '';

UPDATE public.journal_note_pages
SET heading = journal_notes.title
FROM public.journal_notes
WHERE journal_note_pages.note_id = journal_notes.id
  AND coalesce(journal_note_pages.heading, '') = '';

DROP INDEX IF EXISTS public.journal_note_pages_search_idx;

CREATE INDEX journal_note_pages_search_idx ON public.journal_note_pages
  USING GIN(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(heading, '') || ' ' || coalesce(content_text, '')));
