"use client";

// Simple SVG-based earnings chart data generator (no external chart library needed)
export interface ChartPoint {
  label: string;
  value: number;
  cumulative: number;
}

export function buildChartData(
  picks: { tournament_name: string; prize_money: number }[]
): ChartPoint[] {
  let cumulative = 0;
  return picks.map(p => {
    cumulative += p.prize_money;
    return {
      label: p.tournament_name.replace(/^the /i, '').slice(0, 15),
      value: p.prize_money,
      cumulative,
    };
  });
}

export function getChartPath(points: ChartPoint[], width: number, height: number): string {
  if (points.length === 0) return '';
  const maxVal = Math.max(...points.map(p => p.cumulative), 1);
  const padding = 20;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  return points.map((p, i) => {
    const x = padding + (i / Math.max(points.length - 1, 1)) * chartW;
    const y = padding + chartH - (p.cumulative / maxVal) * chartH;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}
