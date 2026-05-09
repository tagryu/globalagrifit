export function fitColor(score: number): string {
  if (score >= 0.75) return 'rgba(34,197,94,0.78)';
  if (score >= 0.5) return 'rgba(234,179,8,0.65)';
  if (score >= 0.25) return 'rgba(249,115,22,0.55)';
  return 'rgba(239,68,68,0.4)';
}

export function fitLabel(score: number): string {
  if (score >= 0.75) return '매우 적합';
  if (score >= 0.5) return '적합';
  if (score >= 0.25) return '제한적';
  return '부적합';
}
