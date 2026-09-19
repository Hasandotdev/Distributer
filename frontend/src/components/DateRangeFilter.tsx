import { startOfMonth, subMonths, startOfYear, format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

const presets = [
  { label: 'This Month', getRange: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Last 3 Months', getRange: () => ({ from: startOfMonth(subMonths(new Date(), 2)), to: new Date() }) },
  { label: 'Last 6 Months', getRange: () => ({ from: startOfMonth(subMonths(new Date(), 5)), to: new Date() }) },
  { label: 'This Year', getRange: () => ({ from: startOfYear(new Date()), to: new Date() }) },
];

function toInputValue(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export default function DateRangeFilter({ from, to, onChange }: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
        />
      </div>
      <div className="flex gap-1.5">
        {presets.map((p) => {
          const { from: pf, to: pt } = p.getRange();
          const isActive = from === toInputValue(pf) && to === toInputValue(pt);
          return (
            <button
              key={p.label}
              onClick={() => onChange(toInputValue(pf), toInputValue(pt))}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                isActive
                  ? "bg-blue-600 text-white"
                  : "border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
