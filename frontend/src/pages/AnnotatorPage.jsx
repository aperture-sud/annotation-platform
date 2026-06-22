import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyPages, getAnnotationRequests, createAnnotationRequest, submitPage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const MEDIUMS  = [{ val: 'english_medium', label: 'English Medium' }, { val: 'kannada_medium', label: 'Kannada Medium' }];
const CLASSES  = [{ val: 'class_8', label: 'Class 8' }, { val: 'class_9', label: 'Class 9' }, { val: 'class_10', label: 'Class 10' }];
const SUBJECTS = [
  { val: 'english',        label: 'English' },
  { val: 'kannada',        label: 'Kannada' },
  { val: 'science',        label: 'Science' },
  { val: 'social_science', label: 'Social Science' },
  { val: 'maths',          label: 'Maths' },
];

const MEDIUM_LABEL  = Object.fromEntries(MEDIUMS.map(({ val, label }) => [val, label]));
const CLASS_LABEL   = Object.fromEntries(CLASSES.map(({ val, label }) => [val, label]));
const SUBJECT_LABEL = Object.fromEntries(SUBJECTS.map(({ val, label }) => [val, label]));

const STATUS_STYLE = {
  pending:  { bg: '#fff8e1', color: '#e65100' },
  approved: { bg: '#e8f5e9', color: '#1b5e20' },
  rejected: { bg: '#fce4ec', color: '#b71c1c' },
};

export default function AnnotatorPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [pages,    setPages]    = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [medium,   setMedium]   = useState('');
  const [cls,      setCls]      = useState('');
  const [subject,  setSubject]  = useState('');
  const [quantity, setQuantity] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [reqError,   setReqError]   = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [pg, rq] = await Promise.all([getMyPages(), getAnnotationRequests()]);
      setPages(pg);
      setRequests(rq);
    } catch (e) {
      console.error('Failed to load', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequest(e) {
    e.preventDefault();
    if (!medium || !cls || !subject) { setReqError('Select medium, class, and subject.'); return; }
    setReqError('');
    setSubmitting(true);
    try {
      const created = await createAnnotationRequest({ medium, cls, subject, quantity });
      setRequests((prev) => [created, ...prev]);
      setMedium(''); setCls(''); setSubject(''); setQuantity(10);
    } catch (err) {
      setReqError(err.response?.data?.detail || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(page_name) {
    try {
      const updated = await submitPage(page_name);
      setPages(prev => prev.map(p => p.page_name === page_name ? { ...p, area: updated.area, review_note: null } : p));
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to submit.');
    }
  }

  const rework      = pages.filter(p => p.area === 'needs_rework');
  const inProgress  = pages.filter(p => p.area === 'assigned');
  const pendingAppr = pages.filter(p => p.area === 'pending_approval');
  const approved    = pages.filter(p => p.area === 'approved');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>
      <div style={{ padding: '28px', maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px', paddingBottom: '16px', borderBottom: '1px solid #e4e4e4' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>My Work</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>{user?.username}</div>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} style={S.outlineBtn}>Sign out</button>
        </div>

        {/* Needs rework */}
        {rework.length > 0 && (
          <div style={{ ...S.card, borderColor: '#ffcc80' }}>
            <div style={S.cardTitle}>
              Flagged for rework
              <span style={{ ...S.count, backgroundColor: '#fff3e0', color: '#e65100' }}>{rework.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {rework.map(p => (
                <PageCard key={p.page_name} page={p} navigate={navigate} onSubmit={handleSubmit} showRemark />
              ))}
            </div>
          </div>
        )}

        {/* In progress */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            In progress
            <span style={S.count}>{inProgress.length}</span>
          </div>
          {loading ? (
            <p style={S.muted}>Loading…</p>
          ) : inProgress.length === 0 ? (
            <p style={S.muted}>No pages in progress. Request some below.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {inProgress.map(p => (
                <PageCard key={p.page_name} page={p} navigate={navigate} onSubmit={handleSubmit} />
              ))}
            </div>
          )}
        </div>

        {/* Pending approval */}
        {pendingAppr.length > 0 && (
          <div style={S.card}>
            <div style={S.cardTitle}>
              Pending approval
              <span style={{ ...S.count, backgroundColor: '#fff3e0', color: '#e65100' }}>{pendingAppr.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {pendingAppr.map(p => (
                <PageCard key={p.page_name} page={p} navigate={navigate} onSubmit={handleSubmit} pendingApproval />
              ))}
            </div>
          </div>
        )}

        {/* Approved */}
        {approved.length > 0 && (
          <div style={S.card}>
            <div style={S.cardTitle}>
              Approved
              <span style={{ ...S.count, backgroundColor: '#e8f5e9', color: '#1b5e20' }}>{approved.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {approved.map(p => <PageCard key={p.page_name} page={p} navigate={navigate} />)}
            </div>
          </div>
        )}

        {/* Request form */}
        <div style={S.card}>
          <div style={S.cardTitle}>Request pages</div>
          <form onSubmit={handleRequest}>
            <div style={S.filterLabel}>Medium</div>
            <div style={S.chipRow}>
              {MEDIUMS.map(({ val, label }) => (
                <button key={val} type="button"
                  style={{ ...S.chip, ...(medium === val ? S.chipOn : {}) }}
                  onClick={() => setMedium(medium === val ? '' : val)}
                >{label}</button>
              ))}
            </div>
            <div style={S.filterLabel}>Class</div>
            <div style={S.chipRow}>
              {CLASSES.map(({ val, label }) => (
                <button key={val} type="button"
                  style={{ ...S.chip, ...(cls === val ? S.chipOn : {}) }}
                  onClick={() => setCls(cls === val ? '' : val)}
                >{label}</button>
              ))}
            </div>
            <div style={S.filterLabel}>Subject</div>
            <div style={S.chipRow}>
              {SUBJECTS.map(({ val, label }) => (
                <button key={val} type="button"
                  style={{ ...S.chip, ...(subject === val ? S.chipOn : {}) }}
                  onClick={() => setSubject(subject === val ? '' : val)}
                >{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
              <div>
                <label style={S.filterLabel}>Quantity</label>
                <input
                  type="number" min={1} max={100} value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  style={S.numInput}
                />
              </div>
              <button
                type="submit" disabled={submitting}
                style={{ ...S.submitBtn, opacity: (!medium || !cls || !subject) ? 0.5 : 1 }}
              >
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
            {reqError && <p style={{ fontSize: '13px', color: '#c62828', marginTop: '8px' }}>{reqError}</p>}
          </form>
        </div>

        {/* Request history */}
        {requests.length > 0 && (
          <div style={S.card}>
            <div style={S.cardTitle}>Request history</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  {['Date', 'Filters', 'Qty', 'Got', 'Status'].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={S.td}>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td style={S.td}>
                      <span style={S.tag}>{MEDIUM_LABEL[r.medium] || r.medium}</span>
                      <span style={S.tag}>{CLASS_LABEL[r.cls] || r.cls}</span>
                      <span style={S.tag}>{SUBJECT_LABEL[r.subject] || r.subject}</span>
                    </td>
                    <td style={S.td}>{r.quantity}</td>
                    <td style={S.td}>{r.status === 'approved' ? r.fulfilled : '—'}</td>
                    <td style={S.td}>
                      <span style={{
                        ...STATUS_STYLE[r.status],
                        padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                      }}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}

function PageCard({ page, navigate, onSubmit, showRemark, pendingApproval }) {
  const [hover, setHover] = useState(false);
  const name     = page.page_name;
  const boxCount = page.box_count ?? 0;
  const area     = page.area;

  const canSubmit = onSubmit && (area === 'assigned' || area === 'needs_rework' || pendingApproval);

  const statusBadge = area === 'approved'
    ? { label: 'Approved', bg: '#e8f5e9', color: '#1b5e20' }
    : null;

  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: `1px solid ${area === 'needs_rework' ? '#ffcc80' : hover ? '#c5cae9' : '#e8e8e8'}`,
        borderRadius: '8px', padding: '14px 16px',
        boxShadow: hover ? '0 3px 12px rgba(0,0,0,0.08)' : 'none',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ fontWeight: 600, fontSize: '13px', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={name}>{name}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {[MEDIUM_LABEL[page.medium], CLASS_LABEL[page.cls], SUBJECT_LABEL[page.subject]].filter(Boolean).map((l) => (
          <span key={l} style={S.tag}>{l}</span>
        ))}
      </div>

      {showRemark && page.review_note && (
        <div style={{ fontSize: '12px', color: '#e65100', backgroundColor: '#fff3e0', borderRadius: '4px', padding: '5px 8px' }}>
          {page.review_note}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ fontSize: '11px', color: '#aaa' }}>{boxCount} box{boxCount !== 1 ? 'es' : ''}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {statusBadge ? (
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '10px', backgroundColor: statusBadge.bg, color: statusBadge.color }}>
              {statusBadge.label}
            </span>
          ) : (
            <>
              <button
                onClick={() => navigate(`/annotate/${encodeURIComponent(name)}`)}
                style={S.annotateBtn}
              >Annotate</button>
              {canSubmit && (
                <button onClick={() => onSubmit(name)} style={S.submitPageBtn}>
                  {pendingApproval ? 'Re-submit' : 'Submit'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  outlineBtn: {
    background: 'none', border: '1px solid #ddd', borderRadius: '6px',
    padding: '5px 12px', cursor: 'pointer', fontSize: '13px', color: '#555',
  },
  card: {
    backgroundColor: '#fff', borderRadius: '10px', padding: '20px 22px',
    marginBottom: '16px', border: '1px solid #e8e8e8',
  },
  cardTitle: {
    fontSize: '14px', fontWeight: 600, color: '#333', margin: '0 0 14px',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  count: {
    fontSize: '12px', fontWeight: 600, backgroundColor: '#e8eaf6', color: '#3949ab',
    padding: '1px 8px', borderRadius: '10px',
  },
  muted: { color: '#bbb', fontSize: '13px', margin: 0 },
  filterLabel: { fontSize: '11px', color: '#666', fontWeight: 600, marginBottom: '6px', marginTop: '10px' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  chip: {
    padding: '5px 12px', fontSize: '12px', border: '1px solid #ddd',
    borderRadius: '16px', cursor: 'pointer', backgroundColor: '#fafafa', color: '#444',
  },
  chipOn: { backgroundColor: '#e8eaf6', borderColor: '#7986cb', color: '#283593', fontWeight: 600 },
  numInput: {
    padding: '6px 10px', fontSize: '13px', border: '1px solid #ddd',
    borderRadius: '6px', width: '80px', boxSizing: 'border-box',
  },
  submitBtn: {
    padding: '8px 20px', backgroundColor: '#3f51b5', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    alignSelf: 'flex-end',
  },
  th: { textAlign: 'left', padding: '6px 10px', color: '#888', fontWeight: 600, fontSize: '11px' },
  td: { padding: '9px 10px', verticalAlign: 'middle' },
  tag: {
    fontSize: '11px', backgroundColor: '#f0f0f0', color: '#555',
    padding: '2px 7px', borderRadius: '8px', whiteSpace: 'nowrap',
    display: 'inline-block', marginRight: '3px',
  },
  annotateBtn: {
    padding: '4px 12px', backgroundColor: '#3f51b5', color: '#fff',
    border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
  submitPageBtn: {
    padding: '4px 12px', backgroundColor: '#fff', color: '#2e7d32',
    border: '1px solid #a5d6a7', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
};
