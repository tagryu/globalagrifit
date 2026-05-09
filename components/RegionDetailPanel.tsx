'use client';

import type { MatchedRegion } from '@/types';
import { fitColor, fitLabel } from '@/lib/fitColor';

const SOIL_LABEL: Record<string, string> = {
  loam: '양토 (Loam)',
  clay: '점토 (Clay)',
  sand: '사질토 (Sand)',
  silt: '미사토 (Silt)',
  peat: '이탄토 (Peat)',
  chernozem: '흑토 (Chernozem)',
};
const CLIMATE_LABEL: Record<string, string> = {
  temperate: '온대',
  tropical: '열대',
  arid: '건조',
  continental: '대륙성',
  mediterranean: '지중해성',
};

// Deterministic pseudo-random from string seed (region.id) so the same
// region always shows the same mocked numbers across renders.
function hashRand(seed: string, i: number): number {
  let h = 2166136261;
  for (let k = 0; k < seed.length; k++) {
    h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  }
  h = Math.imul(h ^ i, 16777619);
  h ^= h >>> 16;
  return ((h >>> 0) % 10000) / 10000;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function buildMockMetrics(r: MatchedRegion) {
  const seed = r.id;
  const fit = r.fit_score;
  // 농경지 비율: tropical/temperate/chernozem 더 높게
  const farmlandPct = clamp(
    (r.soil_type === 'chernozem' ? 60 : r.soil_type === 'sand' ? 8 : 35) +
      (hashRand(seed, 1) - 0.5) * 30,
    3,
    85,
  );
  const farmSize = clamp(
    Number(r.area_ha) > 5_000_000 ? 80 + hashRand(seed, 2) * 320 : 5 + hashRand(seed, 3) * 30,
    1,
    500,
  );
  const mechanizationPct = clamp(20 + fit * 60 + (hashRand(seed, 4) - 0.5) * 25, 5, 98);
  const marketUsd = Math.round(
    (Number(r.area_ha) || 1_000_000) *
      (0.3 + fit * 1.2) *
      (0.7 + hashRand(seed, 5) * 0.6),
  );
  const compShare = clamp(15 + hashRand(seed, 6) * 60, 5, 80);
  const buyerCount = Math.round(50 + hashRand(seed, 7) * 1500 * (fit + 0.5));
  const difficulty = fit >= 0.9 ? '낮음' : fit >= 0.6 ? '중간' : '높음';
  const recommendation = fit >= 0.85 ? '강력 추천' : fit >= 0.6 ? '검토 가치' : '제한적';
  return {
    farmlandPct: farmlandPct.toFixed(1),
    farmSize: farmSize.toFixed(0),
    mechanizationPct: mechanizationPct.toFixed(0),
    marketUsd,
    compShare: compShare.toFixed(0),
    buyerCount,
    difficulty,
    recommendation,
  };
}

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function formatHa(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ha`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ha`;
  return `${n} ha`;
}

interface Props {
  region: MatchedRegion;
  onClose: () => void;
  onDrillDown?: () => void;
}

export function RegionDetailPanel({ region, onClose, onDrillDown }: Props) {
  const m = buildMockMetrics(region);
  const dataSourceTag =
    region.data_source === 'soilgrids_v2' ? (
      <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 text-[10px] text-emerald-300">
        SoilGrids 실데이터
      </span>
    ) : region.data_source === 'heuristic_fallback' ? (
      <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] text-amber-200">
        SoilGrids 폴백 (위경도 추정)
      </span>
    ) : (
      <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-300">
        위경도 추정
      </span>
    );

  return (
    <div className="pointer-events-auto absolute inset-y-4 right-4 z-20 flex w-[min(94vw,360px)] flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/90 shadow-2xl backdrop-blur-md max-lg:bottom-4 max-lg:right-4 max-lg:left-4 max-lg:top-auto max-lg:max-h-[60vh] max-lg:w-auto">
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-zinc-800 p-4">
        <div
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: fitColor(region.fit_score).replace(
              /,([0-9.]+)\)$/,
              ',1)',
            ),
          }}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-100">
            {region.name}
          </h3>
          <p className="truncate text-xs text-zinc-500">{region.country}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* Fit score banner */}
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-emerald-400/80">
              매칭 적합도
            </span>
            <span className="text-xs text-emerald-300/80">
              {fitLabel(region.fit_score)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-300">
              {(region.fit_score * 100).toFixed(0)}%
            </span>
            <span className="text-[10px] text-zinc-500">/ 100</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300"
              style={{ width: `${(region.fit_score * 100).toFixed(0)}%` }}
            />
          </div>
        </div>

        {/* Real env data */}
        <Section title="환경 조건" tag={dataSourceTag}>
          <Stat label="토양" value={SOIL_LABEL[region.soil_type ?? ''] ?? region.soil_type ?? '-'} />
          <Stat label="기후" value={CLIMATE_LABEL[region.climate_zone ?? ''] ?? region.climate_zone ?? '-'} />
          <Stat label="평균 경사" value={region.avg_slope_deg != null ? `${region.avg_slope_deg}°` : '-'} />
          <Stat label="평균 기온" value={region.avg_temp_c != null ? `${region.avg_temp_c}℃` : '-'} />
        </Section>

        {/* Mock agriculture / market metrics */}
        <Section
          title="농업 · 시장 인사이트"
          tag={
            <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-400">
              데모 추정값
            </span>
          }
        >
          <Stat label="총 면적" value={formatHa(Number(region.area_ha) || 0)} />
          <Stat label="농경지 비율" value={`${m.farmlandPct}%`} />
          <Stat label="평균 농가 규모" value={`${m.farmSize} ha`} />
          <Stat label="기계화율" value={`${m.mechanizationPct}%`} />
          <Stat label="추정 시장 규모" value={formatUsd(m.marketUsd)} />
          <Stat label="잠재 바이어" value={`~${m.buyerCount.toLocaleString()}`} />
          <Stat label="기존 경쟁사 점유" value={`${m.compShare}%`} />
        </Section>

        {/* Recommendation */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">
              진출 추천도
            </span>
            <span
              className={`text-xs font-semibold ${
                m.recommendation === '강력 추천'
                  ? 'text-emerald-300'
                  : m.recommendation === '검토 가치'
                    ? 'text-amber-300'
                    : 'text-zinc-400'
              }`}
            >
              {m.recommendation}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-300">
            진출 난이도: <b>{m.difficulty}</b>
          </div>
        </div>

        {region.has_children && onDrillDown && (
          <button
            onClick={onDrillDown}
            className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-2.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/40"
          >
            ▸ 시군구 단위로 더 자세히 보기
          </button>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          {title}
        </span>
        {tag}
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1.5">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-zinc-100">
        {value}
      </div>
    </div>
  );
}
