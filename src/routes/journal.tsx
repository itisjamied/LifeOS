import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import {
  AppConfirmDialog,
  AppTextDialog,
  type AppConfirmDialogConfig,
  type AppTextDialogConfig,
} from "@/components/ui/app-dialog";
import { todayISO } from "@/lib/cycle";
import {
  addJournalAttachment,
  createJournalNotePage,
  createJournalFolder,
  createJournalNote,
  deleteJournalAttachment,
  deleteJournalFolder,
  deleteJournalNote,
  deleteJournalNotePage,
  fetchJournal,
  renameJournalFolder,
  signedAttachmentUrl,
  updateJournalNote,
  updateJournalNotePage,
  type JournalAttachmentRow,
  type JournalFolderRow,
  type JournalNotePageRow,
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
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpDown,
  Bold,
  BookOpen,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Folder,
  FolderPlus,
  Heading2,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Palette,
  Pencil,
  Plus,
  Quote,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Type,
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
type FormatMenu = "fontSize" | "textColor" | "highlightColor" | null;
type ToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  heading: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  checklist: boolean;
  quote: boolean;
};
type DraftSnapshot = {
  title: string;
  pageHeading: string;
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
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  heading: false,
  unorderedList: false,
  orderedList: false,
  checklist: false,
  quote: false,
};

const TEXT_COLOR_OPTIONS = [
  { label: "Ink", value: "#111827" },
  { label: "Gray", value: "#6b7280" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Yellow", value: "#ca8a04" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Pink", value: "#db2777" },
];

const HIGHLIGHT_COLOR_OPTIONS = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Orange", value: "#fed7aa" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Purple", value: "#ddd6fe" },
  { label: "Pink", value: "#fbcfe8" },
];

const FONT_SIZE_OPTIONS = [
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "24", value: "24px" },
  { label: "32", value: "32px" },
];

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
  const selectedPageIdRef = useRef<string | null>(null);
  const selectedPageRef = useRef<JournalNotePageRow | null>(null);
  const draftRef = useRef<DraftSnapshot>({
    title: "",
    pageHeading: "",
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
  const selectionRangeRef = useRef<Range | null>(null);
  const [folders, setFolders] = useState<JournalFolderRow[]>([]);
  const [notes, setNotes] = useState<JournalNoteWithAttachments[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
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
  const [draftPageHeading, setDraftPageHeading] = useState("");
  const [draftHtml, setDraftHtml] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftFolderId, setDraftFolderId] = useState("none");
  const [draftEntryDate, setDraftEntryDate] = useState(todayISO());
  const [draftEntryTime, setDraftEntryTime] = useState(new Date().toTimeString().slice(0, 5));
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [pageReorderMode, setPageReorderMode] = useState(false);
  const [noteSettingsOpen, setNoteSettingsOpen] = useState(false);
  const [textDialog, setTextDialog] = useState<AppTextDialogConfig | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<AppConfirmDialogConfig | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(EMPTY_TOOLBAR_STATE);
  const [formatMenu, setFormatMenu] = useState<FormatMenu>(null);

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

  useEffect(() => {
    const validIds = new Set(notes.map((note) => note.id));
    setSelectedNoteIds((current) => current.filter((id) => validIds.has(id)));
  }, [notes]);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((folder) => map.set(folder.id, folder.name));
    return map;
  }, [folders]);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  const selectedPage = useMemo(() => {
    if (!selectedNote) return null;
    return (
      selectedNote.pages.find((page) => page.id === selectedPageId) ?? selectedNote.pages[0] ?? null
    );
  }, [selectedNote, selectedPageId]);

  useEffect(() => {
    selectedNoteRef.current = selectedNote;
  }, [selectedNote]);

  useEffect(() => {
    selectedPageRef.current = selectedPage;
    selectedPageIdRef.current = selectedPage?.id ?? null;
  }, [selectedPage]);

  useEffect(() => {
    if (!selectedNote) {
      setSelectedPageId(null);
      setPagePickerOpen(false);
      setPageReorderMode(false);
      setNoteSettingsOpen(false);
      return;
    }

    setSelectedPageId((current) =>
      current && selectedNote.pages.some((page) => page.id === current)
        ? current
        : (selectedNote.pages[0]?.id ?? null),
    );
  }, [selectedNote]);

  useEffect(() => {
    setPageReorderMode(false);
  }, [selectedNote?.id]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    attachmentUrlsRef.current = attachmentUrls;
  }, [attachmentUrls]);

  useEffect(() => {
    draftRef.current = {
      title: draftTitle,
      pageHeading: draftPageHeading,
      html: draftHtml,
      text: draftText,
      tags: draftTags,
      folderId: draftFolderId,
      entryDate: draftEntryDate,
      entryTime: draftEntryTime,
    };
  }, [
    draftEntryDate,
    draftEntryTime,
    draftFolderId,
    draftHtml,
    draftPageHeading,
    draftTags,
    draftText,
    draftTitle,
  ]);

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

  const saveEditorSelection = useCallback(() => {
    if (typeof window === "undefined" || !editorRef.current) return false;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return false;
    selectionRangeRef.current = range.cloneRange();
    return true;
  }, []);

  const restoreEditorSelection = useCallback(() => {
    if (typeof window === "undefined" || !editorRef.current || !selectionRangeRef.current) return;
    if (!editorRef.current.contains(selectionRangeRef.current.commonAncestorContainer)) return;
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(selectionRangeRef.current);
  }, []);

  const refreshToolbarState = useCallback(() => {
    if (typeof document === "undefined" || !editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setToolbarState(EMPTY_TOOLBAR_STATE);
      return;
    }

    const anchor = selection.anchorNode;
    if (anchor && !editorRef.current.contains(anchor)) return;
    saveEditorSelection();

    const formatBlock = String(document.queryCommandValue("formatBlock") ?? "").toLowerCase();
    const blockElement = currentBlockElement(editorRef.current);
    const alignCenter = document.queryCommandState("justifyCenter");
    const alignRight = document.queryCommandState("justifyRight");
    const alignLeft = document.queryCommandState("justifyLeft") || (!alignCenter && !alignRight);

    setToolbarState({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      alignLeft,
      alignCenter,
      alignRight,
      heading: formatBlock === "h2" || blockElement?.tagName === "H2",
      unorderedList: document.queryCommandState("insertUnorderedList"),
      orderedList: document.queryCommandState("insertOrderedList"),
      checklist: !!blockElement?.closest("[data-checklist-item]"),
      quote: formatBlock === "blockquote" || !!blockElement?.closest("blockquote"),
    });
  }, [saveEditorSelection]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleSelectionChange = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      if (!editor || !anchor || !editor.contains(anchor)) return;
      refreshToolbarState();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [refreshToolbarState]);

  const restoreEditorFromDraftIfNeeded = useCallback(() => {
    const editor = editorRef.current;
    const note = selectedNoteRef.current;
    const page = selectedPageRef.current;
    if (!editor || !note || !page || hasMeaningfulEditorHtml(editor.innerHTML)) return;

    const html =
      firstMeaningfulHtml(
        draftRef.current.html,
        lastMeaningfulEditorHtmlRef.current,
        ensureInlineAttachmentEmbeds(page.content_html || "", note.attachments),
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
    if (!selectedNote || !selectedPage) {
      draftRef.current = {
        title: "",
        pageHeading: "",
        html: "",
        text: "",
        tags: "",
        folderId: "none",
        entryDate: todayISO(),
        entryTime: new Date().toTimeString().slice(0, 5),
      };
      setDraftTitle("");
      setDraftPageHeading("");
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
      selectedPage.content_html || "",
      selectedNote.attachments,
    );
    const nextDraft = {
      title: selectedNote.title,
      pageHeading: selectedPage.heading ?? "",
      html,
      text: selectedPage.content_text,
      tags: (selectedNote.tags ?? []).join(", "),
      folderId: selectedNote.folder_id ?? "none",
      entryDate: selectedPage.entry_date ?? selectedNote.entry_date,
      entryTime: normalizeTimeValue(selectedPage.entry_time ?? selectedNote.entry_time),
    };
    draftRef.current = nextDraft;
    lastMeaningfulEditorHtmlRef.current = hasMeaningfulEditorHtml(nextDraft.html)
      ? nextDraft.html
      : "";
    blankEditorSaveAllowedRef.current = false;
    setDraftTitle(nextDraft.title);
    setDraftPageHeading(nextDraft.pageHeading);
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
    // Only reset the draft when the user switches notes/pages. Autosave updates
    // the selected rows too, and resetting on every save would move the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote?.id, selectedPage?.id]);

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
    if (!selectedNote || !selectedPage || !editorRef.current) return;
    if (!hasMeaningfulEditorHtml(editorRef.current.innerHTML)) {
      scheduleEditorRestore();
      return;
    }
    hydrateInlineAttachments(editorRef.current, selectedNote.attachments, attachmentUrls);
  }, [attachmentUrls, scheduleEditorRestore, selectedAttachmentKey, selectedNote, selectedPage]);

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
    notes.forEach((note) => {
      const pages = note.pages.length ? note.pages : [];
      if (!pages.length) {
        counts.set(note.entry_date, (counts.get(note.entry_date) ?? 0) + 1);
        return;
      }
      pages.forEach((page) => {
        const entryDate = page.entry_date ?? note.entry_date;
        counts.set(entryDate, (counts.get(entryDate) ?? 0) + 1);
      });
    });
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
        ...note.pages.flatMap((page) => [
          page.title,
          page.heading,
          page.content_text,
          page.entry_date,
          normalizeTimeValue(page.entry_time),
        ]),
        ...note.attachments.map((attachment) => attachment.file_name),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [folderNameById, notes, query]);

  const dayModalNotes = useMemo(
    () =>
      dayModalDate
        ? notes.filter((note) =>
            note.pages.length
              ? note.pages.some((page) => (page.entry_date ?? note.entry_date) === dayModalDate)
              : note.entry_date === dayModalDate,
          )
        : [],
    [dayModalDate, notes],
  );

  const saveDraft = useCallback(async () => {
    const noteId = selectedNoteIdRef.current;
    const pageId = selectedPageIdRef.current;
    if (!noteId || !pageId) return;

    const versionAtStart = draftVersionRef.current;
    const draft = draftRef.current;
    const liveHtml = editorRef.current?.innerHTML ?? "";
    const currentNote = selectedNoteRef.current?.id === noteId ? selectedNoteRef.current : null;
    const currentPage = selectedPageRef.current?.id === pageId ? selectedPageRef.current : null;
    const fallbackHtml =
      firstMeaningfulHtml(
        draft.html,
        lastMeaningfulEditorHtmlRef.current,
        ensureInlineAttachmentEmbeds(
          currentPage?.content_html || "",
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
    const pageHeading = draft.pageHeading.trim().slice(0, 160);
    const title = titleFromDraft(draft.title, pageHeading || text);
    const tags = parseTags(draft.tags);
    const inlineAttachmentIds = attachmentIdsFromPages(currentNote?.pages ?? [], pageId, cleanHtml);
    const removedAttachments =
      currentNote?.attachments.filter((attachment) => !inlineAttachmentIds.has(attachment.id)) ??
      [];
    const removedAttachmentIds = new Set(removedAttachments.map((attachment) => attachment.id));
    const noteContentText = noteTextFromPages(currentNote?.pages ?? [], pageId, text, pageHeading);
    const noteContentHtml =
      currentNote?.pages[0]?.id === pageId ? cleanHtml : (currentNote?.content_html ?? cleanHtml);
    saveStateRef.current = "saving";
    setSaveState("saving");
    try {
      const [saved, savedPage] = await Promise.all([
        updateJournalNote(noteId, {
          title,
          content_html: noteContentHtml,
          content_text: noteContentText,
          tags,
          folder_id: draft.folderId === "none" ? null : draft.folderId,
        }),
        updateJournalNotePage(pageId, {
          heading: pageHeading,
          content_html: cleanHtml,
          content_text: text,
          entry_date: draft.entryDate || todayISO(),
          entry_time: draft.entryTime || new Date().toTimeString().slice(0, 5),
        }),
      ]);
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
                  pages: sortJournalPages(
                    note.pages.map((page) => (page.id === savedPage.id ? savedPage : page)),
                  ),
                }
              : note,
          ),
        ),
      );
      if (
        selectedNoteIdRef.current === noteId &&
        selectedPageIdRef.current === pageId &&
        draftVersionRef.current === versionAtStart
      ) {
        draftRef.current = {
          ...draftRef.current,
          title,
          pageHeading,
          html: cleanHtml,
          text,
          tags: tags.join(", "),
        };
        lastMeaningfulEditorHtmlRef.current = hasMeaningfulEditorHtml(cleanHtml) ? cleanHtml : "";
        blankEditorSaveAllowedRef.current = false;
        setDraftTitle(title);
        setDraftPageHeading(pageHeading);
        setDraftHtml(cleanHtml);
        setDraftText(text);
        setDraftTags(tags.join(", "));
        saveStateRef.current = "saved";
        setSaveState("saved");
      } else if (selectedNoteIdRef.current === noteId && selectedPageIdRef.current === pageId) {
        saveStateRef.current = "dirty";
        setSaveState("dirty");
      }
    } catch (e: unknown) {
      if (selectedNoteIdRef.current === noteId && selectedPageIdRef.current === pageId) {
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

  const selectPage = async (pageId: string) => {
    if (pageId === selectedPageId) return;
    if (saveStateRef.current === "dirty") await saveDraft();
    setSelectedPageId(pageId);
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
      setSelectedPageId(note.pages[0]?.id ?? null);
      setDayModalDate(null);
      setSearchOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't add note");
    }
  };

  const addPage = async () => {
    if (!user || !selectedNote) return;
    const noteId = selectedNote.id;
    const sortOrder = selectedNote.pages.length;
    const createdAt = new Date();
    const entryDate = todayISO(createdAt);
    const entryTime = createdAt.toTimeString().slice(0, 5);
    setTextDialog({
      title: "New page",
      label: "Page name",
      initialValue: format(createdAt, "MMM d"),
      confirmLabel: "Add page",
      onSubmit: async (title) => {
        if (saveStateRef.current === "dirty") await saveDraft();
        try {
          const page = await createJournalNotePage({
            userId: user.id,
            noteId,
            title,
            sortOrder,
            entryDate,
            entryTime,
          });
          setNotes((current) =>
            current.map((note) =>
              note.id === noteId
                ? { ...note, pages: sortJournalPages([...note.pages, page]) }
                : note,
            ),
          );
          setSelectedPageId(page.id);
          setPagePickerOpen(false);
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Couldn't add page");
        }
      },
    });
  };

  const renamePage = async (page: JournalNotePageRow) => {
    setTextDialog({
      title: "Rename page",
      label: "Page name",
      initialValue: page.title,
      confirmLabel: "Rename",
      onSubmit: async (title) => {
        if (title === page.title) return;
        try {
          const saved = await updateJournalNotePage(page.id, { title });
          setNotes((current) =>
            current.map((note) =>
              note.id === saved.note_id
                ? {
                    ...note,
                    pages: sortJournalPages(
                      note.pages.map((item) => (item.id === saved.id ? saved : item)),
                    ),
                  }
                : note,
            ),
          );
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Couldn't rename page");
        }
      },
    });
  };

  const removePage = async (page: JournalNotePageRow) => {
    if (!selectedNote || selectedNote.pages.length <= 1) {
      toast.error("Keep at least one page in a note");
      return;
    }
    const noteId = selectedNote.id;
    const pageIndex = selectedNote.pages.findIndex((item) => item.id === page.id);
    const nextPage = selectedNote.pages[pageIndex + 1] ?? selectedNote.pages[pageIndex - 1];
    setConfirmDialog({
      title: "Delete page?",
      description: `"${page.title}" will be removed from this note.`,
      confirmLabel: "Delete page",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteJournalNotePage(page.id);
          setNotes((current) =>
            current.map((note) =>
              note.id === noteId
                ? { ...note, pages: note.pages.filter((item) => item.id !== page.id) }
                : note,
            ),
          );
          if (selectedPageIdRef.current === page.id) {
            saveStateRef.current = "idle";
            setSaveState("idle");
            setSelectedPageId(nextPage?.id ?? null);
          }
          setPagePickerOpen(false);
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Couldn't delete page");
        }
      },
    });
  };

  const goToAdjacentPage = (direction: -1 | 1) => {
    if (!selectedNote || !selectedPage) return;
    const pageIndex = selectedNote.pages.findIndex((page) => page.id === selectedPage.id);
    const nextPage = selectedNote.pages[pageIndex + direction];
    if (nextPage) void selectPage(nextPage.id);
  };

  const movePage = async (pageId: string, direction: -1 | 1) => {
    const noteId = selectedNote?.id;
    if (!noteId) return;
    if (saveStateRef.current === "dirty") await saveDraft();

    const note = selectedNoteRef.current?.id === noteId ? selectedNoteRef.current : selectedNote;
    if (!note) return;

    const reorderedPages = reorderJournalPages(note.pages, pageId, direction);
    if (!reorderedPages) return;

    const previousPages = note.pages;
    setNotes((current) =>
      current.map((item) => (item.id === noteId ? { ...item, pages: reorderedPages } : item)),
    );

    try {
      const savedPages = await Promise.all(
        reorderedPages.map((page) =>
          updateJournalNotePage(page.id, { sort_order: page.sort_order }),
        ),
      );
      setNotes((current) =>
        current.map((item) =>
          item.id === noteId
            ? {
                ...item,
                pages: sortJournalPages(
                  item.pages.map(
                    (page) => savedPages.find((saved) => saved.id === page.id) ?? page,
                  ),
                ),
              }
            : item,
        ),
      );
    } catch (e: unknown) {
      setNotes((current) =>
        current.map((item) => (item.id === noteId ? { ...item, pages: previousPages } : item)),
      );
      toast.error(e instanceof Error ? e.message : "Couldn't reorder pages");
    }
  };

  const toggleBulkMode = () => {
    setBulkMode((current) => {
      if (current) {
        setSelectedNoteIds([]);
        setBulkMoveOpen(false);
      }
      return !current;
    });
  };

  const toggleNoteSelection = (noteId: string) => {
    setSelectedNoteIds((current) =>
      current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId],
    );
  };

  const selectAllVisibleNotes = () => {
    const visibleIds = folderNotes.map((note) => note.id);
    setSelectedNoteIds((current) =>
      visibleIds.every((id) => current.includes(id))
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
  };

  const moveSelectedNotes = async (folderId: string) => {
    const ids = selectedNoteIds;
    if (!ids.length) return;
    const nextFolderId = folderId === "none" ? null : folderId;
    try {
      await Promise.all(
        ids.map((noteId) => updateJournalNote(noteId, { folder_id: nextFolderId })),
      );
      setNotes((current) =>
        current.map((note) =>
          ids.includes(note.id) ? { ...note, folder_id: nextFolderId } : note,
        ),
      );
      setSelectedNoteIds([]);
      setBulkMode(false);
      setBulkMoveOpen(false);
      toast.success(ids.length === 1 ? "Note moved" : "Notes moved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't move notes");
    }
  };

  const deleteSelectedNotes = () => {
    const ids = selectedNoteIds;
    if (!ids.length) return;
    setConfirmDialog({
      title: ids.length === 1 ? "Delete note?" : "Delete notes?",
      description:
        ids.length === 1
          ? "This note and all of its pages will be deleted."
          : `${ids.length} notes and all of their pages will be deleted.`,
      confirmLabel: ids.length === 1 ? "Delete note" : "Delete notes",
      destructive: true,
      onConfirm: async () => {
        try {
          await Promise.all(ids.map((noteId) => deleteJournalNote(noteId)));
          setNotes((current) => current.filter((note) => !ids.includes(note.id)));
          setSelectedNoteIds([]);
          setBulkMode(false);
          setBulkMoveOpen(false);
          if (selectedNoteId && ids.includes(selectedNoteId)) setSelectedNoteId(null);
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Couldn't delete notes");
        }
      },
    });
  };

  const addFolder = async () => {
    if (!user) return;
    const sortOrder = folders.length;
    setTextDialog({
      title: "New folder",
      label: "Folder name",
      placeholder: "Folder name",
      confirmLabel: "Add folder",
      onSubmit: async (name) => {
        try {
          const folder = await createJournalFolder(user.id, name, sortOrder);
          setFolders((current) => [...current, folder]);
          setActiveFolderId(folder.id);
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Couldn't add folder");
        }
      },
    });
  };

  const renameFolder = async (folder: JournalFolderRow) => {
    setTextDialog({
      title: "Rename folder",
      label: "Folder name",
      initialValue: folder.name,
      confirmLabel: "Rename",
      onSubmit: async (name) => {
        if (name === folder.name) return;
        try {
          const saved = await renameJournalFolder(folder.id, name);
          setFolders((current) =>
            current.map((item) => (item.id === saved.id ? saved : item)).sort(sortFolders),
          );
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Couldn't rename folder");
        }
      },
    });
  };

  const removeFolder = async (folder: JournalFolderRow) => {
    setConfirmDialog({
      title: "Delete folder?",
      description: `"${folder.name}" will be deleted. Notes in it will move to Unfiled.`,
      confirmLabel: "Delete folder",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteJournalFolder(folder.id);
          setFolders((current) => current.filter((item) => item.id !== folder.id));
          setNotes((current) =>
            current.map((note) =>
              note.folder_id === folder.id ? { ...note, folder_id: null } : note,
            ),
          );
          if (activeFolderId === folder.id) setActiveFolderId("all");
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Couldn't delete folder");
        }
      },
    });
  };

  const removeSelectedNote = async () => {
    if (!selectedNote) return;
    const note = selectedNote;
    setConfirmDialog({
      title: "Delete note?",
      description: `"${note.title}" and all of its pages will be deleted.`,
      confirmLabel: "Delete note",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteJournalNote(note.id);
          setNotes((current) => {
            const next = current.filter((item) => item.id !== note.id);
            setSelectedNoteId(next[0]?.id ?? null);
            return next;
          });
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Couldn't delete note");
        }
      },
    });
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
      selectedPageRef.current?.content_html ?? "",
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
    restoreEditorSelection();
    document.execCommand(command, false, value);
    if (trailingBreak) ensureEditableBreaksAfterBlocks(editorRef.current);
    handleEditorInput();
    window.setTimeout(refreshToolbarState, 0);
  };

  const applyTextColor = (color: string) => {
    setFormatMenu(null);
    runCommand("foreColor", color);
  };

  const applyHighlightColor = (color: string) => {
    setFormatMenu(null);
    editorRef.current?.focus();
    restoreEditorSelection();
    document.execCommand("styleWithCSS", false, "true");
    if (!document.execCommand("hiliteColor", false, color)) {
      document.execCommand("backColor", false, color);
    }
    handleEditorInput();
    window.setTimeout(refreshToolbarState, 0);
  };

  const applyFontSize = (fontSize: string) => {
    setFormatMenu(null);
    editorRef.current?.focus();
    restoreEditorSelection();
    document.execCommand("fontSize", false, "7");
    editorRef.current?.querySelectorAll("font[size='7']").forEach((node) => {
      const font = node as HTMLElement;
      const span = document.createElement("span");
      span.style.fontSize = fontSize;
      while (font.firstChild) span.appendChild(font.firstChild);
      span.querySelectorAll<HTMLElement>("[style]").forEach((child) => {
        child.style.fontSize = "";
        if (!child.getAttribute("style")) child.removeAttribute("style");
      });
      font.replaceWith(span);
    });
    handleEditorInput();
    window.setTimeout(refreshToolbarState, 0);
  };

  const insertDivider = () => {
    const tempId = `divider-${Date.now()}`;
    editorRef.current?.focus();
    restoreEditorSelection();
    document.execCommand(
      "insertHTML",
      false,
      `<hr data-journal-divider="true"><p data-divider-caret="${tempId}"><br></p>`,
    );
    const paragraph = editorRef.current?.querySelector(`[data-divider-caret="${tempId}"]`);
    if (paragraph instanceof HTMLElement) {
      paragraph.removeAttribute("data-divider-caret");
      placeCaretAtEnd(paragraph);
      saveEditorSelection();
    }
    handleEditorInput();
    window.setTimeout(refreshToolbarState, 0);
    keepCaretInView();
  };

  const toggleBlockCommand = (format: "H2" | "BLOCKQUOTE") => {
    editorRef.current?.focus();
    restoreEditorSelection();
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
    setTextDialog({
      title: "Add link",
      label: "URL",
      placeholder: "https://",
      confirmLabel: "Insert link",
      inputMode: "url",
      onSubmit: (url) => runCommand("createLink", url),
    });
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
    restoreEditorSelection();
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
    setFormatMenu(null);
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
    restoreEditorSelection();
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
  const selectedPageIndex =
    selectedNote && selectedPage
      ? selectedNote.pages.findIndex((page) => page.id === selectedPage.id)
      : -1;
  const canGoPreviousPage = selectedPageIndex > 0;
  const canGoNextPage = selectedNote
    ? selectedPageIndex >= 0 && selectedPageIndex < selectedNote.pages.length - 1
    : false;
  const visibleNoteIds = folderNotes.map((note) => note.id);
  const allVisibleSelected =
    visibleNoteIds.length > 0 && visibleNoteIds.every((id) => selectedNoteIds.includes(id));
  const monthlyPageCount = notes.reduce(
    (count, note) =>
      count +
      (note.pages.length
        ? note.pages.filter((page) =>
            isSameMonth(parseISO(page.entry_date ?? note.entry_date), calendarMonth),
          ).length
        : isSameMonth(parseISO(note.entry_date), calendarMonth)
          ? 1
          : 0),
    0,
  );

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
          <span>{monthlyPageCount} this month</span>
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
              onClick={toggleBulkMode}
              className={`rounded-full border px-3 py-2 text-xs font-bold transition-colors ${
                bulkMode
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {bulkMode ? "Done" : "Select"}
            </button>
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

        {bulkMode && (
          <div className="relative mb-4 rounded-lg border border-border bg-card/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={selectAllVisibleNotes}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                {allVisibleSelected ? "Clear visible" : "Select visible"}
              </button>
              <span className="text-xs font-medium text-muted-foreground">
                {selectedNoteIds.length} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkMoveOpen((open) => !open)}
                  disabled={!selectedNoteIds.length}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-35"
                >
                  Move
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedNotes}
                  disabled={!selectedNoteIds.length}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-destructive disabled:opacity-35"
                >
                  Delete
                </button>
              </div>
            </div>
            {bulkMoveOpen && (
              <div className="absolute right-3 left-3 z-30 mt-3 rounded-lg border border-border bg-popover p-2 shadow-xl">
                <FolderPicker
                  folders={folders}
                  value="none"
                  onChange={(folderId) => {
                    void moveSelectedNotes(folderId);
                  }}
                />
              </div>
            )}
          </div>
        )}

        <NoteList
          notes={folderNotes}
          selectedNoteId={selectedNoteId}
          selectionMode={bulkMode}
          selectedNoteIds={selectedNoteIds}
          onSelect={selectNote}
          onToggleSelect={toggleNoteSelection}
          emptyLabel="No notes here yet."
        />
      </section>

      {selectedNote && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="mx-auto flex h-full max-w-5xl flex-col px-4">
            <div className="relative flex shrink-0 items-center justify-between border-b border-border bg-background/95 py-3 backdrop-blur">
              <button
                type="button"
                onClick={() => {
                  setPagePickerOpen(false);
                  setPageReorderMode(false);
                  setNoteSettingsOpen(false);
                  setSelectedNoteId(null);
                }}
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
                  onClick={() => {
                    setNoteSettingsOpen(false);
                    if (pagePickerOpen) setPageReorderMode(false);
                    setPagePickerOpen((open) => !open);
                  }}
                  className="icon-button h-9 w-9 shrink-0 md:hidden"
                  aria-label="Pages"
                  title="Pages"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPagePickerOpen(false);
                    setPageReorderMode(false);
                    setNoteSettingsOpen((open) => !open);
                  }}
                  className="icon-button h-9 w-9 shrink-0"
                  aria-label="Note settings"
                  title="Note settings"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
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
              {pagePickerOpen && (
                <MobilePageMenu
                  pages={selectedNote.pages}
                  selectedPageId={selectedPage?.id ?? null}
                  reorderMode={pageReorderMode}
                  canGoPrevious={canGoPreviousPage}
                  canGoNext={canGoNextPage}
                  onClose={() => {
                    setPagePickerOpen(false);
                    setPageReorderMode(false);
                  }}
                  onSelect={(pageId) => void selectPage(pageId)}
                  onPrevious={() => goToAdjacentPage(-1)}
                  onNext={() => goToAdjacentPage(1)}
                  onAdd={() => void addPage()}
                  onToggleReorderMode={() => setPageReorderMode((mode) => !mode)}
                  onMoveUp={selectedPage ? () => void movePage(selectedPage.id, -1) : undefined}
                  onMoveDown={selectedPage ? () => void movePage(selectedPage.id, 1) : undefined}
                  onRename={selectedPage ? () => void renamePage(selectedPage) : undefined}
                  onDelete={selectedPage ? () => void removePage(selectedPage) : undefined}
                />
              )}
              {noteSettingsOpen && (
                <NoteSettingsPanel
                  folders={folders}
                  draftNoteTitle={draftTitle}
                  draftFolderId={draftFolderId}
                  draftEntryDate={draftEntryDate}
                  draftEntryTime={draftEntryTime}
                  createdAt={selectedNote.created_at}
                  updatedAt={selectedNote.updated_at}
                  onClose={() => setNoteSettingsOpen(false)}
                  onNoteTitleChange={(title) => {
                    draftRef.current = { ...draftRef.current, title };
                    setDraftTitle(title);
                    markDirty();
                  }}
                  onFolderChange={(folderId) => {
                    draftRef.current = { ...draftRef.current, folderId };
                    setDraftFolderId(folderId);
                    markDirty();
                  }}
                  onEntryDateChange={(entryDate) => {
                    draftRef.current = { ...draftRef.current, entryDate };
                    setDraftEntryDate(entryDate);
                    markDirty();
                  }}
                  onEntryTimeChange={(entryTime) => {
                    draftRef.current = { ...draftRef.current, entryTime };
                    setDraftEntryTime(entryTime);
                    markDirty();
                  }}
                />
              )}
            </div>

            <div className="flex min-h-0 flex-1 gap-4">
              <PageSidebar
                pages={selectedNote.pages}
                selectedPageId={selectedPage?.id ?? null}
                reorderMode={pageReorderMode}
                onSelect={(pageId) => void selectPage(pageId)}
                onAdd={() => void addPage()}
                onToggleReorderMode={() => setPageReorderMode((mode) => !mode)}
                onRename={renamePage}
                onDelete={(page) => void removePage(page)}
                onMove={(pageId, direction) => void movePage(pageId, direction)}
              />

              <div
                ref={editorScrollRef}
                className="min-w-0 flex-1 overflow-auto pb-28"
                style={{
                  paddingBottom: keyboardOffset ? `${keyboardOffset + 112}px` : undefined,
                }}
              >
                <div className="px-1 py-5">
                  <div className="min-w-0">
                    {selectedPage && (
                      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
                        <span className="truncate">{selectedPage.title}</span>
                        <span aria-hidden>·</span>
                        <span>{formatPageStamp(selectedPage)}</span>
                      </div>
                    )}
                    <label htmlFor="journal-page-heading" className="sr-only">
                      Page title
                    </label>
                    <input
                      id="journal-page-heading"
                      value={draftPageHeading}
                      onChange={(event) => {
                        const pageHeading = event.target.value;
                        draftRef.current = { ...draftRef.current, pageHeading };
                        setDraftPageHeading(pageHeading);
                        markDirty();
                      }}
                      className="w-full bg-transparent text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground"
                      placeholder="Entry title"
                    />
                  </div>
                </div>

                <div className="px-1 pb-10">
                  {selectedPage ? (
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={handleEditorInput}
                      onClick={handleEditorClick}
                      onKeyDown={handleEditorKeyDown}
                      onKeyUp={() => {
                        saveEditorSelection();
                        refreshToolbarState();
                        keepCaretInView();
                      }}
                      onMouseUp={() => {
                        saveEditorSelection();
                        refreshToolbarState();
                      }}
                      onFocus={() => {
                        scheduleEditorRestore();
                        saveEditorSelection();
                        refreshToolbarState();
                        keepCaretInView();
                      }}
                      onBlur={() => {
                        if (saveState === "dirty") void saveDraft();
                      }}
                      className="journal-editor min-h-[24rem] w-full bg-transparent px-1 py-3 text-base leading-7 text-foreground outline-none [&_a]:text-primary [&_blockquote]:border-l-4 [&_blockquote]:border-primary/50 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_hr]:my-6 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
                    />
                  ) : (
                    <div className="flex min-h-[18rem] items-center justify-center text-sm text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => void addPage()}
                        className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 font-medium"
                      >
                        <Plus className="h-4 w-4" />
                        Add page
                      </button>
                    </div>
                  )}
                </div>
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
              {formatMenu && (
                <ToolbarFormatMenu
                  menu={formatMenu}
                  onTextColor={applyTextColor}
                  onHighlightColor={applyHighlightColor}
                  onFontSize={applyFontSize}
                />
              )}
              <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-3">
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
                  label="Font size"
                  onClick={() =>
                    setFormatMenu((current) => (current === "fontSize" ? null : "fontSize"))
                  }
                  active={formatMenu === "fontSize"}
                  icon={<Type className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Text color"
                  onClick={() =>
                    setFormatMenu((current) => (current === "textColor" ? null : "textColor"))
                  }
                  active={formatMenu === "textColor"}
                  icon={<Palette className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Highlight"
                  onClick={() =>
                    setFormatMenu((current) =>
                      current === "highlightColor" ? null : "highlightColor",
                    )
                  }
                  active={formatMenu === "highlightColor"}
                  icon={<Highlighter className="h-4 w-4" />}
                />
                <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden />
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
                <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden />
                <ToolbarButton
                  label="Align left"
                  onClick={() => runCommand("justifyLeft")}
                  active={toolbarState.alignLeft}
                  icon={<AlignLeft className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Align center"
                  onClick={() => runCommand("justifyCenter")}
                  active={toolbarState.alignCenter}
                  icon={<AlignCenter className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Align right"
                  onClick={() => runCommand("justifyRight")}
                  active={toolbarState.alignRight}
                  icon={<AlignRight className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Link"
                  onClick={addLink}
                  icon={<LinkIcon className="h-4 w-4" />}
                />
                <ToolbarButton
                  label="Divider"
                  onClick={insertDivider}
                  icon={<Minus className="h-4 w-4" />}
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
            const note = notes.find((item) => item.id === noteId);
            const page = note?.pages.find(
              (item) => (item.entry_date ?? note.entry_date) === dayModalDate,
            );
            setDayModalDate(null);
            if (page) setSelectedPageId(page.id);
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

      <AppTextDialog config={textDialog} onClose={() => setTextDialog(null)} />
      <AppConfirmDialog config={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

function NoteList({
  notes,
  selectedNoteId,
  selectionMode = false,
  selectedNoteIds = [],
  onSelect,
  onToggleSelect,
  emptyLabel,
}: {
  notes: JournalNoteWithAttachments[];
  selectedNoteId: string | null;
  selectionMode?: boolean;
  selectedNoteIds?: string[];
  onSelect: (noteId: string) => void;
  onToggleSelect?: (noteId: string) => void;
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
            selected={selectedNoteIds.includes(note.id)}
            selectionMode={selectionMode}
            onSelect={() => onSelect(note.id)}
            onToggleSelect={() => onToggleSelect?.(note.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function NoteListItem({
  note,
  active,
  selected,
  selectionMode,
  onSelect,
  onToggleSelect,
}: {
  note: JournalNoteWithAttachments;
  active: boolean;
  selected: boolean;
  selectionMode: boolean;
  onSelect: () => void;
  onToggleSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={selectionMode ? onToggleSelect : onSelect}
      className={`block w-full rounded-lg border px-4 py-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/15"
          : active
            ? "border-primary bg-primary/10"
            : "border-border bg-card/65 hover:border-primary/40 hover:bg-card"
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        {selectionMode && (
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background"
            }`}
            aria-hidden
          >
            {selected && <CheckSquare className="h-3.5 w-3.5" />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">{note.title}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {notePageDateSummary(note)}
            {notePreviewText(note) ? ` · ${notePreviewText(note)}` : ""}
          </span>
        </span>
        {(note.pages.length > 1 || note.attachments.length > 0) && (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {note.pages.length > 1 ? (
              <>
                <FileText className="h-3 w-3" />
                {note.pages.length}
              </>
            ) : (
              <>
                <Paperclip className="h-3 w-3" />
                {note.attachments.length}
              </>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

function PageSidebar({
  pages,
  selectedPageId,
  reorderMode,
  onSelect,
  onAdd,
  onToggleReorderMode,
  onRename,
  onDelete,
  onMove,
}: {
  pages: JournalNotePageRow[];
  selectedPageId: string | null;
  reorderMode: boolean;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onToggleReorderMode: () => void;
  onRename: (page: JournalNotePageRow) => void;
  onDelete: (page: JournalNotePageRow) => void;
  onMove: (pageId: string, direction: -1 | 1) => void;
}) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border py-4 pr-3 md:block">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase text-muted-foreground">Pages</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAdd}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
            aria-label="Add page"
            title="Add page"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleReorderMode}
            disabled={pages.length <= 1}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-35 ${
              reorderMode
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            aria-label={reorderMode ? "Done reordering pages" : "Reorder pages"}
            title={reorderMode ? "Done reordering pages" : "Reorder pages"}
          >
            {reorderMode ? <Check className="h-4 w-4" /> : <ArrowUpDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <ul className="space-y-1">
        {pages.map((page, index) => (
          <li key={page.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(page.id)}
              onDoubleClick={() => onRename(page)}
              className={`min-w-0 flex-1 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                selectedPageId === page.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="block truncate">{page.title}</span>
              <span className="mt-0.5 block truncate text-[11px] opacity-70">
                {formatPageStamp(page)}
              </span>
            </button>
            {reorderMode ? (
              <div className="flex h-9 w-6 shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => onMove(page.id, -1)}
                  disabled={index === 0}
                  className="flex h-1/2 items-center justify-center rounded-t-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25"
                  aria-label={`Move ${page.title} up`}
                  title={`Move ${page.title} up`}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(page.id, 1)}
                  disabled={index === pages.length - 1}
                  className="flex h-1/2 items-center justify-center rounded-b-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25"
                  aria-label={`Move ${page.title} down`}
                  title={`Move ${page.title} down`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onRename(page)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  aria-label={`Rename ${page.title}`}
                  title={`Rename ${page.title}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(page)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
                  aria-label={`Delete ${page.title}`}
                  title={`Delete ${page.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function MobilePageMenu({
  pages,
  selectedPageId,
  reorderMode,
  canGoPrevious,
  canGoNext,
  onClose,
  onSelect,
  onPrevious,
  onNext,
  onAdd,
  onToggleReorderMode,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
}: {
  pages: JournalNotePageRow[];
  selectedPageId: string | null;
  reorderMode: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onClose: () => void;
  onSelect: (pageId: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onAdd: () => void;
  onToggleReorderMode: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="absolute top-full right-0 left-0 z-40 mt-2 rounded-lg border border-border bg-popover p-3 shadow-xl md:hidden">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase text-muted-foreground">Pages</span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close pages"
          title="Close pages"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className="icon-button h-9 w-9 shrink-0 disabled:opacity-35"
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          className="icon-button h-9 w-9 shrink-0 disabled:opacity-35"
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="icon-button h-9 w-9 shrink-0"
          aria-label="Add page"
          title="Add page"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleReorderMode}
          disabled={pages.length <= 1}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-35 ${
            reorderMode
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground"
          }`}
          aria-label={reorderMode ? "Done reordering pages" : "Reorder pages"}
          title={reorderMode ? "Done reordering pages" : "Reorder pages"}
        >
          {reorderMode ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5" />
          )}
        </button>
        {reorderMode ? (
          <>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!onMoveUp || !canGoPrevious}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground disabled:opacity-35"
              aria-label="Move page up"
              title="Move page up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!onMoveDown || !canGoNext}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground disabled:opacity-35"
              aria-label="Move page down"
              title="Move page down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onRename}
              disabled={!onRename}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground disabled:opacity-35"
              aria-label="Rename page"
              title="Rename page"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={!onDelete || pages.length <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground disabled:opacity-35"
              aria-label="Delete page"
              title="Delete page"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      <div className="max-h-72 space-y-1 overflow-auto">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => {
              onSelect(page.id);
              if (!reorderMode) onClose();
            }}
            className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-medium ${
              selectedPageId === page.id
                ? "bg-primary text-primary-foreground"
                : "text-popover-foreground hover:bg-muted"
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate">{page.title}</span>
              <span className="block truncate text-[11px] opacity-70">{formatPageStamp(page)}</span>
            </span>
            {selectedPageId === page.id && <CheckSquare className="h-4 w-4 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function NoteSettingsPanel({
  folders,
  draftNoteTitle,
  draftFolderId,
  draftEntryDate,
  draftEntryTime,
  createdAt,
  updatedAt,
  onClose,
  onNoteTitleChange,
  onFolderChange,
  onEntryDateChange,
  onEntryTimeChange,
}: {
  folders: JournalFolderRow[];
  draftNoteTitle: string;
  draftFolderId: string;
  draftEntryDate: string;
  draftEntryTime: string;
  createdAt: string;
  updatedAt: string;
  onClose: () => void;
  onNoteTitleChange: (title: string) => void;
  onFolderChange: (folderId: string) => void;
  onEntryDateChange: (entryDate: string) => void;
  onEntryTimeChange: (entryTime: string) => void;
}) {
  return (
    <div className="absolute top-full right-0 z-40 mt-2 w-full rounded-lg border border-border bg-popover p-4 shadow-xl sm:max-w-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground">Settings</p>
          <h2 className="text-lg font-bold text-foreground">
            {draftNoteTitle.trim() || "Untitled note"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close settings"
          title="Close settings"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="mb-4 block space-y-1">
        <span className="text-[10px] font-bold uppercase text-muted-foreground">Note name</span>
        <input
          value={draftNoteTitle}
          onChange={(event) => onNoteTitleChange(event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          placeholder="Journal"
        />
      </label>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Page date</span>
          <input
            type="date"
            value={draftEntryDate}
            onChange={(event) => onEntryDateChange(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Page time</span>
          <input
            type="time"
            value={draftEntryTime}
            onChange={(event) => onEntryTimeChange(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      </div>

      <div className="mb-4">
        <p className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">Folder</p>
        <FolderPicker folders={folders} value={draftFolderId} onChange={onFolderChange} />
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span>Created {format(parseISO(createdAt), "MMM d, h:mm a")}</span>
        <span>Updated {format(parseISO(updatedAt), "MMM d, h:mm a")}</span>
      </div>
    </div>
  );
}

function FolderPicker({
  folders,
  value,
  onChange,
}: {
  folders: JournalFolderRow[];
  value: string;
  onChange: (folderId: string) => void;
}) {
  const options = [{ id: "none", name: "Unfiled" }, ...folders];

  return (
    <div className="max-h-64 space-y-1 overflow-auto">
      {options.map((folder) => (
        <button
          key={folder.id}
          type="button"
          onClick={() => onChange(folder.id)}
          className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-medium ${
            value === folder.id
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-muted"
          }`}
        >
          <span className="min-w-0 truncate">{folder.name}</span>
          {value === folder.id && <CheckSquare className="h-4 w-4 shrink-0" />}
        </button>
      ))}
    </div>
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

function ToolbarFormatMenu({
  menu,
  onTextColor,
  onHighlightColor,
  onFontSize,
}: {
  menu: Exclude<FormatMenu, null>;
  onTextColor: (color: string) => void;
  onHighlightColor: (color: string) => void;
  onFontSize: (fontSize: string) => void;
}) {
  const colorOptions = menu === "textColor" ? TEXT_COLOR_OPTIONS : HIGHLIGHT_COLOR_OPTIONS;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-3">
      <div className="inline-flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-border bg-background px-2 py-2 shadow-lg">
        {menu === "fontSize"
          ? FONT_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onFontSize(option.value)}
                className="flex h-8 min-w-10 shrink-0 items-center justify-center rounded-full border border-border px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                aria-label={`${option.label}px text`}
                title={`${option.label}px text`}
              >
                {option.label}
              </button>
            ))
          : colorOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  menu === "textColor" ? onTextColor(option.value) : onHighlightColor(option.value)
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-transform hover:scale-105"
                aria-label={`${option.label} ${menu === "textColor" ? "text" : "highlight"}`}
                title={`${option.label} ${menu === "textColor" ? "text" : "highlight"}`}
              >
                <span
                  className="h-5 w-5 rounded-full border border-black/10"
                  style={{ backgroundColor: option.value }}
                  aria-hidden
                />
              </button>
            ))}
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

function sortJournalPages(pages: JournalNotePageRow[]) {
  return [...pages].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      parseISO(a.created_at).getTime() - parseISO(b.created_at).getTime(),
  );
}

function reorderJournalPages(pages: JournalNotePageRow[], pageId: string, direction: -1 | 1) {
  const ordered = sortJournalPages(pages);
  const pageIndex = ordered.findIndex((page) => page.id === pageId);
  const targetIndex = pageIndex + direction;
  if (pageIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return null;

  const reordered = [...ordered];
  [reordered[pageIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[pageIndex]];
  return reordered.map((page, sortOrder) => ({ ...page, sort_order: sortOrder }));
}

function notePreviewText(note: JournalNoteWithAttachments) {
  const page = note.pages.find((item) => item.heading || item.content_text);
  return page ? page.heading || page.content_text : note.content_text;
}

function notePageDateSummary(note: JournalNoteWithAttachments) {
  if (!note.pages.length) return formatEntryStamp(note);
  const dates = note.pages
    .map((page) => page.entry_date ?? note.entry_date)
    .filter(Boolean)
    .filter((date, index, all) => all.indexOf(date) === index)
    .sort();
  if (!dates.length) return formatEntryStamp(note);
  if (dates.length === 1) return formatPageStamp(note.pages[0]);
  const first = parseISO(`${dates[0]}T00:00:00`);
  const last = parseISO(`${dates[dates.length - 1]}T00:00:00`);
  return `${format(first, "MMM d")} - ${format(last, "MMM d")}`;
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
    .querySelectorAll(
      "[data-journal-attachment-id], [data-checklist-item], blockquote, ul, ol, h2, hr",
    )
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
        !["BLOCKQUOTE", "UL", "OL", "H2", "HR"].includes(nextElement.tagName) &&
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

function attachmentIdsFromPages(
  pages: JournalNotePageRow[],
  activePageId: string,
  activeHtml: string,
) {
  const ids = new Set<string>();
  if (!pages.length) {
    attachmentIdsFromHtml(activeHtml).forEach((id) => ids.add(id));
    return ids;
  }
  pages.forEach((page) => {
    attachmentIdsFromHtml(page.id === activePageId ? activeHtml : page.content_html).forEach((id) =>
      ids.add(id),
    );
  });
  return ids;
}

function noteTextFromPages(
  pages: JournalNotePageRow[],
  activePageId: string,
  activeText: string,
  activeHeading: string,
) {
  const texts = pages.length
    ? pages.map((page) => {
        const heading = page.id === activePageId ? activeHeading : page.heading;
        const content = page.id === activePageId ? activeText : page.content_text;
        return [heading, content].filter(Boolean).join(" ");
      })
    : [activeHeading, activeText];
  return texts.filter(Boolean).join(" · ");
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
      "[data-journal-attachment-id], [data-checklist-item], hr, img, video, audio, iframe",
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
  const date = parseISO(`${note.entry_date ?? todayISO()}T${normalizeTimeValue(note.entry_time)}`);
  return format(date, "MMM d, h:mm a");
}

function formatPageStamp(page: JournalNotePageRow) {
  const date = parseISO(`${page.entry_date ?? todayISO()}T${normalizeTimeValue(page.entry_time)}`);
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
