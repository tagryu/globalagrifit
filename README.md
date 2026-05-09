# 🌍 GlobalAgriFit

농기구 스펙을 입력하면 전세계에서 사용 가능한 농지 지역을 3D 지구본 위에 색칠해서 보여주는 데모 (해커톤 MVP).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Supabase (Postgres + PostGIS)
- react-globe.gl
- Data: Natural Earth (admin_0/1) + GADM v4.1 (admin_2) + ISRIC SoilGrids 2.0 (KR·US 토양 실데이터)

## Getting Started

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase URL + anon key
npm run dev
```

Open http://localhost:3000.

## Seed (one-time)

Schema/RPC migrations live in Supabase. Region polygons are loaded from Natural Earth + GADM:

```bash
# admin_0 (countries) + admin_1 (states) for major ag countries
npx tsx scripts/seed-world.ts

# admin_2 for KR/US/JP/CN/DE/FR. Korea+USA use real SoilGrids API at centroid.
npx tsx scripts/seed-admin2.ts
```

Required GeoJSON files (gitignored, fetched manually):
- `data/admin_0.geojson` — Natural Earth 50m countries
- `data/admin_1_10m.geojson` — Natural Earth 10m states/provinces
- `data/gadm41_{ISO3}_2.json` — GADM admin_2 for KOR/USA/JPN/CHN/DEU/FRA

## Features

- **모델 등록**: 제조사·모델명·단가·출력·예취폭·차폭·중량·등판각·작목·인증 메타데이터 저장
- **매칭**: 토양 / 기후 / 경사 / 온도 4축으로 fit_score 계산
- **드릴다운**: 도/주 클릭 → 시군구·county·市町村 단위 자식 fetch + 줌인
- **시각 효과**: fit_score ≥ 0.75 지역에 펄스 ring 애니메이션
- **반응형**: 모바일 = globe 위 / 폼 아래, 데스크탑 = 폼 좌 / globe 우
