import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.rpc('match_equipment', {
    p_max_slope: body.max_slope_deg,
    p_soils: body.compatible_soils,
    p_climates: body.compatible_climates,
    p_min_temp: body.min_temp_c,
    p_max_temp: body.max_temp_c,
    p_min_score:
      typeof body.min_score === 'number' ? body.min_score : 0.5,
    p_parent_id: body.parent_id ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ regions: data });
}
