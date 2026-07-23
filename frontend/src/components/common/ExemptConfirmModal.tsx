import React, { useEffect, useState } from 'react';

/**
 * A single, reusable "are you sure?" modal for every action in the app that
 * results in a project being exempted — whether that's a brand-new Exempt
 * decision (reason required) or approving someone else's already-submitted
 * exemption request (reason optional, since one was already given upstream).
 *
 * Replaces the old window.prompt()-based flow everywhere it was used.
 */
export interface ExemptConfirmModalProps {
  projectName: string;
  /** Plain-language description of what happens next, shown under the title. */
  message: string;
  /** true: a fresh reason must be typed in. false: confirm-only, no textarea. */
  requireReason: boolean;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}

export const ExemptConfirmModal: React.FC<ExemptConfirmModalProps> = ({
  projectName, message, requireReason, confirmLabel, onCancel, onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 10);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = reason.trim();
  const canConfirm = !requireReason || trimmed.length > 0;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 160ms ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '18px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          width: '100%',
          maxWidth: '400px',
          overflow: 'hidden',
          transform: mounted ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(6px)',
          transition: 'transform 160ms ease-out',
        }}
      >
        <div style={{ padding: '22px 22px 18px' }}>
          <div
            style={{
              width: '46px', height: '46px', borderRadius: '50%',
              background: '#FEF3C7', border: '1px solid #FDE68A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', marginBottom: '14px',
            }}
          >
            ⚠️
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>
            Are you sure?
          </h3>
          <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '6px', lineHeight: 1.5 }}>
            {message}
          </p>
          <p
            style={{
              fontSize: '13px', fontWeight: 600, color: '#111827', marginTop: '10px',
              background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: '8px',
              padding: '8px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {projectName}
          </p>

          {requireReason && (
            <div style={{ marginTop: '14px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                Reason <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder="Why is this project being exempted?"
                style={{
                  marginTop: '6px', width: '100%', fontSize: '13px',
                  border: '1px solid #E5E7EB', borderRadius: '10px',
                  padding: '9px 11px', resize: 'none', outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = '#FBBF24'; e.target.style.boxShadow = '0 0 0 3px rgba(251,191,36,0.15)'; }}
                onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', padding: '14px 22px', background: '#F9FAFB', borderTop: '1px solid #F3F4F6' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px 16px', fontSize: '13px', fontWeight: 600,
              borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff',
              color: '#4B5563', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            disabled={!canConfirm}
            onClick={() => onConfirm(requireReason ? trimmed : undefined)}
            style={{
              flex: 1, padding: '10px 16px', fontSize: '13px', fontWeight: 700,
              borderRadius: '10px', border: 'none',
              background: canConfirm ? '#1F2937' : '#D1D5DB',
              color: '#fff', cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};