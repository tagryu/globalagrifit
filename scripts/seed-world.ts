// Seed Supabase regions with admin_1 polygons for major agricultural countries
// and admin_0 polygons for the rest.
//
// Pipeline:
// 1) Load Natural Earth admin_0 (countries) and admin_1 (10m, states/provinces).
// 2) Pick admin_1 for the "states-of-interest" countries; admin_0 for the rest.
// 3) Compute centroid → estimate climate/soil/temp/etc.
// 4) Simplify polygon coordinates (stride sampling) so the globe stays smooth.
// 5) Truncate `regions` table and bulk insert.

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { estimateAttrs } from './estimator';

type Polygon = number[][][]; // [ring][point][lng,lat]
type MultiPoly = Polygon[];
type GeoJSONGeometry =
  | { type: 'Polygon'; coordinates: Polygon }
  | { type: 'MultiPolygon'; coordinates: MultiPoly };

interface Feature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: GeoJSONGeometry;
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

// Top agricultural countries: break down to states/provinces for granular matching.
// Everything else stays at country level (admin_0).
const ADMIN_1_COUNTRIES = new Set([
  'United States of America',
  'Canada',
  'China',
  'India',
  'Russia',
  'Australia',
  'Brazil',
  'Japan',
  'South Korea',
  'Argentina',
  'Mexico',
  'Indonesia',
  'Pakistan',
  'Kazakhstan',
  'Ukraine',
]);

// Tiny landlocked or low-relevance entries to skip.
const SKIP_COUNTRIES = new Set([
  'Antarctica',
  'Vatican',
  'San Marino',
  'Monaco',
  'Liechtenstein',
  'Andorra',
  'Maldives',
  'Marshall Islands',
  'Tuvalu',
  'Nauru',
  'Kiribati',
  'Palau',
  'Saint Kitts and Nevis',
  'Saint Vincent and the Grenadines',
  'Saint Lucia',
  'Grenada',
  'Antigua and Barbuda',
  'Dominica',
  'Barbados',
  'Comoros',
  'Sao Tome and Principe',
  'Seychelles',
]);

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

function asMultiPolygon(g: GeoJSONGeometry): MultiPoly {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

// Stride-sample ring vertices. Keep first and last (which equals first), drop most middle points.
// This is much faster than turf.simplify and good enough for globe rendering.
function simplifyMultiPolygon(mp: MultiPoly, maxPointsPerRing: number): MultiPoly {
  return mp
    .map((poly) =>
      poly
        .map((ring) => {
          if (ring.length <= maxPointsPerRing + 2) return ring;
          const stride = Math.ceil(ring.length / maxPointsPerRing);
          const out: number[][] = [];
          for (let i = 0; i < ring.length; i += stride) out.push(ring[i]);
          // ensure ring closure
          const first = ring[0];
          const last = out[out.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) out.push(first);
          return out;
        })
        .filter((ring) => ring.length >= 4),
    )
    .filter((poly) => poly.length > 0);
}

function centroid(mp: MultiPoly): [number, number] {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const poly of mp) {
    const ring = poly[0];
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
      n++;
    }
  }
  return n === 0 ? [0, 0] : [sx / n, sy / n];
}

function bboxArea(mp: MultiPoly): number {
  let minX = 180,
    minY = 90,
    maxX = -180,
    maxY = -90;
  for (const poly of mp) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  // very rough hectares from bbox area; just for relative scaling
  const dx = maxX - minX;
  const dy = maxY - minY;
  // 1 deg lat ≈ 111 km; 1 deg lng ≈ 111*cos(lat) km
  const latMid = (minY + maxY) / 2;
  const kmPerDegLng = 111 * Math.cos((latMid * Math.PI) / 180);
  const area_km2 = dx * kmPerDegLng * dy * 111;
  return Math.max(0, Math.round(area_km2 * 100)); // km² → ha
}

interface RegionRow {
  name: string;
  country: string;
  geojson: GeoJSONGeometry;
  attrs: ReturnType<typeof estimateAttrs>;
}

function buildRows(): RegionRow[] {
  const a0 = JSON.parse(
    fs.readFileSync(path.resolve('data/admin_0.geojson'), 'utf8'),
  ) as FeatureCollection;
  const a1 = JSON.parse(
    fs.readFileSync(path.resolve('data/admin_1_10m.geojson'), 'utf8'),
  ) as FeatureCollection;

  const rows: RegionRow[] = [];

  // admin_1 picks
  for (const f of a1.features) {
    const adm = String(f.properties.admin ?? '');
    if (!ADMIN_1_COUNTRIES.has(adm)) continue;
    const name = String(f.properties.name ?? '');
    if (!name) continue;
    const mp = asMultiPolygon(f.geometry);
    const simplified = simplifyMultiPolygon(mp, 80);
    if (simplified.length === 0) continue;
    const [cx, cy] = centroid(simplified);
    const area = bboxArea(simplified);
    const attrs = estimateAttrs(cy, cx, area);
    rows.push({
      name: `${name}, ${adm}`,
      country: adm,
      geojson: { type: 'MultiPolygon', coordinates: simplified },
      attrs,
    });
  }

  // admin_0 picks (countries NOT in ADMIN_1_COUNTRIES)
  for (const f of a0.features) {
    const adm = String(
      f.properties.ADMIN ?? f.properties.NAME ?? '',
    );
    if (ADMIN_1_COUNTRIES.has(adm)) continue;
    if (SKIP_COUNTRIES.has(adm)) continue;
    if (!adm) continue;
    const mp = asMultiPolygon(f.geometry);
    const simplified = simplifyMultiPolygon(mp, 80);
    if (simplified.length === 0) continue;
    const [cx, cy] = centroid(simplified);
    const area = bboxArea(simplified);
    const attrs = estimateAttrs(cy, cx, area);
    rows.push({
      name: adm,
      country: adm,
      geojson: { type: 'MultiPolygon', coordinates: simplified },
      attrs,
    });
  }

  return rows;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, key);

  console.log('Building rows from Natural Earth GeoJSON...');
  const rows = buildRows();
  console.log(`Built ${rows.length} regions.`);

  // Truncate previous data first
  console.log('Clearing old regions...');
  const { error: delErr } = await supabase
    .from('regions')
    .delete()
    .gte('avg_slope_deg', -1);
  if (delErr) {
    console.error('Delete error:', delErr.message);
    process.exit(1);
  }

  // Insert via RPC for proper geom handling. Batch in parallel chunks.
  const concurrency = 8;
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (r) => {
        const { error } = await supabase.rpc('upsert_region_with_geojson', {
          p_name: r.name,
          p_country: r.country,
          p_geojson: r.geojson,
          p_soil_type: r.attrs.soil_type,
          p_climate_zone: r.attrs.climate_zone,
          p_avg_slope_deg: r.attrs.avg_slope_deg,
          p_avg_elevation_m: r.attrs.avg_elevation_m,
          p_avg_temp_c: r.attrs.avg_temp_c,
          p_annual_rainfall_mm: r.attrs.annual_rainfall_mm,
          p_primary_crops: r.attrs.primary_crops,
          p_area_ha: r.attrs.area_ha,
        });
        return { r, error };
      }),
    );
    for (const { r, error } of results) {
      if (error) {
        failed++;
        console.error(`  X ${r.name}: ${error.message}`);
      } else {
        ok++;
      }
    }
    process.stdout.write(`  ${Math.min(i + concurrency, rows.length)}/${rows.length}\r`);
  }
  console.log(`\nDone: ${ok} ok, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
