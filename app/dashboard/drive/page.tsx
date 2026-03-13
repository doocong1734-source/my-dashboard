'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { FileText, Folder, Image, Film, Music, ExternalLink, RefreshCw, Upload, Trash2, Search, ChevronRight, X, Home } from 'lucide-react'

type DriveFile = {
  id: string
  name: string
  mimeType: string
  size: string
  modifiedTime: string
  webViewLink: string
}

type Breadcrumb = { id: string | null; name: string }

function getFileIcon(mimeType: string) {
  if (mimeType.includes('folder')) return { icon: Folder, bg: 'bg-[#FFE500]' }
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

export default function DrivePage() {
  const { data: session, status } = useSession()
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: 'root', name: '내 드라이브' }])
  const [preview, setPreview] = useState<DriveFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchFiles(folderId: string | null = null) {
    setLoading(true)
    setError(null)
    try {
      const url = folderId ? `/api/drive/files?folderId=${folderId}` : '/api/drive/files'
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || '파일 목록을 가져오지 못했습니다.')
      }
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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)

    const folderId = currentFolder
    if (folderId) formData.append('folderId', folderId)
    try {
      const res = await fetch('/api/drive/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || '업로드에 실패했습니다.')
      }
      await fetchFiles(currentFolder)
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드에 실패했습니다.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(file: DriveFile) {
    if (!confirm(`"${file.name}" 을 삭제할까요?`)) return
    setError(null)
    try {
      const res = await fetch('/api/drive/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: file.id }) })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || '삭제에 실패했습니다.')
      }
      setFiles(prev => prev.filter(f => f.id !== file.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
  const isImage = (f: DriveFile) => f.mimeType.includes('image')

  if (status === 'loading') return <div className="p-8 font-black">로딩 중...</div>

  if (!session) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="border-4 border-black bg-white shadow-[6px_6px_0_black] p-12 text-center max-w-sm">
          <h2 className="text-2xl font-black uppercase mb-4">Google Drive</h2>
          <p className="font-bold text-gray-600 mb-6">Google 계정으로 로그인하면<br/>Drive 파일에 접근할 수 있어요.</p>
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
            표시 범위: 내 드라이브 전체
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
      <div className="flex items-center gap-1 mb-4 font-black text-sm">
        {breadcrumbs.map((crumb, i) => (
          <div key={crumb.id ?? 'root'} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} strokeWidth={3} />}
            <button onClick={() => navigateTo(crumb)}
              className={`flex items-center gap-1 px-2 py-1 border-2 border-black text-black hover:bg-[#FFE500] transition-all ${i === breadcrumbs.length - 1 ? 'bg-[#FFE500]' : 'bg-white'}`}>
              {i === 0 && <Home size={12} strokeWidth={3} />}
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* 검색 */}
      <div className="flex items-center gap-3 border-4 border-black bg-white shadow-[4px_4px_0_black] px-4 py-3 mb-6">
        <Search size={18} strokeWidth={2.5} className="text-black" />
        <input type="text" placeholder="파일 검색..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 font-bold bg-transparent outline-none placeholder:text-gray-400 text-black" />
        {search && <button onClick={() => setSearch('')} className="text-black"><X size={16} strokeWidth={2.5} /></button>}
      </div>

      {/* 파일 목록 */}
      {error && (
        <div className="mb-4 border-4 border-black bg-[#FF6B6B] px-4 py-3 font-black text-black">
          {error}
        </div>
      )}

      {loading ? (
        <p className="font-black">로딩 중...</p>
      ) : filtered.length === 0 ? (
        <div className="border-4 border-black bg-white shadow-[4px_4px_0_black] p-12 text-center">
          <p className="font-black text-gray-400 uppercase">파일이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(file => {
            const { icon: Icon, bg } = getFileIcon(file.mimeType)
            const isFolder = file.mimeType.includes('folder')
            return (
              <div key={file.id} className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-4 flex items-center gap-4 hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
                <button onClick={() => isFolder ? openFolder(file) : isImage(file) ? setPreview(file) : null}
                  className={`${bg} border-2 border-black p-2 text-black ${isFolder || isImage(file) ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
                  <Icon size={18} strokeWidth={2.5} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-black text-black truncate ${isFolder ? 'cursor-pointer hover:underline' : ''}`}
                    onClick={() => isFolder && openFolder(file)}>
                    {file.name}
                  </p>
                  <p className="text-xs font-bold text-gray-500">
                    {isFolder ? '폴더' : formatSize(file.size)} · {new Date(file.modifiedTime).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <div className="flex gap-2">
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

      {/* 이미지 미리보기 모달 */}
      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-white border-4 border-black shadow-[8px_8px_0_black] max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b-4 border-black bg-[#FFE500]">
              <span className="font-black truncate">{preview.name}</span>
              <button onClick={() => setPreview(null)} className="border-2 border-black p-1 text-black hover:bg-black hover:text-white transition-all">
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
              <img src={`https://drive.google.com/thumbnail?id=${preview.id}&sz=w1000`} alt={preview.name} className="max-w-full max-h-full object-contain border-2 border-black" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
