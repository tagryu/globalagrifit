export type SoilType =
  | 'loam'
  | 'clay'
  | 'sand'
  | 'silt'
  | 'peat'
  | 'chernozem';

export type ClimateZone =
  | 'temperate'
  | 'tropical'
  | 'arid'
  | 'continental'
  | 'mediterranean';

export type EquipmentCategory = 'tractor' | 'harvester' | 'plow' | 'seeder';

export interface MatchedRegion {
  id: string;
  name: string;
  country: string;
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
  fit_score: number;
  area_ha: number;
  soil_type: SoilType | null;
  climate_zone: ClimateZone | null;
  avg_slope_deg: number | null;
  avg_temp_c: number | null;
  level: number;
  parent_id: string | null;
  data_source: string | null;
  has_children: boolean;
}

export interface EquipmentInput {
  category: EquipmentCategory;
  power_hp: number;
  max_slope_deg: number;
  compatible_soils: SoilType[];
  compatible_climates: ClimateZone[];
  min_temp_c: number;
  max_temp_c: number;
}

export interface EquipmentRecord {
  id: string;
  company: string | null;
  name: string;
  category: EquipmentCategory | null;
  price_krw: number | null;
  power_hp: number | null;
  cutting_width_m: number | null;
  width_m: number | null;
  weight_kg: number | null;
  max_slope_deg: number | null;
  compatible_soils: SoilType[] | null;
  compatible_climates: ClimateZone[] | null;
  min_temp_c: number | null;
  max_temp_c: number | null;
  target_crops: string[] | null;
  certifications: string[] | null;
}
