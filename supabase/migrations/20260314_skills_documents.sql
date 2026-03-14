create table if not exists public.skills (
  id text primary key,
  name text not null,
  category text not null,
  input_fields jsonb not null,
  output_sections jsonb not null,
  prompt_template text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null,
  title text not null,
  input_payload jsonb not null,
  generated_content text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

insert into public.skills (id, name, category, input_fields, output_sections, prompt_template)
values
  (
    'meeting_minutes_v1',
    '회의록 작성',
    'meeting',
    '["meeting_title", "date_time", "participants", "agenda", "discussion_notes"]'::jsonb,
    '["한줄요약", "핵심논의", "결정사항", "액션아이템(담당자/마감일)"]'::jsonb,
    $$너는 회의 기록 비서다.
아래 입력을 기반으로 간결하고 실행 가능한 회의록을 작성하라.
[회의명] {{meeting_title}}
[일시] {{date_time}}
[참석자] {{participants}}
[안건] {{agenda}}
[논의내용] {{discussion_notes}}$$
  ),
  (
    'weekly_report_v1',
    '주간 업무보고',
    'report',
    '["period", "completed_tasks", "in_progress", "blockers", "next_week_plan"]'::jsonb,
    '["주간요약", "완료사항", "진행중", "이슈/리스크", "다음주계획"]'::jsonb,
    $$경영진이 빠르게 파악할 수 있도록 1페이지 형식으로 작성하라.
수치와 결과 중심으로 정리하라.
[기간] {{period}}
[완료] {{completed_tasks}}
[진행중] {{in_progress}}
[블로커] {{blockers}}
[다음주] {{next_week_plan}}$$
  ),
  (
    'project_proposal_v1',
    '프로젝트 제안서',
    'proposal',
    '["project_name", "problem_statement", "objectives", "scope", "timeline", "budget", "risks"]'::jsonb,
    '["배경/문제정의", "목표", "범위", "실행계획", "예산", "리스크및대응", "기대효과"]'::jsonb,
    $$실무 승인 가능한 제안서 톤으로 작성하라.
모호한 표현 대신 실행 가능한 문장으로 작성하라.
[프로젝트] {{project_name}}
[문제] {{problem_statement}}
[목표] {{objectives}}
[범위] {{scope}}
[일정] {{timeline}}
[예산] {{budget}}
[리스크] {{risks}}$$
  ),
  (
    'retrospective_v1',
    '회고 문서',
    'retrospective',
    '["sprint_or_period", "what_went_well", "what_went_wrong", "lessons_learned", "action_items"]'::jsonb,
    '["잘한점", "아쉬운점", "배운점", "개선액션(우선순위)"]'::jsonb,
    $$비난 없이 개선 중심으로 회고를 작성하라.
액션은 담당자/기한 포함.
[기간] {{sprint_or_period}}
[잘한점] {{what_went_well}}
[아쉬운점] {{what_went_wrong}}
[배운점] {{lessons_learned}}
[액션] {{action_items}}$$
  ),
  (
    'decision_log_v1',
    '의사결정 기록',
    'decision',
    '["decision_title", "context", "options_considered", "selected_option", "rationale", "impact"]'::jsonb,
    '["결정요약", "배경", "고려대안", "선택안", "근거", "영향"]'::jsonb,
    $$나중에 봐도 맥락이 이해되도록 의사결정 로그를 작성하라.
[제목] {{decision_title}}
[배경] {{context}}
[대안] {{options_considered}}
[선택] {{selected_option}}
[근거] {{rationale}}
[영향] {{impact}}$$
  ),
  (
    'handoff_note_v1',
    '인수인계 문서',
    'operations',
    '["system_or_project", "current_status", "pending_tasks", "known_issues", "runbook_links", "contacts"]'::jsonb,
    '["현재상태", "진행중업무", "이슈/주의사항", "운영절차", "연락체계"]'::jsonb,
    $$새 담당자가 당일 업무를 시작할 수 있게 실무형 인수인계를 작성하라.
[대상] {{system_or_project}}
[상태] {{current_status}}
[남은업무] {{pending_tasks}}
[이슈] {{known_issues}}
[런북] {{runbook_links}}
[연락처] {{contacts}}$$
  ),
  (
    'study_note_v1',
    '학습 노트',
    'learning',
    '["topic", "source_material", "key_points", "examples", "questions"]'::jsonb,
    '["핵심개념", "요약", "예시", "아직모르는것", "다음학습계획"]'::jsonb,
    $$초심자도 이해 가능하게 학습 노트를 구조화하라.
[주제] {{topic}}
[자료] {{source_material}}
[핵심] {{key_points}}
[예시] {{examples}}
[질문] {{questions}}$$
  ),
  (
    'blog_draft_v1',
    '블로그 초안 작성',
    'writing',
    '["title", "target_audience", "key_message", "outline_points", "references"]'::jsonb,
    '["제목후보", "도입", "본문(섹션별)", "결론", "CTA"]'::jsonb,
    $$정보 전달력이 좋은 블로그 초안을 작성하라.
[제목] {{title}}
[독자] {{target_audience}}
[핵심메시지] {{key_message}}
[아웃라인] {{outline_points}}
[참고] {{references}}$$
  ),
  (
    'spreadsheet_plan_v1',
    '엑셀형 표 자동 생성',
    'spreadsheet',
    '["table_purpose", "columns", "sample_rows", "formulas_needed"]'::jsonb,
    '["시트구조", "컬럼정의", "샘플데이터", "수식제안"]'::jsonb,
    $$엑셀/시트로 바로 옮길 수 있도록 표 구조를 생성하라.
[목적] {{table_purpose}}
[컬럼] {{columns}}
[샘플행] {{sample_rows}}
[수식] {{formulas_needed}}$$
  ),
  (
    'slide_outline_v1',
    'PPT 아웃라인 생성',
    'presentation',
    '["presentation_topic", "audience", "duration_minutes", "key_points", "desired_tone"]'::jsonb,
    '["슬라이드목차", "슬라이드별핵심메시지", "발표자노트", "예상질문"]'::jsonb,
    $${{duration_minutes}}분 발표 분량에 맞춰 슬라이드 아웃라인을 작성하라.
[주제] {{presentation_topic}}
[청중] {{audience}}
[핵심포인트] {{key_points}}
[톤] {{desired_tone}}$$
  )
on conflict (id) do update
set
  name = excluded.name,
  category = excluded.category,
  input_fields = excluded.input_fields,
  output_sections = excluded.output_sections,
  prompt_template = excluded.prompt_template;
