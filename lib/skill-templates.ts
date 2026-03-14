export type SkillTemplate = {
  id: string
  name: string
  category: string
  input_fields: string[]
  output_sections: string[]
  prompt_template: string
}

export type ObsidianOptions = {
  enabled: boolean
  vaultFolder?: string
  tags?: string[]
  aliases?: string[]
  linkedNotes?: string[]
}

function sanitizeObsidianValue(value: string) {
  return value.replace(/[\[\]#|^:%]/g, '').trim()
}

export const defaultSkillTemplates: SkillTemplate[] = [
  {
    id: 'meeting_minutes_v1',
    name: '회의록 작성',
    category: 'meeting',
    input_fields: ['meeting_title', 'date_time', 'participants', 'agenda', 'discussion_notes'],
    output_sections: ['한줄요약', '핵심논의', '결정사항', '액션아이템(담당자/마감일)'],
    prompt_template: `너는 회의 기록 비서다.
아래 입력을 기반으로 간결하고 실행 가능한 회의록을 작성하라.
[회의명] {{meeting_title}}
[일시] {{date_time}}
[참석자] {{participants}}
[안건] {{agenda}}
[논의내용] {{discussion_notes}}`,
  },
  {
    id: 'weekly_report_v1',
    name: '주간 업무보고',
    category: 'report',
    input_fields: ['period', 'completed_tasks', 'in_progress', 'blockers', 'next_week_plan'],
    output_sections: ['주간요약', '완료사항', '진행중', '이슈/리스크', '다음주계획'],
    prompt_template: `경영진이 빠르게 파악할 수 있도록 1페이지 형식으로 작성하라.
수치와 결과 중심으로 정리하라.
[기간] {{period}}
[완료] {{completed_tasks}}
[진행중] {{in_progress}}
[블로커] {{blockers}}
[다음주] {{next_week_plan}}`,
  },
  {
    id: 'project_proposal_v1',
    name: '프로젝트 제안서',
    category: 'proposal',
    input_fields: ['project_name', 'problem_statement', 'objectives', 'scope', 'timeline', 'budget', 'risks'],
    output_sections: ['배경/문제정의', '목표', '범위', '실행계획', '예산', '리스크및대응', '기대효과'],
    prompt_template: `실무 승인 가능한 제안서 톤으로 작성하라.
모호한 표현 대신 실행 가능한 문장으로 작성하라.
[프로젝트] {{project_name}}
[문제] {{problem_statement}}
[목표] {{objectives}}
[범위] {{scope}}
[일정] {{timeline}}
[예산] {{budget}}
[리스크] {{risks}}`,
  },
  {
    id: 'retrospective_v1',
    name: '회고 문서',
    category: 'retrospective',
    input_fields: ['sprint_or_period', 'what_went_well', 'what_went_wrong', 'lessons_learned', 'action_items'],
    output_sections: ['잘한점', '아쉬운점', '배운점', '개선액션(우선순위)'],
    prompt_template: `비난 없이 개선 중심으로 회고를 작성하라.
액션은 담당자/기한 포함.
[기간] {{sprint_or_period}}
[잘한점] {{what_went_well}}
[아쉬운점] {{what_went_wrong}}
[배운점] {{lessons_learned}}
[액션] {{action_items}}`,
  },
  {
    id: 'decision_log_v1',
    name: '의사결정 기록',
    category: 'decision',
    input_fields: ['decision_title', 'context', 'options_considered', 'selected_option', 'rationale', 'impact'],
    output_sections: ['결정요약', '배경', '고려대안', '선택안', '근거', '영향'],
    prompt_template: `나중에 봐도 맥락이 이해되도록 의사결정 로그를 작성하라.
[제목] {{decision_title}}
[배경] {{context}}
[대안] {{options_considered}}
[선택] {{selected_option}}
[근거] {{rationale}}
[영향] {{impact}}`,
  },
  {
    id: 'handoff_note_v1',
    name: '인수인계 문서',
    category: 'operations',
    input_fields: ['system_or_project', 'current_status', 'pending_tasks', 'known_issues', 'runbook_links', 'contacts'],
    output_sections: ['현재상태', '진행중업무', '이슈/주의사항', '운영절차', '연락체계'],
    prompt_template: `새 담당자가 당일 업무를 시작할 수 있게 실무형 인수인계를 작성하라.
[대상] {{system_or_project}}
[상태] {{current_status}}
[남은업무] {{pending_tasks}}
[이슈] {{known_issues}}
[런북] {{runbook_links}}
[연락처] {{contacts}}`,
  },
  {
    id: 'study_note_v1',
    name: '학습 노트',
    category: 'learning',
    input_fields: ['topic', 'source_material', 'key_points', 'examples', 'questions'],
    output_sections: ['핵심개념', '요약', '예시', '아직모르는것', '다음학습계획'],
    prompt_template: `초심자도 이해 가능하게 학습 노트를 구조화하라.
[주제] {{topic}}
[자료] {{source_material}}
[핵심] {{key_points}}
[예시] {{examples}}
[질문] {{questions}}`,
  },
  {
    id: 'blog_draft_v1',
    name: '블로그 초안 작성',
    category: 'writing',
    input_fields: ['title', 'target_audience', 'key_message', 'outline_points', 'references'],
    output_sections: ['제목후보', '도입', '본문(섹션별)', '결론', 'CTA'],
    prompt_template: `정보 전달력이 좋은 블로그 초안을 작성하라.
[제목] {{title}}
[독자] {{target_audience}}
[핵심메시지] {{key_message}}
[아웃라인] {{outline_points}}
[참고] {{references}}`,
  },
  {
    id: 'spreadsheet_plan_v1',
    name: '엑셀형 표 자동 생성',
    category: 'spreadsheet',
    input_fields: ['table_purpose', 'columns', 'sample_rows', 'formulas_needed'],
    output_sections: ['시트구조', '컬럼정의', '샘플데이터', '수식제안'],
    prompt_template: `엑셀/시트로 바로 옮길 수 있도록 표 구조를 생성하라.
[목적] {{table_purpose}}
[컬럼] {{columns}}
[샘플행] {{sample_rows}}
[수식] {{formulas_needed}}`,
  },
  {
    id: 'slide_outline_v1',
    name: 'PPT 아웃라인 생성',
    category: 'presentation',
    input_fields: ['presentation_topic', 'audience', 'duration_minutes', 'key_points', 'desired_tone'],
    output_sections: ['슬라이드목차', '슬라이드별핵심메시지', '발표자노트', '예상질문'],
    prompt_template: `{{duration_minutes}}분 발표 분량에 맞춰 슬라이드 아웃라인을 작성하라.
[주제] {{presentation_topic}}
[청중] {{audience}}
[핵심포인트] {{key_points}}
[톤] {{desired_tone}}`,
  },
]

export function buildPrompt(template: string, payload: Record<string, string>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => payload[key] || '')
}

export function buildGeneratedMarkdown(
  skillName: string,
  sections: string[],
  payload: Record<string, string>,
  prompt: string,
  obsidian?: ObsidianOptions
) {
  const lines: string[] = []

  if (obsidian?.enabled) {
    const sanitizedTags = (obsidian.tags || [])
      .map(tag => sanitizeObsidianValue(tag).replace(/^#/, '').replace(/\s+/g, '-'))
      .filter(Boolean)
    const sanitizedAliases = (obsidian.aliases || [])
      .map(alias => sanitizeObsidianValue(alias))
      .filter(Boolean)
    const rawLinks = (obsidian.linkedNotes || []).map(note => note.trim()).filter(Boolean)
    const sanitizedLinks = rawLinks.map(note => sanitizeObsidianValue(note)).filter(Boolean)

    lines.push('---')
    lines.push(`title: "${skillName.replace(/"/g, '\\"')}"`)
    lines.push(`created: "${new Date().toISOString()}"`)
    const sanitizedFolder = obsidian.vaultFolder ? sanitizeObsidianValue(obsidian.vaultFolder) : ''
    if (sanitizedFolder) {
      lines.push(`folder: "${sanitizedFolder.replace(/"/g, '\\"')}"`)
    }
    if (sanitizedTags.length > 0) {
      lines.push('tags:')
      for (const tag of sanitizedTags) {
        lines.push(`  - "${tag}"`)
      }
    }
    if (sanitizedAliases.length > 0) {
      lines.push('aliases:')
      for (const alias of sanitizedAliases) {
        lines.push(`  - "${alias.replace(/"/g, '\\"')}"`)
      }
    }
    lines.push('---')
    lines.push('')

    if (sanitizedTags.length > 0) {
      lines.push(sanitizedTags.map(tag => `#${tag}`).join(' '))
      lines.push('')
    }

    if (rawLinks.length > 0) {
      lines.push('## 연결 노트')
      for (let i = 0; i < rawLinks.length; i += 1) {
        const raw = rawLinks[i]
        const safe = sanitizedLinks[i] || ''
        if (!safe) continue

        if (/^https?:\/\//i.test(raw)) {
          lines.push(`- [${safe}](${raw})`)
        } else {
          lines.push(`- [[${safe}]]`)
        }
      }
      lines.push('')
    }
  }

  lines.push(`# ${skillName}`)
  lines.push('')
  lines.push('## 입력값')
  for (const [key, value] of Object.entries(payload)) {
    lines.push(`- **${key}**: ${value || '-'}`)
  }
  lines.push('')
  lines.push('## 자동 생성 초안')
  lines.push('')
  for (const section of sections) {
    lines.push(`### ${section}`)
    lines.push('-')
    lines.push('')
  }
  lines.push('## 생성 프롬프트')
  lines.push('```')
  lines.push(prompt)
  lines.push('```')

  return lines.join('\n')
}
