'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  Loader2,
  Plus,
  Search,
  Bold,
  Italic,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  CheckSquare,
  Minus,
  Image as ImageIcon,
  Save,
  FileText,
  Clock,
  Hash,
  List,
  X,
  Trash2,
  File,
  ChevronRight,
  ArrowLeftRight,
  GitFork,
  Calendar,
  Pencil,
  Bot
} from 'lucide-react';
import 'highlight.js/styles/github.css';
import GraphView from './GraphView';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import NoteAIPanel from '@/components/NoteAIPanel';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webContentLink?: string;
}

interface Frontmatter {
  tags: string[];
  title?: string;
  [key: string]: unknown;
}

interface OutlineItem {
  level: number;
  text: string;
  id: string;
}

interface WikiLinkEntry {
  sourceId: string;
  sourceName: string;
  targetName: string;
  alias?: string;
}

interface AutocompleteState {
  visible: boolean;
  query: string;
  triggerPos: number; // position of [[ in textarea
  suggestions: string[];
}

const parseFrontmatter = (content: string): { frontmatter: Frontmatter; body: string } => {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: { tags: [] }, body: content };
  }

  const fmString = match[1];
  const body = content.slice(match[0].length);
  const frontmatter: Frontmatter = { tags: [] };

  const lines = fmString.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (key === 'tags') {
      const tagMatch = value.match(/\[(.*)\]/);
      if (tagMatch) {
        frontmatter.tags = tagMatch[1].split(',').map((t: string) => t.trim().replace(/['"]/g, ''));
      }
    } else {
      (frontmatter as Record<string, unknown>)[key] = value.replace(/['"]/g, '');
    }
  }

  return { frontmatter, body };
};

const extractHashTags = (content: string): string[] => {
  const hashtagRegex = /#([a-zA-Z0-9_-]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = hashtagRegex.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    if (!tags.includes(tag) && tag.length > 1) {
      tags.push(tag);
    }
  }
  return tags;
};

const extractOutline = (content: string): OutlineItem[] => {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const outline: OutlineItem[] = [];
  let match;
  const body = content.replace(/^---[\s\S]*?---\n/, '');

  while ((match = headingRegex.exec(body)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    outline.push({ level, text, id });
  }

  return outline;
};

const countWords = (text: string): number => {
  const cleanText = text.replace(/```[\s\S]*?```/g, '').replace(/[#*`_~\[\]]/g, ' ');
  const words = cleanText.split(/\s+/).filter((w: string) => w.length > 0);
  return words.length;
};

const countCharacters = (text: string): number => {
  return text.replace(/\s/g, '').length;
};

export default function NotesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{id: string; name: string}[]>([]);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  // Phase 2: Link index
  const [linkIndex, setLinkIndex] = useState<WikiLinkEntry[]>([]);
  const [fileMap, setFileMap] = useState<Record<string, string>>({});
  const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
    visible: false, query: '', triggerPos: 0, suggestions: [],
  });
  const autocompleteRef = useRef<HTMLDivElement>(null);
  // Phase 3: Tag system
  const [tagIndex, setTagIndex] = useState<{tag: string; noteIds: string[]; frequency: number}[]>([]);
  const [noteTagMap, setNoteTagMap] = useState<Record<string, string[]>>({});
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  // Phase 5: Graph view
  const [showGraph, setShowGraph] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  // Phase 6: Template system
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<{id: string; name: string; content: string}[]>([]);
  const [newNoteName, setNewNoteName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  // Vault folder
  const [vaultFolderId, setVaultFolderId] = useState<string | null>(null);
  const [allVaultFiles, setAllVaultFiles] = useState<DriveFile[]>([]);
  // Context menu (right-click rename/delete)
  const [contextMenu, setContextMenu] = useState<{ fileId: string; fileName: string; x: number; y: number } | null>(null);
  // Drag-and-drop
  const [dragFileId, setDragFileId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // Recent files (localStorage)
  const [recentFileIds, setRecentFileIds] = useState<string[]>([]);
  // Pinned files (localStorage)
  const [pinnedFileIds, setPinnedFileIds] = useState<string[]>([]);
  // Phase 7: Quick capture
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [quickCaptureText, setQuickCaptureText] = useState('');
  // Phase 4: Full-text search
  const [fullSearchQuery, setFullSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{fileId: string; fileName: string; snippet: string; matchType: string; matchCount: number}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [frontmatter, setFrontmatter] = useState<Frontmatter>({ tags: [] });
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [syncScroll, setSyncScroll] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const outlineRefs = useRef<Record<string, HTMLElement | null>>({});

  // Load recent/pinned from localStorage
  useEffect(() => {
    try {
      const r = localStorage.getItem('notes_recent');
      if (r) setRecentFileIds(JSON.parse(r));
      const p = localStorage.getItem('notes_pinned');
      if (p) setPinnedFileIds(JSON.parse(p));
    } catch {}
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const fetchFiles = useCallback(async (folderId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = folderId ? `/api/drive/files?folderId=${folderId}` : '/api/drive/files';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch files');
      const data = await response.json();
      const all: DriveFile[] = data.files || [];
      setFolders(all.filter(f => f.mimeType === 'application/vnd.google-apps.folder'));
      setFiles(all.filter(f => f.name.endsWith('.md')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;

    // Resolve OBSIDIANVAULT folder ID first, then load everything
    fetch('/api/drive/files?folderId=root')
      .then(r => r.json())
      .then(d => {
        const vaultFolder = (d.files || []).find(
          (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder' && f.name.toLowerCase() === 'obsidianvault'
        );
        const fid = vaultFolder?.id ?? undefined;
        if (fid) {
          setVaultFolderId(fid);
          setCurrentFolderId(fid);
          setFolderPath([{ id: fid, name: vaultFolder!.name }]);
          localStorage.setItem('vault-folder-id', fid);
        }
        fetchFiles(fid);

        const qs = fid ? `?folderId=${fid}` : '';
        fetch(`/api/notes/links${qs}`)
          .then(r => r.json())
          .then(d => {
            if (d.links) setLinkIndex(d.links);
            if (d.fileMap) setFileMap(d.fileMap);
          })
          .catch(() => {});
        fetch(`/api/notes/tags${qs}`)
          .then(r => r.json())
          .then(d => {
            if (d.tagIndex) setTagIndex(d.tagIndex);
            if (d.noteTagMap) setNoteTagMap(d.noteTagMap);
          })
          .catch(() => {});
        // Load ALL vault files recursively for graph view
        if (fid) {
          fetch(`/api/notes/all-files?folderId=${fid}`)
            .then(r => r.json())
            .then(d => { if (d.files) setAllVaultFiles(d.files); })
            .catch(() => {});
        }
      })
      .catch(() => {
        fetchFiles();
      });
  }, [session, fetchFiles]);

  const fetchFileContent = useCallback(async (fileId: string) => {
    setIsLoadingContent(true);
    try {
      const response = await fetch(`/api/drive/content?fileId=${fileId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch content');
      }
      const data = await response.json();
      const fileContent = data.content || '';
      setContent(fileContent);
      setOriginalContent(fileContent);
      setIsDirty(false);

      const { frontmatter: fm } = parseFrontmatter(fileContent);
      const hashTags = extractHashTags(fileContent);
      setFrontmatter({ ...fm, tags: fm.tags.length > 0 ? fm.tags : hashTags });
      setOutline(extractOutline(fileContent));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content');
    } finally {
      setIsLoadingContent(false);
    }
  }, []);

  const handleSelectFile = useCallback(
    (file: DriveFile) => {
      const doSelect = () => {
        setSelectedFile(file);
        fetchFileContent(file.id);
        setRecentFileIds(prev => {
          const next = [file.id, ...prev.filter(id => id !== file.id)].slice(0, 8);
          try { localStorage.setItem('notes_recent', JSON.stringify(next)); } catch {}
          return next;
        });
      };
      if (isDirty && selectedFile) {
        if (confirm('저장되지 않은 변경사항이 있습니다. 버리시겠습니까?')) doSelect();
      } else {
        doSelect();
      }
    },
    [isDirty, selectedFile, fetchFileContent]
  );

  const togglePin = useCallback((fileId: string) => {
    setPinnedFileIds(prev => {
      const next = prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId];
      try { localStorage.setItem('notes_pinned', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleCreateFile = async () => {
    const fileName = prompt('Enter note name:', 'Untitled');
    if (!fileName) return;

    const fullName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;

    try {
      const blob = new Blob([''], { type: 'text/markdown' });
      const formData = new FormData();
      formData.append('file', blob, fullName);
      formData.append('mimeType', 'text/markdown');

      const response = await fetch('/api/drive/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to create file');
      }

      await fetchFiles(vaultFolderId ?? undefined);
      const data = await response.json();
      if (data.file) {
        setSelectedFile(data.file);
        setContent('');
        setOriginalContent('');
        setIsDirty(false);
        setFrontmatter({ tags: [] });
        setOutline([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create file');
    }
  };

  const handleMoveFile = useCallback(async (fileId: string, targetFolderId: string) => {
    try {
      const res = await fetch('/api/drive/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, targetFolderId, currentFolderId }),
      });
      if (!res.ok) throw new Error('Move failed');
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch { setError('파일 이동 실패'); }
  }, [currentFolderId]);

  const handleRename = useCallback(async (fileId: string, newName: string) => {
    try {
      const res = await fetch('/api/drive/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, name: newName }),
      });
      if (!res.ok) throw new Error('Rename failed');
      const { file: renamed } = await res.json();
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: renamed.name } : f));
      if (selectedFile?.id === fileId) setSelectedFile(prev => prev ? { ...prev, name: renamed.name } : null);
    } catch { setError('이름 변경 실패'); }
  }, [selectedFile]);

  const handleDelete = useCallback(async (fileId: string) => {
    try {
      const res = await fetch('/api/drive/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      if (!res.ok) throw new Error('Delete failed');
      setFiles(prev => prev.filter(f => f.id !== fileId));
      if (selectedFile?.id === fileId) { setSelectedFile(null); setContent(''); }
    } catch { setError('삭제 실패'); }
  }, [selectedFile]);

  // Daily note
  const todayFileName = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.md`;
  }, []);

  const handleDailyNote = useCallback(async () => {
    const existing = files.find(f => f.name === todayFileName);
    if (existing) { handleSelectFile(existing); return; }
    const fid = currentFolderId ?? vaultFolderId;
    if (!fid) return;
    const blob = new Blob([`# ${todayFileName.replace('.md','')}\n\n`], { type: 'text/markdown' });
    const fd = new FormData();
    fd.append('file', blob, todayFileName);
    fd.append('folderId', fid);
    try {
      const res = await fetch('/api/drive/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.file) {
        await fetchFiles(currentFolderId ?? vaultFolderId ?? undefined);
        handleSelectFile(data.file);
      }
    } catch { setError('데일리 노트 생성 실패'); }
  }, [files, todayFileName, currentFolderId, vaultFolderId, fetchFiles]);

  const handleSave = useCallback(async () => {
    if (!selectedFile || !isDirty) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/drive/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: selectedFile.id,
          content,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      setOriginalContent(content);
      setIsDirty(false);
      setLastSaved(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, isDirty, content]);

  const handleDeleteSelected = async () => {
    if (!selectedFile) return;
    if (!confirm(`Delete "${selectedFile.name}"?`)) return;

    try {
      const response = await fetch('/api/drive/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: selectedFile.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete');
      }

      setSelectedFile(null);
      setContent('');
      setOriginalContent('');
      setIsDirty(false);
      setFrontmatter({ tags: [] });
      setOutline([]);
      await fetchFiles(vaultFolderId ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Phase 7: Quick capture Ctrl+Shift+N
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
        e.preventDefault();
        setQuickCaptureText('');
        setShowQuickCapture(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  useEffect(() => {
    setIsDirty(content !== originalContent);
  }, [content, originalContent]);

  const filteredFiles = useMemo(() => {
    let result = files;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((file) => file.name.toLowerCase().includes(query));
    }
    // Phase 3: tag filter
    if (activeTagFilter) {
      result = result.filter((file) => {
        const tags = noteTagMap[file.id] || [];
        return tags.includes(activeTagFilter);
      });
    }
    return result;
  }, [files, searchQuery, activeTagFilter, noteTagMap]);

  const insertText = useCallback(
    (before: string, after: string = '', placeholder: string = '') => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = content.substring(start, end) || placeholder;
      const newText =
        content.substring(0, start) +
        before +
        selectedText +
        after +
        content.substring(end);

      setContent(newText);

      setTimeout(() => {
        textarea.focus();
        const newCursorPos = start + before.length + selectedText.length;
        textarea.setSelectionRange(
          start + before.length,
          newCursorPos
        );
      }, 0);
    },
    [content]
  );

  const handleToolbarAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'bold':
          insertText('**', '**', 'bold text');
          break;
        case 'italic':
          insertText('*', '*', 'italic text');
          break;
        case 'code':
          insertText('`', '`', 'code');
          break;
        case 'codeblock':
          insertText('```\n', '\n```', 'code here');
          break;
        case 'h1':
          insertAtLineStart('# ');
          break;
        case 'h2':
          insertAtLineStart('## ');
          break;
        case 'h3':
          insertAtLineStart('### ');
          break;
        case 'link':
          insertText('[', '](url)', 'link text');
          break;
        case 'checkbox':
          insertAtLineStart('- [ ] ');
          break;
        case 'divider':
          insertText('\n---\n');
          break;
        case 'image':
          insertText('![', '](url)', 'alt text');
          break;
      }
    },
    [insertText]
  );

  const insertAtLineStart = useCallback(
    (prefix: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const lineStart = content.lastIndexOf('\n', start - 1) + 1;
      const newText =
        content.substring(0, lineStart) + prefix + content.substring(lineStart);

      setContent(newText);
    },
    [content]
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLTextAreaElement> | React.UIEvent<HTMLDivElement>) => {
      if (!syncScroll) return;

      const target = e.currentTarget;
      const scrollPercentage = target.scrollTop / (target.scrollHeight - target.clientHeight);

      if (target === textareaRef.current && previewRef.current) {
        previewRef.current.scrollTop =
          scrollPercentage * (previewRef.current.scrollHeight - previewRef.current.clientHeight);
      }
    },
    [syncScroll]
  );

  const scrollToHeading = (id: string) => {
    const element = outlineRefs.current[id];
    if (element && previewRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Phase 2: autocomplete selection
  const selectAutocomplete = useCallback((name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { triggerPos } = autocomplete;
    const before = content.slice(0, triggerPos);
    const after = content.slice(textarea.selectionStart);
    const inserted = `[[${name}]]`;
    setContent(before + inserted + after);
    setAutocomplete(prev => ({ ...prev, visible: false }));
    setTimeout(() => {
      textarea.focus();
      const pos = triggerPos + inserted.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  }, [autocomplete, content]);

  // Phase 2: backlinks for current note
  const backlinks = useMemo(() => {
    if (!selectedFile) return [];
    const currentName = selectedFile.name.replace(/\.md$/, '');
    return linkIndex
      .filter(l => l.targetName === currentName)
      .map(l => ({ id: l.sourceId, name: l.sourceName }))
      .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i); // dedupe
  }, [selectedFile, linkIndex]);

  // Phase 2: outbound link count
  const outboundLinks = useMemo(() => {
    const matches = content.match(/\[\[[^\]]+\]\]/g) || [];
    return matches.length;
  }, [content]);

  // Phase 4: debounced full-text search
  const runFullSearch = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); setShowSearchResults(false); return; }
    setIsSearching(true);
    setShowSearchResults(true);
    fetch(`/api/notes/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => { setSearchResults(d.results || []); })
      .catch(() => {})
      .finally(() => setIsSearching(false));
  }, []);

  const wordCount = useMemo(() => countWords(content), [content]);
  const charCount = useMemo(() => countCharacters(content), [content]);

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="h-12 w-12 animate-spin text-black" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b-4 border-black bg-[#FFE500] p-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black uppercase tracking-tight text-black">
            Notes
          </h1>
          <button
            onClick={() => {
              setNewNoteName('');
              setSelectedTemplate(null);
              setShowTemplateModal(true);
              // Load templates lazily
              if (templates.length === 0) {
                fetch('/api/notes/templates').then(r => r.json()).then(d => { if (d.templates) setTemplates(d.templates); }).catch(() => {});
              }
            }}
            style={{ color: '#fff' }}
            className="flex items-center gap-2 border-4 border-black bg-black px-4 py-2 font-black shadow-[4px_4px_0_black] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_black] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          >
            <Plus className="h-4 w-4" />
            New Note
          </button>
          <button
            onClick={handleDailyNote}
            className="flex items-center gap-2 border-4 border-black bg-[#69DB7C] px-4 py-2 font-black text-black shadow-[4px_4px_0_black] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_black]"
            title="오늘의 노트"
          >
            <Calendar className="h-4 w-4" />
            오늘
          </button>
          <button
            onClick={() => setShowGraph(true)}
            className="flex items-center gap-2 border-4 border-black bg-[#B197FC] px-4 py-2 font-black text-black shadow-[4px_4px_0_black] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_black]"
            title="그래프 뷰"
          >
            <GitFork className="h-4 w-4" />
            그래프
          </button>
          <button
            onClick={() => setShowAIPanel(p => !p)}
            className={`flex items-center gap-2 border-4 border-black px-4 py-2 font-black text-black shadow-[4px_4px_0_black] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_black] ${showAIPanel ? 'bg-[#FFE500]' : 'bg-white'}`}
            title="AI 어시스턴트"
          >
            <Bot className="h-4 w-4" />
            AI
          </button>
        </div>

        {/* Phase 4: Full-text search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="전문 검색... (내용 포함)"
            value={fullSearchQuery}
            onChange={(e) => {
              const v = e.target.value;
              setFullSearchQuery(v);
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => runFullSearch(v), 400);
            }}
            onKeyDown={(e) => e.key === 'Escape' && setShowSearchResults(false)}
            className="w-80 border-4 border-black py-2 pl-10 pr-4 font-medium shadow-[4px_4px_0_black] placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />
          {/* Search Results Dropdown */}
          {showSearchResults && (
            <div className="absolute right-0 top-full z-50 mt-1 w-[480px] border-4 border-black bg-white shadow-[6px_6px_0_black]">
              <div className="flex items-center justify-between border-b-2 border-black bg-[#FFE500] px-3 py-2">
                <span className="text-xs font-black">검색 결과 {searchResults.length}개</span>
                <button onClick={() => setShowSearchResults(false)}><X className="h-4 w-4" /></button>
              </div>
              {isSearching ? (
                <div className="flex items-center justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : searchResults.length === 0 ? (
                <p className="p-4 text-sm text-gray-400">결과 없음</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {searchResults.map((r) => (
                    <button
                      key={r.fileId}
                      onClick={() => {
                        const f = files.find(f => f.id === r.fileId);
                        if (f) { handleSelectFile(f); setShowSearchResults(false); setFullSearchQuery(''); }
                      }}
                      className="flex w-full flex-col gap-1 border-b border-gray-100 px-3 py-2 text-left hover:bg-[#FFE500]"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 shrink-0 text-[#B197FC]" />
                        <span className="text-sm font-black text-black">{r.fileName}</span>
                        <span className={`ml-auto text-xs font-bold border px-1 ${r.matchType === 'both' ? 'border-black bg-[#FFE500]' : r.matchType === 'filename' ? 'border-gray-300' : 'border-[#B197FC] bg-[#B197FC]/20'}`}>
                          {r.matchType === 'both' ? '파일명+내용' : r.matchType === 'filename' ? '파일명' : `내용 ${r.matchCount}회`}
                        </span>
                      </div>
                      {r.snippet && <p className="text-xs text-gray-500 line-clamp-2">{r.snippet}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - File List */}
        <aside className="w-60 shrink-0 border-r-4 border-black bg-gray-50">
          <div className="flex h-full flex-col">
            <div className="border-b-4 border-black bg-gray-100 px-3 py-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wide text-black">
                Files ({filteredFiles.length})
              </h2>
              <button
                title="새 폴더"
                onClick={async () => {
                  const name = prompt('폴더 이름:');
                  if (!name?.trim()) return;
                  try {
                    const res = await fetch('/api/drive/create-folder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: name.trim(), parentId: currentFolderId }),
                    });
                    if (res.ok) fetchFiles(currentFolderId ?? vaultFolderId ?? undefined);
                  } catch { setError('폴더 생성 실패'); }
                }}
                className="border-2 border-black bg-white px-1.5 py-0.5 text-xs font-black hover:bg-[#FFE500] transition-all"
              >
                + 폴더
              </button>
            </div>

            {/* Breadcrumb */}
            {folderPath.length > 0 && (
              <div className="flex items-center gap-1 border-b-2 border-black bg-white px-2 py-1.5 overflow-x-auto">
                <button
                  onClick={() => {
                    const vid = vaultFolderId ?? undefined;
                    setCurrentFolderId(vid ?? null);
                    setFolderPath(vid ? [{ id: vid, name: folderPath[0].name }] : []);
                    fetchFiles(vid);
                  }}
                  className="text-xs font-bold text-gray-500 hover:text-black shrink-0"
                >
                  ~
                </button>
                {folderPath.slice(1).map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="h-3 w-3 text-gray-400" />
                    <button
                      onClick={() => {
                        const idx = folderPath.findIndex(x => x.id === p.id);
                        const newPath = folderPath.slice(0, idx + 1);
                        setFolderPath(newPath);
                        setCurrentFolderId(p.id);
                        fetchFiles(p.id);
                      }}
                      className="text-xs font-bold text-gray-500 hover:text-black max-w-[60px] truncate"
                    >
                      {p.name}
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-black" />
                </div>
              ) : error ? (
                <div className="p-4">
                  <div className="rounded-lg border-4 border-red-500 bg-red-100 p-3">
                    <p className="text-sm font-bold text-red-700">{error}</p>
                    <button
                      onClick={() => fetchFiles(vaultFolderId ?? undefined)}
                      className="mt-2 text-xs font-bold text-red-600 underline"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="p-2">
                  {/* Pinned notes */}
                  {pinnedFileIds.length > 0 && files.some(f => pinnedFileIds.includes(f.id)) && (
                    <>
                      <li className="px-2 pt-2 pb-1">
                        <span className="text-xs font-black uppercase text-gray-400">📌 고정</span>
                      </li>
                      {files.filter(f => pinnedFileIds.includes(f.id)).map(file => (
                        <li key={`pin-${file.id}`}>
                          <button
                            onClick={() => handleSelectFile(file)}
                            className={`mb-1 flex w-full items-center gap-2 border-2 px-3 py-1.5 text-left transition-all ${
                              selectedFile?.id === file.id ? 'border-black bg-[#FFE500]' : 'border-transparent bg-yellow-50 hover:border-black'
                            }`}
                          >
                            <span className="text-xs">📌</span>
                            <span className="truncate text-xs font-bold text-black">{file.name.replace('.md','')}</span>
                          </button>
                        </li>
                      ))}
                      <li className="border-b-2 border-gray-200 mb-1" />
                    </>
                  )}
                  {/* Recent files */}
                  {recentFileIds.length > 0 && files.some(f => recentFileIds.includes(f.id)) && !pinnedFileIds.length && (
                    <>
                      <li className="px-2 pt-2 pb-1">
                        <span className="text-xs font-black uppercase text-gray-400">🕐 최근</span>
                      </li>
                      {recentFileIds.slice(0,3).map(id => {
                        const file = files.find(f => f.id === id);
                        if (!file) return null;
                        return (
                          <li key={`recent-${file.id}`}>
                            <button
                              onClick={() => handleSelectFile(file)}
                              className={`mb-1 flex w-full items-center gap-2 border-2 px-3 py-1.5 text-left transition-all ${
                                selectedFile?.id === file.id ? 'border-black bg-[#FFE500]' : 'border-transparent bg-gray-50 hover:border-black'
                              }`}
                            >
                              <span className="text-xs">🕐</span>
                              <span className="truncate text-xs font-bold text-black">{file.name.replace('.md','')}</span>
                            </button>
                          </li>
                        );
                      })}
                      <li className="border-b-2 border-gray-200 mb-1" />
                    </>
                  )}
                  {/* Folders first (drop targets) */}
                  {folders.map((folder) => (
                    <li key={folder.id}>
                      <button
                        onClick={() => {
                          setCurrentFolderId(folder.id);
                          setFolderPath(prev => [...prev, { id: folder.id, name: folder.name }]);
                          fetchFiles(folder.id);
                        }}
                        onDragOver={(e) => { e.preventDefault(); setDropTargetId(folder.id); }}
                        onDragLeave={() => setDropTargetId(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDropTargetId(null);
                          if (dragFileId && dragFileId !== folder.id) {
                            handleMoveFile(dragFileId, folder.id);
                            setDragFileId(null);
                          }
                        }}
                        className={`mb-1 flex w-full items-center gap-2 border-2 px-3 py-2 text-left transition-all ${
                          dropTargetId === folder.id
                            ? 'border-black bg-[#FFE500] shadow-[2px_2px_0_black]'
                            : 'border-transparent bg-gray-100 hover:border-black hover:bg-[#FFE500]'
                        }`}
                      >
                        <ChevronRight className="h-3 w-3 shrink-0 text-gray-500" />
                        <span className="truncate text-sm font-bold text-black">{folder.name}</span>
                      </button>
                    </li>
                  ))}
                  {/* .md files */}
                  {filteredFiles.length === 0 && folders.length === 0 ? (
                    <li className="p-4 text-center">
                      <File className="mx-auto h-12 w-12 text-gray-300" />
                      <p className="mt-2 text-sm font-medium text-gray-500">
                        {searchQuery ? 'No files found' : 'No notes yet'}
                      </p>
                    </li>
                  ) : (
                    filteredFiles.map((file) => (
                      <li key={file.id}>
                        <button
                          draggable
                          onDragStart={() => setDragFileId(file.id)}
                          onDragEnd={() => { setDragFileId(null); setDropTargetId(null); }}
                          onClick={() => handleSelectFile(file)}
                          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ fileId: file.id, fileName: file.name, x: e.clientX, y: e.clientY }); }}
                          className={`mb-1 flex w-full items-start gap-2 border-4 p-3 text-left transition-all ${
                            dragFileId === file.id ? 'opacity-50 ' : ''
                          }${
                            selectedFile?.id === file.id
                              ? 'border-black bg-[#FFE500] shadow-[2px_2px_0_black]'
                              : 'border-transparent bg-white shadow-[2px_2px_0_black] hover:border-black'
                          }`}
                        >
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#B197FC]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-black">
                              {file.name.replace('.md', '')}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDate(file.modifiedTime)}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            {/* New Note in current folder */}
            <div className="border-t-2 border-black p-2">
              <button
                onClick={() => {
                  setNewNoteName('');
                  setSelectedTemplate(null);
                  setShowTemplateModal(true);
                  if (templates.length === 0) {
                    fetch('/api/notes/templates').then(r => r.json()).then(d => { if (d.templates) setTemplates(d.templates); }).catch(() => {});
                  }
                }}
                className="flex w-full items-center justify-center gap-2 border-2 border-black bg-[#FFE500] py-2 font-black text-xs text-black hover:bg-black hover:text-white transition-all"
              >
                <Plus className="h-3 w-3" />
                {currentFolderId && currentFolderId !== vaultFolderId ? '이 폴더에 추가' : '새 노트'}
              </button>
            </div>

            {/* Phase 3: Tag Filter */}
            {tagIndex.length > 0 && (
              <div className="border-t-4 border-black">
                <div className="border-b-2 border-black bg-gray-100 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-gray-600">태그 필터</span>
                    {activeTagFilter && (
                      <button onClick={() => setActiveTagFilter(null)} className="text-xs font-bold text-gray-400 hover:text-black">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 p-2">
                  {tagIndex.slice(0, 12).map(({ tag, frequency }) => (
                    <button
                      key={tag}
                      onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                      className={`border-2 border-black px-2 py-0.5 text-xs font-bold transition-all ${
                        activeTagFilter === tag
                          ? 'bg-[#B197FC] text-black shadow-[2px_2px_0_black]'
                          : 'bg-white text-black hover:bg-[#B197FC]'
                      }`}
                    >
                      #{tag} <span className="opacity-60">{frequency}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Panel - Editor */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {selectedFile ? (
            <>
              {/* Toolbar */}
              <div className="shrink-0 border-b-4 border-black bg-gray-100 p-2">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={() => handleToolbarAction('bold')}
                    className="rounded border-2 border-black bg-white p-2 font-bold shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Bold (Ctrl+B)"
                  >
                    <Bold className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToolbarAction('italic')}
                    className="rounded border-2 border-black bg-white p-2 font-bold italic shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Italic (Ctrl+I)"
                  >
                    <Italic className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToolbarAction('code')}
                    className="rounded border-2 border-black bg-white p-2 font-mono text-sm shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Inline Code"
                  >
                    <Code className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToolbarAction('codeblock')}
                    className="rounded border-2 border-black bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Code Block"
                  >
                    <FileCode className="h-4 w-4" />
                  </button>

                  <div className="mx-2 h-6 w-px bg-black" />

                  <button
                    onClick={() => handleToolbarAction('h1')}
                    className="rounded border-2 border-black bg-white p-2 font-bold shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Heading 1"
                  >
                    <Heading1 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToolbarAction('h2')}
                    className="rounded border-2 border-black bg-white p-2 font-bold shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Heading 2"
                  >
                    <Heading2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToolbarAction('h3')}
                    className="rounded border-2 border-black bg-white p-2 font-bold shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Heading 3"
                  >
                    <Heading3 className="h-4 w-4" />
                  </button>

                  <div className="mx-2 h-6 w-px bg-black" />

                  <button
                    onClick={() => handleToolbarAction('link')}
                    className="rounded border-2 border-black bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Insert Link"
                  >
                    <LinkIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToolbarAction('image')}
                    className="rounded border-2 border-black bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Insert Image"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToolbarAction('checkbox')}
                    className="rounded border-2 border-black bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Checkbox"
                  >
                    <CheckSquare className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToolbarAction('divider')}
                    className="rounded border-2 border-black bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_black] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    title="Horizontal Rule"
                  >
                    <Minus className="h-4 w-4" />
                  </button>

                  <div className="ml-auto flex items-center gap-2">
                    {/* View Toggle */}
                    <div className="flex rounded border-2 border-black shadow-[2px_2px_0_black]">
                      <button
                        onClick={() => setActiveTab('edit')}
                        className={`px-3 py-1 text-sm font-bold transition-all ${
                          activeTab === 'edit'
                            ? 'bg-black text-white'
                            : 'bg-white text-black hover:bg-gray-100'
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setActiveTab('preview')}
                        className={`px-3 py-1 text-sm font-bold transition-all ${
                          activeTab === 'preview'
                            ? 'bg-black text-white'
                            : 'bg-white text-black hover:bg-gray-100'
                        }`}
                      >
                        Preview
                      </button>
                    </div>

                    {/* Save Status */}
                    <span className="text-xs font-bold text-gray-500">
                      {isDirty ? (
                        <span className="text-orange-600">수정됨</span>
                      ) : (
                        <span className="text-green-600">저장됨</span>
                      )}
                    </span>

                    {/* Save Button */}
                    <button
                      onClick={handleSave}
                      disabled={!isDirty || isSaving}
                      className={`flex items-center gap-2 border-4 px-4 py-2 font-black transition-all ${
                        isDirty
                          ? 'border-black bg-[#69DB7C] text-black shadow-[4px_4px_0_black] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_black] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none'
                          : 'border-gray-300 bg-gray-100 text-gray-400'
                      }`}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save
                    </button>

                    {/* Export Button */}
                    {selectedFile && (
                      <a
                        href={`/api/notes/export?fileId=${selectedFile.id}&format=md`}
                        download
                        className="rounded border-4 border-black bg-[#74C0FC] p-2 text-black shadow-[4px_4px_0_black] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_black]"
                        title="MD로 내보내기"
                      >
                        ↓
                      </a>
                    )}
                    {/* Delete Button */}
                    <button
                      onClick={handleDeleteSelected}
                      className="rounded border-4 border-red-500 bg-red-100 p-2 text-red-600 shadow-[4px_4px_0_black] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_black] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
                      title="Delete Note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Editor Area */}
              <div className="flex flex-1 overflow-hidden">
                {activeTab === 'edit' ? (
                  <div className="flex h-full w-full">
                    {/* Textarea + Autocomplete */}
                    <div className="relative flex-1 border-r-4 border-black">
                      {/* Wiki link autocomplete dropdown */}
                      {autocomplete.visible && (
                        <div ref={autocompleteRef} className="absolute left-4 top-4 z-50 w-64 border-4 border-black bg-white shadow-[4px_4px_0_black]">
                          <div className="border-b-2 border-black bg-[#B197FC] px-3 py-1.5 text-xs font-black">
                            노트 링크 삽입
                          </div>
                          {autocomplete.suggestions.map((name) => (
                            <button
                              key={name}
                              onMouseDown={(e) => { e.preventDefault(); selectAutocomplete(name); }}
                              className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm font-bold text-black hover:bg-[#FFE500]"
                            >
                              <FileText className="h-3 w-3 shrink-0 text-[#B197FC]" />
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => {
                          const val = e.target.value;
                          setContent(val);
                          // Wiki link autocomplete: detect [[
                          const pos = e.target.selectionStart ?? 0;
                          const textBefore = val.slice(0, pos);
                          const bracketIdx = textBefore.lastIndexOf('[[');
                          if (bracketIdx !== -1 && !textBefore.slice(bracketIdx).includes(']]')) {
                            const query = textBefore.slice(bracketIdx + 2);
                            const allNames = Object.keys(fileMap);
                            const suggestions = query
                              ? allNames.filter(n => n.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
                              : allNames.slice(0, 8);
                            setAutocomplete({ visible: suggestions.length > 0, query, triggerPos: bracketIdx, suggestions });
                          } else {
                            setAutocomplete(prev => ({ ...prev, visible: false }));
                          }
                        }}
                        onScroll={handleScroll}
                        placeholder="Start writing your note..."
                        className="h-full w-full resize-none border-0 p-4 font-mono text-sm outline-none"
                        spellCheck={false}
                      />
                    </div>

                    {/* Preview */}
                    <div
                      ref={previewRef}
                      className="h-full flex-1 overflow-y-auto bg-white p-4"
                      onScroll={handleScroll}
                    >
                      <div className="prose max-w-none">
                        <MarkdownRenderer content={content} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full w-full overflow-y-auto bg-white p-6">
                    <div className="prose max-w-none rounded-lg border-4 border-black p-6 shadow-[4px_4px_0_black]">
                      <MarkdownRenderer content={content} />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer - Character Count */}
              <div className="shrink-0 border-t-4 border-black bg-gray-100 p-2">
                <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                  <span>{selectedFile.name}</span>
                  <span>
                    {wordCount} words | {charCount} chars | {content.length} total
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <FileText className="mx-auto h-24 w-24 text-gray-200" />
                <h2 className="mt-4 text-xl font-bold text-gray-400">
                  Select a note to start editing
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  Or create a new note to get started
                </p>
                <button
                  onClick={handleCreateFile}
                  className="mt-6 flex items-center gap-2 border-4 border-black bg-[#FFE500] px-6 py-3 font-black text-black shadow-[4px_4px_0_black] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_black] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
                >
                  <Plus className="h-5 w-5" />
                  New Note
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right Panel - Metadata */}
        <aside className="w-56 shrink-0 border-l-4 border-black bg-gray-50">
          <div className="flex h-full flex-col">
            <div className="border-b-4 border-black bg-gray-100 p-3">
              <h2 className="text-sm font-black uppercase tracking-wide text-black">
                Metadata
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {selectedFile ? (
                <div className="space-y-4">
                  {/* Tags */}
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Hash className="h-4 w-4 text-[#B197FC]" />
                      <h3 className="text-xs font-black uppercase tracking-wide text-gray-600">
                        Tags
                      </h3>
                    </div>
                    {frontmatter.tags && frontmatter.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {frontmatter.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="rounded border-2 border-black bg-[#B197FC] px-2 py-0.5 text-xs font-bold text-black"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No tags found</p>
                    )}
                  </div>

                  {/* Backlinks */}
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4 text-[#B197FC]" />
                      <h3 className="text-xs font-black uppercase tracking-wide text-gray-600">
                        백링크 ({backlinks.length})
                      </h3>
                    </div>
                    {backlinks.length > 0 ? (
                      <div className="space-y-1">
                        {backlinks.map((bl) => (
                          <button
                            key={bl.id}
                            onClick={() => {
                              const f = files.find(f => f.id === bl.id);
                              if (f) handleSelectFile(f);
                            }}
                            className="flex w-full items-center gap-1 border-2 border-black bg-white px-2 py-1 text-left text-xs font-bold text-black hover:bg-[#FFE500] transition-all"
                          >
                            <FileText className="h-3 w-3 shrink-0 text-[#B197FC]" />
                            <span className="truncate">{bl.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">이 노트를 참조하는 노트 없음</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">→ 링크 {outboundLinks}개</p>
                  </div>

                  {/* Stats */}
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <List className="h-4 w-4 text-[#B197FC]" />
                      <h3 className="text-xs font-black uppercase tracking-wide text-gray-600">
                        Statistics
                      </h3>
                    </div>
                    <div className="space-y-1 text-xs font-bold text-gray-600">
                      <div className="flex justify-between border border-gray-200 px-2 py-1">
                        <span>단어</span><span className="font-black">{wordCount}</span>
                      </div>
                      <div className="flex justify-between border border-gray-200 px-2 py-1">
                        <span>글자</span><span className="font-black">{charCount}</span>
                      </div>
                      {lastSaved && (
                        <div className="flex items-center gap-1 border border-gray-200 px-2 py-1">
                          <Clock className="h-3 w-3" />
                          <span className="text-[10px]">{lastSaved.toLocaleTimeString('ko-KR')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Outline */}
                  {outline.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <List className="h-4 w-4 text-[#B197FC]" />
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-600">목차</h3>
                      </div>
                      <div className="space-y-1">
                        {outline.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => scrollToHeading(item.id)}
                            className="flex w-full items-start text-left text-xs font-bold text-gray-600 hover:text-black"
                            style={{ paddingLeft: `${(item.level - 1) * 8}px` }}
                          >
                            <ChevronRight className="mr-1 h-3 w-3 shrink-0 mt-0.5" />
                            <span className="truncate">{item.text}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 text-center">
                  <p className="text-xs text-gray-400">노트를 선택하면<br />메타데이터가 표시됩니다</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Phase 7: Quick Capture (Ctrl+Shift+N) */}
      {showQuickCapture && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60">
          <div className="w-full max-w-lg border-4 border-black bg-white shadow-[8px_8px_0_black]">
            <div className="flex items-center justify-between border-b-4 border-black bg-[#69DB7C] px-4 py-3">
              <span className="font-black uppercase">빠른 메모 (Ctrl+Shift+N)</span>
              <button onClick={() => setShowQuickCapture(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4">
              <textarea
                autoFocus
                value={quickCaptureText}
                onChange={e => setQuickCaptureText(e.target.value)}
                placeholder="메모를 입력하세요... (Enter+Shift로 줄바꿈)"
                className="w-full resize-none border-4 border-black p-3 font-mono text-sm outline-none"
                rows={5}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const text = quickCaptureText.trim();
                    if (!text) return;
                    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    const fname = `QuickNote-${ts}.md`;
                    const blob = new Blob([text], { type: 'text/markdown' });
                    const fd = new FormData();
                    fd.append('file', blob, fname);
                    await fetch('/api/drive/upload', { method: 'POST', body: fd });
                    await fetchFiles(vaultFolderId ?? undefined);
                    setShowQuickCapture(false);
                    setQuickCaptureText('');
                  }
                  if (e.key === 'Escape') setShowQuickCapture(false);
                }}
              />
              <p className="mt-1 text-xs text-gray-400">Enter로 저장 · Shift+Enter 줄바꿈 · Esc 닫기</p>
            </div>
          </div>
        </div>
      )}

      {/* Phase 6: Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8">
          <div className="w-full max-w-md border-4 border-black bg-white shadow-[8px_8px_0_black]">
            <div className="flex items-center justify-between border-b-4 border-black bg-[#FFE500] p-4">
              <span className="font-black uppercase">새 노트 만들기</span>
              <button onClick={() => setShowTemplateModal(false)} className="border-2 border-black p-1 hover:bg-black hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-xs font-black uppercase">노트 이름</label>
                <input
                  type="text"
                  value={newNoteName}
                  onChange={e => setNewNoteName(e.target.value)}
                  placeholder="노트 제목..."
                  className="w-full border-4 border-black px-3 py-2 font-bold outline-none"
                  autoFocus
                />
              </div>
              {templates.length > 0 && (
                <div>
                  <label className="mb-2 block text-xs font-black uppercase">템플릿 선택 (선택사항)</label>
                  <div className="space-y-1">
                    <button
                      onClick={() => setSelectedTemplate(null)}
                      className={`w-full border-2 border-black px-3 py-2 text-left text-sm font-bold transition-all ${selectedTemplate === null ? 'bg-[#FFE500] shadow-[2px_2px_0_black]' : 'bg-white hover:bg-gray-50'}`}
                    >
                      빈 노트
                    </button>
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplate(t.id)}
                        className={`w-full border-2 border-black px-3 py-2 text-left text-sm font-bold transition-all ${selectedTemplate === t.id ? 'bg-[#B197FC] shadow-[2px_2px_0_black]' : 'bg-white hover:bg-gray-50'}`}
                      >
                        📄 {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const name = newNoteName.trim() || 'Untitled';
                    const templateContent = selectedTemplate ? (templates.find(t => t.id === selectedTemplate)?.content ?? '') : '';
                    const finalContent = templateContent
                      .replace(/\{title\}/g, name)
                      .replace(/\{date\}/g, new Date().toISOString().split('T')[0])
                      .replace(/\{time\}/g, new Date().toLocaleTimeString('ko-KR'));
                    const fullName = name.endsWith('.md') ? name : `${name}.md`;
                    const blob = new Blob([finalContent], { type: 'text/markdown' });
                    const formData = new FormData();
                    formData.append('file', blob, fullName);
                    try {
                      if (currentFolderId) formData.append('folderId', currentFolderId);
                      const res = await fetch('/api/drive/upload', { method: 'POST', body: formData });
                      const data = await res.json();
                      if (data.file) { await fetchFiles(currentFolderId ?? vaultFolderId ?? undefined); setSelectedFile(data.file); setContent(finalContent); setOriginalContent(finalContent); }
                      setShowTemplateModal(false);
                    } catch { setError('노트 생성 실패'); setShowTemplateModal(false); }
                  }}
                  disabled={!newNoteName.trim()}
                  className="border-4 border-black bg-[#69DB7C] px-5 py-2 font-black disabled:opacity-50"
                >
                  만들기
                </button>
                <button onClick={() => setShowTemplateModal(false)} className="border-4 border-black bg-white px-5 py-2 font-black">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] bg-white border-2 border-black shadow-[3px_3px_0_black]"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 170), top: Math.min(contextMenu.y, window.innerHeight - 100) }}
        >
          <button
            onClick={() => { togglePin(contextMenu.fileId); setContextMenu(null); }}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-black hover:bg-[#FFE500] transition-all"
          >
            <span className="text-sm">{pinnedFileIds.includes(contextMenu.fileId) ? '📌 고정 해제' : '📌 고정'}</span>
          </button>
          <div className="border-t border-gray-100" />
          <button
            onClick={() => {
              const newName = prompt('새 이름:', contextMenu.fileName.replace('.md', ''));
              if (newName?.trim()) {
                const n = newName.trim();
                handleRename(contextMenu.fileId, n.endsWith('.md') ? n : `${n}.md`);
              }
              setContextMenu(null);
            }}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-black hover:bg-[#FFE500] transition-all"
          >
            <Pencil className="h-4 w-4" /> 이름 변경
          </button>
          <div className="border-t-2 border-black" />
          <button
            onClick={() => {
              if (confirm(`"${contextMenu.fileName.replace('.md', '')}" 삭제하시겠습니까?`)) {
                handleDelete(contextMenu.fileId);
              }
              setContextMenu(null);
            }}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 transition-all"
          >
            <Trash2 className="h-4 w-4" /> 삭제
          </button>
        </div>
      )}
      {contextMenu && <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />}

      {/* AI Panel */}
      <NoteAIPanel
        isOpen={showAIPanel}
        onClose={() => setShowAIPanel(false)}
        onOpen={() => setShowAIPanel(true)}
        noteTitle={selectedFile?.name.replace(/\.md$/, '') ?? ''}
        noteContent={content}
        noteFileId={selectedFile?.id ?? null}
      />

      {/* Phase 5: Graph View */}
      {showGraph && (
        <GraphView
          files={(allVaultFiles.length > 0 ? allVaultFiles : files).map(f => ({ id: f.id, name: f.name.replace(/\.md$/, '') }))}
          links={linkIndex}
          fileMap={fileMap}
          selectedFileId={selectedFile?.id ?? null}
          onSelectNode={(fileId) => {
            const f = files.find(f => f.id === fileId);
            if (f) handleSelectFile(f);
            setShowGraph(false);
          }}
          onClose={() => setShowGraph(false)}
        />
      )}
    </div>
  );
}
