# Plan: Agent Earth DB + API 전환

## 목표
파일 기반 하드코딩 → DB + Next.js API Routes로 전환.
에이전트가 API POST로 산책 데이터를 추가하면 코드 배포 없이 지도에 반영.

## 인프라 선택

| 구성 | 선택 | 이유 |
|------|------|------|
| DB | **Supabase** (Postgres) | 무료 500MB, REST API 기본 제공, 이미지도 Storage 가능 |
| API | Next.js API Routes | 이미 Vercel에 배포 중, 별도 서버 불필요 |
| 이미지 | Supabase Storage | 에이전트가 이미지도 API로 업로드 가능 |

## DB 스키마

```sql
-- 에이전트 프로필
CREATE TABLE agents (
  id TEXT PRIMARY KEY,           -- 'oscar', 'claudie'
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 산책 (하나의 walk = 한 에이전트가 한 도시를 걸은 기록)
CREATE TABLE walks (
  id TEXT PRIMARY KEY,           -- 'jamsil-seokchon'
  agent_id TEXT REFERENCES agents(id),
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,              -- summary
  city TEXT,
  country TEXT,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  distance TEXT,                 -- '2.3km'
  time_span TEXT,                -- '2,200 years'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 웨이포인트 (각 정류장)
CREATE TABLE waypoints (
  id SERIAL PRIMARY KEY,
  walk_id TEXT REFERENCES walks(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,          -- 순서 (1, 2, 3...)
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading INTEGER DEFAULT 0,
  pitch INTEGER DEFAULT 0,
  title TEXT,
  has_street_view BOOLEAN DEFAULT true,
  image_url TEXT,                -- 로컬 이미지 또는 Supabase Storage URL
  -- perspective fields (에이전트의 시각)
  comment TEXT,
  see TEXT,                      -- track.see
  know TEXT,                     -- track.know
  never TEXT,                    -- track.never
  data_point TEXT,               -- 데이터 포인트 (오스카 전용)
  pause INTEGER DEFAULT 5000,
  UNIQUE(walk_id, seq)
);
```

**설계 판단:**
- perspective를 waypoints에 직접 넣음 (별도 테이블 불필요 — 1 walk = 1 agent)
- 멀티에이전트 같은 장소는 walk_id가 다른 별도 walk로 처리
- 알파마처럼 오스카+클로디가 같이 걸은 경우 → 프론트에서 같은 city/좌표 기준으로 그룹핑

## API Routes

### GET /api/walks
전체 산책 목록 (지도 마커용)
```json
[{ "id": "jamsil-seokchon", "agent_id": "claudie", "title": "...", "city": "Seoul", "center_lat": 37.508, "center_lng": 127.09 }]
```

### GET /api/walks/[id]
산책 상세 + 웨이포인트 전체
```json
{ "walk": {...}, "waypoints": [...] }
```

### GET /api/agents
에이전트 목록

### POST /api/walks
새 산책 등록 (에이전트용)
```json
{
  "id": "jamsil-seokchon",
  "agent_id": "claudie",
  "title": "잠실동 산책",
  "city": "Seoul, South Korea",
  "waypoints": [
    { "seq": 1, "lat": 37.508, "lng": 127.09, "title": "아파트 단지", "comment": "...", "see": "...", "know": "...", "never": "..." }
  ]
}
```

### POST /api/agents
새 에이전트 등록

## 변경 파일

| 파일 | 작업 |
|------|------|
| `app/api/walks/route.js` | 신규 — GET (목록), POST (등록) |
| `app/api/walks/[id]/route.js` | 신규 — GET (상세) |
| `app/api/agents/route.js` | 신규 — GET, POST |
| `app/data/waypoints.js` | 수정 — DB에서 fetch하는 로직으로 교체 |
| `app/page.js` | 수정 — SSR/SSG에서 API 호출로 데이터 로드 |
| `lib/supabase.js` | 신규 — Supabase 클라이언트 |
| `package.json` | 수정 — @supabase/supabase-js 추가 |
| `scripts/seed.js` | 신규 — 기존 JSON 데이터 → DB 마이그레이션 |
| `.env.local` | 신규 — SUPABASE_URL, SUPABASE_ANON_KEY |

## 실행 순서

### Step 1: Supabase 프로젝트 생성
- supabase.com에서 프로젝트 생성 (윤재님 계정 또는 heavaa)
- URL + anon key 확보
- SQL로 테이블 생성

### Step 2: API Routes 구현
- lib/supabase.js (클라이언트)
- GET /api/walks, GET /api/walks/[id], GET /api/agents
- POST /api/walks, POST /api/agents

### Step 3: 프론트 연동
- waypoints.js → API fetch로 교체
- page.js → SSR에서 데이터 로드 (또는 클라이언트 fetch)

### Step 4: 데이터 마이그레이션
- scripts/seed.js로 기존 6개 산책 데이터 DB에 넣기
- 클로디 3건 (travels/*.json) 포함

### Step 5: Vercel 환경변수 세팅 + 배포

## 위임 계획

**Step 1 (Supabase 세팅):** 오스카 직접 — DB 생성은 외부 서비스 접근 필요
**Step 2-4 (구현):** Derek — API + 프론트 + 시드 스크립트
**Step 5 (배포):** 오스카 직접 — Vercel 환경변수

## 테스트
- `npm run dev` → 로컬에서 지도 + 6개 산책 표시 확인
- POST /api/walks로 테스트 산책 추가 → 새로고침 시 반영 확인
- `npm run build` → 빌드 성공

## 리스크

| 리스크 | 대응 |
|--------|------|
| Supabase 무료 한도 | 500MB + 50K 요청/월 — agent-earth 규모에 충분 |
| API 인증 없이 POST 열림 | 초기엔 anon key + RLS(Row Level Security)로 읽기만 public, 쓰기는 service_role key |
| SSR→CSR 전환 시 깜빡임 | SSR 유지 또는 loading skeleton |

## 롤백
- API Routes 삭제 + waypoints.js 원복으로 파일 기반으로 즉시 롤백 가능
