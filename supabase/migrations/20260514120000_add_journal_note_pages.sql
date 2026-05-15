CREATE TABLE public.journal_note_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES public.journal_notes ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Page',
  content_html TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_time TIME NOT NULL DEFAULT (now()::time),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_note_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal note pages all" ON public.journal_note_pages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.journal_notes
      WHERE journal_notes.id = journal_note_pages.note_id
        AND journal_notes.user_id = auth.uid()
    )
  );

CREATE INDEX journal_note_pages_note_sort_idx ON public.journal_note_pages(note_id, sort_order);
CREATE INDEX journal_note_pages_entry_date_idx ON public.journal_note_pages(user_id, entry_date);
CREATE INDEX journal_note_pages_user_updated_idx ON public.journal_note_pages(user_id, updated_at DESC);
CREATE INDEX journal_note_pages_search_idx ON public.journal_note_pages
  USING GIN(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_text, '')));

CREATE TRIGGER journal_note_pages_updated_at BEFORE UPDATE ON public.journal_note_pages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.journal_note_pages (
  user_id,
  note_id,
  title,
  content_html,
  content_text,
  entry_date,
  entry_time,
  sort_order,
  created_at,
  updated_at
)
SELECT
  user_id,
  id,
  'Main',
  content_html,
  content_text,
  entry_date,
  entry_time,
  0,
  created_at,
  updated_at
FROM public.journal_notes
WHERE NOT EXISTS (
  SELECT 1
  FROM public.journal_note_pages
  WHERE journal_note_pages.note_id = journal_notes.id
);
