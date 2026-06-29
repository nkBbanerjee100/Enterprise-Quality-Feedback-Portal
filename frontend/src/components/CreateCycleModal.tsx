/**
 * Create CSAT Cycle Modal
 */
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { csatCyclesApi } from '../api/csat-cycles.api';

const BRAND = { green: '#1A5C3A', gold: '#9B7C2A' };
const currentYear = new Date().getFullYear();

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateCycleModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    cycle_name: '',
    description: '',
    year: currentYear,
    half: 'H1' as 'H1' | 'H2',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => csatCyclesApi.create(form),
    onSuccess: () => {
      setErrorMsg(null);
      onCreated();
    },
    onError: (err: unknown) => {
      // Extract backend detail message (FastAPI returns { detail: "..." })
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (detail) {
        setErrorMsg(detail);
      } else {
        setErrorMsg('Failed to create cycle. Please try again.');
      }
    },
  });

  const halfLabel = (h: 'H1' | 'H2') => h === 'H1' ? 'H1 — January to June' : 'H2 — July to December';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div style={{ background: BRAND.green }} className="px-6 py-4 flex justify-between items-center">
          <h2 className="text-white font-bold text-lg">Create CSAT Cycle</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Year + Half row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Year</label>
              <select
                value={form.year}
                onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Half</label>
              <select
                value={form.half}
                onChange={e => setForm(f => ({ ...f, half: e.target.value as 'H1' | 'H2' }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              >
                <option value="H1">H1 — Jan to Jun</option>
                <option value="H2">H2 — Jul to Dec</option>
              </select>
            </div>
          </div>

          {/* Auto-generated name preview */}
          <div className="bg-gray-50 rounded-lg px-4 py-2.5 text-xs text-gray-500 border border-gray-100">
            <span className="font-semibold">Period: </span>
            {form.half === 'H1'
              ? `01 Jan ${form.year} → 30 Jun ${form.year}`
              : `01 Jul ${form.year} → 31 Dec ${form.year}`}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Cycle Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={form.cycle_name}
              onChange={e => setForm(f => ({ ...f, cycle_name: e.target.value }))}
              placeholder={`e.g. CSAT ${form.year} ${halfLabel(form.half)}`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Any notes about this cycle..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 resize-none"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-6 pb-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.cycle_name.trim() || mutation.isPending}
            style={{ background: BRAND.green }}
            className="px-5 py-2 text-sm text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Cycle'}
          </button>
        </div>
      </div>
    </div>
  );
}