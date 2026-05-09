import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET() {
  const supabase = client();
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .order('company', { ascending: true })
    .order('name', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ equipment: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = client();
  const payload = {
    company: body.company,
    name: body.name,
    category: body.category,
    price_krw: body.price_krw ?? null,
    power_hp: body.power_hp,
    cutting_width_m: body.cutting_width_m ?? null,
    width_m: body.width_m ?? null,
    weight_kg: body.weight_kg ?? null,
    max_slope_deg: body.max_slope_deg,
    compatible_soils: body.compatible_soils,
    compatible_climates: body.compatible_climates,
    min_temp_c: body.min_temp_c,
    max_temp_c: body.max_temp_c,
    target_crops: body.target_crops ?? null,
    certifications: body.certifications ?? null,
  };
  const { data, error } = await supabase
    .from('equipment')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ equipment: data });
}
