'use client'

import { useEffect, useMemo, useState } from 'react'
import { WandSparkles, RefreshCcw, FileText, Download, Save, Trash2 } from 'lucide-react'
import { useFeatureSettings } from '@/components/feature-settings-provider'
import { defaultSkillTemplates } from '@/lib/skill-templates'

type SkillTemplate = {
  id: string
  name: string
  category: string
  input_fields: string[]
  output_sections: string[]
  prompt_template: string
}

type GenerateResponse = {
  document: {
    id: string
    title: string
    generated_content: string
    status: string
    created_at: string
  }
  prompt: string
  skill: {
    id: string
    name: string
    category: string
  }
  source?: 'database' | 'default'
  fallbackReason?: string | null
  driveUpload?:
    | {
        ok: true
        file: {
          id?: string | null
          name?: string | null
          webViewLink?: string | null
          parents?: string[] | null
        }
      }
    | { ok: false; error: string }
}

type ObsidianModeOptions = {
  enabled: boolean
  vaultFolder: string
  tagsCsv: string
  aliasesCsv: string
  linkedNotesCsv: string
}

type GeneratedDocument = {
  id: string
  skill_id: string
  title: string
  input_payload: Record<string, string>
  generated_content: string
  status: string
  created_at: string
}

const localSkillTemplatesStorageKey = 'my-dashboard-local-skill-templates'

function readLocalSkillTemplates(): SkillTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(localSkillTemplatesStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SkillTemplate[]
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      item =>
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.category === 'string' &&
        typeof item.prompt_template === 'string' &&
        Array.isArray(item.input_fields) &&
        Array.isArray(item.output_sections)
    )
  } catch {
    return []
  }
}

function writeLocalSkillTemplates(skills: SkillTemplate[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(localSkillTemplatesStorageKey, JSON.stringify(skills))
}

export default function SkillsPage() {
  const { settings } = useFeatureSettings()
  const [skills, setSkills] = useState<SkillTemplate[]>([])
  const [loadingSkills, setLoadingSkills] = useState(true)
  const [selectedSkillId, setSelectedSkillId] = useState('')
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [docTitle, setDocTitle] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [source, setSource] = useState<'database' | 'default' | ''>('')
  const [fallbackReason, setFallbackReason] = useState<string | null>(null)
  const [documents, setDocuments] = useState<GeneratedDocument[]>([])
  const [loadingDocuments, setLoadingDocuments] = useState(true)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [savingDocument, setSavingDocument] = useState(false)
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null)
  const [driveUploadMessage, setDriveUploadMessage] = useState<string | null>(null)
  const [showCreateSkillForm, setShowCreateSkillForm] = useState(false)
  const [creatingSkill, setCreatingSkill] = useState(false)
  const [newSkill, setNewSkill] = useState({
    id: '',
    name: '',
    category: '',
    inputFields: 'title,notes',
    outputSections: '요약,핵심내용',
    promptTemplate: '',
  })
  const [obsidianOptions, setObsidianOptions] = useState<ObsidianModeOptions>({
    enabled: false,
    vaultFolder: 'my dashboard/documents',
    tagsCsv: 'skill,dashboard',
    aliasesCsv: '',
    linkedNotesCsv: '',
  })

  const selectedSkill = useMemo(
    () => skills.find(skill => skill.id === selectedSkillId) || null,
    [skills, selectedSkillId]
  )

  const selectedDocument = useMemo(
    () => documents.find(doc => doc.id === selectedDocumentId) || null,
    [documents, selectedDocumentId]
  )

  useEffect(() => {
    if (!selectedDocument) {
      setEditTitle('')
      setEditContent('')
      return
    }

    setEditTitle(selectedDocument.title)
    setEditContent(selectedDocument.generated_content)
  }, [selectedDocument])

  useEffect(() => {
    async function fetchSkills() {
      setLoadingSkills(true)
      setError(null)
      try {
        const res = await fetch('/api/skills')
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.')
          }
          throw new Error(data?.error || 'Skills를 불러오지 못했습니다.')
        }

        const fetched = (data.skills || []) as SkillTemplate[]
        const localSkills = readLocalSkillTemplates()
        const mergedSkills = [...fetched]
        for (const local of localSkills) {
          if (!mergedSkills.find(item => item.id === local.id)) {
            mergedSkills.push(local)
          }
        }

        setSkills(mergedSkills)
        setSource((data.source || '') as 'database' | 'default' | '')
        setFallbackReason(typeof data.fallbackReason === 'string' ? data.fallbackReason : null)

        if (mergedSkills.length > 0) {
          setSelectedSkillId(mergedSkills[0].id)
          const initial: Record<string, string> = {}
          for (const field of mergedSkills[0].input_fields) {
            initial[field] = ''
          }
          setFormData(initial)
        }
      } catch (e) {
        setSkills([])
        setError(e instanceof Error ? e.message : 'Skills를 불러오지 못했습니다.')
      } finally {
        setLoadingSkills(false)
      }
    }

    fetchSkills()
  }, [])

  useEffect(() => {
    async function fetchDocuments() {
      setLoadingDocuments(true)
      try {
        const res = await fetch('/api/documents')
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.')
          }
          throw new Error(data?.error || '문서 목록을 불러오지 못했습니다.')
        }

        const docs = (data.documents || []) as GeneratedDocument[]
        setDocuments(docs)
        if (docs.length > 0) {
          setSelectedDocumentId(docs[0].id)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '문서 목록을 불러오지 못했습니다.')
      } finally {
        setLoadingDocuments(false)
      }
    }

    fetchDocuments()
  }, [])

  useEffect(() => {
    if (!selectedSkill) return
    setFormData(prev => {
      const next: Record<string, string> = {}
      for (const field of selectedSkill.input_fields) {
        next[field] = prev[field] || ''
      }
      return next
    })
    setResult(null)
    setError(null)
  }, [selectedSkill])

  async function handleGenerate() {
    if (!settings.skillDocGenerationEnabled) {
      setError('현재 설정에서 Skill 문서 생성 기능이 비활성화되어 있습니다.')
      return
    }

    if (!selectedSkill) {
      setError('Skill을 선택해 주세요.')
      return
    }

    for (const field of selectedSkill.input_fields) {
      if (!formData[field]?.trim()) {
        setError(`필수 입력값 누락: ${field}`)
        return
      }
    }

    setGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: selectedSkill.id,
          title: docTitle,
          payload: formData,
          ...(obsidianOptions.enabled
            ? {
                obsidian: {
                  enabled: true,
                  vaultFolder: obsidianOptions.vaultFolder,
                  tags: obsidianOptions.tagsCsv
                    .split(',')
                    .map(v => v.trim())
                    .filter(Boolean),
                  aliases: obsidianOptions.aliasesCsv
                    .split(',')
                    .map(v => v.trim())
                    .filter(Boolean),
                  linkedNotes: obsidianOptions.linkedNotesCsv
                    .split(',')
                    .map(v => v.trim())
                    .filter(Boolean),
                },
              }
            : {}),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.')
        }
        if (Array.isArray(data?.missingFields) && data.missingFields.length > 0) {
          throw new Error(`필수 입력값 누락: ${data.missingFields.join(', ')}`)
        }
        throw new Error(data?.error || '문서 생성에 실패했습니다.')
      }

      setResult(data as GenerateResponse)
      const created = (data as GenerateResponse).document as GeneratedDocument
      setDocuments(prev => [created, ...prev])
      setSelectedDocumentId(created.id)

      const upload = (data as GenerateResponse).driveUpload
      if (upload?.ok) {
        if (upload.file.webViewLink) {
          setDriveUploadMessage(`Google Drive 저장 완료: ${upload.file.webViewLink}`)
        } else {
          setDriveUploadMessage('Google Drive documents 폴더에 저장되었습니다.')
        }
      } else if (upload && !upload.ok) {
        setDriveUploadMessage(`Google Drive 저장 실패: ${upload.error}`)
      } else {
        setDriveUploadMessage(null)
      }
    } catch (e) {
      setResult(null)
      setDriveUploadMessage(null)
      setError(e instanceof Error ? e.message : '문서 생성에 실패했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSaveDocument() {
    if (!selectedDocument) {
      setError('수정할 문서를 선택해 주세요.')
      return
    }

    if (!editTitle.trim() || !editContent.trim()) {
      setError('제목과 본문을 모두 입력해 주세요.')
      return
    }

    setSavingDocument(true)
    setError(null)
    try {
      const res = await fetch('/api/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedDocument.id,
          title: editTitle,
          generatedContent: editContent,
          status: selectedDocument.status,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.')
        }
        throw new Error(data?.error || '문서 저장에 실패했습니다.')
      }

      const updated = data.document as GeneratedDocument
      setDocuments(prev => prev.map(doc => (doc.id === updated.id ? updated : doc)))
      setSelectedDocumentId(updated.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '문서 저장에 실패했습니다.')
    } finally {
      setSavingDocument(false)
    }
  }

  async function handleDeleteDocument(id: string) {
    setDeletingDocumentId(id)
    setError(null)
    try {
      const res = await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.')
        }
        throw new Error(data?.error || '문서 삭제에 실패했습니다.')
      }

      setDocuments(prev => prev.filter(doc => doc.id !== id))
      if (selectedDocumentId === id) {
        const remained = documents.filter(doc => doc.id !== id)
        setSelectedDocumentId(remained.length > 0 ? remained[0].id : null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '문서 삭제에 실패했습니다.')
    } finally {
      setDeletingDocumentId(null)
    }
  }

  async function handleExportDocument(id: string) {
    setError(null)
    try {
      const res = await fetch('/api/documents/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (res.status === 401) {
          throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.')
        }
        throw new Error(data?.error || '내보내기에 실패했습니다.')
      }

      const blob = await res.blob()
      const contentDisposition = res.headers.get('Content-Disposition') || ''
      const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/)
      const fileName = fileNameMatch ? fileNameMatch[1] : 'generated-document.md'

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '내보내기에 실패했습니다.')
    }
  }

  async function handleCreateSkill() {
    const id = newSkill.id.trim()
    const name = newSkill.name.trim()
    const category = newSkill.category.trim()
    const promptTemplate = newSkill.promptTemplate.trim()
    const inputFields = newSkill.inputFields
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
    const outputSections = newSkill.outputSections
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)

    if (!id || !name || !category || !promptTemplate) {
      setError('스킬 생성 필수값(id, name, category, promptTemplate)을 입력해 주세요.')
      return
    }

    if (inputFields.length === 0 || outputSections.length === 0) {
      setError('입력필드/출력섹션은 최소 1개 이상 필요합니다.')
      return
    }

    if (!/^[a-z0-9_-]+$/i.test(id)) {
      setError('id는 영문/숫자/하이픈/언더스코어만 가능합니다.')
      return
    }

    const createdSkill: SkillTemplate = {
      id,
      name,
      category,
      input_fields: inputFields,
      output_sections: outputSections,
      prompt_template: promptTemplate,
    }

    setCreatingSkill(true)
    setError(null)
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createdSkill),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || '스킬 저장에 실패했습니다.')
      }

      setSkills(prev => {
        const withoutSame = prev.filter(item => item.id !== createdSkill.id)
        return [createdSkill, ...withoutSame]
      })
      setSelectedSkillId(createdSkill.id)
      setShowCreateSkillForm(false)
      setNewSkill({
        id: '',
        name: '',
        category: '',
        inputFields: 'title,notes',
        outputSections: '요약,핵심내용',
        promptTemplate: '',
      })
    } catch {
      setSkills(prev => {
        const withoutSame = prev.filter(item => item.id !== createdSkill.id)
        const next = [createdSkill, ...withoutSame]
        const defaultIds = new Set(defaultSkillTemplates.map(item => item.id))
        const localOnly = next.filter(item => !defaultIds.has(item.id))
        writeLocalSkillTemplates(localOnly)
        return next
      })
      setSelectedSkillId(createdSkill.id)
      setShowCreateSkillForm(false)
      setError('Supabase 저장 실패: 새 스킬을 브라우저 로컬 저장소에 저장했습니다.')
    } finally {
      setCreatingSkill(false)
    }
  }

  function resetForm() {
    if (!selectedSkill) return
    const next: Record<string, string> = {}
    for (const field of selectedSkill.input_fields) {
      next[field] = ''
    }
    setFormData(next)
    setDocTitle('')
    setResult(null)
    setError(null)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="border-4 border-black bg-white shadow-[6px_6px_0_black] p-5 flex-1 mr-4">
          <h2 className="text-3xl font-black text-black uppercase">Skill 자동 문서 생성</h2>
          <p className="text-sm font-bold text-black mt-1">템플릿 기반 입력폼 → 자동 초안 생성 → DB 저장</p>
        </div>
        <button
          onClick={resetForm}
          className="bg-white border-4 border-black shadow-[4px_4px_0_black] px-5 py-3 font-black text-black uppercase flex items-center gap-2 hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
        >
          <RefreshCcw size={16} strokeWidth={2.5} />
          초기화
        </button>
      </div>

      {error && (
        <div className="mb-4 border-4 border-black bg-[#FF6B6B] px-4 py-3 font-black text-black">
          {error}
        </div>
      )}

      {driveUploadMessage && (
        <div className="mb-4 border-4 border-black bg-[#74C0FC] px-4 py-3 font-black text-black break-all">
          {driveUploadMessage}
        </div>
      )}

      {loadingSkills ? (
        <div className="border-4 border-black bg-white shadow-[4px_4px_0_black] p-8 text-center">
          <p className="font-black text-black">Skill 목록 로딩 중...</p>
        </div>
      ) : skills.length === 0 ? (
        <div className="border-4 border-black bg-white shadow-[4px_4px_0_black] p-8 text-center">
          <p className="font-black text-black">사용 가능한 Skill 템플릿이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="font-black uppercase">Skill 선택</h3>
              <button
                onClick={() => setShowCreateSkillForm(prev => !prev)}
                className="bg-[#FFE500] border-2 border-black px-2 py-1 text-[10px] font-black uppercase text-black"
              >
                {showCreateSkillForm ? '닫기' : '새 스킬'}
              </button>
            </div>
            {source && (
              <div className="mb-3 border-2 border-black bg-[#f5f0e8] px-2 py-1 text-xs font-black uppercase text-black">
                Source: {source === 'database' ? 'Supabase' : 'Default Templates'}
              </div>
            )}
            {source === 'default' && fallbackReason && (
              <div className="mb-3 border-2 border-black bg-[#FFE500] px-2 py-1 text-[10px] font-black uppercase text-black">
                Fallback reason: {fallbackReason}
              </div>
            )}
            {showCreateSkillForm && (
              <div className="mb-3 border-2 border-black bg-[#f5f0e8] p-2 space-y-2">
                <input
                  type="text"
                  value={newSkill.id}
                  onChange={e => setNewSkill(prev => ({ ...prev, id: e.target.value }))}
                  className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none text-black"
                  placeholder="id (예: my_custom_skill_v1)"
                />
                <input
                  type="text"
                  value={newSkill.name}
                  onChange={e => setNewSkill(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none text-black"
                  placeholder="스킬 이름"
                />
                <input
                  type="text"
                  value={newSkill.category}
                  onChange={e => setNewSkill(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none text-black"
                  placeholder="카테고리"
                />
                <input
                  type="text"
                  value={newSkill.inputFields}
                  onChange={e => setNewSkill(prev => ({ ...prev, inputFields: e.target.value }))}
                  className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none text-black"
                  placeholder="입력필드 콤마구분 (예: title,notes)"
                />
                <input
                  type="text"
                  value={newSkill.outputSections}
                  onChange={e => setNewSkill(prev => ({ ...prev, outputSections: e.target.value }))}
                  className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none text-black"
                  placeholder="출력섹션 콤마구분 (예: 요약,핵심)"
                />
                <textarea
                  value={newSkill.promptTemplate}
                  onChange={e => setNewSkill(prev => ({ ...prev, promptTemplate: e.target.value }))}
                  className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none resize-none h-20 text-black"
                  placeholder="프롬프트 템플릿"
                />
                <button
                  onClick={handleCreateSkill}
                  disabled={creatingSkill}
                  className="w-full bg-[#69DB7C] border-2 border-black px-2 py-1 text-xs font-black uppercase text-black disabled:opacity-50"
                >
                  {creatingSkill ? '저장 중...' : '스킬 저장'}
                </button>
              </div>
            )}
            <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
              {skills.map(skill => (
                <button
                  key={skill.id}
                  onClick={() => setSelectedSkillId(skill.id)}
                  className={`w-full text-left border-2 border-black p-3 transition-all ${
                    selectedSkillId === skill.id ? 'bg-[#FFE500] shadow-[2px_2px_0_black]' : 'bg-white'
                  }`}
                >
                  <p className="font-black text-sm text-black">{skill.name}</p>
                  <p className="text-xs font-bold text-black mt-0.5">{skill.category}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-2 bg-white border-4 border-black shadow-[4px_4px_0_black] p-4">
            {selectedSkill ? (
              <>
                <div className="mb-4 border-b-2 border-black pb-3">
                  <h3 className="font-black uppercase text-black text-lg flex items-center gap-2">
                    <WandSparkles size={16} strokeWidth={2.5} /> {selectedSkill.name}
                  </h3>
                  <p className="text-xs font-bold text-black mt-1">카테고리: {selectedSkill.category}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="text-xs font-black uppercase block mb-1 text-black">문서 제목 (선택)</label>
                    <input
                      type="text"
                      value={docTitle}
                      onChange={e => setDocTitle(e.target.value)}
                      className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none text-black"
                      placeholder="비워두면 자동 생성됩니다"
                    />
                  </div>

                  {selectedSkill.input_fields.map(field => (
                    <div key={field} className={field.includes('notes') || field.includes('description') ? 'col-span-2' : ''}>
                      <label className="text-xs font-black uppercase block mb-1 text-black">{field}</label>
                      {field.includes('notes') || field.includes('description') || field.includes('outline') ? (
                        <textarea
                          value={formData[field] || ''}
                          onChange={e => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                          className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none resize-none h-24 text-black"
                        />
                      ) : (
                        <input
                          type="text"
                          value={formData[field] || ''}
                          onChange={e => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                          className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none text-black"
                        />
                      )}
                    </div>
                  ))}

                  <div className="col-span-2 border-4 border-black bg-[#f5f0e8] p-3 mt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black uppercase text-black">Obsidian 형식</label>
                      <button
                        type="button"
                        onClick={() => {
                          setObsidianOptions(prev => {
                            const nextEnabled = !prev.enabled
                            if (!nextEnabled) {
                              return {
                                ...prev,
                                enabled: false,
                                tagsCsv: '',
                                aliasesCsv: '',
                                linkedNotesCsv: '',
                              }
                            }
                            return { ...prev, enabled: true }
                          })
                        }}
                        className={`border-2 border-black px-2 py-1 text-[10px] font-black uppercase ${
                          obsidianOptions.enabled ? 'bg-[#69DB7C]' : 'bg-white'
                        }`}
                      >
                        {obsidianOptions.enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {obsidianOptions.enabled && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="col-span-2">
                          <label className="text-[10px] font-black uppercase block mb-1 text-black">Vault Folder</label>
                          <input
                            type="text"
                            value={obsidianOptions.vaultFolder}
                            onChange={e =>
                              setObsidianOptions(prev => ({
                                ...prev,
                                vaultFolder: e.target.value,
                              }))
                            }
                            className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none text-black"
                            placeholder="my dashboard/documents"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-black uppercase block mb-1 text-black">Tags (comma)</label>
                          <input
                            type="text"
                            value={obsidianOptions.tagsCsv}
                            onChange={e =>
                              setObsidianOptions(prev => ({
                                ...prev,
                                tagsCsv: e.target.value,
                              }))
                            }
                            className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none text-black"
                            placeholder="project,meeting,weekly"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase block mb-1 text-black">Aliases (comma)</label>
                          <input
                            type="text"
                            value={obsidianOptions.aliasesCsv}
                            onChange={e =>
                              setObsidianOptions(prev => ({
                                ...prev,
                                aliasesCsv: e.target.value,
                              }))
                            }
                            className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none text-black"
                            placeholder="회의록,Meeting Note"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase block mb-1 text-black">Linked Notes (comma)</label>
                          <input
                            type="text"
                            value={obsidianOptions.linkedNotesCsv}
                            onChange={e =>
                              setObsidianOptions(prev => ({
                                ...prev,
                                linkedNotesCsv: e.target.value,
                              }))
                            }
                            className="w-full border-2 border-black px-2 py-1 text-xs font-bold bg-white outline-none text-black"
                            placeholder="Projects/Alpha,People/Team"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <button
                    onClick={handleGenerate}
                    disabled={generating || !settings.skillDocGenerationEnabled}
                    className="bg-[#69DB7C] border-4 border-black px-5 py-2.5 font-black uppercase text-black disabled:opacity-50"
                  >
                    {generating ? '생성 중...' : settings.skillDocGenerationEnabled ? '문서 생성' : '생성 비활성'}
                  </button>
                </div>

                {result && (
                  <div className="border-4 border-black bg-[#f5f0e8] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText size={16} strokeWidth={2.5} />
                      <p className="font-black text-black">생성 결과</p>
                    </div>
                    <p className="text-xs font-bold text-black mb-2">
                      저장됨: {result.document.title} · {new Date(result.document.created_at).toLocaleString('ko-KR')}
                    </p>
                    <textarea
                      readOnly
                      value={result.document.generated_content}
                      className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none resize-none h-80 text-black text-sm"
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="font-black text-black">선택된 Skill이 없습니다.</p>
            )}
          </div>

          <div className="col-span-2 bg-white border-4 border-black shadow-[4px_4px_0_black] p-4">
            <h3 className="font-black uppercase mb-3">생성 문서 히스토리</h3>

            {loadingDocuments ? (
              <div className="border-2 border-black bg-[#f5f0e8] p-4 text-sm font-black text-black">문서 로딩 중...</div>
            ) : documents.length === 0 ? (
              <div className="border-2 border-black bg-[#f5f0e8] p-4 text-sm font-black text-black">저장된 문서가 없습니다.</div>
            ) : (
              <>
                <div className="space-y-2 max-h-56 overflow-auto pr-1 mb-3">
                  {documents.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDocumentId(doc.id)}
                      className={`w-full text-left border-2 border-black p-2 ${selectedDocumentId === doc.id ? 'bg-[#FFE500]' : 'bg-white'}`}
                    >
                      <p className="text-xs font-black text-black truncate">{doc.title}</p>
                      <p className="text-[10px] font-bold text-black mt-1">{new Date(doc.created_at).toLocaleString('ko-KR')}</p>
                    </button>
                  ))}
                </div>

                {selectedDocument ? (
                  <div className="border-4 border-black bg-[#f5f0e8] p-3">
                    <label className="text-xs font-black uppercase block mb-1 text-black">문서 제목</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none text-black mb-2"
                    />

                    <label className="text-xs font-black uppercase block mb-1 text-black">문서 본문</label>
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none resize-none h-64 text-black text-sm mb-2"
                    />

                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={handleSaveDocument}
                        disabled={savingDocument}
                        className="bg-[#69DB7C] border-2 border-black px-3 py-2 text-xs font-black uppercase text-black disabled:opacity-50 flex items-center gap-1"
                      >
                        <Save size={12} strokeWidth={2.5} /> 저장
                      </button>
                      <button
                        onClick={() => handleExportDocument(selectedDocument.id)}
                        className="bg-white border-2 border-black px-3 py-2 text-xs font-black uppercase text-black flex items-center gap-1"
                      >
                        <Download size={12} strokeWidth={2.5} /> 내보내기
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(selectedDocument.id)}
                        disabled={deletingDocumentId === selectedDocument.id}
                        className="bg-[#FF6B6B] border-2 border-black px-3 py-2 text-xs font-black uppercase text-black disabled:opacity-50 flex items-center gap-1"
                      >
                        <Trash2 size={12} strokeWidth={2.5} /> 삭제
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-black bg-[#f5f0e8] p-4 text-sm font-black text-black">
                    문서를 선택하면 편집/내보내기/삭제가 가능합니다.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
