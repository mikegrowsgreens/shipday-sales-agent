'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X, ChevronDown } from 'lucide-react';

type ImportFormat = 'auto' | 'audit' | 'regional' | 'upgrades';

interface ImportResult {
  success: boolean;
  format?: string;
  imported?: number;
  updated?: number;
  matched?: number;
  changes_created?: number;
  skipped: number;
  total: number;
  errors: string[];
}

export function CustomerImport() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ImportFormat>('auto');
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsePreview = useCallback(async (f: File) => {
    const text = await f.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;

    // Simple CSV parsing for preview (first 6 rows)
    const parseRow = (line: string) => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
        current += char;
      }
      result.push(current.trim());
      return result;
    };

    const h = parseRow(lines[0]);
    setHeaders(h);

    const rows: string[][] = [];
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      rows.push(parseRow(lines[i]));
    }
    setPreview(rows);

    // Auto-detect format
    const lower = h.map(x => x.toLowerCase());
    if (lower.includes('name') && lower.includes('contact') && lower.includes('plan')) {
      setFormat('audit');
    } else if (lower.includes('company_id') || lower.includes('avg_completed_orders')) {
      setFormat('regional');
    } else if (lower.includes('close date') && lower.includes('commission')) {
      setFormat('upgrades');
    }
  }, []);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.tsv') && !f.name.endsWith('.txt')) {
      return;
    }
    setFile(f);
    setResult(null);
    parsePreview(f);
  }, [parsePreview]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', format === 'upgrades' ? 'auto' : format);

      const endpoint = format === 'upgrades'
        ? '/api/customers/import/upgrades'
        : '/api/customers/import';

      const res = await fetch(endpoint, { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, skipped: 0, total: 0, errors: [data.error || 'Import failed'] });
      } else {
        setResult(data);
      }
    } catch (err) {
      setResult({ success: false, skipped: 0, total: 0, errors: [err instanceof Error ? err.message : 'Network error'] });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setResult(null);
    setFormat('auto');
  };

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      {!file && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
          }`}
        >
          <Upload className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-300 font-medium">Drop CSV file here or click to browse</p>
          <p className="text-gray-500 text-sm mt-1">Supports Audit, Regional, and Upgrade tab exports</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      )}

      {/* File Selected */}
      {file && !result && (
        <div className="space-y-4">
          {/* File info bar */}
          <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-white text-sm font-medium">{file.name}</p>
                <p className="text-gray-500 text-xs">{(file.size / 1024).toFixed(1)} KB &middot; {preview.length} rows previewed</p>
              </div>
            </div>
            <button onClick={reset} className="text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Format selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400">Format:</label>
            <div className="relative">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ImportFormat)}
                className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="auto">Auto-detect</option>
                <option value="audit">Audit Sheet</option>
                <option value="regional">Regional Customer List</option>
                <option value="upgrades">Upgrade History</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
            <span className="text-xs text-gray-500">
              {format === 'audit' && 'Name, Contact, Email, Phone, Plan, Status...'}
              {format === 'regional' && 'email, company_id, address, account_plan...'}
              {format === 'upgrades' && 'Name, Plan, Email, Close Date, Commission'}
              {format === 'auto' && 'Will detect from headers'}
            </span>
          </div>

          {/* Preview table */}
          {headers.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800">
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri} className="border-t border-gray-800">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-gray-300 whitespace-nowrap max-w-[200px] truncate">
                          {cell || <span className="text-gray-600">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Import button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import {format === 'upgrades' ? 'Upgrades' : 'Customers'}
                </>
              )}
            </button>
            <button
              onClick={reset}
              className="px-4 py-2.5 text-gray-400 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className={`rounded-lg border p-5 ${
          result.success ? 'border-green-700 bg-green-900/20' : 'border-red-700 bg-red-900/20'
        }`}>
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`font-medium ${result.success ? 'text-green-300' : 'text-red-300'}`}>
                {result.success ? 'Import Complete' : 'Import Failed'}
              </p>

              {result.success && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {result.imported !== undefined && (
                    <div className="bg-gray-800/50 rounded px-3 py-2">
                      <p className="text-2xl font-bold text-white">{result.imported}</p>
                      <p className="text-xs text-gray-400">New Records</p>
                    </div>
                  )}
                  {result.updated !== undefined && (
                    <div className="bg-gray-800/50 rounded px-3 py-2">
                      <p className="text-2xl font-bold text-white">{result.updated}</p>
                      <p className="text-xs text-gray-400">Updated</p>
                    </div>
                  )}
                  {result.matched !== undefined && (
                    <div className="bg-gray-800/50 rounded px-3 py-2">
                      <p className="text-2xl font-bold text-white">{result.matched}</p>
                      <p className="text-xs text-gray-400">Matched</p>
                    </div>
                  )}
                  {result.changes_created !== undefined && (
                    <div className="bg-gray-800/50 rounded px-3 py-2">
                      <p className="text-2xl font-bold text-white">{result.changes_created}</p>
                      <p className="text-xs text-gray-400">Plan Changes</p>
                    </div>
                  )}
                  <div className="bg-gray-800/50 rounded px-3 py-2">
                    <p className="text-2xl font-bold text-white">{result.skipped}</p>
                    <p className="text-xs text-gray-400">Skipped</p>
                  </div>
                  <div className="bg-gray-800/50 rounded px-3 py-2">
                    <p className="text-2xl font-bold text-white">{result.total}</p>
                    <p className="text-xs text-gray-400">Total Rows</p>
                  </div>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-1">Errors ({result.errors.length}):</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-400/80">{e}</p>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={reset}
                className="mt-3 text-sm text-blue-400 hover:text-blue-300"
              >
                Import another file
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
