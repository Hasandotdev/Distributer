import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function parseAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const str = String(value).replace(/[^\d.\-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function parseDate(value: any): string {
  if (!value) return todayLocal();

  if (value instanceof Date && !isNaN(value.getTime())) {
    return toLocalDateStr(value);
  }

  if (typeof value === 'number' && value > 40000 && value < 60000) {
    const utcDays = Math.floor(value - 25569);
    const utcMs = utcDays * 86400 * 1000;
    const d = new Date(utcMs);
    return toLocalDateStr(d);
  }

  const str = String(value).trim();
  if (!str) return todayLocal();

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split('T')[0];

  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

  const mdy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const y = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${y}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return toLocalDateStr(d);

  return todayLocal();
}

export function todayLocal(): string {
  return toLocalDateStr(new Date());
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
