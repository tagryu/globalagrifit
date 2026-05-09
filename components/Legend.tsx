export function Legend() {
  const items = [
    { color: 'rgba(34,197,94,0.85)', label: '매우 적합 (75%+)' },
    { color: 'rgba(234,179,8,0.85)', label: '적합 (50–74%)' },
    { color: 'rgba(249,115,22,0.85)', label: '제한적 (25–49%)' },
    { color: 'rgba(239,68,68,0.85)', label: '부적합 (<25%)' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-white/20"
            style={{ backgroundColor: it.color }}
          />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
