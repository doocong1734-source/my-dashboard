# My Dashboard

Next.js 기반 운영 대시보드입니다. 현재 포함 기능:

- Google Drive 연동 (my dashboard 하위 폴더 범위 제한)
- Jobs 관리 (Supabase)
- 스케줄 캘린더 (Supabase 기반 CRUD)
- Skill 자동 문서 생성 (템플릿 기반)
- 기능 토글 설정 (localStorage)
- 공유 접근 토큰 발급 (scope/만료 지정)

## 1) 빠른 시작

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

## 2) 필수 환경변수

`.env.example` 참고:

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `SHARE_TOKEN_SECRET` (선택, 없으면 NEXTAUTH_SECRET 사용)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY` (Skills AI 본문 생성)
- `OPENAI_MODEL` (선택, 기본 `gpt-4o-mini`)
- `AI_PROVIDER` (선택, 기본 `openai`)
- `AI_MODEL` (선택, provider 기본 모델)
- `ANTHROPIC_API_KEY` (선택)
- `GEMINI_API_KEY` (선택)
- `OPENROUTER_API_KEY` (선택)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Google OAuth redirect_uri 설정 (redirect_uri_mismatch 방지)

Google Cloud Console > OAuth 2.0 Client(웹) > Authorized redirect URIs 에 아래를 모두 등록하세요.

- 로컬: `http://localhost:3000/api/auth/callback/google`
- 운영(메인): `https://<your-main-domain>/api/auth/callback/google`
- Vercel 도메인 사용 시: `https://<your-vercel-domain>/api/auth/callback/google`

앱의 `NEXTAUTH_URL`은 현재 접속 도메인과 동일해야 하며, 위 URI들과 정확히 일치해야 합니다.

## 3) Supabase 스키마 (필수)

아래 테이블이 필요합니다.

### `jobs`
- `id` (uuid, pk)
- `title` (text)
- `description` (text)
- `agent` (text)
- `status` (text: pending/running/completed/failed)
- `schedule` (text)
- `result` (text)
- `created_at` (timestamptz, default now())

### `schedules`
- `id` (uuid, pk, default gen_random_uuid())
- `title` (text, not null)
- `description` (text)
- `date` (date, not null)
- `time` (time, not null)
- `created_at` (timestamptz, default now())

예시 SQL:

```sql
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  date date not null,
  time time not null,
  created_at timestamptz not null default now()
);
```

### `skills` (선택: 없으면 기본 템플릿 fallback)
- `id` (text, pk)
- `name` (text, not null)
- `category` (text, not null)
- `input_fields` (jsonb, not null)
- `output_sections` (jsonb, not null)
- `prompt_template` (text, not null)
- `created_at` (timestamptz, default now())

```sql
create table if not exists public.skills (
  id text primary key,
  name text not null,
  category text not null,
  input_fields jsonb not null,
  output_sections jsonb not null,
  prompt_template text not null,
  created_at timestamptz not null default now()
);
```

### `generated_documents`
- `id` (uuid, pk, default gen_random_uuid())
- `skill_id` (text, not null)
- `title` (text, not null)
- `input_payload` (jsonb, not null)
- `generated_content` (text, not null)
- `status` (text, default 'draft')
- `created_at` (timestamptz, default now())

```sql
create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null,
  title text not null,
  input_payload jsonb not null,
  generated_content text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);
```

### 마이그레이션 파일로 한 번에 적용

`supabase/migrations/20260314_skills_documents.sql` 파일에
`skills`, `generated_documents` 테이블 생성 + 기본 skill 템플릿 시드가 포함되어 있습니다.

Supabase SQL Editor에서 파일 내용을 실행하면 한 번에 반영됩니다.

## 4) 주요 API 계약

### Drive
- `GET /api/drive/folders` : my dashboard 폴더 구조 보장/조회
- `GET /api/drive/files?folderId=...` : 해당 폴더 파일 조회 (my dashboard 하위만 허용)
- `POST /api/drive/upload` : 파일 업로드
- `DELETE /api/drive/delete` : 파일 삭제

### Share Token
- `POST /api/share-token`
  - body:
    - `label?: string`
    - `scopes?: ('drive.read' | 'drive.write')[]`
    - `expiresInMinutes?: number` (5~10080)
  - response:
    - `token`, `tokenType`, `scopes`, `expiresAt`

### Skills
- `GET /api/skills`
  - db의 `skills` 테이블 조회
  - 조회 실패/데이터 없음 시 내장 기본 템플릿 fallback

### Documents
- `POST /api/documents/generate`
  - body:
    - `skillId` (string, required)
    - `title` (string, optional)
    - `payload` (record<string, string>, required)
    - `obsidian` (optional)
      - `enabled` (boolean)
      - `vaultFolder` (string)
      - `tags` (string[])
      - `aliases` (string[])
      - `linkedNotes` (string[])
  - response:
    - `document`, `prompt`, `skill`

### Obsidian 활용
- Skills 페이지에서 `Obsidian 형식`을 ON 하면 생성 문서에 아래가 자동 반영됩니다.
  - YAML frontmatter (`title`, `created`, `folder`, `tags`, `aliases`)
  - 인라인 태그(`#tag`)
  - 위키링크(`[[노트명]]`) 기반 연결 노트 섹션

### Skills AI 본문 생성
- `/api/documents/generate`는 문서 초안 본문을 AI로 생성합니다.
- Skills 화면에서 provider/model/temperature를 선택할 수 있습니다.
- 지원 provider: `openai`, `anthropic`, `gemini`, `openrouter`
- 선택한 provider의 API 키가 없거나 AI 요청 실패 시, fallback 본문(입력값 기반)으로 자동 생성됩니다.

- `GET /api/documents`
  - 생성된 문서 목록 조회 (`generated_documents`)

- `PATCH /api/documents`
  - body:
    - `id` (string, required)
    - `title` (string, required)
    - `generatedContent` (string, required)
    - `status` (string, required)
  - response:
    - `document`

- `DELETE /api/documents`
  - body:
    - `id` (string, required)
  - response:
    - `success`

- `POST /api/documents/export`
  - body:
    - `id` (string, required)
  - response:
    - markdown 파일 다운로드 (`text/markdown`, attachment)

## 5) 다중 환경/다른 에이전트에서 쉽게 작업하는 방법

1. `.env.example` 기준으로 환경 복제
2. Supabase 테이블(`jobs`, `schedules`) 먼저 생성
3. Google OAuth 승인 리디렉션 URL에 환경별 도메인 등록
4. `npm run lint && npm run build`로 배포 전 검증

## 6) 보안 메모

- `.env.local`은 절대 공유하지 마세요.
- 공유 토큰은 scope/만료를 짧게 주고, 안전한 채널로 전달하세요.
- Drive API는 `my dashboard` 하위 트리만 접근 가능하도록 서버에서 강제합니다.
