# My Dashboard

Next.js 기반 운영 대시보드입니다. 현재 포함 기능:

- Google Drive 연동 (my dashboard 하위 폴더 범위 제한)
- Jobs 관리 (Supabase)
- 스케줄 캘린더 (Supabase 기반 CRUD)
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
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

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

## 5) 다중 환경/다른 에이전트에서 쉽게 작업하는 방법

1. `.env.example` 기준으로 환경 복제
2. Supabase 테이블(`jobs`, `schedules`) 먼저 생성
3. Google OAuth 승인 리디렉션 URL에 환경별 도메인 등록
4. `npm run lint && npm run build`로 배포 전 검증

## 6) 보안 메모

- `.env.local`은 절대 공유하지 마세요.
- 공유 토큰은 scope/만료를 짧게 주고, 안전한 채널로 전달하세요.
- Drive API는 `my dashboard` 하위 트리만 접근 가능하도록 서버에서 강제합니다.
