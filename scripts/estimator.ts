// Latitude/longitude → climate/soil/temp inference for region attributes.
// Demo-grade heuristics, not ground truth. Honest about that in PLAN.md.

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

export interface RegionAttrs {
  soil_type: SoilType;
  climate_zone: ClimateZone;
  avg_slope_deg: number;
  avg_elevation_m: number;
  avg_temp_c: number;
  annual_rainfall_mm: number;
  primary_crops: string[];
  area_ha: number;
}

function inBox(
  lat: number,
  lng: number,
  s: number,
  n: number,
  w: number,
  e: number,
): boolean {
  // east-of-180 wraparound not needed for our boxes
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

export function estimateClimate(lat: number, lng: number): ClimateZone {
  const abs = Math.abs(lat);

  // Mediterranean climates (SW US, S Europe + N Africa coast, Chile, S Australia, Cape)
  if (
    inBox(lat, lng, 30, 45, -10, 40) || // Med Basin + N Africa coastal
    inBox(lat, lng, 32, 42, -125, -115) || // California
    inBox(lat, lng, -40, -28, -75, -68) || // Central Chile
    inBox(lat, lng, -38, -30, 113, 125) || // SW Australia
    inBox(lat, lng, -35, -30, 17, 25) // Western Cape
  ) {
    // overlap with desert below: handled by arid check first
  }

  // Arid/desert belts
  if (
    inBox(lat, lng, 14, 32, -17, 35) || // Sahara + Sahel north
    inBox(lat, lng, 12, 35, 30, 60) || // Arabian + N Sudan
    inBox(lat, lng, 25, 42, 50, 78) || // Iran/Afghan/Pak/Turkmen
    inBox(lat, lng, 35, 50, 55, 95) || // Central Asia steppe-desert
    inBox(lat, lng, 28, 42, -118, -100) || // US SW + Mexico N
    inBox(lat, lng, -32, -18, 115, 145) || // Australia interior
    inBox(lat, lng, -30, -15, -75, -65) || // Atacama
    inBox(lat, lng, -30, -18, 12, 22) // Namib/Kalahari
  ) {
    return 'arid';
  }

  // Mediterranean (after arid filter)
  if (
    inBox(lat, lng, 35, 45, -10, 40) ||
    inBox(lat, lng, 32, 42, -125, -115) ||
    inBox(lat, lng, -40, -28, -75, -68) ||
    inBox(lat, lng, -38, -30, 113, 125) ||
    inBox(lat, lng, -35, -30, 17, 25)
  ) {
    return 'mediterranean';
  }

  // Continental (high latitude, deep continental interior)
  if (abs >= 50) return 'continental';
  if (
    // Eurasian continental band
    inBox(lat, lng, 45, 60, 25, 140) ||
    // North American continental
    inBox(lat, lng, 42, 60, -110, -65)
  ) {
    return 'continental';
  }

  // Tropical
  if (abs <= 23.5) return 'tropical';

  // Default mid-latitude
  return 'temperate';
}

export function estimateTemp(lat: number, elevation_m = 0): number {
  const abs = Math.abs(lat);
  // Sea-level temp: ~28 at equator, ~0 at lat 60, ~-10 at 75
  let t = 28 - abs * 0.45;
  // Elevation lapse: -6.5°C per km
  t -= (elevation_m / 1000) * 6.5;
  return Math.round(Math.max(-15, Math.min(30, t)));
}

export function estimateRainfall(climate: ClimateZone): number {
  switch (climate) {
    case 'tropical':
      return 1700;
    case 'temperate':
      return 800;
    case 'mediterranean':
      return 550;
    case 'continental':
      return 500;
    case 'arid':
      return 200;
  }
}

export function estimateSoil(
  lat: number,
  lng: number,
  climate: ClimateZone,
): SoilType {
  // Chernozem belts
  if (
    inBox(lat, lng, 45, 56, 22, 86) || // Ukraine + S Russia + N Kazakhstan
    inBox(lat, lng, 38, 55, -110, -92) || // Great Plains + Canadian prairies
    inBox(lat, lng, -38, -30, -65, -55) // Argentine pampas
  ) {
    return 'chernozem';
  }
  if (climate === 'arid') return 'sand';
  if (climate === 'tropical') return 'clay';
  // Loess/silt belts
  if (
    inBox(lat, lng, 30, 38, 100, 120) || // Loess plateau N China
    inBox(lat, lng, 24, 32, 70, 90) // Indo-Gangetic plain
  ) {
    return 'silt';
  }
  return 'loam';
}

export function estimateSlope(lat: number, lng: number): number {
  // Major mountain regions get higher slope
  if (
    inBox(lat, lng, 27, 40, 70, 105) || // Himalaya + Tibet
    inBox(lat, lng, -45, 12, -82, -65) || // Andes
    inBox(lat, lng, 35, 50, -125, -105) || // Rockies + Sierra
    inBox(lat, lng, 5, 15, 35, 42) || // Ethiopian highlands
    inBox(lat, lng, 36, 50, 5, 16) || // Alps
    inBox(lat, lng, 40, 45, 40, 50) // Caucasus
  ) {
    return 12;
  }
  return 3;
}

export function estimateElevation(lat: number, lng: number): number {
  if (inBox(lat, lng, 27, 40, 70, 105)) return 4000; // Tibet+Himalaya
  if (inBox(lat, lng, -45, 12, -82, -65)) return 1500; // Andes
  if (inBox(lat, lng, 35, 50, -125, -105)) return 1500; // Rockies
  if (inBox(lat, lng, 5, 15, 35, 42)) return 2200; // Ethiopian
  if (inBox(lat, lng, 36, 50, 5, 16)) return 800; // Alps
  return 200;
}

export function estimateCrops(climate: ClimateZone, soil: SoilType): string[] {
  if (climate === 'tropical') return ['rice', 'cassava', 'sugarcane'];
  if (climate === 'arid') return ['wheat', 'sorghum'];
  if (climate === 'mediterranean') return ['olive', 'grape', 'wheat'];
  if (climate === 'continental') {
    if (soil === 'chernozem') return ['wheat', 'sunflower', 'corn'];
    return ['wheat', 'barley'];
  }
  // temperate
  if (soil === 'chernozem') return ['corn', 'soy', 'wheat'];
  return ['wheat', 'corn', 'soy'];
}

export function estimateAttrs(
  centroidLat: number,
  centroidLng: number,
  area_ha: number,
): RegionAttrs {
  const climate = estimateClimate(centroidLat, centroidLng);
  const elevation = estimateElevation(centroidLat, centroidLng);
  const soil = estimateSoil(centroidLat, centroidLng, climate);
  return {
    climate_zone: climate,
    soil_type: soil,
    avg_slope_deg: estimateSlope(centroidLat, centroidLng),
    avg_elevation_m: elevation,
    avg_temp_c: estimateTemp(centroidLat, elevation),
    annual_rainfall_mm: estimateRainfall(climate),
    primary_crops: estimateCrops(climate, soil),
    area_ha,
  };
}
