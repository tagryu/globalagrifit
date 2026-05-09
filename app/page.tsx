'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { EquipmentForm } from '@/components/EquipmentForm';
import { StatsPanel } from '@/components/StatsPanel';
import { Legend } from '@/components/Legend';
import { RegionDetailPanel } from '@/components/RegionDetailPanel';
import type { EquipmentInput, MatchedRegion } from '@/types';

const GlobeView = dynamic(
  () => import('@/components/GlobeView').then((m) => m.GlobeView),
  { ssr: false, loading: () => <GlobePlaceholder /> },
);

interface DrillFrame {
  regions: MatchedRegion[];
  parentName: string | null;
}

export default function Home() {
  const [regions, setRegions] = useState<MatchedRegion[]>([]);
  const [stack, setStack] = useState<DrillFrame[]>([]);
  const [lastInput, setLastInput] = useState<EquipmentInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pov, setPov] = useState<{ lat: number; lng: number; altitude: number } | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<MatchedRegion | null>(null);

  async function fetchMatch(input: EquipmentInput, parent_id?: string) {
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, parent_id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Match failed');
    const list: MatchedRegion[] = (json.regions ?? []).map(
      (r: MatchedRegion & { fit_score: string | number }) => ({
        ...r,
        fit_score: Number(r.fit_score),
      }),
    );
    return list;
  }

  async function handleSubmit(values: EquipmentInput) {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchMatch(values);
      setLastInput(values);
      setRegions(list);
      setStack([]);
      setPov(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleRegionClick(r: MatchedRegion) {
    // Open the detail panel on every click. Drill-down is opt-in via panel button.
    setSelectedRegion(r);
  }

  async function handleDrillDown() {
    const r = selectedRegion;
    if (!r || !r.has_children || !lastInput) return;
    setLoading(true);
    setError(null);
    try {
      const children = await fetchMatch(lastInput, r.id);
      if (children.length === 0) {
        setError('자식 지역에 매칭되는 결과가 없어요.');
        return;
      }
      setStack((s) => [...s, { regions, parentName: r.name }]);
      setRegions(children);
      setSelectedRegion(null);
      // Compute centroid for camera
      const g = r.geometry;
      const ring =
        g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0];
      let lng = 0,
        lat = 0;
      for (const [x, y] of ring) {
        lng += x;
        lat += y;
      }
      lng /= ring.length;
      lat /= ring.length;
      setPov({ lat, lng, altitude: 0.7 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setStack((s) => {
      if (s.length === 0) return s;
      const last = s[s.length - 1];
      setRegions(last.regions);
      setPov({ lat: 20, lng: 30, altitude: 2.5 });
      return s.slice(0, -1);
    });
  }

  const breadcrumb =
    stack.length > 0
      ? stack.map((f) => f.parentName).filter(Boolean).join(' › ') +
        ' › ' +
        (regions[0]?.name?.split(',').slice(-2).join(',').trim() ?? '')
      : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-2 border-b border-zinc-800 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🌍</span>
          <h1 className="text-lg font-semibold tracking-tight">
            GlobalAgri<span className="text-emerald-400">Fit</span>
          </h1>
          <span className="hidden text-xs text-zinc-500 sm:inline">
            농기구 스펙 → 전세계 적합 농지 시각화
          </span>
        </div>
        <Legend />
      </header>

      <main className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-zinc-800 bg-zinc-950 lg:w-[380px] lg:border-r lg:border-t-0 max-lg:max-h-[55vh]">
          <div className="p-4 sm:p-6">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              농기구 스펙
            </h2>
            <EquipmentForm onMatch={handleSubmit} loading={loading} />
            {error && (
              <p className="mt-3 rounded-md border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
          </div>
        </aside>

        <section className="relative flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-zinc-800 px-4 py-3 sm:px-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                {stack.length > 0 ? (
                  <span>📍 {breadcrumb}</span>
                ) : regions.length > 0 ? (
                  <span>전세계 도/주 단위 — 지역을 클릭하면 시군구로 확대</span>
                ) : (
                  <span>매칭하기 전</span>
                )}
              </div>
              {stack.length > 0 && (
                <button
                  onClick={handleBack}
                  className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:border-emerald-500 hover:text-emerald-300"
                >
                  ← 상위로
                </button>
              )}
            </div>
            <StatsPanel regions={regions} />
          </div>
          <div className="relative min-h-[280px] flex-1 overflow-hidden">
            <GlobeView
              regions={regions}
              pov={pov}
              onRegionClick={handleRegionClick}
            />
            {selectedRegion && (
              <RegionDetailPanel
                region={selectedRegion}
                onClose={() => setSelectedRegion(null)}
                onDrillDown={
                  selectedRegion.has_children ? handleDrillDown : undefined
                }
              />
            )}
            {regions.length === 0 && !loading && (
              <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
                <span className="rounded-full bg-zinc-900/80 px-4 py-2 text-center text-xs text-zinc-300 backdrop-blur">
                  좌측(또는 아래) 폼에서 농기구 스펙을 입력하고 매칭하세요
                </span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function GlobePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
      🌍 지구본 로딩 중…
    </div>
  );
}
