import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { todayISO } from "@/lib/cycle";
import {
  addJournalAttachment,
  createJournalFolder,
  createJournalNote,
  deleteJournalAttachment,
  deleteJournalFolder,
  deleteJournalNote,
  fetchJournal,
  renameJournalFolder,
  signedAttachmentUrl,
  updateJournalNote,
  type JournalAttachmentRow,
  type JournalFolderRow,
  type JournalNoteWithAttachments,
} from "@/lib/journal-data";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  Bold,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Paperclip,
  Pencil,
  Plus,
  Quote,
  Search,
  Sparkles,
  Trash2,
  Underline,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Journal — Cycle" },
      {
        name: "description",
        content: "Private folders, rich notes, attachments and a monthly journal calendar.",
      },
    ],
  }),
  component: JournalPage,
});

type FolderFilter = "all" | "unfiled" | string;
type SaveState = "idle" | "dirty" | "saving" | "saved";
type MetaEditor = "stamp" | "folder" | null;
type ToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  heading: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  checklist: boolean;
  quote: boolean;
};
type DraftSnapshot = {
  title: string;
  html: string;
  text: string;
  tags: string;
  folderId: string;
  entryDate: string;
  entryTime: string;
};

const EMPTY_TOOLBAR_STATE: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  heading: false,
  unorderedList: false,
  orderedList: false,
  checklist: false,
  quote: false,
};

function JournalPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const editorToolbarRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const selectedNoteIdRef = useRef<string | null>(null);
  const selectedNoteRef = useRef<JournalNoteWithAttachments | null>(null);
  const draftRef = useRef<DraftSnapshot>({
    title: "",
    html: "",
    text: "",
    tags: "",
    folderId: "none",
    entryDate: todayISO(),
    entryTime: new Date().toTimeString().slice(0, 5),
  });
  const draftVersionRef = useRef(0);
  const saveStateRef = useRef<SaveState>("idle");
  const attachmentUrlsRef = useRef<Record<string, string>>({});
  const caretScrollFrameRef = useRef<number | null>(null);
  const restoreEditorFrameRef = useRef<number | null>(null);
  const restoreEditorTimeoutsRef = useRef<number[]>([]);
  const lastMeaningfulEditorHtmlRef = useRef("");
  const blankEditorSaveAllowedRef = useRef(false);
  const [folders, setFolders] = useState<JournalFolderRow[]>([]);
  const [notes, setNotes] = useState<JournalNoteWithAttachments[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<FolderFilter>("all");
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [busy, setBusy] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [draftTitle, setDraftTitle] = useState("");
  const [draftHtml, setDraftHtml] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftFolderId, setDraftFolderId] = useState("none");
  const [draftEntryDate, setDraftEntryDate] = useState(todayISO());
  const [draftEntryTime, setDraftEntryTime] = useState(new Date().toTimeString().slice(0, 5));
  const [metaEditor, setMetaEditor] = useState<MetaEditor>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(EMPTY_TOOLBAR_STATE);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const reload = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { folders: folderRows, notes: noteRows } = await fetchJournal(user.id);
      setFolders(folderRows);
      setNotes(sortJournalNotes(noteRows));
      setSelectedNoteId((current) =>
        current && noteRows.some((note) => note.id === current) ? current : null,
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load journal");
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    selectedNoteIdRef.current = selectedNoteId;
  }, [selectedNoteId]);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((folder) => map.set(folder.id, folder.name));
    return map;
  }, [folders]);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  useEffect(() => {
    selectedNoteRef.current = selectedNote;
  }, [selectedNote]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    attachmentUrlsRef.current = attachmentUrls;
  }, [attachmentUrls]);

  useEffect(() => {
    draftRef.current = {
      title: draftTitle,
      html: draftHtml,
      text: draftText,
      tags: draftTags,
      folderId: draftFolderId,
      entryDate: draftEntryDate,
      entryTime: draftEntryTime,
    };
  }, [draftEntryDate, draftEntryTime, draftFolderId, draftHtml, draftTags, draftText, draftTitle]);

  const keepCaretInView = useCallback(() => {
    if (typeof window === "undefined") return;

    if (caretScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(caretScrollFrameRef.current);
    }

    caretScrollFrameRef.current = window.requestAnimationFrame(() => {
      caretScrollFrameRef.current = null;
      scrollEditorSelectionIntoView(
        editorScrollRef.current,
        editorRef.current,
        editorToolbarRef.current,
      );
      window.setTimeout(() => {
        scrollEditorSelectionIntoView(
          editorScrollRef.current,
          editorRef.current,
          editorToolbarRef.current,
        );
      }, 90);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (caretScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(caretScrollFrameRef.current);
      }
      if (restoreEditorFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreEditorFrameRef.current);
      }
      restoreEditorTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      restoreEditorTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!selectedNote || typeof window === "undefined" || !window.visualViewport) {
      setKeyboardOffset(0);
      return;
    }

    const viewport = window.visualViewport;
    const updateKeyboardOffset = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardOffset(Math.round(offset));
      keepCaretInView();
    };

    updateKeyboardOffset();
    viewport.addEventListener("resize", updateKeyboardOffset);
    viewport.addEventListener("scroll", updateKeyboardOffset);
    window.addEventListener("orientationchange", updateKeyboardOffset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardOffset);
      viewport.removeEventListener("scroll", updateKeyboardOffset);
      window.removeEventListener("orientationchange", updateKeyboardOffset);
    };
  }, [keepCaretInView, selectedNote]);

  const refreshToolbarState = useCallback(() => {
    if (typeof document === "undefined" || !editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setToolbarState(EMPTY_TOOLBAR_STATE);
      return;
    }

    const anchor = selection.anchorNode;
    if (anchor && !editorRef.current.contains(anchor)) return;

    const formatBlock = String(document.queryCommandValue("formatBlock") ?? "").toLowerCase();
    const blockElement = currentBlockElement(editorRef.current);

    setToolbarState({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      heading: formatBlock === "h2" || blockElement?.tagName === "H2",
      unorderedList: document.queryCommandState("insertUnorderedList"),
      orderedList: document.queryCommandState("insertOrderedList"),
      checklist: !!blockElement?.closest("[data-checklist-item]"),
      quote: formatBlock === "blockquote" || !!blockElement?.closest("blockquote"),
    });
  }, []);

  const restoreEditorFromDraftIfNeeded = useCallback(() => {
    const editor = editorRef.current;
    const note = selectedNoteRef.current;
    if (!editor || !note || hasMeaningfulEditorHtml(editor.innerHTML)) return;

    const html =
      firstMeaningfulHtml(
        draftRef.current.html,
        lastMeaningfulEditorHtmlRef.current,
        ensureInlineAttachmentEmbeds(note.content_html || "", note.attachments),
      ) ?? "";
    if (!hasMeaningfulEditorHtml(html)) return;

    editor.innerHTML = renderInlineAttachments(html, note.attachments, attachmentUrlsRef.current);
    lastMeaningfulEditorHtmlRef.current = html;
    blankEditorSaveAllowedRef.current = false;
  }, []);

  const scheduleEditorRestore = useCallback(() => {
    restoreEditorFromDraftIfNeeded();
    if (typeof window === "undefined") return;

    if (restoreEditorFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreEditorFrameRef.current);
    }
    restoreEditorTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    restoreEditorTimeoutsRef.current = [];

    restoreEditorFrameRef.current = window.requestAnimationFrame(() => {
      restoreEditorFrameRef.current = null;
      restoreEditorFromDraftIfNeeded();
    });

    [80, 240].forEach((delay) => {
      const timeout = window.setTimeout(() => {
        restoreEditorFromDraftIfNeeded();
        restoreEditorTimeoutsRef.current = restoreEditorTimeoutsRef.current.filter(
          (item) => item !== timeout,
        );
      }, delay);
      restoreEditorTimeoutsRef.current.push(timeout);
    });
  }, [restoreEditorFromDraftIfNeeded]);

  useEffect(() => {
    if (!selectedNote) {
      setToolbarState(EMPTY_TOOLBAR_STATE);
      return;
    }

    document.addEventListener("selectionchange", refreshToolbarState);
    return () => document.removeEventListener("selectionchange", refreshToolbarState);
  }, [refreshToolbarState, selectedNote]);

  useEffect(() => {
    if (!selectedNote) {
      draftRef.current = {
        title: "",
        html: "",
        text: "",
        tags: "",
        folderId: "none",
        entryDate: todayISO(),
        entryTime: new Date().toTimeString().slice(0, 5),
      };
      setMetaEditor(null);
      setDraftTitle("");
      setDraftHtml("");
      setDraftText("");
      setDraftTags("");
      setDraftFolderId("none");
      setDraftEntryDate(todayISO());
      setDraftEntryTime(new Date().toTimeString().slice(0, 5));
      if (editorRef.current) editorRef.current.innerHTML = "";
      lastMeaningfulEditorHtmlRef.current = "";
      blankEditorSaveAllowedRef.current = false;
      saveStateRef.current = "idle";
      setSaveState("idle");
      return;
    }

    const html = ensureInlineAttachmentEmbeds(
      selectedNote.content_html || "",
      selectedNote.attachments,
    );
    const nextDraft = {
      title: selectedNote.title,
      html,
      text: selectedNote.content_text,
      tags: (selectedNote.tags ?? []).join(", "),
      folderId: selectedNote.folder_id ?? "none",
      entryDate: selectedNote.entry_date,
      entryTime: normalizeTimeValue(selectedNote.entry_time),
    };
    draftRef.current = nextDraft;
    lastMeaningfulEditorHtmlRef.current = hasMeaningfulEditorHtml(nextDraft.html)
      ? nextDraft.html
      : "";
    blankEditorSaveAllowedRef.current = false;
    setMetaEditor(null);
    setDraftTitle(nextDraft.title);
    setDraftHtml(nextDraft.html);
    setDraftText(nextDraft.text);
    setDraftTags(nextDraft.tags);
    setDraftFolderId(nextDraft.folderId);
    setDraftEntryDate(nextDraft.entryDate);
    setDraftEntryTime(nextDraft.entryTime);
    if (editorRef.current) {
      editorRef.current.innerHTML = renderInlineAttachments(html, selectedNote.attachments, {});
    }
    saveStateRef.current = "idle";
    setSaveState("idle");
    // Only reset the draft when the user switches notes. Autosave updates the
    // selected note row too, and resetting on every save would move the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote?.id]);

  const selectedAttachmentKey = selectedNote?.attachments
    .map((attachment) => attachment.id)
    .join("|");

  useEffect(() => {
    let cancelled = false;
    const attachments = selectedNote?.attachments ?? [];
    if (!attachments.length) {
      setAttachmentUrls({});
      return;
    }

    void Promise.all(
      attachments.map(async (attachment) => {
        try {
          return [attachment.id, await signedAttachmentUrl(attachment.storage_path)] as const;
        } catch {
          return [attachment.id, ""] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setAttachmentUrls(Object.fromEntries(pairs.filter(([, url]) => url)));
    });

    return () => {
      cancelled = true;
    };
  }, [selectedNote?.id, selectedNote?.attachments, selectedAttachmentKey]);

  useEffect(() => {
    if (!selectedNote || !editorRef.current) return;
    if (!hasMeaningfulEditorHtml(editorRef.current.innerHTML)) {
      scheduleEditorRestore();
      return;
    }
    hydrateInlineAttachments(editorRef.current, selectedNote.attachments, attachmentUrls);
  }, [attachmentUrls, scheduleEditorRestore, selectedAttachmentKey, selectedNote]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth));
    const end = endOfWeek(endOfMonth(calendarMonth));
    return eachDayOfInterval({ start, end }).map((date) => ({
      date,
      iso: format(date, "yyyy-MM-dd"),
      inMonth: isSameMonth(date, calendarMonth),
    }));
  }, [calendarMonth]);

  const notesByDate = useMemo(() => {
    const counts = new Map<string, number>();
    notes.forEach((note) => counts.set(note.entry_date, (counts.get(note.entry_date) ?? 0) + 1));
    return counts;
  }, [notes]);

  const folderNotes = useMemo(() => {
    return notes.filter((note) => {
      if (activeFolderId === "unfiled") return !note.folder_id;
      if (!isSystemFolder(activeFolderId)) return note.folder_id === activeFolderId;
      return true;
    });
  }, [activeFolderId, notes]);

  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return notes.filter((note) => {
      if (!normalizedQuery) return true;
      const folderName = note.folder_id ? (folderNameById.get(note.folder_id) ?? "") : "unfiled";
      const searchable = [
        note.title,
        note.content_text,
        note.entry_date,
        normalizeTimeValue(note.entry_time),
        folderName,
        ...note.attachments.map((attachment) => attachment.file_name),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [folderNameById, notes, query]);

  const dayModalNotes = useMemo(
    () => (dayModalDate ? notes.filter((note) => note.entry_date === dayModalDate) : []),
    [dayModalDate, notes],
  );

  const saveDraft = useCallback(async () => {
    const noteId = selectedNoteIdRef.current;
    if (!noteId) return;

    const versionAtStart = draftVersionRef.current;
    const draft = draftRef.current;
    const liveHtml = editorRef.current?.innerHTML ?? "";
    const currentNote = selectedNoteRef.current?.id === noteId ? selectedNoteRef.current : null;
    const fallbackHtml =
      firstMeaningfulHtml(
        draft.html,
        lastMeaningfulEditorHtmlRef.current,
        ensureInlineAttachmentEmbeds(
          currentNote?.content_html || "",
          currentNote?.attachments ?? [],
        ),
      ) ?? "";
    const sourceHtml =
      hasMeaningfulEditorHtml(liveHtml) ||
      blankEditorSaveAllowedRef.current ||
      !hasMeaningfulEditorHtml(fallbackHtml)
        ? liveHtml
        : fallbackHtml;
    const cleanHtml = serializeEditorHtml(sourceHtml);
    const text = htmlToText(cleanHtml);
    const title = titleFromDraft(draft.title, text);
    const tags = parseTags(draft.tags);
    const inlineAttachmentIds = attachmentIdsFromHtml(cleanHtml);
    const removedAttachments =
      currentNote?.attachments.filter((attachment) => !inlineAttachmentIds.has(attachment.id)) ??
      [];
    const removedAttachmentIds = new Set(removedAttachments.map((attachment) => attachment.id));
    saveStateRef.current = "saving";
    setSaveState("saving");
    try {
      const saved = await updateJournalNote(noteId, {
        title,
        content_html: cleanHtml,
        content_text: text,
        tags,
        folder_id: draft.folderId === "none" ? null : draft.folderId,
        entry_date: draft.entryDate || todayISO(),
        entry_time: draft.entryTime || new Date().toTimeString().slice(0, 5),
      });
      if (removedAttachments.length) {
        await Promise.all(
          removedAttachments.map((attachment) => deleteJournalAttachment(attachment)),
        );
      }
      setNotes((current) =>
        sortJournalNotes(
          current.map((note) =>
            note.id === saved.id
              ? {
                  ...saved,
                  attachments: note.attachments.filter(
                    (attachment) => !removedAttachmentIds.has(attachment.id),
                  ),
                }
              : note,
          ),
        ),
      );
      if (selectedNoteIdRef.current === noteId && draftVersionRef.current === versionAtStart) {
        draftRef.current = {
          ...draftRef.current,
          title,
          html: cleanHtml,
          text,
          tags: tags.join(", "),
        };
        lastMeaningfulEditorHtmlRef.current = hasMeaningfulEditorHtml(cleanHtml) ? cleanHtml : "";
        blankEditorSaveAllowedRef.current = false;
        setDraftTitle(title);
        setDraftHtml(cleanHtml);
        setDraftText(text);
        setDraftTags(tags.join(", "));
        saveStateRef.current = "saved";
        setSaveState("saved");
      } else if (selectedNoteIdRef.current === noteId) {
        saveStateRef.current = "dirty";
        setSaveState("dirty");
      }
    } catch (e: unknown) {
      if (selectedNoteIdRef.current === noteId) {
        saveStateRef.current = "dirty";
        setSaveState("dirty");
      }
      toast.error(e instanceof Error ? e.message : "Couldn't save note");
    }
  }, []);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = window.setTimeout(() => {
      void saveDraft();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [saveDraft, saveState]);

  useEffect(() => {
    if (!selectedNoteId) return;

    const saveIfDirty = () => {
      if (saveStateRef.current === "dirty") void saveDraft();
    };
    const restoreOnReturn = () => {
      scheduleEditorRestore();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveIfDirty();
      } else {
        restoreOnReturn();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", restoreOnReturn);
    window.addEventListener("pageshow", restoreOnReturn);
    window.addEventListener("pagehide", saveIfDirty);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", restoreOnReturn);
      window.removeEventListener("pageshow", restoreOnReturn);
      window.removeEventListener("pagehide", saveIfDirty);
    };
  }, [saveDraft, scheduleEditorRestore, selectedNoteId]);

  const markDirty = () => {
    draftVersionRef.current += 1;
    saveStateRef.current = "dirty";
    setSaveState("dirty");
  };

  const selectNote = (noteId: string) => {
    if (noteId === selectedNoteId) return;
    if (saveState === "dirty") void saveDraft();
    setSelectedNoteId(noteId);
  };

  const addNote = async ({
    folderId,
    entryDate,
  }: { folderId?: string | null; entryDate?: string } = {}) => {
    if (!user) return;
    if (saveState === "dirty") void saveDraft();
    const targetFolderId =
      folderId !== undefined ? folderId : !isSystemFolder(activeFolderId) ? activeFolderId : null;
    try {
      const note = await createJournalNote(user.id, targetFolderId, entryDate ?? todayISO());
      setNotes((current) => sortJournalNotes([note, ...current]));
      setSelectedNoteId(note.id);
      setDayModalDate(null);
      setSearchOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't add note");
    }
  };

  const addFolder = async () => {
    if (!user) return;
    const name = prompt("Folder name")?.trim();
    if (!name) return;
    try {
      const folder = await createJournalFolder(user.id, name, folders.length);
      setFolders((current) => [...current, folder]);
      setActiveFolderId(folder.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't add folder");
    }
  };

  const renameFolder = async (folder: JournalFolderRow) => {
    const name = prompt("Rename folder", folder.name)?.trim();
    if (!name || name === folder.name) return;
    try {
      const saved = await renameJournalFolder(folder.id, name);
      setFolders((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)).sort(sortFolders),
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't rename folder");
    }
  };

  const removeFolder = async (folder: JournalFolderRow) => {
    if (!confirm(`Delete "${folder.name}"? Notes in it will move to Unfiled.`)) return;
    try {
      await deleteJournalFolder(folder.id);
      setFolders((current) => current.filter((item) => item.id !== folder.id));
      setNotes((current) =>
        current.map((note) => (note.folder_id === folder.id ? { ...note, folder_id: null } : note)),
      );
      if (activeFolderId === folder.id) setActiveFolderId("all");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete folder");
    }
  };

  const removeSelectedNote = async () => {
    if (!selectedNote) return;
    if (!confirm(`Delete "${selectedNote.title}"?`)) return;
    try {
      await deleteJournalNote(selectedNote.id);
      setNotes((current) => {
        const next = current.filter((note) => note.id !== selectedNote.id);
        setSelectedNoteId(next[0]?.id ?? null);
        return next;
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete note");
    }
  };

  const handleEditorInput = () => {
    if (editorRef.current) {
      hydrateChecklists(editorRef.current);
      ensureEditableBreaksAfterBlocks(editorRef.current);
    }
    const html = editorRef.current?.innerHTML ?? "";
    const cleanHtml = serializeEditorHtml(html);
    const previousMeaningfulHtml = firstMeaningfulHtml(
      draftRef.current.html,
      lastMeaningfulEditorHtmlRef.current,
      selectedNoteRef.current?.content_html ?? "",
    );
    const unexpectedBlankEditor =
      !!previousMeaningfulHtml &&
      !hasMeaningfulEditorHtml(cleanHtml) &&
      typeof document !== "undefined" &&
      (document.visibilityState !== "visible" || !isEditorFocused(editorRef.current));

    if (unexpectedBlankEditor) {
      scheduleEditorRestore();
      return;
    }

    const text = htmlToText(cleanHtml);
    draftRef.current = { ...draftRef.current, html: cleanHtml, text };
    if (hasMeaningfulEditorHtml(cleanHtml)) {
      lastMeaningfulEditorHtmlRef.current = cleanHtml;
      blankEditorSaveAllowedRef.current = false;
    } else if (previousMeaningfulHtml && isEditorFocused(editorRef.current)) {
      blankEditorSaveAllowedRef.current = true;
    }
    setDraftHtml(cleanHtml);
    setDraftText(text);
    refreshToolbarState();
    markDirty();
    keepCaretInView();
  };

  const runCommand = (command: string, value?: string, trailingBreak = false) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (trailingBreak) ensureEditableBreaksAfterBlocks(editorRef.current);
    handleEditorInput();
    window.setTimeout(refreshToolbarState, 0);
  };

  const toggleBlockCommand = (format: "H2" | "BLOCKQUOTE") => {
    editorRef.current?.focus();
    const blockElement = currentBlockElement(editorRef.current);
    const currentFormat = String(document.queryCommandValue("formatBlock") ?? "").toLowerCase();
    const isActive =
      format === "H2"
        ? currentFormat === "h2" || blockElement?.tagName === "H2"
        : currentFormat === "blockquote" || !!blockElement?.closest("blockquote");

    if (format === "BLOCKQUOTE" && isActive) {
      const quote = blockElement?.closest("blockquote");
      if (quote) {
        const paragraph = document.createElement("p");
        paragraph.innerHTML = quote.innerHTML || "<br>";
        quote.replaceWith(paragraph);
        placeCaretAtEnd(paragraph);
      } else {
        document.execCommand("formatBlock", false, "P");
      }
    } else {
      document.execCommand("formatBlock", false, isActive ? "P" : format);
    }
    ensureEditableBreaksAfterBlocks(editorRef.current);
    handleEditorInput();
    window.setTimeout(refreshToolbarState, 0);
  };

  const addLink = () => {
    const url = prompt("Link URL")?.trim();
    if (!url) return;
    runCommand("createLink", url);
  };

  const addChecklistItem = () => {
    const checklistItem = currentBlockElement(editorRef.current)?.closest(
      "[data-checklist-item]",
    ) as HTMLElement | null;
    if (checklistItem) {
      const lastChecklistItem = lastChecklistItemInRun(checklistItem);
      const nextElement = lastChecklistItem.nextElementSibling as HTMLElement | null;
      const paragraph =
        nextElement &&
        !nextElement.hasAttribute("data-checklist-item") &&
        !nextElement.hasAttribute("data-journal-attachment-id") &&
        ["P", "DIV"].includes(nextElement.tagName)
          ? nextElement
          : document.createElement("p");

      if (!paragraph.parentElement) {
        paragraph.innerHTML = "<br>";
        lastChecklistItem.parentNode?.insertBefore(paragraph, lastChecklistItem.nextSibling);
        handleEditorInput();
      }
      placeCaretAtEnd(paragraph);
      refreshToolbarState();
      keepCaretInView();
      return;
    }

    const tempId = `check-${Date.now()}`;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, checklistItemHtml(false, "", tempId));
    const item = editorRef.current?.querySelector(`[data-checklist-temp="${tempId}"]`);
    if (item instanceof HTMLElement) {
      item.removeAttribute("data-checklist-temp");
      const text = item.querySelector("[data-checklist-text]");
      if (text instanceof HTMLElement) placeCaretAtEnd(text);
    }
    handleEditorInput();
    window.setTimeout(refreshToolbarState, 0);
    keepCaretInView();
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    const checklistItem = currentBlockElement(editorRef.current)?.closest(
      "[data-checklist-item]",
    ) as HTMLElement | null;
    if (!checklistItem) return;

    event.preventDefault();

    const text = checklistItem.querySelector("[data-checklist-text]") as HTMLElement | null;
    const textValue = text?.innerText.replace(/\u00a0/g, " ").trim() ?? "";

    if (!textValue) {
      const nextElement = checklistItem.nextElementSibling as HTMLElement | null;
      if (nextElement && isBlankEditableLine(nextElement)) {
        checklistItem.remove();
        placeCaretAtEnd(nextElement);
      } else {
        const paragraph = document.createElement("p");
        paragraph.innerHTML = "<br>";
        checklistItem.replaceWith(paragraph);
        placeCaretAtEnd(paragraph);
      }
    } else {
      const newItem = createChecklistItemElement();
      if (!newItem) return;
      checklistItem.parentNode?.insertBefore(newItem, checklistItem.nextSibling);
      const newText = newItem.querySelector("[data-checklist-text]") as HTMLElement | null;
      if (newText) placeCaretAtEnd(newText);
    }

    handleEditorInput();
    window.setTimeout(refreshToolbarState, 0);
    keepCaretInView();
  };

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const toggle = target.closest("[data-checklist-toggle]") as HTMLElement | null;
    if (!toggle) return;
    event.preventDefault();
    const item = toggle.closest("[data-checklist-item]") as HTMLElement | null;
    if (!item) return;
    const checked = item.dataset.checked === "true";
    setChecklistChecked(item, !checked);
    handleEditorInput();
    keepCaretInView();
  };

  const insertInlineAttachment = (attachment: JournalAttachmentRow, url = "") => {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, inlineAttachmentHtml(attachment, url));
    handleEditorInput();
    keepCaretInView();
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!user || !selectedNote || !files?.length) return;
    if (saveState === "dirty") await saveDraft();
    setUploading(true);
    try {
      const uploaded: JournalAttachmentRow[] = [];
      for (const file of Array.from(files)) {
        const attachment = await addJournalAttachment({
          userId: user.id,
          noteId: selectedNote.id,
          file,
        });
        uploaded.push(attachment);
        const signedUrl = await signedAttachmentUrl(attachment.storage_path).catch(() => "");
        setAttachmentUrls((current) => ({ ...current, [attachment.id]: signedUrl }));
        insertInlineAttachment(attachment, signedUrl);
      }
      setNotes((current) =>
        current.map((note) =>
          note.id === selectedNote.id
            ? { ...note, attachments: [...note.attachments, ...uploaded] }
            : note,
        ),
      );
      toast.success(uploaded.length === 1 ? "Attachment added" : "Attachments added");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload attachment");
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  };

  if (loading || busy) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> loading journal...
      </div>
    );
  }

  const selectedFolderLabel =
    activeFolderId === "all"
      ? "All Notes"
      : activeFolderId === "unfiled"
        ? "Unfiled"
        : (folderNameById.get(activeFolderId) ?? "Folder");

  return (
    <div className="px-4 pt-8 pb-6 animate-fade-up lg:px-6">
      <header className="mb-5">
        <div className="grid grid-cols-[auto_1fr_auto] items-center">
          <Link to="/settings" className="icon-button" aria-label="Settings" title="Settings">
            <UserRound className="h-[18px] w-[18px]" />
          </Link>
          {/* <div className="text-center">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
              {notes.length} note{notes.length === 1 ? "" : "s"}
            </p>
            <h1 className="mt-1 text-3xl text-foreground">Journal</h1>
          </div> */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="icon-button"
              aria-label="Search journal"
              title="Search journal"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="flex flex-col justify-between pb-8">
        <div>
          <div className="mb-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCalendarMonth((current) => subMonths(current, 1))}
              className="icon-button"
              aria-label="Previous month"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">
                {format(calendarMonth, "yyyy")}
              </p>
              <h2 className="text-3xl font-bold text-foreground">
                {format(calendarMonth, "MMMM")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
              className="icon-button"
              aria-label="Next month"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <MonthlyJournalCalendar
            days={monthDays}
            currentMonth={calendarMonth}
            counts={notesByDate}
            onSelect={setDayModalDate}
          />
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          <span>
            {notes.filter((note) => isSameMonth(parseISO(note.entry_date), calendarMonth)).length}{" "}
            this month
          </span>
        </div>
      </section>

      <section className="pt-3 pb-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Folders</p>
            <h2 className="text-2xl font-bold text-foreground">{selectedFolderLabel}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addFolder}
              className="icon-button"
              aria-label="Add folder"
              title="Add folder"
            >
              <FolderPlus className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => addNote()}
              className="icon-button"
              aria-label="New note"
              title="New note"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <FolderRow
            active={activeFolderId === "all"}
            icon={<BookOpen className="h-4 w-4" />}
            label="All Notes"
            count={notes.length}
            onClick={() => setActiveFolderId("all")}
          />
          <FolderRow
            active={activeFolderId === "unfiled"}
            icon={<FileText className="h-4 w-4" />}
            label="Unfiled"
            count={notes.filter((note) => !note.folder_id).length}
            onClick={() => setActiveFolderId("unfiled")}
          />
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              active={activeFolderId === folder.id}
              icon={<Folder className="h-4 w-4" />}
              label={folder.name}
              count={notes.filter((note) => note.folder_id === folder.id).length}
              onClick={() => setActiveFolderId(folder.id)}
              onRename={() => renameFolder(folder)}
              onDelete={() => removeFolder(folder)}
            />
          ))}
        </div>

        <NoteList
          notes={folderNotes}
          selectedNoteId={selectedNoteId}
          onSelect={selectNote}
          emptyLabel="No notes here yet."
        />
      </section>

      {selectedNote && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="mx-auto flex h-full max-w-3xl flex-col px-4">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-background/95 py-3 backdrop-blur">
              <button
                type="button"
                onClick={() => setSelectedNoteId(null)}
                className="icon-button h-9 w-9 shrink-0"
                aria-label="Close note"
                title="Close note"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {uploading ? "Uploading" : saveLabel(saveState)}
                </span>
                <button
                  type="button"
                  onClick={removeSelectedNote}
                  className="icon-button h-9 w-9 shrink-0 text-destructive"
                  aria-label="Delete note"
                  title="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              ref={editorScrollRef}
              className="flex-1 overflow-auto pb-28"
              style={{
                paddingBottom: keyboardOffset ? `${keyboardOffset + 112}px` : undefined,
              }}
            >
              <div className="px-1 py-5">
                <div className="min-w-0">
                  <label htmlFor="journal-title" className="sr-only">
                    Note title
                  </label>
                  <input
                    id="journal-title"
                    value={draftTitle}
                    onChange={(event) => {
                      const title = event.target.value;
                      draftRef.current = { ...draftRef.current, title };
                      setDraftTitle(title);
                      markDirty();
                    }}
                    className="w-full bg-transparent text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground"
                    placeholder="Untitled"
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Created {format(parseISO(selectedNote.created_at), "MMM d, h:mm a")}</span>
                  <span>Updated {format(parseISO(selectedNote.updated_at), "MMM d, h:mm a")}</span>
                </div>

                <div className="relative mt-4">
                  <div className="flex flex-wrap gap-2">
                    <MetaChip
                      active={metaEditor === "stamp"}
                      icon={<CalendarDays className="h-3.5 w-3.5" />}
                      label={format(
                        parseISO(`${draftEntryDate || todayISO()}T${draftEntryTime || "00:00"}`),
                        "MMM d, h:mm a",
                      )}
                      onClick={() =>
                        setMetaEditor((current) => (current === "stamp" ? null : "stamp"))
                      }
                    />
                    <MetaChip
                      active={metaEditor === "folder"}
                      icon={<Folder className="h-3.5 w-3.5" />}
                      label={
                        draftFolderId === "none"
                          ? "Unfiled"
                          : (folderNameById.get(draftFolderId) ?? "Folder")
                      }
                      onClick={() =>
                        setMetaEditor((current) => (current === "folder" ? null : "folder"))
                      }
                    />
                  </div>

                  {metaEditor && (
                    <MetaPopover onClose={() => setMetaEditor(null)}>
                      {metaEditor === "stamp" && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-1">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">
                              Date
                            </span>
                            <input
                              type="date"
                              value={draftEntryDate}
                              onChange={(event) => {
                                const entryDate = event.target.value;
                                draftRef.current = { ...draftRef.current, entryDate };
                                setDraftEntryDate(entryDate);
                                markDirty();
                              }}
                              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">
                              Time
                            </span>
                            <input
                              type="time"
                              value={draftEntryTime}
                              onChange={(event) => {
                                const entryTime = event.target.value;
                                draftRef.current = { ...draftRef.current, entryTime };
                                setDraftEntryTime(entryTime);
                                markDirty();
                              }}
                              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                            />
                          </label>
                        </div>
                      )}
                      {metaEditor === "folder" && (
                        <select
                          value={draftFolderId}
                          onChange={(event) => {
                            const folderId = event.target.value;
                            draftRef.current = { ...draftRef.current, folderId };
                            setDraftFolderId(folderId);
                            markDirty();
                          }}
                          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="none">Unfiled</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </MetaPopover>
                  )}
                </div>
              </div>

              <div className="px-1 pb-10">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  onClick={handleEditorClick}
                  onKeyDown={handleEditorKeyDown}
                  onKeyUp={() => {
                    refreshToolbarState();
                    keepCaretInView();
                  }}
                  onMouseUp={refreshToolbarState}
                  onFocus={() => {
                    scheduleEditorRestore();
                    refreshToolbarState();
                    keepCaretInView();
                  }}
                  onBlur={() => {
                    if (saveState === "dirty") void saveDraft();
                  }}
                  className="journal-editor min-h-[24rem] w-full bg-transparent px-1 py-3 text-base leading-7 text-foreground outline-none [&_a]:text-primary [&_blockquote]:border-l-4 [&_blockquote]:border-primary/50 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
                />
              </div>
            </div>

            <div
              ref={editorToolbarRef}
              className="fixed right-0 bottom-0 left-0 z-50 border-t border-border bg-background/95 backdrop-blur"
              style={{
                bottom: keyboardOffset ? `${keyboardOffset}px` : "0px",
                paddingBottom: keyboardOffset ? "0px" : "env(safe-area-inset-bottom)",
              }}
            >
              <div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto px-4 py-3">
                <ToolbarButton
                  label="Bold"
                  onClick={() => runCommand("bold")}
                  active={toolbarState.bold}
                  icon={<Bold className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Italic"
                  onClick={() => runCommand("italic")}
                  active={toolbarState.italic}
                  icon={<Italic className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Underline"
                  onClick={() => runCommand("underline")}
                  active={toolbarState.underline}
                  icon={<Underline className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Heading"
                  onClick={() => toggleBlockCommand("H2")}
                  active={toolbarState.heading}
                  icon={<Heading2 className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Bullet list"
                  onClick={() => runCommand("insertUnorderedList", undefined, true)}
                  active={toolbarState.unorderedList}
                  icon={<List className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Numbered list"
                  onClick={() => runCommand("insertOrderedList", undefined, true)}
                  active={toolbarState.orderedList}
                  icon={<ListOrdered className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Checklist"
                  onClick={addChecklistItem}
                  active={toolbarState.checklist}
                  icon={<CheckSquare className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Quote"
                  onClick={() => toggleBlockCommand("BLOCKQUOTE")}
                  active={toolbarState.quote}
                  icon={<Quote className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Link"
                  onClick={addLink}
                  icon={<LinkIcon className="h-4 w-4" />}
                />
                <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden />
                <ToolbarButton
                  label="Photo"
                  onClick={() => imageInputRef.current?.click()}
                  icon={<ImageIcon className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Attachment"
                  onClick={() => attachmentInputRef.current?.click()}
                  icon={<Paperclip className="h-4 w-4" />}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => uploadFiles(event.target.files)}
                />
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => uploadFiles(event.target.files)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {dayModalDate && (
        <DayEntriesModal
          dateIso={dayModalDate}
          notes={dayModalNotes}
          onClose={() => setDayModalDate(null)}
          onAdd={() => addNote({ entryDate: dayModalDate })}
          onOpen={(noteId) => {
            setDayModalDate(null);
            selectNote(noteId);
          }}
        />
      )}

      {searchOpen && (
        <SearchModal
          query={query}
          notes={searchResults}
          onQueryChange={setQuery}
          onClose={() => setSearchOpen(false)}
          onOpen={(noteId) => {
            setSearchOpen(false);
            selectNote(noteId);
          }}
        />
      )}
    </div>
  );
}

function NoteList({
  notes,
  selectedNoteId,
  onSelect,
  emptyLabel,
}: {
  notes: JournalNoteWithAttachments[];
  selectedNoteId: string | null;
  onSelect: (noteId: string) => void;
  emptyLabel: string;
}) {
  if (notes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li key={note.id}>
          <NoteListItem
            note={note}
            active={selectedNoteId === note.id}
            onSelect={() => onSelect(note.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function NoteListItem({
  note,
  active,
  onSelect,
}: {
  note: JournalNoteWithAttachments;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-lg border px-4 py-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card/65 hover:border-primary/40 hover:bg-card"
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">{note.title}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {formatEntryStamp(note)}
            {note.content_text ? ` · ${note.content_text}` : ""}
          </span>
        </span>
        {note.attachments.length > 0 && (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            {note.attachments.length}
          </span>
        )}
      </span>
    </button>
  );
}

function MonthlyJournalCalendar({
  days,
  currentMonth,
  counts,
  onSelect,
}: {
  days: { date: Date; iso: string; inMonth: boolean }[];
  currentMonth: Date;
  counts: Map<string, number>;
  onSelect: (iso: string) => void;
}) {
  const max = Math.max(1, ...Array.from(counts.values()));

  return (
    <div>
      <div className="mb-3 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((item) => {
          const count = counts.get(item.iso) ?? 0;
          const intensity = count === 0 ? 0 : 0.18 + (count / max) * 0.72;
          const today = isToday(item.date);
          return (
            <button
              key={item.iso}
              type="button"
              onClick={() => onSelect(item.iso)}
              title={`${format(item.date, "MMMM d")} - ${count} note${count === 1 ? "" : "s"}`}
              className={`relative flex aspect-square min-h-12 flex-col items-center justify-center rounded-lg border text-sm font-bold transition-transform active:scale-95 ${
                item.inMonth
                  ? "border-border text-foreground"
                  : "border-transparent text-muted-foreground/35"
              } ${today ? "ring-2 ring-primary/40" : ""}`}
              style={{
                backgroundColor: count === 0 ? "transparent" : `oklch(0.7 0.13 235 / ${intensity})`,
                color: count > 0 ? "var(--primary-foreground)" : undefined,
              }}
            >
              {format(item.date, "d")}
              {count > 0 && (
                <span className="absolute bottom-1 text-[9px] font-black leading-none">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="sr-only">{format(currentMonth, "MMMM yyyy")}</p>
    </div>
  );
}

function DayEntriesModal({
  dateIso,
  notes,
  onClose,
  onAdd,
  onOpen,
}: {
  dateIso: string;
  notes: JournalNoteWithAttachments[];
  onClose: () => void;
  onAdd: () => void;
  onOpen: (noteId: string) => void;
}) {
  const date = parseISO(`${dateIso}T00:00:00`);
  return (
    <Overlay onClose={onClose} title={format(date, "MMMM d")}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground">
            {format(date, "EEEE")}
          </p>
          <h2 className="text-2xl font-bold text-foreground">{format(date, "MMMM d")}</h2>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="icon-button"
          aria-label="Add entry"
          title="Add entry"
        >
          <Plus className="h-[18px] w-[18px]" />
        </button>
      </div>
      <NoteList notes={notes} selectedNoteId={null} onSelect={onOpen} emptyLabel="No entries." />
    </Overlay>
  );
}

function SearchModal({
  query,
  notes,
  onQueryChange,
  onClose,
  onOpen,
}: {
  query: string;
  notes: JournalNoteWithAttachments[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onOpen: (noteId: string) => void;
}) {
  return (
    <Overlay onClose={onClose} title="Search">
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search notes and attachments"
          className="rounded-full pl-9"
        />
      </div>
      <NoteList
        notes={notes.slice(0, 30)}
        selectedNoteId={null}
        onSelect={onOpen}
        emptyLabel="No matches."
      />
    </Overlay>
  );
}

function Overlay({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background/96 px-4 py-5 backdrop-blur">
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-muted-foreground">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="icon-button h-9 w-9"
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FolderRow({
  active,
  icon,
  label,
  count,
  onClick,
  onRename,
  onDelete,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`group flex shrink-0 items-center rounded-full border transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card/65 text-muted-foreground hover:bg-card hover:text-foreground"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onRename}
        className="flex min-w-0 items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <span className="shrink-0">{icon}</span>
        <span className="max-w-28 truncate">{label}</span>
        <span className="text-xs opacity-70">{count}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 ${
            active ? "hover:bg-white/15" : "hover:bg-background"
          }`}
          aria-label={`Delete ${label}`}
          title={`Delete ${label}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function MetaChip({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="max-w-44 truncate">{label}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-70" />
    </button>
  );
}

function MetaPopover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute top-full left-0 z-20 mt-2 w-full max-w-sm rounded-lg border border-border bg-card p-3 shadow-xl">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  icon,
  onClick,
  active = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-background/45 text-muted-foreground hover:text-foreground"
      }`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function isSystemFolder(folderId: FolderFilter) {
  return folderId === "all" || folderId === "unfiled";
}

function sortJournalNotes(notes: JournalNoteWithAttachments[]) {
  return [...notes].sort(
    (a, b) => parseISO(b.updated_at).getTime() - parseISO(a.updated_at).getTime(),
  );
}

function sortFolders(a: JournalFolderRow, b: JournalFolderRow) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
}

function currentBlockElement(editor: HTMLElement | null) {
  if (!editor || typeof window === "undefined") return null;
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  if (!anchor || !editor.contains(anchor)) return null;

  const element =
    anchor.nodeType === Node.ELEMENT_NODE ? (anchor as HTMLElement) : anchor.parentElement;
  return element?.closest(
    "[data-checklist-item],h1,h2,h3,blockquote,li,p,div,ul,ol",
  ) as HTMLElement | null;
}

function lastChecklistItemInRun(item: HTMLElement) {
  let current = item;
  while (current.nextElementSibling?.hasAttribute("data-checklist-item")) {
    current = current.nextElementSibling as HTMLElement;
  }
  return current;
}

function placeCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function scrollEditorSelectionIntoView(
  scrollContainer: HTMLElement | null,
  editor: HTMLElement | null,
  toolbar: HTMLElement | null,
) {
  if (!scrollContainer || !editor || typeof window === "undefined") return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.focusNode) return;
  if (!editor.contains(selection.focusNode)) return;

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(false);

  const caretRect = selectionCaretRect(range, selection.focusNode);
  if (!caretRect) return;

  const containerRect = scrollContainer.getBoundingClientRect();
  const visualViewport = window.visualViewport;
  const visualTop = visualViewport?.offsetTop ?? 0;
  const visualBottom = visualTop + (visualViewport?.height ?? window.innerHeight);
  const toolbarTop = toolbar?.getBoundingClientRect().top ?? window.innerHeight;
  const topPadding = 22;
  const bottomPadding = 30;
  const visibleTop = Math.max(containerRect.top, visualTop) + topPadding;
  const visibleBottom = Math.min(containerRect.bottom, visualBottom, toolbarTop) - bottomPadding;
  if (visibleBottom <= visibleTop) return;

  let nextScrollTop = scrollContainer.scrollTop;
  if (caretRect.bottom > visibleBottom) {
    nextScrollTop += caretRect.bottom - visibleBottom;
  } else if (caretRect.top < visibleTop) {
    nextScrollTop -= visibleTop - caretRect.top;
  } else {
    return;
  }

  const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
  scrollContainer.scrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));
}

function selectionCaretRect(range: Range, focusNode: Node) {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  if (rects.length) return rects[rects.length - 1];

  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) return rect;

  const fallbackElement = focusNode instanceof HTMLElement ? focusNode : focusNode.parentElement;
  return fallbackElement?.getBoundingClientRect() ?? null;
}

function ensureInlineAttachmentEmbeds(html: string, attachments: JournalAttachmentRow[]) {
  let next = html;
  attachments.forEach((attachment) => {
    if (
      !next.includes(`data-journal-attachment-id="${attachment.id}"`) &&
      !next.includes(`data-journal-attachment-id='${attachment.id}'`)
    ) {
      next += inlineAttachmentHtml(attachment);
    }
  });
  return next;
}

function renderInlineAttachments(
  html: string,
  attachments: JournalAttachmentRow[],
  urls: Record<string, string>,
) {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = ensureInlineAttachmentEmbeds(html, attachments);
  hydrateChecklists(template.content);
  hydrateInlineAttachments(template.content, attachments, urls);
  ensureEditableBreaksAfterBlocks(template.content);
  return template.innerHTML;
}

function hydrateInlineAttachments(
  root: ParentNode | null,
  attachments: JournalAttachmentRow[],
  urls: Record<string, string>,
) {
  if (!root) return;
  root.querySelectorAll("[data-journal-attachment-id]").forEach((node) => {
    const element = node as HTMLElement;
    const attachment = attachments.find((item) => item.id === element.dataset.journalAttachmentId);
    if (!attachment) return;
    setAttachmentDataset(element, attachment);
    element.setAttribute("contenteditable", "false");
    element.innerHTML = inlineAttachmentInnerHtml(attachment, urls[attachment.id] ?? "");
  });
}

function serializeEditorHtml(html: string) {
  const cleanHtml = sanitizeContent(html);
  if (typeof document === "undefined") return cleanHtml;
  const template = document.createElement("template");
  template.innerHTML = cleanHtml;
  hydrateChecklists(template.content);
  template.content.querySelectorAll("[data-journal-attachment-id]").forEach((node) => {
    const element = node as HTMLElement;
    const attachment = attachmentFromElement(element);
    const figure = document.createElement("figure");
    setAttachmentDataset(figure, attachment);
    figure.setAttribute("contenteditable", "false");
    figure.className = "my-4";
    figure.innerHTML = inlineAttachmentInnerHtml(attachment);
    element.replaceWith(figure);
  });
  ensureEditableBreaksAfterBlocks(template.content);
  return template.innerHTML;
}

function ensureEditableBreaksAfterBlocks(root: ParentNode | null) {
  if (!root) return;
  removeBlankLinesBetweenChecklistItems(root);
  root
    .querySelectorAll("[data-journal-attachment-id], [data-checklist-item], blockquote, ul, ol, h2")
    .forEach((node) => {
      const element = node as HTMLElement;
      if (element.closest("ul, ol") && !["UL", "OL"].includes(element.tagName)) return;
      const nextSibling = element.nextSibling;
      if (nextSibling?.nodeType === Node.TEXT_NODE && nextSibling.textContent?.trim()) return;

      const nextElement = element.nextElementSibling as HTMLElement | null;
      if (
        element.hasAttribute("data-checklist-item") &&
        nextElement?.hasAttribute("data-checklist-item")
      ) {
        return;
      }

      const nextIsEditableLine =
        nextElement &&
        !nextElement.hasAttribute("data-journal-attachment-id") &&
        !nextElement.hasAttribute("data-checklist-item") &&
        !["BLOCKQUOTE", "UL", "OL", "H2"].includes(nextElement.tagName) &&
        ["P", "DIV", "BR"].includes(nextElement.tagName);

      if (nextIsEditableLine) return;

      const paragraph = document.createElement("p");
      paragraph.innerHTML = "<br>";
      element.parentNode?.insertBefore(paragraph, element.nextSibling);
    });
}

function removeBlankLinesBetweenChecklistItems(root: ParentNode | null) {
  if (!root) return;
  root.querySelectorAll("[data-checklist-item]").forEach((node) => {
    const item = node as HTMLElement;
    let nextElement = item.nextElementSibling as HTMLElement | null;
    while (
      nextElement &&
      isBlankEditableLine(nextElement) &&
      nextElement.nextElementSibling instanceof HTMLElement &&
      nextElement.nextElementSibling.hasAttribute("data-checklist-item")
    ) {
      const blankLine = nextElement;
      nextElement = nextElement.nextElementSibling as HTMLElement | null;
      blankLine.remove();
    }
  });
}

function isBlankEditableLine(element: HTMLElement) {
  if (
    element.hasAttribute("data-checklist-item") ||
    element.hasAttribute("data-journal-attachment-id") ||
    !["P", "DIV"].includes(element.tagName)
  ) {
    return false;
  }

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("br").forEach((br) => br.remove());
  return clone.textContent?.replace(/\u00a0/g, " ").trim() === "" && clone.children.length === 0;
}

function hydrateChecklists(root: ParentNode | null) {
  if (!root) return;

  root.querySelectorAll("input[type='checkbox']").forEach((input) => {
    const checkbox = input as HTMLInputElement;
    if (checkbox.closest("[data-checklist-item]")) return;

    const container = checkbox.closest("div, p, li") as HTMLElement | null;
    const checked = checkbox.checked || checkbox.hasAttribute("checked");
    const text = (container?.textContent ?? "").trim();
    const replacement = document.createElement("div");
    replacement.innerHTML = checklistItemHtml(checked, text);
    container?.replaceWith(replacement.firstElementChild ?? document.createTextNode(""));
  });

  root.querySelectorAll("[data-checklist-item]").forEach((node) => {
    const item = node as HTMLElement;
    const checked = item.dataset.checked === "true";
    item.className = checklistItemClass();
    item.dataset.checked = checked ? "true" : "false";

    let toggle = item.querySelector("[data-checklist-toggle]") as HTMLElement | null;
    if (!toggle) {
      toggle = document.createElement("button");
      item.prepend(toggle);
    }
    toggle.setAttribute("type", "button");
    toggle.setAttribute("contenteditable", "false");
    toggle.setAttribute("data-checklist-toggle", "");
    toggle.setAttribute("aria-pressed", checked ? "true" : "false");
    toggle.className = checklistToggleClass(checked);
    toggle.innerHTML = checked ? "&#10003;" : "";

    let text = item.querySelector("[data-checklist-text]") as HTMLElement | null;
    if (!text) {
      text = document.createElement("span");
      text.setAttribute("data-checklist-text", "");
      item.append(text);
    }
    text.setAttribute("contenteditable", "true");
    text.className = checklistTextClass(checked);
    if (!text.textContent?.trim() && text.innerHTML.trim() === "") text.innerHTML = "<br>";
  });
}

function createChecklistItemElement(checked = false, text = "", tempId?: string) {
  const template = document.createElement("template");
  template.innerHTML = checklistItemMarkup(checked, text, tempId);
  return template.content.firstElementChild instanceof HTMLElement
    ? template.content.firstElementChild
    : null;
}

function checklistItemMarkup(checked = false, text = "", tempId?: string) {
  const escapedText = escapeHtml(text);
  return `<div data-checklist-item data-checked="${checked ? "true" : "false"}"${
    tempId ? ` data-checklist-temp="${escapeHtml(tempId)}"` : ""
  } class="${checklistItemClass()}"><button type="button" contenteditable="false" data-checklist-toggle aria-pressed="${
    checked ? "true" : "false"
  }" class="${checklistToggleClass(checked)}">${checked ? "&#10003;" : ""}</button><span contenteditable="true" data-checklist-text class="${checklistTextClass(
    checked,
  )}">${escapedText || "<br>"}</span></div>`;
}

function checklistItemHtml(checked = false, text = "", tempId?: string) {
  return `${checklistItemMarkup(checked, text, tempId)}<p><br></p>`;
}

function setChecklistChecked(item: HTMLElement, checked: boolean) {
  item.dataset.checked = checked ? "true" : "false";
  const toggle = item.querySelector("[data-checklist-toggle]") as HTMLElement | null;
  const text = item.querySelector("[data-checklist-text]") as HTMLElement | null;
  if (toggle) {
    toggle.setAttribute("aria-pressed", checked ? "true" : "false");
    toggle.className = checklistToggleClass(checked);
    toggle.innerHTML = checked ? "&#10003;" : "";
  }
  if (text) text.className = checklistTextClass(checked);
}

function checklistItemClass() {
  return "my-1 flex items-start gap-3 py-1";
}

function checklistToggleClass(checked: boolean) {
  return `mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-black leading-none transition-colors ${
    checked
      ? "border-primary bg-primary text-primary-foreground"
      : "border-primary/70 bg-transparent text-primary"
  }`;
}

function checklistTextClass(checked: boolean) {
  return `min-w-0 flex-1 pt-0.5 leading-7 outline-none ${
    checked
      ? "text-muted-foreground line-through decoration-muted-foreground/70"
      : "text-foreground"
  }`;
}

function attachmentIdsFromHtml(html: string) {
  const ids = new Set<string>();
  if (typeof document === "undefined") {
    html.replace(/data-journal-attachment-id=["']([^"']+)["']/g, (_, id: string) => {
      ids.add(id);
      return "";
    });
    return ids;
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("[data-journal-attachment-id]").forEach((node) => {
    const id = (node as HTMLElement).dataset.journalAttachmentId;
    if (id) ids.add(id);
  });
  return ids;
}

function inlineAttachmentHtml(attachment: JournalAttachmentRow, url = "") {
  return `<figure class="my-4" contenteditable="false" data-journal-attachment-id="${escapeHtml(
    attachment.id,
  )}" data-journal-file-name="${escapeHtml(attachment.file_name)}" data-journal-mime-type="${escapeHtml(
    attachment.mime_type,
  )}" data-journal-file-size="${attachment.file_size}">${inlineAttachmentInnerHtml(
    attachment,
    url,
  )}</figure><p><br></p>`;
}

function inlineAttachmentInnerHtml(attachment: JournalAttachmentRow, url = "") {
  const name = escapeHtml(attachment.file_name);
  const size = escapeHtml(formatBytes(attachment.file_size));

  if (attachment.mime_type.startsWith("image/")) {
    const media = url
      ? `<img src="${escapeHtml(url)}" alt="${name}" class="max-h-[26rem] w-full  object-contain" />`
      : `<div class="flex min-h-44 items-center justify-center bg-muted text-sm text-muted-foreground">${name}</div>`;
    return `<div class="overflow-hidden ">${media}</div>`;
  }

  const href = url ? escapeHtml(url) : "#";
  return `<a href="${href}" target="_blank" rel="noreferrer" class="flex items-center gap-3 rounded-lg border border-border bg-muted/45 px-3 py-3 text-foreground no-underline"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">file</span><span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold">${name}</span><span class="block text-xs text-muted-foreground">${size}</span></span></a>`;
}

function setAttachmentDataset(element: HTMLElement, attachment: JournalAttachmentRow) {
  element.dataset.journalAttachmentId = attachment.id;
  element.dataset.journalFileName = attachment.file_name;
  element.dataset.journalMimeType = attachment.mime_type;
  element.dataset.journalFileSize = String(attachment.file_size);
}

function attachmentFromElement(element: HTMLElement): JournalAttachmentRow {
  return {
    id: element.dataset.journalAttachmentId ?? "",
    user_id: "",
    note_id: "",
    file_name: element.dataset.journalFileName ?? "Attachment",
    mime_type: element.dataset.journalMimeType ?? "application/octet-stream",
    file_size: Number(element.dataset.journalFileSize ?? 0),
    storage_path: "",
    created_at: "",
  };
}

function sanitizeContent(html: string) {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content
    .querySelectorAll("script, style, iframe, object, embed, meta, link")
    .forEach((node) => {
      node.remove();
    });
  template.content.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on")) element.removeAttribute(attribute.name);
      if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML;
}

function hasMeaningfulEditorHtml(html: string) {
  if (!html.trim()) return false;
  if (typeof document === "undefined") {
    return (
      html
        .replace(/<br\s*\/?>/gi, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .trim().length > 0
    );
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  if (
    template.content.querySelector(
      "[data-journal-attachment-id], [data-checklist-item], img, video, audio, iframe",
    )
  ) {
    return true;
  }
  return (template.content.textContent ?? "").replace(/\u00a0/g, " ").trim().length > 0;
}

function firstMeaningfulHtml(...candidates: string[]) {
  return candidates.find((html) => hasMeaningfulEditorHtml(html));
}

function isEditorFocused(editor: HTMLElement | null) {
  if (!editor || typeof document === "undefined") return false;
  const activeElement = document.activeElement;
  return activeElement === editor || (!!activeElement && editor.contains(activeElement));
}

function htmlToText(html: string) {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ").trim();
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.innerText.replace(/\s+/g, " ").trim();
}

function titleFromDraft(title: string, text: string) {
  const trimmed = title.trim();
  if (trimmed) return trimmed.slice(0, 120);
  const firstLine = text.trim().split(/\s+/).slice(0, 8).join(" ");
  return firstLine || "Untitled";
}

function parseTags(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[,\n#]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .slice(0, 12);
}

function normalizeTimeValue(value: string | null | undefined) {
  return (value ?? new Date().toTimeString()).slice(0, 5);
}

function formatEntryStamp(note: JournalNoteWithAttachments) {
  const date = parseISO(`${note.entry_date}T${normalizeTimeValue(note.entry_time)}`);
  return format(date, "MMM d, h:mm a");
}

function saveLabel(state: SaveState) {
  switch (state) {
    case "dirty":
      return "Unsaved";
    case "saving":
      return "Saving";
    case "saved":
      return "Saved";
    case "idle":
    default:
      return "Saved";
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
