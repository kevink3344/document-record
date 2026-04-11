import { useMemo } from 'react';
import { ChartLine } from 'lucide-react';
import type { DashboardResponse } from '../types';

export function TrendChart({ trend }: { trend: DashboardResponse['trend'] }) {
  const teams = useMemo(() => {
    const grouped = new Map<string, Array<{ day: string; ticket_count: number }>>();
    trend.forEach((item) => {
      const list = grouped.get(item.team_name) ?? [];
      list.push({ day: item.day, ticket_count: item.ticket_count });
      grouped.set(item.team_name, list);
    });
    return [...grouped.entries()].slice(0, 4);
  }, [trend]);

  const maxValue = Math.max(1, ...trend.map((item) => item.ticket_count));
  const palette = ['#0078d4', '#00a2ae', '#7f56d9', '#ff7a00'];

  return (
    <div className="rounded-[3px] border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Daily Team Ticket Trend</h3>
        <ChartLine size={16} className="text-slate-500" />
      </div>
      <svg viewBox="0 0 640 260" className="h-64 w-full bg-slate-50">
        {[0, 1, 2, 3, 4].map((n) => (
          <line key={n} x1="40" y1={30 + n * 50} x2="620" y2={30 + n * 50} stroke="#dfe4ea" strokeWidth="1" />
        ))}
        {teams.map(([teamName, points], index) => {
          const d = points
            .map((point, itemIndex) => {
              const x = 40 + (itemIndex * 580) / Math.max(points.length - 1, 1);
              const y = 230 - (point.ticket_count / maxValue) * 190;
              return `${itemIndex === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .join(' ');

          return (
            <g key={teamName}>
              <path d={d} fill="none" stroke={palette[index]} strokeWidth="3" />
              <text x={50} y={24 + index * 16} fill={palette[index]} fontSize="11" fontWeight="600">
                {teamName}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}