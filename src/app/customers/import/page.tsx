'use client';

import Link from 'next/link';
import { ArrowLeft, FileSpreadsheet, Info } from 'lucide-react';
import { CustomerImport } from '@/components/customers/CustomerImport';

export default function CustomerImportPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/customers"
          className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Import Customers</h1>
          <p className="text-sm text-gray-400 mt-0.5">Upload CSV files from your Google Sheets</p>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div className="space-y-3 text-sm text-gray-300">
            <p className="font-medium text-white">How to export from Google Sheets:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-gray-400">
              <li>Open the Google Sheet</li>
              <li>Go to <span className="text-gray-300">File &rarr; Download &rarr; Comma-separated values (.csv)</span></li>
              <li>For sheets with multiple tabs, select the tab first, then download</li>
            </ol>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileSpreadsheet className="w-4 h-4 text-green-400" />
                  <span className="text-white text-xs font-medium">Audit Sheet</span>
                </div>
                <p className="text-xs text-gray-500">Customer plans, status, contact info, and notes</p>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                  <span className="text-white text-xs font-medium">Regional List</span>
                </div>
                <p className="text-xs text-gray-500">Financial metrics, order data, locations</p>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                  <span className="text-white text-xs font-medium">Upgrade Tabs</span>
                </div>
                <p className="text-xs text-gray-500">Monthly upgrade history with commissions</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 pt-1">
              Import order: Audit first, then Regional (merges by email), then Upgrades
            </p>
          </div>
        </div>
      </div>

      {/* Import Component */}
      <CustomerImport />

      {/* Footer link */}
      <div className="mt-8 text-center">
        <Link
          href="/customers"
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          &larr; Back to Customer Hub
        </Link>
      </div>
    </div>
  );
}
