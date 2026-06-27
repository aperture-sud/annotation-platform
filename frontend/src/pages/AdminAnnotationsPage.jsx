import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getAnnotationRequests, approveAnnotationRequest, rejectAnnotationRequest,
  getManagerPages, approveManagerPage, sendBackPage,
  IMAGE_BASE_URL as IMAGE_BASE,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const MEDIUM_LABEL  = { english_medium: 'English Medium', kannada_medium: 'Kannada Medium' };
const CLASS_LABEL   = { class_8: 'Class 8', class_9: 'Class 9', class_10: 'Class 10' };
const SUBJECT_LABEL = { english: 'English', kannada: 'Kannada', science: 'Science', social_science: 'Social Science', maths: 'Maths' };

const AREA_STYLE = {
  pending_approval: { border: '#ffcc80', bg: '#fff8e1', color: '#e65100', label: 'Pending'  },
  needs_rework:     { border: '#ef9a9a', bg: '#fce4ec', color: '#b71c1c', label: 'Rework'   },
  flagged_admin:    { border: '#f48fb1', bg: '#fce4ec', color: '#ad1457', label: 'Flagged'  },
  approved:         { border: '#a5d6a7', bg: '#e8f5e9', color: '#1b5e20', label: 'Approved' },
};

const REQ_STATUS = {
  pending:  { backgroundColor: '#fff8e1', color: '#e65100' },
  approved: { backgroundColor: '#e8f5e9', color: '#1b5e20' },
  rejected: { backgroundColor: '#fce4ec', color: '#b71c1c' },
};

export default function AdminAnnotationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState(location.state?.tab || 'review');

  const [pages,    setPages]    = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [modal,  setModal]  = useState(null);
  const [note,   setNote]   = useState('');
  const [busy,   setBusy]   = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [pg, rq] = await Promise.all([
      getManagerPages().catch(() => []),
      getAnnotationRequests().catch(() => []),
    ]);
    setPages(pg);
    setRequests(rq);
    setLoading(false);
  }

  async function handleApprove() {
    setBusy(true);
    try {
      const updated = await approveManagerPage(modal.page_name);
      setPages(prev => prev.map(p => p.page_name === modal.page_name ? { ...p, ...updated } : p));
      setModal(null);
    } catch (e) { alert(e.response?.data?.detail || 'Failed.'); }
    finally { setBusy(false); }
  }

  async function handleSendBack() {
    setBusy(true);
    try {
      const updated = await sendBackPage(modal.page_name, note);
      setPages(prev => prev.map(p => p.page_name === modal.page_name ? { ...p, ...updated } : p));
      setModal(null); setNote('');
    } catch (e) { alert(e.response?.data?.detail || 'Failed.'); }
    finally { setBusy(false); }
  }

  async function handleApproveReq(id) {
    try {
      const updated = await approveAnnotationRequest(id);
      setRequests(prev => prev.map(r => r.id === id ? updated : r));
    } catch (e) { alert(e.response?.data?.detail || 'Failed.'); }
  }

  async function handleRejectReq(id) {
    try {
      const updated = await rejectAnnotationRequest(id);
      setRequests(prev => prev.map(r => r.id === id ? updated : r));
    } catch (e) { alert(e.response?.data?.detail || 'Failed.'); }
  }

  const pendingPages = pages.filter(p => p.area === 'pending_approval').length;
  const pendingReqs  = requests.filter(r => r.status === 'pending').length;

  const groups = [
    { key: 'pending_approval', pages: pages.filter(p => p.area === 'pending_approval') },
    { key: 'needs_rework',     pages: pages.filter(p => p.area === 'needs_rework')     },
    { key: 'flagged_admin',    pages: pages.filter(p => p.area === 'flagged_admin')    },
    { key: 'approved',         pages: pages.filter(p => p.area === 'approved')         },
  ].filter(g => g.pages.length > 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>

      {/* Review modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)', zIndex: 1010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => !busy && (setModal(null), setNote(''))}>
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '22px', width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>{modal.page_name}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
                  {MEDIUM_LABEL[modal.medium] || modal.medium} · {CLASS_LABEL[modal.cls] || modal.cls} · {SUBJECT_LABEL[modal.subject] || modal.subject}
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                  {modal.box_count ?? 0} boxes · by {modal.assigned_to}
                </div>
              </div>
              {AREA_STYLE[modal.area] && (
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '10px', fontWeight: 600, backgroundColor: AREA_STYLE[modal.area].bg, color: AREA_STYLE[modal.area].color }}>
                  {AREA_STYLE[modal.area].label}
                </span>
              )}
            </div>

            {modal.review_note && (
              <div style={{ backgroundColor: '#fff8e1', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#e65100' }}>
                <span style={{ fontWeight: 600 }}>Previous remark: </span>{modal.review_note}
              </div>
            )}

            <img src={`${IMAGE_BASE}/${modal.image_path}`} alt={modal.page_name}
              style={{ width: '100%', borderRadius: '8px', border: '1px solid #e0e0e0' }}
              onError={e => { e.target.style.display = 'none'; }} />

            {modal.area !== 'approved' && (
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
                  Remark (optional — shown to annotator on send back)
                </label>
                <textarea value={note} onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Labels missing on diagram"
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box', resize: 'vertical', minHeight: '56px', fontFamily: 'inherit' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setModal(null); setNote(''); }} disabled={busy} style={S.cancelBtn}>Cancel</button>
              <button onClick={() => navigate(`/annotate/${encodeURIComponent(modal.page_name)}`)} style={S.viewBtn}>View</button>
              {modal.area !== 'approved' && <>
                <button onClick={handleSendBack} disabled={busy} style={S.sendBackBtn}>{busy ? '…' : 'Send back'}</button>
                <button onClick={handleApprove} disabled={busy} style={S.approveBtn}>{busy ? '…' : 'Approve'}</button>
              </>}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '28px', maxWidth: '860px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e4e4e4' }}>
          <button onClick={() => navigate('/')} style={S.back}>← Back</button>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 0 14px', flex: 1 }}>Annotations</h1>
          <span style={{ fontSize: '12px', color: '#aaa' }}>{user?.username}</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid #e4e4e4' }}>
          {[
            { id: 'review',   label: 'Review',   badge: pendingPages },
            { id: 'requests', label: 'Requests', badge: pendingReqs  },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                border: 'none', background: 'none', marginBottom: '-1px',
                borderBottom: tab === t.id ? '2px solid #1565C0' : '2px solid transparent',
                color: tab === t.id ? '#1565C0' : '#888',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
              {t.label}
              {t.badge > 0 && (
                <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '8px', fontWeight: 600, backgroundColor: tab === t.id ? '#e3f2fd' : '#f0f0f0', color: tab === t.id ? '#1565C0' : '#888' }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Review tab */}
        {tab === 'review' && (
          <div>
            {loading ? (
              <p style={{ color: '#bbb', fontSize: '13px' }}>Loading…</p>
            ) : groups.length === 0 ? (
              <p style={{ color: '#bbb', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>No annotated pages yet.</p>
            ) : groups.map(g => {
              const as = AREA_STYLE[g.key];
              return (
                <div key={g.key} style={{ ...S.card, borderColor: as.border, marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: as.color, marginBottom: '12px' }}>
                    {as.label} ({g.pages.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {g.pages.map(p => (
                      <div key={p.page_name}
                        style={{ width: '88px', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${as.border}`, backgroundColor: '#fff' }}
                        onClick={() => { setModal(p); setNote(''); }}>
                        <img src={`${IMAGE_BASE}/${p.image_path}`} alt={p.page_name}
                          style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }}
                          onError={e => { e.target.style.display = 'none'; }} />
                        <div style={{ padding: '4px 6px 6px' }}>
                          <div style={{ fontSize: '10px', color: '#555', wordBreak: 'break-all', lineHeight: '1.3' }}>{p.page_name}</div>
                          <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>{p.box_count ?? 0} boxes</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Requests tab */}
        {tab === 'requests' && (
          <div style={S.card}>
            {loading ? (
              <p style={{ color: '#bbb', fontSize: '13px' }}>Loading…</p>
            ) : requests.length === 0 ? (
              <p style={{ color: '#bbb', fontSize: '13px' }}>No requests yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    {['Annotator', 'Filters', 'Qty', 'Got', 'Date', 'Status', ''].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: r.status === 'pending' ? '#fafbff' : 'transparent' }}>
                      <td style={{ ...S.td, fontWeight: 500 }}>{r.requested_by}</td>
                      <td style={S.td}>
                        <span style={S.tag}>{MEDIUM_LABEL[r.medium] || r.medium}</span>
                        <span style={S.tag}>{CLASS_LABEL[r.cls] || r.cls}</span>
                        <span style={S.tag}>{SUBJECT_LABEL[r.subject] || r.subject}</span>
                      </td>
                      <td style={S.td}>{r.quantity}</td>
                      <td style={{ ...S.td, color: '#888' }}>{r.status === 'approved' ? r.fulfilled : '—'}</td>
                      <td style={{ ...S.td, color: '#aaa', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td style={S.td}>
                        <span style={{ ...REQ_STATUS[r.status], padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{r.status}</span>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.status === 'pending' && <>
                          <button onClick={() => handleApproveReq(r.id)} style={S.approveSmBtn}>Approve</button>
                          <button onClick={() => handleRejectReq(r.id)} style={{ ...S.rejectSmBtn, marginLeft: '6px' }}>Reject</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

const S = {
  back:        { background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px', color: '#555' },
  card:        { backgroundColor: '#fff', borderRadius: '10px', padding: '18px 20px', border: '1px solid #e8e8e8' },
  cancelBtn:   { padding: '8px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'none', color: '#555', cursor: 'pointer', fontSize: '13px' },
  viewBtn:     { padding: '8px 14px', border: '1px solid #c5cae9', borderRadius: '6px', background: 'none', color: '#3949ab', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  sendBackBtn: { padding: '8px 14px', border: '1px solid #ffcc80', borderRadius: '6px', background: 'none', color: '#e65100', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  approveBtn:  { padding: '8px 14px', border: 'none', borderRadius: '6px', backgroundColor: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  approveSmBtn:{ background: 'none', border: '1px solid #a5d6a7', color: '#2e7d32', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px' },
  rejectSmBtn: { background: 'none', border: '1px solid #ffcdd2', color: '#e53935', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px' },
  th:  { textAlign: 'left', padding: '6px 10px', color: '#888', fontWeight: 600, fontSize: '11px' },
  td:  { padding: '9px 10px', borderBottom: '1px solid #f5f5f5' },
  tag: { fontSize: '11px', backgroundColor: '#f0f0f0', color: '#555', padding: '2px 7px', borderRadius: '8px', marginRight: '3px', display: 'inline-block', whiteSpace: 'nowrap' },
};
