/**
 * Needs Your Review — a single, unified list for Management, merging two
 * previously-separate pending-decision systems:
 *   - the pre-cycle staging pool ("not sure" during initial project triage)
 *   - each cycle's addition-approval queue ("not sure" when adding a
 *     project to an already-existing cycle)
 *
 * Management no longer needs to know both of these exist, or check two
 * different pages — everything awaiting a decision shows up here, and
 * Approve/Decline acts on the right underlying system automatically based
 * on each item's `source`.
 *
 * Deciding an item updates the count immediately (both the on-page total
 * and the sidebar nav badge) via an optimistic cache update, rather than
 * waiting on a refetch round trip — the whole point of a "16 → 15 → 14"
 * feel is that it happens the instant you act, not a beat later.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { reviewsApi, PendingReviewItem, PendingReviewsResponse } from '../../api/reviews.api';
import { projectStagingApi } from '../../api/project-staging.api';
import { csatCyclesApi } from '../../api/csat-cycles.api';
import { formatDate } from '../../utils/formatters';
import { BRAND } from '../../utils/constants';

type SourceFilter = 'all' | PendingReviewItem['source'];

const SOURCE_META: Record<PendingReviewItem['source'], { label: string; bg: string; text: string }> = {
  staging:        { label: 'New project pool', bg: BRAND.goldMuted, text: BRAND.gold },
  cycle_addition: { label: 'Added to cycle',    bg: '#EFF4FF',       text: '#2563EB' },
};

// ─── Small building blocks, matching the visual language already used on
// the Reports dashboard (KpiCard) and CSAT Cycle detail page (pill tabs) ──

function SummaryCard({ value, label, accent, icon }: { value: number; label: string; accent: string; icon: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
      padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, flex: 1,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: `${accent}1A`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 700, color: BRAND.textDark, margin: 0, lineHeight: 1.1 }}>{value}</p>
        <p style={{ fontSize: 12.5, color: BRAND.textMid, margin: '3px 0 0', fontWeight: 500 }}>{label}</p>
      </div>
    </div>
  );
}

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 20,
        border: active ? 'none' : '1px solid #E5E7EB',
        background: active ? BRAND.textDark : '#fff',
        color: active ? '#fff' : BRAND.textMid,
        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s ease, color 0.15s ease',
      }}
    >
      {label}
    </button>
  );
}

function ProjectIcon() {
  return (
    <div style={{
      width: 38, height: 38, borderRadius: 9, background: BRAND.greenMuted,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={BRAND.green} strokeWidth="2">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </div>
  );
}

function ReviewRow({
  item, onDecide, busy, leaving,
}: {
  item: PendingReviewItem;
  onDecide: (item: PendingReviewItem, approve: boolean, remarks?: string) => void;
  busy: boolean;
  leaving: boolean;
}) {
  const [remarks, setRemarks] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const meta = SOURCE_META[item.source];

  return (
    <div
      style={{
        padding: '16px 20px',
        borderBottom: '1px solid #F1F3F4',
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'translateX(8px)' : 'translateX(0)',
        maxHeight: leaving ? 0 : 200,
        overflow: 'hidden',
        transition: 'opacity 0.22s ease, transform 0.22s ease, max-height 0.28s ease 0.05s, padding 0.28s ease 0.05s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <ProjectIcon />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: BRAND.textDark, margin: 0 }}>{item.project_name}</p>
              <span style={{ fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.text, padding: '2px 9px', borderRadius: 20 }}>
                {meta.label}
              </span>
            </div>
            <p style={{ fontSize: 12, color: BRAND.textLight, margin: '4px 0 0' }}>
              {item.cycle_name && <>{item.cycle_name} · </>}
              {item.requested_by ? `Requested by ${item.requested_by}` : 'Requested'} · {formatDate(item.requested_at)}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <button
              disabled={busy}
              onClick={() => onDecide(item, item.action_type === 'exemption' ? false : true)}
              style={{
                fontSize: 12.5, fontWeight: 600, color: '#fff', background: BRAND.green,
                border: 'none', borderRadius: 8, padding: '7px 14px', cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap',
              }}
            >
              Reject Exemption
            </button>
            <span style={{ fontSize: 10, color: BRAND.textLight, textAlign: 'center', lineHeight: 1.3, maxWidth: 110 }}>
              final · makes it eligible
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <button
              disabled={busy}
              onClick={() => item.action_type === 'exemption' ? onDecide(item, true) : setShowDecline(s => !s)}
              style={{
                fontSize: 12.5, fontWeight: 600, color: BRAND.textMid, background: '#fff',
                border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 14px', cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap',
              }}
            >
              Approve Exemption
            </button>
            <span style={{ fontSize: 10, color: BRAND.textLight, textAlign: 'center', lineHeight: 1.3, maxWidth: 110 }}>
              {item.action_type === 'exemption' ? 'final · removes from cycle' : 'final · removes from cycle · reason required'}
            </span>
          </div>
        </div>
      </div>

      {item.exemption_reason && (
        <p style={{ fontSize: 12, color: BRAND.textLight, margin: '8px 0 0 50px', background: '#FAFAFA', borderRadius: 8, padding: '6px 10px' }}>
          Reason: "{item.exemption_reason}"
        </p>
      )}

      {showDecline && item.action_type === 'final' && (
        <div style={{ marginTop: 10, marginLeft: 50, display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Reason (required)"
            style={{ flex: 1, fontSize: 13, padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8 }}
          />
          <button
            disabled={busy || !remarks.trim()}
            onClick={() => onDecide(item, false, remarks || undefined)}
            style={{
              fontSize: 12.5, fontWeight: 600, color: '#B91C1C', background: '#FEF2F2',
              border: '1px solid #FCA5A5', borderRadius: 8, padding: '7px 14px',
              cursor: (busy || !remarks.trim()) ? 'not-allowed' : 'pointer',
              opacity: (busy || !remarks.trim()) ? 0.5 : 1,
            }}
          >
            Confirm Exemption
          </button>
        </div>
      )}
    </div>
  );
}

export const PendingReviewsPage: React.FC = () => {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<SourceFilter>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['pendingReviews'],
    queryFn: () => reviewsApi.listPending(),
  });

  const items = data?.items ?? [];
  const stagingCount = items.filter(i => i.source === 'staging').length;
  const cycleCount = items.filter(i => i.source === 'cycle_addition').length;
  const visible = filter === 'all' ? items : items.filter(i => i.source === filter);

  const handleDecide = async (item: PendingReviewItem, approve: boolean, remarks?: string) => {
    const key = `${item.source}:${item.id}`;

    // 'final' declines (Management's last-word decision) require a reason —
    // same rule as everywhere else in this chain. 'exemption' decisions
    // (approve/reject an exemption REQUEST) don't need one: Quality already
    // gave a reason when requesting it.
    if (item.action_type === 'final' && !approve && !(remarks || '').trim()) {
      setErrorMsg('An exemption reason is required to decline.');
      return;
    }

    setBusyId(key);
    setErrorMsg(null);
    try {
      if (item.action_type === 'exemption') {
        if (item.source === 'staging') {
          await projectStagingApi.decideExemption(item.id, approve, remarks);
        } else {
          await csatCyclesApi.decideExemption(item.cycle_id!, item.id, approve, remarks);
        }
      } else if (item.source === 'staging') {
        await projectStagingApi.decide(item.id, approve, remarks);
      } else if (approve) {
        await csatCyclesApi.approveAddition(item.cycle_id!, item.id);
      } else {
        await csatCyclesApi.declineAddition(item.cycle_id!, item.id, { remarks });
      }

      // Play the fade-out, then drop the row from both this page's cache
      // and the sidebar badge's count — immediately, not on the next poll
      // or refetch. This is what makes "16 → 15" actually feel instant.
      setLeavingIds(prev => new Set(prev).add(key));
      setTimeout(() => {
        qc.setQueryData<PendingReviewsResponse | undefined>(['pendingReviews'], old =>
          old ? { total: old.total - 1, items: old.items.filter(i => `${i.source}:${i.id}` !== key) } : old
        );
        qc.setQueryData<number | undefined>(['pendingReviewsCount'], old =>
          typeof old === 'number' ? Math.max(0, old - 1) : old
        );
        setLeavingIds(prev => { const n = new Set(prev); n.delete(key); return n; });
      }, 320);

      // Reconcile with the server in the background in case anything else
      // (another Management user, a direct approve from the old per-cycle
      // page) changed the underlying data at the same time.
      qc.invalidateQueries({ queryKey: ['pendingReviews'] });
      qc.invalidateQueries({ queryKey: ['pendingReviewsCount'] });
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.detail ?? `Couldn't update "${item.project_name}". Please try again.`
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageWrapper>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: BRAND.textDark, margin: 0 }}>Needs Your Review</h1>
        <p style={{ fontSize: 13.5, color: BRAND.textMid, margin: '6px 0 24px', maxWidth: 640 }}>
          Everything currently waiting on a decision from you — new projects from Quality's triage pool,
          and additions to existing CSAT cycles. Approve or decline right here.
        </p>

        <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
          <SummaryCard value={items.length} label="Total pending" accent={BRAND.textDark} icon="⚑" />
          <SummaryCard value={stagingCount} label="New project pool" accent={BRAND.gold} icon="✦" />
          <SummaryCard value={cycleCount} label="Added to cycle" accent="#2563EB" icon="↺" />
        </div>

        {errorMsg && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: 13, padding: '10px 14px', borderRadius: 10, marginBottom: 16 }}>
            {errorMsg}
          </div>
        )}

        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <FilterPill active={filter === 'all'} label={`All (${items.length})`} onClick={() => setFilter('all')} />
            <FilterPill active={filter === 'staging'} label={`New project pool (${stagingCount})`} onClick={() => setFilter('staging')} />
            <FilterPill active={filter === 'cycle_addition'} label={`Added to cycle (${cycleCount})`} onClick={() => setFilter('cycle_addition')} />
          </div>
        )}

        {isLoading ? (
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ padding: '16px 20px', borderBottom: i < 2 ? '1px solid #F1F3F4' : 'none', display: 'flex', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: '#F3F4F6' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: '40%', height: 14, borderRadius: 4, background: '#F3F4F6', marginBottom: 8 }} />
                  <div style={{ width: '60%', height: 11, borderRadius: 4, background: '#F3F4F6' }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p style={{ fontSize: 13, color: '#B91C1C' }}>Couldn't load pending reviews. Please try again.</p>
        ) : visible.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', background: BRAND.greenMuted, margin: '0 auto 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: BRAND.green,
            }}>
              ✓
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: BRAND.textDark, margin: 0 }}>
              {items.length === 0 ? "You're all caught up" : 'Nothing here for this filter'}
            </p>
            <p style={{ fontSize: 12.5, color: BRAND.textLight, margin: '4px 0 0' }}>
              {items.length === 0 ? 'Nothing is waiting on a decision from you right now.' : 'Try a different filter above.'}
            </p>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
            {visible.map(item => (
              <ReviewRow
                key={`${item.source}:${item.id}`}
                item={item}
                busy={busyId === `${item.source}:${item.id}`}
                leaving={leavingIds.has(`${item.source}:${item.id}`)}
                onDecide={handleDecide}
              />
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
};