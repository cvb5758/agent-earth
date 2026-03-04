# Plan: #5 + #6 동적 로딩 + 클로디 산책 3건 통합

## 두 이슈를 한 PR로 처리하는 이유
- #5 (동적 로딩) 완료하면 #6 (데이터 변환)이 자동으로 반영됨
- 별도 PR은 불필요한 중간 상태를 만듦

## 작업 범위

### Part 1: waypoints.js 동적 로딩 (#5)

**현재:** 하드코딩 import (새 산책마다 코드 수정 필요)
**목표:** `data/travels/` + `data/agents/` 폴더를 자동 스캔

**방법:** Next.js는 클라이언트 컴포넌트에서 `fs`를 못 쓰므로, **빌드 타임 스크립트**로 index 파일을 생성.

**파일:** `scripts/build-travel-index.js`
- `data/travels/` 디렉토리 스캔
- 각 폴더에서 `meta.json` + `*.json` (meta 제외 = agent 파일) 읽기
- `data/agents/` 디렉토리 스캔
- `app/data/generated-index.js` 생성 (import문 + travels/agents 배열 자동 생성)

**파일:** `app/data/waypoints.js`
- 하드코딩 import 제거
- `generated-index.js`에서 import

**파일:** `package.json`
- `"prebuild": "node scripts/build-travel-index.js"` 추가
- `"predev": "node scripts/build-travel-index.js"` 추가

### Part 2: 클로디 산책 3건 변환 (#6)

**변환 스크립트:** `scripts/convert-legacy-travels.js`
- `travels/*.json` (올인원 형식) → `data/travels/` (분리 형식)으로 변환

**변환 매핑:**
```
올인원 JSON                    →  분리 형식
─────────────────────────────────────────────
walker, title, subtitle,       →  meta.json (id, title, subtitle, description,
summary, city, waypoints           location, stats, waypoints[{id,lat,lng,localImage}])

waypoints[].comment,           →  {walker}.json (agentId, perspectives[{
waypoints[].track.see/know/never   waypointId, comment, see, know, never}])

waypoints[].image              →  localImage 경로 유지 (이미 walks/ 에 있음)
```

**주의:** 올인원에는 `location.center`, `stats.distance` 등이 없음 → 첫 waypoint 좌표를 center로, distance는 계산 또는 빈값

### Part 3: .gitignore + 정리
- `app/data/generated-index.js`를 `.gitignore`에 추가 (빌드 산출물)
- 변환 완료 후 `travels/` 원본은 유지 (히스토리용, 삭제는 후속)

## 변경 파일

| 파일 | 작업 |
|------|------|
| `scripts/build-travel-index.js` | 신규 — 빌드타임 인덱스 생성 |
| `scripts/convert-legacy-travels.js` | 신규 — 올인원→분리 변환 (일회성) |
| `app/data/waypoints.js` | 수정 — generated-index에서 import |
| `package.json` | 수정 — prebuild/predev 추가 |
| `.gitignore` | 수정 — generated-index.js 추가 |
| `data/travels/jamsil-seokchon/` | 신규 — 변환 결과 |
| `data/travels/eunpyeong-bukhansan/` | 신규 — 변환 결과 |
| `data/travels/ilsan-lakecity/` | 신규 — 변환 결과 |

## 테스트 전략
- `node scripts/build-travel-index.js` 실행 → generated-index.js 생성 확인
- `npm run build` → 빌드 성공 확인
- 빌드 후 travels 개수가 6개 (기존 3 + 신규 3)인지 확인

## 리스크

| 리스크 | 대응 |
|--------|------|
| generated-index.js import 경로 오류 | 상대 경로 정확히 계산 |
| 올인원 형식에 location/stats 누락 | 기본값 생성 (center=첫 waypoint, distance="~2km") |
| Vercel 빌드 시 prebuild 미실행 | vercel.json에 buildCommand 명시 |

## 롤백
- waypoints.js 원복 + generated-index 삭제로 즉시 롤백
