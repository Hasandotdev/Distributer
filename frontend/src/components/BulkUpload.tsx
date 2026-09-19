import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkUploadProps {
  title: string;
  templateHeaders: string[];
  displayHeaders?: string[];
  columnAliases?: Record<string, string>;
  onUpload: (data: any[], rawHeaders?: string[]) => Promise<void>;
}

export default function BulkUpload({ title, templateHeaders, displayHeaders, columnAliases, onUpload }: BulkUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function downloadTemplate() {
    const headers = displayHeaders || templateHeaders;
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws['!cols'] = headers.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_template.xlsx`);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rows.length === 0) {
        setResult({ type: 'error', message: 'The file is empty or has no valid rows.' });
        return;
      }

      const rawHeaders = Object.keys(rows[0] as object).map((h) => h.trim());
      const normalizedHeaders = rawHeaders.map((h) => {
        const lower = h.toLowerCase();
        return columnAliases?.[lower] || lower;
      });
      const missing = templateHeaders.filter((h) => !normalizedHeaders.includes(h.trim().toLowerCase()));
      if (missing.length > 0) {
        setResult({ type: 'error', message: `Missing columns: ${missing.join(', ')}` });
        return;
      }

      const normalizedRows = rows.map((row: any) => {
        const normalized: Record<string, any> = {};
        Object.entries(row).forEach(([key, value]) => {
          const cleanKey = key.trim().toLowerCase();
          const mappedKey = columnAliases?.[cleanKey] || cleanKey;
          normalized[mappedKey] = typeof value === 'string' ? value.trim() : value;
        });
        return normalized;
      });

      await onUpload(normalizedRows as any[], rawHeaders);
      setResult({ type: 'success', message: `${rows.length} rows uploaded successfully.` });
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Upload failed.' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-neutral-900">{title}</h3>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          <Download className="h-4 w-4" />
          Download Template
        </button>

        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition",
            uploading ? "cursor-not-allowed bg-neutral-400" : "bg-neutral-900 hover:bg-neutral-800"
          )}
        >
          <Upload className="h-4 w-4" />
          {uploading ? 'Uploading...' : 'Upload File'}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {uploading && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-neutral-500" />
          </div>
        </div>
      )}

      {result && (
        <div
          className={cn(
            "mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm",
            result.type === 'success'
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          )}
        >
          {result.type === 'success' ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {result.message}
        </div>
      )}
    </div>
  );
}
