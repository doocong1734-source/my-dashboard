'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession, signIn } from 'next-auth/react'
import {
  FileText, Folder, Image, Film, Music, ExternalLink, RefreshCw,
  Upload, Trash2, Search, ChevronRight, X, Home, Eye, Edit3, Save,
  FileCode, AlertCircle, Loader2
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type DriveFile = {
  id: string
  name: string
  mimeType: string
  size: string
  modifiedTime: string
  webViewLink: string
}

type Breadcrumb = { id: string | null; name: string }

function isMarkdown(f: DriveFile) {
  return f.name.endsWith('.md') || f.name.endsWith('.markdown')
}

function isTextFile(f: DriveFile) {
  return (f.mimeType.startsWith('text/') && !isMarkdown(f)) || f.name.endsWith('.txt') || f.name.endsWith('.json')
}

function getFileIcon(mimeType: string, name: string) {
  if (mimeType.includes('folder')) return { icon: Folder, bg: 'bg-[#FFE500]' }
  if (name.endsWith('.md') || name.endsWith('.markdown')) return { icon: FileCode, bg: 'bg-[#B197FC]' }
  if (mimeType.includes('image')) return { icon: Image, bg: 'bg-[#74C0FC]' }
  if (mimeType.includes('video')) return { icon: Film, bg: 'bg-[#FF6B6B]' }
  if (mimeType.includes('audio')) return { icon: Music, bg: 'bg-[#CC5DE8]' }
  return { icon: FileText, bg: 'bg-[#69DB7C]' }
}

function formatSize(bytes: string) {
  const n = parseInt(bytes)
  if (!n) return '-'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// ── Markdown Editor Modal ──────────────────────────────────────────────────────
function MarkdownModal({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [mode, setMode] = useState<'preview' | 'edit' | 'split'>('split')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/drive/content?fileId=${file.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setContent(d.content || '')
        setOriginal(d.content || '')
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [file.id])

  const save = useCallback(async () => {
    setSaving(true); setError(null); setSaveMsg(null)
    try {
      const res = await fetch('/api/drive/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id, content }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || '저장 실패')
      setOriginal(content)
      setSaveMsg('저장 완료!')
      setTimeout(() => setSaveMsg(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }, [file.id, content])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save, onClose])

  const isDirty = content !== original

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-black shadow-[8px_8px_0_black] w-full max-w-7xl h-[92vh] flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b-4 border-black bg-[#B197FC] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileCode size={20} strokeWidth={2.5} className="text-black flex-shrink-0" />
            <span className="font-black text-black truncate">{file.name}</span>
            {isDirty && <span className="text-xs font-black bg-[#FFE500] border-2 border-black px-2 py-0.5 flex-shrink-0">수정됨</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex border-2 border-black overflow-hidden">
              {([['preview', '미리보기', Eye], ['split', '분할', FileCode], ['edit', '편집', Edit3]] as const).map(([m, label, Icon]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-black transition-all ${mode === m ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}>
                  <Icon size={12} strokeWidth={2.5} />{label}
                </button>
              ))}
            </div>
            <button onClick={save} disabled={saving || !isDirty}
              className="flex items-center gap-1 bg-[#69DB7C] border-2 border-black px-3 py-1.5 font-black text-xs text-black hover:shadow-[2px_2px_0_black] transition-all disabled:opacity-40">
              {saving ? <Loader2 size={12} strokeWidth={2.5} className="animate-spin" /> : <Save size={12} strokeWidth={2.5} />}
              저장 (Ctrl+S)
            </button>
            <button onClick={onClose} className="border-2 border-black p-1.5 bg-white text-black hover:bg-black hover:text-white transition-all">
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Status */}
        {(error || saveMsg) && (
          <div className={`flex items-center gap-2 px-4 py-2 text-sm font-black border-b-4 border-black ${error ? 'bg-[#FF6B6B]' : 'bg-[#69DB7C]'} text-black flex-shrink-0`}>
            {error ? <AlertCircle size={14} /> : null}{error || saveMsg}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={32} strokeWidth={2.5} className="animate-spin text-black" />
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden min-h-0">
            {(mode === 'edit' || mode === 'split') && (
              <div className={`flex flex-col ${mode === 'split' ? 'w-1/2 border-r-4 border-black' : 'w-full'}`}>
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b-2 border-black flex-shrink-0">
                  <Edit3 size={13} strokeWidth={2.5} className="text-gray-500" />
                  <span className="text-xs font-black text-gray-500 uppercase">마크다운 편집</span>
                  <span className="ml-auto text-xs text-gray-400 font-bold">{content.length}자</span>
                </div>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  spellCheck={false}
                  className="flex-1 p-4 font-mono text-sm outline-none resize-none bg-white text-black leading-relaxed"
                  placeholder="마크다운을 입력하세요..."
                />
              </div>
            )}
            {(mode === 'preview' || mode === 'split') && (
              <div className={`flex flex-col ${mode === 'split' ? 'w-1/2' : 'w-full'}`}>
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b-2 border-black flex-shrink-0">
                  <Eye size={13} strokeWidth={2.5} className="text-gray-500" />
                  <span className="text-xs font-black text-gray-500 uppercase">미리보기</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                  <div className="prose max-w-none
                    prose-headings:font-black prose-headings:text-black prose-headings:border-b-2 prose-headings:border-black prose-headings:pb-1
                    prose-a:text-blue-600 prose-a:font-bold
                    prose-code:bg-gray-100 prose-code:rounded prose-code:px-1 prose-code:text-sm prose-code:font-mono prose-code:text-black
                    prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:border-2 prose-pre:border-black
                    prose-blockquote:border-l-4 prose-blockquote:border-[#B197FC] prose-blockquote:bg-gray-50 prose-blockquote:pl-4
                    prose-table:border-2 prose-table:border-black
                    prose-th:bg-[#FFE500] prose-th:font-black prose-th:border prose-th:border-black
                    prose-td:border prose-td:border-black">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Plain Text Modal ───────────────────────────────────────────────────────────
function TextModal({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/drive/content?fileId=${file.id}`)
      .then(r => r.json())
      .then(d => { setContent(d.content || ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [file.id])

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-black shadow-[8px_8px_0_black] w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b-4 border-black bg-[#FFE500]">
          <span className="font-black truncate">{file.name}</span>
          <button onClick={onClose} className="border-2 border-black p-1 text-black hover:bg-black hover:text-white transition-all">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        {loading
          ? <div className="flex-1 flex items-center justify-center p-8"><Loader2 size={28} className="animate-spin" /></div>
          : <pre className="flex-1 overflow-auto p-4 text-sm font-mono text-black whitespace-pre-wrap">{content}</pre>
        }
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DrivePage() {
  const { data: session, status } = useSession()
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: 'root', name: '내 드라이브' }])
  const [mdFile, setMdFile] = useState<DriveFile | null>(null)
  const [textFile, setTextFile] = useState<DriveFile | null>(null)
  const [imgPreview, setImgPreview] = useState<DriveFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchFiles(folderId: string | null = null) {
    setLoading(true); setError(null)
    try {
      const url = folderId ? `/api/drive/files?folderId=${folderId}` : '/api/drive/files'
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '파일 목록을 가져오지 못했습니다.')
      setFiles(data.files || [])
    } catch (e) {
      setFiles([])
      setError(e instanceof Error ? e.message : '파일 목록을 가져오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.accessToken && currentFolder) fetchFiles(currentFolder)
  }, [session, currentFolder])

  useEffect(() => {
    if (!session?.accessToken) return
    setCurrentFolder('root')
    setBreadcrumbs([{ id: 'root', name: '내 드라이브' }])
  }, [session])

  function openFolder(folder: DriveFile) {
    setCurrentFolder(folder.id)
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
    setSearch('')
  }

  function navigateTo(crumb: Breadcrumb) {
    const idx = breadcrumbs.findIndex(b => b.id === crumb.id)
    setBreadcrumbs(prev => prev.slice(0, idx + 1))
    setCurrentFolder(crumb.id)
    setSearch('')
  }

  function handleFileClick(file: DriveFile) {
    if (file.mimeType.includes('folder')) { openFolder(file); return }
    if (isMarkdown(file)) { setMdFile(file); return }
    if (isTextFile(file)) { setTextFile(file); return }
    if (file.mimeType.includes('image')) { setImgPreview(file); return }
    if (file.webViewLink) window.open(file.webViewLink, '_blank')
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setError(null)
    const formData = new FormData()
    formData.append('file', file)
    if (currentFolder) formData.append('folderId', currentFolder)
    try {
      const res = await fetch('/api/drive/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '업로드 실패')
      await fetchFiles(currentFolder)
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(file: DriveFile) {
    if (!confirm(`"${file.name}" 을 삭제할까요?`)) return
    setError(null)
    try {
      const res = await fetch('/api/drive/delete', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '삭제 실패')
      setFiles(prev => prev.filter(f => f.id !== file.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
  const mdCount = filtered.filter(f => isMarkdown(f)).length

  if (status === 'loading') return <div className="p-8 font-black">로딩 중...</div>

  if (!session) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="border-4 border-black bg-white shadow-[6px_6px_0_black] p-12 text-center max-w-sm">
          <h2 className="text-2xl font-black uppercase mb-4">Google Drive</h2>
          <p className="font-bold text-gray-600 mb-6">Google 계정으로 로그인하면<br />Drive 파일에 접근할 수 있어요.</p>
          <button onClick={() => signIn('google')}
            className="bg-[#FFE500] border-4 border-black shadow-[4px_4px_0_black] px-8 py-3 font-black uppercase hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all w-full text-black">
            Google로 로그인
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="border-4 border-black bg-white shadow-[6px_6px_0_black] p-5 flex-1 mr-4">
          <h2 className="text-3xl font-black uppercase">Google Drive</h2>
          <p className="text-sm font-bold text-gray-600 mt-1">{session.user?.email} · {filtered.length}개</p>
          <p className="text-xs font-bold text-black mt-1">
            {mdCount > 0 && <span className="text-[#B197FC]">📝 .md 파일 {mdCount}개 · </span>}
            내 드라이브 전체
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-[#FFE500] border-4 border-black shadow-[4px_4px_0_black] px-5 py-4 font-black uppercase text-black flex items-center gap-2 hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all disabled:opacity-50">
            <Upload size={18} strokeWidth={2.5} />
            {uploading ? '업로드 중...' : '업로드'}
          </button>
          <button onClick={() => fetchFiles(currentFolder)} disabled={loading}
            className="bg-[#74C0FC] border-4 border-black shadow-[4px_4px_0_black] p-4 hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all disabled:opacity-50 text-black">
            <RefreshCw size={20} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
      </div>

      {/* 브레드크럼 */}
      <div className="flex items-center gap-1 mb-4 font-black text-sm flex-wrap">
        {breadcrumbs.map((crumb, i) => (
          <div key={crumb.id ?? 'root'} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} strokeWidth={3} />}
            <button onClick={() => navigateTo(crumb)}
              className={`flex items-center gap-1 px-2 py-1 border-2 border-black text-black hover:bg-[#FFE500] transition-all ${i === breadcrumbs.length - 1 ? 'bg-[#FFE500]' : 'bg-white'}`}>
              {i === 0 && <Home size={12} strokeWidth={3} />}{crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* 검색 */}
      <div className="flex items-center gap-3 border-4 border-black bg-white shadow-[4px_4px_0_black] px-4 py-3 mb-6">
        <Search size={18} strokeWidth={2.5} className="text-black" />
        <input type="text" placeholder="파일 검색... (예: .md 로 마크다운만 필터)" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 font-bold bg-transparent outline-none placeholder:text-gray-400 text-black" />
        {search && <button onClick={() => setSearch('')} className="text-black"><X size={16} strokeWidth={2.5} /></button>}
      </div>

      {/* 에러 */}
      {error && (
        <div className="mb-4 border-4 border-black bg-[#FF6B6B] px-4 py-3 font-black text-black flex items-center gap-2">
          <AlertCircle size={16} strokeWidth={2.5} />{error}
        </div>
      )}

      {/* 파일 목록 */}
      {loading ? (
        <div className="flex items-center gap-2 font-black">
          <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />로딩 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-4 border-black bg-white shadow-[4px_4px_0_black] p-12 text-center">
          <p className="font-black text-gray-400 uppercase">파일이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(file => {
            const { icon: Icon, bg } = getFileIcon(file.mimeType, file.name)
            const isFolder = file.mimeType.includes('folder')
            const isMd = isMarkdown(file)
            const clickable = isFolder || isMd || isTextFile(file) || file.mimeType.includes('image')

            return (
              <div key={file.id}
                className={`bg-white border-4 border-black shadow-[4px_4px_0_black] p-4 flex items-center gap-4 transition-all ${clickable ? 'hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 cursor-pointer' : ''} ${isMd ? 'border-l-[8px] border-l-[#B197FC]' : ''}`}
                onClick={() => handleFileClick(file)}>
                <div className={`${bg} border-2 border-black p-2 text-black flex-shrink-0`}>
                  <Icon size={18} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-black truncate">{file.name}</p>
                    {isMd && <span className="text-xs font-black bg-[#B197FC] border-2 border-black px-2 py-0.5 flex-shrink-0">MD</span>}
                  </div>
                  <p className="text-xs font-bold text-gray-500">
                    {isFolder ? '폴더' : formatSize(file.size)} · {new Date(file.modifiedTime).toLocaleDateString('ko-KR')}
                    {isMd && <span className="ml-2 text-[#B197FC]">클릭하여 편집</span>}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {isMd && (
                    <button onClick={() => setMdFile(file)}
                      className="bg-[#B197FC] border-2 border-black p-2 text-black hover:shadow-[2px_2px_0_black] transition-all" title="마크다운 편집기">
                      <Edit3 size={14} strokeWidth={2.5} />
                    </button>
                  )}
                  {file.webViewLink && (
                    <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
                      className="bg-[#FFE500] border-2 border-black p-2 text-black hover:shadow-[2px_2px_0_black] transition-all">
                      <ExternalLink size={14} strokeWidth={2.5} />
                    </a>
                  )}
                  <button onClick={() => handleDelete(file)}
                    className="bg-[#FF6B6B] border-2 border-black p-2 hover:shadow-[2px_2px_0_black] transition-all text-black">
                    <Trash2 size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 이미지 미리보기 */}
      {imgPreview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-white border-4 border-black shadow-[8px_8px_0_black] max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b-4 border-black bg-[#FFE500]">
              <span className="font-black truncate">{imgPreview.name}</span>
              <button onClick={() => setImgPreview(null)} className="border-2 border-black p-1 text-black hover:bg-black hover:text-white transition-all">
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
              <img src={`https://drive.google.com/thumbnail?id=${imgPreview.id}&sz=w1000`} alt={imgPreview.name}
                className="max-w-full max-h-full object-contain border-2 border-black" />
            </div>
          </div>
        </div>
      )}

      {mdFile && <MarkdownModal file={mdFile} onClose={() => setMdFile(null)} />}
      {textFile && <TextModal file={textFile} onClose={() => setTextFile(null)} />}
    </div>
  )
}
