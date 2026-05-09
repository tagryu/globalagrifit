import { createClient } from '@supabase/supabase-js';
import { REGIONS, bboxToMultiPolygonGeoJSON } from './seed-data';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) {
    console.error('Missing Supabase env vars in .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  console.log(`Seeding ${REGIONS.length} regions...`);
  let ok = 0;
  for (const r of REGIONS) {
    const geojson = bboxToMultiPolygonGeoJSON(r.bbox);
    const { error } = await supabase.rpc('upsert_region_with_geojson', {
      p_name: r.name,
      p_country: r.country,
      p_geojson: geojson,
      p_soil_type: r.soil_type,
      p_climate_zone: r.climate_zone,
      p_avg_slope_deg: r.avg_slope_deg,
      p_avg_elevation_m: r.avg_elevation_m,
      p_avg_temp_c: r.avg_temp_c,
      p_annual_rainfall_mm: r.annual_rainfall_mm,
      p_primary_crops: r.primary_crops,
      p_area_ha: r.area_ha,
    });
    if (error) {
      console.error(`  X ${r.name}: ${error.message}`);
    } else {
      ok++;
      console.log(`  OK ${r.name}`);
    }
  }
  console.log(`Done: ${ok}/${REGIONS.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
