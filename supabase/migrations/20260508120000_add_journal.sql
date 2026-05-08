CREATE TABLE public.journal_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.journal_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal folders all" ON public.journal_folders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.journal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  folder_id UUID REFERENCES public.journal_folders ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content_html TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_time TIME NOT NULL DEFAULT (now()::time),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal notes all" ON public.journal_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.journal_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES public.journal_notes ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal attachments all" ON public.journal_attachments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX journal_folders_user_sort_idx ON public.journal_folders(user_id, sort_order);
CREATE INDEX journal_notes_user_updated_idx ON public.journal_notes(user_id, updated_at DESC);
CREATE INDEX journal_notes_folder_idx ON public.journal_notes(folder_id);
CREATE INDEX journal_notes_entry_date_idx ON public.journal_notes(user_id, entry_date);
CREATE INDEX journal_notes_tags_idx ON public.journal_notes USING GIN(tags);
CREATE INDEX journal_notes_search_idx ON public.journal_notes
  USING GIN(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_text, '')));
CREATE INDEX journal_attachments_note_idx ON public.journal_attachments(note_id);

CREATE TRIGGER journal_folders_updated_at BEFORE UPDATE ON public.journal_folders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER journal_notes_updated_at BEFORE UPDATE ON public.journal_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('journal-attachments', 'journal-attachments', false, 26214400, NULL)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = NULL;

CREATE POLICY "own journal attachment objects read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'journal-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "own journal attachment objects insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'journal-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "own journal attachment objects update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'journal-attachments' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'journal-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "own journal attachment objects delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'journal-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
