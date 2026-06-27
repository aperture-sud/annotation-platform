import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyMaskingPages, getMaskingRequests, createMaskingRequest, IMAGE_BASE_URL as IMAGE_BASE, MASKED_BASE_URL as MASKED_BASE } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const SUBJECT_LABEL = { english: 'English', kannada: 'Kannada', science: 'Science', social_science: 'Social Science', maths: 'Maths' };
const MEDIUM_LABEL  = { english_medium: 'English Medium', kannada_medium: 'Kannada Medium' };
const CLASS_LABEL   = { class_8: 'Class 8', class_9: 'Class 9', class_10: 'Class 10' };

const AREA_STYLE = {
  pending_approval: { bg: '#fff8e1', color: '#e65100', label: 'Pending review' },
  needs_rework:     { bg: '#fce4ec', color: '#b71c1c', label: 'Needs rework' },
  approved:         { bg: '#e8f5e9', color: '#1b5e20', label: 'Approved' },
};

export default function MaskerPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [pages,    setPages]    = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [quantity, setQuantity] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [reqError,   setReqError]   = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [pg, rq] = await Promise.all([getMyMaskingPages(), getMaskingRequests()]);
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
    if (quantity < 1) { setReqError('Enter a valid quantity.'); return; }
    setReqError('');
    setSubmitting(true);
    try {
      const created = await createMaskingRequest(quantity);
      setRequests(prev => [created, ...prev]);
      setQuantity(10);
    } catch (err) {
      setReqError(err.response?.data?.detail || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  // Bucket pages by status
  const toMask      = pages.filter(p => !p.masking_area);
  const pendingPgs  = pages.filter(p => p.masking_area === 'pending_approval');
  const reworkPgs   = pages.filter(p => p.masking_area === 'needs_rework');
  const approvedPgs = pages.filter(p => p.masking_area === 'approved');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>
      <div style={{ padding: '28px', maxWidth: '860px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px', paddingBottom: '16px', borderBottom: '1px solid #e4e4e4' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Masking Queue</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>{user?.username}</div>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} style={S.outlineBtn}>Sign out</button>
        </div>

        {/* To mask */}
        {!loading && toMask.length > 0 && (
          <Section title={`To mask (${toMask.length})`} border="#ffcc80">
            {toMask.map(p => (
              <PageRow key={p.page_name} page={p} navigate={navigate}>
                <button style={S.primaryBtn} onClick={() => navigate(`/mask/${encodeURIComponent(p.page_name)}`)}>Mask</button>
              </PageRow>
            ))}
          </Section>
        )}

        {/* Needs rework */}
        {!loading && reworkPgs.length > 0 && (
          <Section title={`Needs rework (${reworkPgs.length})`} border="#ef9a9a">
            {reworkPgs.map(p => (
              <PageRow key={p.page_name} page={p} navigate={navigate}>
                {p.masking_review_note && (
                  <span style={{ fontSize: '11px', color: '#b71c1c', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.masking_review_note}>
                    {p.masking_review_note}
                  </span>
                )}
                <button style={S.redoBtn} onClick={() => navigate(`/mask/${encodeURIComponent(p.page_name)}`)}>Redo</button>
              </PageRow>
            ))}
          </Section>
        )}

        {/* Pending approval */}
        {!loading && pendingPgs.length > 0 && (
          <Section title={`Pending review (${pendingPgs.length})`} border="#ffe082">
            {pendingPgs.map(p => (
              <PageRow key={p.page_name} page={p} navigate={navigate}>
                <span style={{ fontSize: '11px', backgroundColor: '#fff8e1', color: '#e65100', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>Submitted</span>
              </PageRow>
            ))}
          </Section>
        )}

        {/* Approved */}
        {!loading && approvedPgs.length > 0 && (
          <Section title={`Approved (${approvedPgs.length})`} border="#a5d6a7">
            {approvedPgs.map(p => (
              <PageRow key={p.page_name} page={p} navigate={navigate}>
                <span style={{ fontSize: '11px', backgroundColor: '#e8f5e9', color: '#1b5e20', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>Approved</span>
              </PageRow>
            ))}
          </Section>
        )}

        {!loading && pages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#ccc', fontSize: '14px' }}>
            No pages assigned. Request pages below.
          </div>
        )}

        {/* Request form */}
        <div style={{ ...S.card, marginTop: '20px' }}>
          <div style={S.cardTitle}>Request pages</div>
          <form onSubmit={handleRequest} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={S.label}>Quantity</div>
              <input
                type="number" min="1" max="200" value={quantity}
                onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                style={S.input}
              />
            </div>
            <button type="submit" disabled={submitting} style={S.primaryBtn}>
              {submitting ? 'Requesting…' : 'Request'}
            </button>
          </form>
          {reqError && <div style={{ color: '#c62828', fontSize: '12px', marginTop: '8px' }}>{reqError}</div>}
        </div>

        {/* Request history */}
        {requests.length > 0 && (
          <div style={{ ...S.card, marginTop: '16px' }}>
            <div style={S.cardTitle}>My requests</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Requested', 'Quantity', 'Fulfilled', 'Status'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td style={S.td}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={S.td}>{r.quantity}</td>
                    <td style={S.td}>{r.fulfilled}</td>
                    <td style={S.td}>
                      <span style={{
                        fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '8px',
                        ...{ pending: { backgroundColor: '#fff8e1', color: '#e65100' }, approved: { backgroundColor: '#e8f5e9', color: '#1b5e20' }, rejected: { backgroundColor: '#fce4ec', color: '#b71c1c' } }[r.status],
                      }}>
                        {r.status}
                      </span>
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

function Section({ title, border, children }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '10px', border: `1px solid ${border}`, padding: '18px 20px', marginBottom: '14px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '12px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>
    </div>
  );
}

function PageRow({ page, navigate, children }) {
  const imgSrc = page.masked_image_path
    ? `${MASKED_BASE}/${page.masked_image_path}`
    : `${IMAGE_BASE}/${page.image_path}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '7px', backgroundColor: '#fafafa', border: '1px solid #eee' }}>
      <img
        src={imgSrc}
        alt={page.page_name}
        onClick={() => navigate(`/mask/${encodeURIComponent(page.page_name)}`)}
        style={{ width: '48px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd', cursor: 'pointer', flexShrink: 0 }}
        onError={e => { e.target.style.display = 'none'; }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {page.page_name}
        </div>
        <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
          {SUBJECT_LABEL[page.subject] || page.subject} · {CLASS_LABEL[page.cls] || page.cls} · {MEDIUM_LABEL[page.medium] || page.medium}
        </div>
      </div>
      {children}
    </div>
  );
}

const S = {
  outlineBtn: { background: 'none', border: '1px solid #ddd', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', color: '#555', cursor: 'pointer' },
  card: { backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e8e8e8', padding: '20px' },
  cardTitle: { fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '14px' },
  label: { fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 500 },
  input: { border: '1px solid #ddd', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', width: '90px', outline: 'none' },
  primaryBtn: { backgroundColor: '#1565C0', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  redoBtn: { backgroundColor: '#e65100', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  th: { textAlign: 'left', padding: '6px 10px', fontSize: '11px', color: '#888', fontWeight: 600, borderBottom: '1px solid #eee' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#333' },
};
