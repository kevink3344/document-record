import { useMemo, useState } from 'react';
import { ChartLine, ShieldCheck } from 'lucide-react';
import type { DashboardResponse } from '../types';

type DashboardInsightTab = 'ACKNOWLEDGMENTS' | 'COMPLIANCE';

type ComplianceChartProps = {
  compliance: DashboardResponse['compliance'];
  trend: DashboardResponse['trend'];
};

export function ComplianceChart({ compliance, trend }: ComplianceChartProps) {
  const [activeTab, setActiveTab] = useState<DashboardInsightTab>('ACKNOWLEDGMENTS');
  const teams = useMemo(() => {
    const grouped = new Map<string, Array<{ day: string; acknowledgment_count: number }>>();
    trend.forEach((item) => {
      const list = grouped.get(item.team_name) ?? [];
      list.push({ day: item.day, acknowledgment_count: item.acknowledgment_count });
      grouped.set(item.team_name, list);
    });
    return [...grouped.entries()].slice(0, 4);
  }, [trend]);

  const maxTrendValue = Math.max(1, ...trend.map((item) => item.acknowledgment_count));
  const palette = ['#0078d4', '#00a2ae', '#7f56d9', '#ff7a00'];
  const hasAcknowledgmentData = trend.length > 0;
  const hasComplianceData = compliance.length > 0;

  if (!hasAcknowledgmentData && !hasComplianceData) {
    return (
      <div className="rounded-[3px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Team Insights
          </h3>
          <ShieldCheck size={16} className="text-slate-500" />
        </div>
        <p className="text-xs text-slate-500">No team data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[3px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Team Insights
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Monitor daily acknowledgments and signed-vs-assigned coverage by team.
          </p>
        </div>
        {activeTab === 'ACKNOWLEDGMENTS' ? (
          <ChartLine size={16} className="text-slate-500" />
        ) : (
          <ShieldCheck size={16} className="text-slate-500" />
        )}
      </div>

      <div className="mb-4 flex gap-6 border-b border-slate-200 dark:border-slate-700">
        {[
          { id: 'ACKNOWLEDGMENTS' as const, label: 'Daily Acknowledgments' },
          { id: 'COMPLIANCE' as const, label: 'Compliance Rate' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'ACKNOWLEDGMENTS' ? (
        hasAcknowledgmentData ? (
          <>
            <svg viewBox="0 0 640 260" className="h-64 w-full rounded-[3px] bg-slate-50 dark:bg-slate-900/40">
              {[0, 1, 2, 3, 4].map((n) => (
                <line
                  key={n}
                  x1="40"
                  y1={30 + n * 50}
                  x2="620"
                  y2={30 + n * 50}
                  stroke="#dfe4ea"
                  strokeWidth="1"
                />
              ))}
              {teams.map(([teamName, points], index) => {
                const d = points
                  .map((point, itemIndex) => {
                    const x = 40 + (itemIndex * 580) / Math.max(points.length - 1, 1);
                    const y = 230 - (point.acknowledgment_count / maxTrendValue) * 190;
                    return `${itemIndex === 0 ? 'M' : 'L'} ${x} ${y}`;
                  })
                  .join(' ');

                return (
                  <g key={teamName}>
                    <path d={d} fill="none" stroke={palette[index]} strokeWidth="3" />
                    {points.map((point, itemIndex) => {
                      const x = 40 + (itemIndex * 580) / Math.max(points.length - 1, 1);
                      const y = 230 - (point.acknowledgment_count / maxTrendValue) * 190;
                      return <circle key={`${teamName}-${point.day}`} cx={x} cy={y} r="4" fill={palette[index]} />;
                    })}
                    <text x={50} y={24 + index * 16} fill={palette[index]} fontSize="11" fontWeight="600">
                      {teamName}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Counts represent completed acknowledgments per day across the last 14 days.
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-500">No acknowledgment activity available yet.</p>
        )
      ) : hasComplianceData ? (
        <>
          <div className="space-y-3">
            {compliance.map(({ team_name, signed, total }) => {
              const pct = total > 0 ? Math.round((signed / total) * 100) : 0;
              const barColor =
                pct >= 80
                  ? 'bg-emerald-500'
                  : pct >= 50
                    ? 'bg-amber-400'
                    : 'bg-red-500';
              const labelColor =
                pct >= 80
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : pct >= 50
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-red-700 dark:text-red-400';

              return (
                <div key={team_name}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="max-w-[60%] truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                      {team_name}
                    </span>
                    <span className={`text-xs font-semibold tabular-nums ${labelColor}`}>
                      {signed}/{total} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> ≥80% compliant
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> 50–79%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> &lt;50%
            </span>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500">No team compliance data available yet.</p>
      )}
    </div>
  );
}
