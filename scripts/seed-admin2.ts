// Seed admin_2 (counties / 시군구 / 市町村 / Kreise / départements / 县) for 6 core countries.
// Korea + USA: real SoilGrids classification at centroid.
// Japan/China/Germany/France: heuristic (lat/lng based).
// Climate/temp/rainfall stay heuristic for everyone (Open-Meteo skipped for speed).

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { estimateAttrs, type SoilType, type ClimateZone } from './estimator';

type Polygon = number[][][];
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

const COUNTRIES: {
  iso: string;
  country_db: string; // matches `regions.country` in DB
  use_real_soil: boolean;
}[] = [
  { iso: 'KOR', country_db: 'South Korea', use_real_soil: true },
  { iso: 'USA', country_db: 'United States of America', use_real_soil: true },
  { iso: 'JPN', country_db: 'Japan', use_real_soil: false },
  { iso: 'CHN', country_db: 'China', use_real_soil: false },
  { iso: 'DEU', country_db: 'Germany', use_real_soil: false },
  { iso: 'FRA', country_db: 'France', use_real_soil: false },
];

// WRB Reference Soil Group → our 6-class taxonomy.
const WRB_TO_SOIL: Record<string, SoilType> = {
  Chernozems: 'chernozem',
  Phaeozems: 'chernozem',
  Kastanozems: 'chernozem',
  Vertisols: 'clay',
  Luvisols: 'clay',
  Acrisols: 'clay',
  Lixisols: 'clay',
  Plinthosols: 'clay',
  Stagnosols: 'clay',
  Nitisols: 'clay',
  Ferralsols: 'clay',
  Alisols: 'clay',
  Arenosols: 'sand',
  Calcisols: 'sand',
  Gypsisols: 'sand',
  Solonchaks: 'sand',
  Solonetz: 'sand',
  Podzols: 'sand',
  Durisols: 'sand',
  Histosols: 'peat',
  Cambisols: 'loam',
  Cryosols: 'loam',
  Gleysols: 'loam',
  Andosols: 'loam',
  Umbrisols: 'loam',
  Regosols: 'loam',
  Leptosols: 'loam',
  Anthrosols: 'loam',
  Technosols: 'loam',
  Albeluvisols: 'loam',
  Fluvisols: 'silt',
  Planosols: 'silt',
  Retisols: 'loam',
};

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

function simplifyMultiPolygon(mp: MultiPoly, maxPointsPerRing = 50): MultiPoly {
  return mp
    .map((poly) =>
      poly
        .map((ring) => {
          if (ring.length <= maxPointsPerRing + 2) return ring;
          const stride = Math.ceil(ring.length / maxPointsPerRing);
          const out: number[][] = [];
          for (let i = 0; i < ring.length; i += stride) out.push(ring[i]);
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

function bboxAreaHa(mp: MultiPoly): number {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const poly of mp) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const dx = maxX - minX;
  const dy = maxY - minY;
  const latMid = (minY + maxY) / 2;
  const kmPerDegLng = 111 * Math.cos((latMid * Math.PI) / 180);
  return Math.max(0, Math.round(dx * kmPerDegLng * dy * 111 * 100));
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[一-鿿]/g, '') // strip cjk
    .replace(/[-\s]+do$/, '')
    .replace(/[-\s]+si$/, '')
    .replace(/[-\s]+gun$/, '')
    .replace(/[-\s]+gu$/, '')
    .replace(/[ -]/g, '')
    .replace(/ō/g, 'o')
    .replace(/ū/g, 'u')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

async function querySoilGridsClass(
  lat: number,
  lng: number,
): Promise<SoilType | null> {
  const url = `https://rest.isric.org/soilgrids/v2.0/classification/query?lon=${lng}&lat=${lat}&number_classes=1`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) {
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        return null;
      }
      const j = (await res.json()) as { wrb_class_name?: string };
      const cls = j.wrb_class_name;
      if (!cls) return null;
      const last = cls.split(/\s+/).pop()!;
      return WRB_TO_SOIL[last] ?? WRB_TO_SOIL[cls] ?? null;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return null;
}

interface SeedRow {
  name: string;
  country: string;
  parent_id: string | null;
  level: number;
  data_source: string;
  geojson: GeoJSONGeometry;
  attrs: ReturnType<typeof estimateAttrs> & { soil_type: SoilType; climate_zone: ClimateZone };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, key);

  console.log('Loading admin_1 lookup from DB...');
  const { data: parents } = await supabase
    .from('regions')
    .select('id, name, country')
    .in('country', COUNTRIES.map((c) => c.country_db));
  if (!parents) {
    console.error('Failed to load admin_1 lookup');
    process.exit(1);
  }
  // Map: country|normalized_name → id (admin_1)
  // Plus country|null → id (admin_0/country level row)
  const parentLookup = new Map<string, string>();
  const countryLookup = new Map<string, string>();
  for (const p of parents) {
    if (p.name === p.country) {
      countryLookup.set(p.country, p.id);
      continue;
    }
    const stripped = p.name.replace(`, ${p.country}`, '').trim();
    parentLookup.set(`${p.country}::${normalize(stripped)}`, p.id);
  }
  console.log(`  ${parentLookup.size} admin_1 + ${countryLookup.size} country-level rows.`);

  // Build all seed rows first (so we can show progress on SoilGrids calls).
  const allRows: SeedRow[] = [];
  for (const c of COUNTRIES) {
    const filePath = path.resolve(`data/gadm41_${c.iso}_2.json`);
    const fc = JSON.parse(fs.readFileSync(filePath, 'utf8')) as FeatureCollection;
    console.log(`${c.iso}: ${fc.features.length} features (real soil: ${c.use_real_soil})`);

    for (const f of fc.features) {
      const name1 = String(f.properties.NAME_1 ?? '');
      const name2 = String(f.properties.NAME_2 ?? '');
      if (!name2) continue;
      const mp = asMultiPolygon(f.geometry);
      const simplified = simplifyMultiPolygon(mp, 50);
      if (simplified.length === 0) continue;
      const [cx, cy] = centroid(simplified);
      const area = bboxAreaHa(simplified);
      const heur = estimateAttrs(cy, cx, area);

      // Resolve parent_id: try admin_1 by NAME_1, then country
      let parent_id: string | null =
        parentLookup.get(`${c.country_db}::${normalize(name1)}`) ?? null;
      if (!parent_id) parent_id = countryLookup.get(c.country_db) ?? null;

      const display = `${name2}${name1 ? ', ' + name1 : ''}, ${c.country_db}`;
      allRows.push({
        name: display,
        country: c.country_db,
        parent_id,
        level: 2,
        data_source: c.use_real_soil ? 'pending_soilgrids' : 'heuristic',
        geojson: { type: 'MultiPolygon', coordinates: simplified },
        attrs: heur,
      });
    }
  }

  console.log(`Total admin_2 rows: ${allRows.length}`);
  const realRows = allRows.filter((r) => r.data_source === 'pending_soilgrids');
  console.log(`Querying SoilGrids for ${realRows.length} rows (Korea+USA)...`);

  // Parallel SoilGrids queries with a small concurrency limit
  const concurrency = 12;
  let done = 0;
  let realOk = 0;
  for (let i = 0; i < realRows.length; i += concurrency) {
    const batch = realRows.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (r) => {
        const [cx, cy] = centroid(r.geojson.coordinates as MultiPoly);
        const soil = await querySoilGridsClass(cy, cx);
        if (soil) {
          r.attrs.soil_type = soil;
          r.data_source = 'soilgrids_v2';
          realOk++;
        } else {
          r.data_source = 'heuristic_fallback';
        }
      }),
    );
    done += batch.length;
    if (done % 60 === 0 || done === realRows.length) {
      process.stdout.write(`  ${done}/${realRows.length} (ok=${realOk})\r`);
    }
  }
  console.log(`\n  SoilGrids done: ${realOk}/${realRows.length} ok.`);

  // Insert all rows in parallel batches
  console.log('Inserting into Supabase...');
  let ok = 0;
  let failed = 0;
  const insertConcurrency = 16;
  for (let i = 0; i < allRows.length; i += insertConcurrency) {
    const batch = allRows.slice(i, i + insertConcurrency);
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
          p_level: r.level,
          p_parent_id: r.parent_id,
          p_data_source: r.data_source,
        });
        return { r, error };
      }),
    );
    for (const { r, error } of results) {
      if (error) {
        failed++;
        if (failed <= 5) console.error(`  X ${r.name}: ${error.message}`);
      } else ok++;
    }
    process.stdout.write(`  ${Math.min(i + insertConcurrency, allRows.length)}/${allRows.length}\r`);
  }
  console.log(`\nDone: ${ok} ok, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
