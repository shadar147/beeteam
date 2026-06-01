export function MoodTrendBars({ trend }: { trend: number[] }) {
  return (
    <span data-mood-bars className="inline-flex items-end gap-[3px]" style={{ height: 18 }}>
      {trend.map((v, i) => (
        <i
          key={i}
          data-bar
          style={{
            display: "block",
            width: 4,
            borderRadius: 2,
            height: `${4 + v * 1.4}px`,
            opacity: 0.35 + (i / Math.max(trend.length - 1, 1)) * 0.65,
            background:
              v >= 7 ? "var(--brand)" : v >= 5 ? "var(--warn)" : "var(--miss)",
          }}
        />
      ))}
    </span>
  );
}
