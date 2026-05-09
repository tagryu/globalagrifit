'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchedRegion } from '@/types';
import { fitColor, fitLabel } from '@/lib/fitColor';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

interface PolygonDatum {
  region: MatchedRegion;
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
}

interface GlobeViewProps {
  regions: MatchedRegion[];
  pov?: { lat: number; lng: number; altitude: number } | null;
  onRegionClick?: (r: MatchedRegion) => void;
}

export function GlobeView({ regions, pov, onRegionClick }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<{
    controls: () => { autoRotate: boolean; autoRotateSpeed: number };
    pointOfView: (
      v: { lat: number; lng: number; altitude: number },
      ms?: number,
    ) => void;
  } | null>(null);

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (globeRef.current) {
        const c = globeRef.current.controls();
        c.autoRotate = true;
        c.autoRotateSpeed = 0.4;
      }
    }, 100);
    return () => clearTimeout(t);
  }, [size.w, size.h]);

  useEffect(() => {
    if (!pov || !globeRef.current) return;
    globeRef.current.pointOfView(pov, 1500);
  }, [pov]);

  const polygons: PolygonDatum[] = useMemo(
    () =>
      regions
        .filter((r) => r.geometry)
        .map((r) => ({ region: r, geometry: r.geometry })),
    [regions],
  );

  const rings = useMemo(() => {
    return regions
      .filter((r) => r.fit_score >= 0.75 && r.geometry)
      .slice(0, 80) // cap for perf
      .map((r) => {
        const g = r.geometry;
        const ring =
          g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0];
        let lng = 0;
        let lat = 0;
        for (const [x, y] of ring) {
          lng += x;
          lat += y;
        }
        lng /= ring.length;
        lat /= ring.length;
        return {
          lat,
          lng,
          maxR: 4 + r.fit_score * 5,
          propagationSpeed: 1.5,
          repeatPeriod: 1400,
          color: 'rgba(34,197,94,0.85)',
        };
      });
  }, [regions]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {size.w > 0 && size.h > 0 && (
        <Globe
          ref={globeRef as never}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          polygonsData={polygons}
          polygonGeoJsonGeometry={(d: object) =>
            (d as PolygonDatum).geometry as unknown as never
          }
          polygonCapColor={(d: object) =>
            fitColor((d as PolygonDatum).region.fit_score)
          }
          polygonSideColor={() => 'rgba(0,0,0,0.2)'}
          polygonStrokeColor={() => '#0f172a'}
          polygonAltitude={(d: object) => {
            const s = (d as PolygonDatum).region.fit_score;
            // Stronger lift for high-fit regions for visual "lighting up" effect
            return s >= 0.75 ? 0.02 + s * 0.08 : 0.005 + s * 0.02;
          }}
          polygonLabel={(d: object) => {
            const r = (d as PolygonDatum).region;
            const drillHint = r.has_children
              ? '<div style="margin-top:4px;color:#34d399;font-size:10px">▸ 클릭하면 더 자세히</div>'
              : '';
            const sourceTag =
              r.data_source === 'soilgrids_v2'
                ? '<span style="background:#065f46;color:#a7f3d0;padding:1px 4px;border-radius:4px;font-size:9px">SoilGrids 실데이터</span>'
                : '<span style="background:#3f3f46;color:#a1a1aa;padding:1px 4px;border-radius:4px;font-size:9px">추정</span>';
            return `
              <div style="background:#0f172a;color:#e2e8f0;padding:8px 10px;border-radius:8px;font-family:sans-serif;font-size:12px;border:1px solid #334155;max-width:240px">
                <div style="font-weight:600;margin-bottom:4px">${r.name}</div>
                <div style="color:#94a3b8;font-size:11px">${r.country}</div>
                <div style="margin-top:4px">적합도 <b>${(r.fit_score * 100).toFixed(0)}%</b> · ${fitLabel(r.fit_score)}</div>
                <div style="color:#94a3b8;font-size:10px;margin-top:2px">
                  ${r.soil_type ?? '-'} · ${r.climate_zone ?? '-'} · slope ${r.avg_slope_deg ?? '-'}° · ${r.avg_temp_c ?? '-'}℃
                </div>
                <div style="margin-top:4px">${sourceTag}</div>
                ${drillHint}
              </div>`;
          }}
          polygonsTransitionDuration={500}
          ringsData={rings}
          ringColor={() => (t: number) =>
            `rgba(34,197,94,${(1 - t).toFixed(2)})`
          }
          ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed"
          ringRepeatPeriod="repeatPeriod"
          onPolygonClick={(d: object) => {
            const r = (d as PolygonDatum).region;
            // Always zoom to clicked region for feedback
            const g = r.geometry;
            const ring =
              g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0];
            if (ring?.length) {
              let lng = 0,
                lat = 0;
              for (const [x, y] of ring) {
                lng += x;
                lat += y;
              }
              lng /= ring.length;
              lat /= ring.length;
              globeRef.current?.pointOfView(
                { lat, lng, altitude: r.has_children ? 0.7 : 1.0 },
                1200,
              );
            }
            // If admin_2 children exist, drill down
            onRegionClick?.(r);
          }}
        />
      )}
    </div>
  );
}
