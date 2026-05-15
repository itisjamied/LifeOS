import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { todayISO } from "@/lib/cycle";

export const JOURNAL_ATTACHMENTS_BUCKET = "journal-attachments";

export type JournalFolderRow = Database["public"]["Tables"]["journal_folders"]["Row"];
export type JournalNoteRow = Database["public"]["Tables"]["journal_notes"]["Row"];
export type JournalNoteUpdate = Database["public"]["Tables"]["journal_notes"]["Update"];
export type JournalNotePageRow = Database["public"]["Tables"]["journal_note_pages"]["Row"];
export type JournalNotePageUpdate = Database["public"]["Tables"]["journal_note_pages"]["Update"];
export type JournalAttachmentRow = Database["public"]["Tables"]["journal_attachments"]["Row"];

export interface JournalNoteWithAttachments extends JournalNoteRow {
  attachments: JournalAttachmentRow[];
  pages: JournalNotePageRow[];
}

export async function fetchJournal(userId: string) {
  const [
    { data: folders, error: foldersError },
    { data: notes, error: notesError },
    { data: pages, error: pagesError },
  ] = await Promise.all([
    supabase
      .from("journal_folders")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("journal_notes")
      .select("*, journal_attachments(*)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("journal_note_pages")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (foldersError) throw foldersError;
  if (notesError) throw notesError;
  if (pagesError) throw pagesError;

  const pagesByNoteId = new Map<string, JournalNotePageRow[]>();
  (pages ?? []).forEach((page) => {
    const notePages = pagesByNoteId.get(page.note_id) ?? [];
    notePages.push(page);
    pagesByNoteId.set(page.note_id, notePages);
  });

  return {
    folders: folders ?? [],
    notes: (
      (notes ?? []) as unknown as (JournalNoteRow & {
        journal_attachments?: JournalAttachmentRow[];
      })[]
    ).map(({ journal_attachments, ...note }) => ({
      ...note,
      attachments: journal_attachments ?? [],
      pages: (pagesByNoteId.get(note.id) ?? []).map((page) => ({
        ...page,
        entry_date: page.entry_date ?? note.entry_date,
        entry_time: page.entry_time ?? note.entry_time,
        heading: page.heading ?? "",
      })),
    })),
  };
}

export async function createJournalFolder(userId: string, name: string, sortOrder: number) {
  const { data, error } = await supabase
    .from("journal_folders")
    .insert({ user_id: userId, name, sort_order: sortOrder })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function renameJournalFolder(folderId: string, name: string) {
  const { data, error } = await supabase
    .from("journal_folders")
    .update({ name })
    .eq("id", folderId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteJournalFolder(folderId: string) {
  const { error } = await supabase.from("journal_folders").delete().eq("id", folderId);
  if (error) throw error;
}

export async function createJournalNote(
  userId: string,
  folderId?: string | null,
  entryDate = todayISO(),
) {
  const entryTime = new Date().toTimeString().slice(0, 5);
  const { data, error } = await supabase
    .from("journal_notes")
    .insert({
      user_id: userId,
      folder_id: folderId ?? null,
      title: "New note",
      content_html: "",
      content_text: "",
      tags: [],
      entry_date: entryDate,
      entry_time: entryTime,
    })
    .select("*")
    .single();
  if (error) throw error;
  const page = await createJournalNotePage({
    userId,
    noteId: data.id,
    title: "Main",
    sortOrder: 0,
    entryDate,
    entryTime,
  });
  return { ...data, attachments: [], pages: [page] };
}

export async function updateJournalNote(noteId: string, patch: JournalNoteUpdate) {
  const { data, error } = await supabase
    .from("journal_notes")
    .update(patch)
    .eq("id", noteId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createJournalNotePage({
  userId,
  noteId,
  title,
  heading = "",
  sortOrder,
  entryDate = todayISO(),
  entryTime = new Date().toTimeString().slice(0, 5),
}: {
  userId: string;
  noteId: string;
  title: string;
  heading?: string;
  sortOrder: number;
  entryDate?: string;
  entryTime?: string;
}) {
  const { data, error } = await supabase
    .from("journal_note_pages")
    .insert({
      user_id: userId,
      note_id: noteId,
      title,
      heading,
      content_html: "",
      content_text: "",
      entry_date: entryDate,
      entry_time: entryTime,
      sort_order: sortOrder,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateJournalNotePage(pageId: string, patch: JournalNotePageUpdate) {
  const { data, error } = await supabase
    .from("journal_note_pages")
    .update(patch)
    .eq("id", pageId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteJournalNotePage(pageId: string) {
  const { error } = await supabase.from("journal_note_pages").delete().eq("id", pageId);
  if (error) throw error;
}

export async function deleteJournalNote(noteId: string) {
  const { data: attachments } = await supabase
    .from("journal_attachments")
    .select("storage_path")
    .eq("note_id", noteId);

  if (attachments?.length) {
    await supabase.storage
      .from(JOURNAL_ATTACHMENTS_BUCKET)
      .remove(attachments.map((attachment) => attachment.storage_path));
  }

  const { error } = await supabase.from("journal_notes").delete().eq("id", noteId);
  if (error) throw error;
}

export async function addJournalAttachment({
  userId,
  noteId,
  file,
}: {
  userId: string;
  noteId: string;
  file: File;
}) {
  const safeName = file.name.replace(/[^\w.\- ]+/g, "").trim() || "attachment";
  const storagePath = `${userId}/${noteId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(JOURNAL_ATTACHMENTS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("journal_attachments")
    .insert({
      user_id: userId,
      note_id: noteId,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
      storage_path: storagePath,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteJournalAttachment(attachment: JournalAttachmentRow) {
  await supabase.storage.from(JOURNAL_ATTACHMENTS_BUCKET).remove([attachment.storage_path]);
  const { error } = await supabase.from("journal_attachments").delete().eq("id", attachment.id);
  if (error) throw error;
}

export async function signedAttachmentUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from(JOURNAL_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
