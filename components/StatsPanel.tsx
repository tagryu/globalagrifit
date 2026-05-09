import type { MatchedRegion } from '@/types';

export function StatsPanel({ regions }: { regions: MatchedRegion[] }) {
  const total = regions.length;
  const fit = regions.filter((r) => r.fit_score >= 0.5);
  const fitCount = fit.length;
  const fitArea = fit.reduce((acc, r) => acc + Number(r.area_ha || 0), 0);
  const countries = new Set(fit.map((r) => r.country)).size;

  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat
        label="적합 지역"
        value={`${fitCount} / ${total}`}
        sub="fit_score ≥ 0.5"
      />
      <Stat
        label="사용 가능 농지"
        value={formatArea(fitArea)}
        sub="hectares"
      />
      <Stat label="대상 국가" value={`${countries}`} sub="countries" />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="text-xl font-semibold text-emerald-300">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function formatArea(ha: number): string {
  if (ha >= 1_000_000) return `${(ha / 1_000_000).toFixed(1)}M ha`;
  if (ha >= 1_000) return `${(ha / 1_000).toFixed(0)}K ha`;
  return `${ha} ha`;
}
