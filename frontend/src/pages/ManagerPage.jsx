import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getManagerPages, approveManagerPage, sendBackPage, flagAdminPage,
  IMAGE_BASE_URL as IMAGE_BASE,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const MEDIUM_LABEL  = { english_medium: 'English Medium', kannada_medium: 'Kannada Medium' };
const CLASS_LABEL   = { class_8: 'Class 8', class_9: 'Class 9', class_10: 'Class 10' };
const SUBJECT_LABEL = { english: 'English', kannada: 'Kannada', science: 'Science', social_science: 'Social Science', maths: 'Maths' };

const AREA_STYLE = {
  pending_approval: { border: '#ffcc80', bg: '#fff8e1', color: '#e65100', label: 'Pending' },
  needs_rework:     { border: '#ef9a9a', bg: '#fce4ec', color: '#b71c1c', label: 'Rework' },
  flagged_admin:    { border: '#f48fb1', bg: '#fce4ec', color: '#ad1457', label: 'Flagged' },
  approved:         { border: '#a5d6a7', bg: '#e8f5e9', color: '#1b5e20', label: 'Approved' },
};

const TABS = [
  { key: 'approve_annotations', label: 'Approve Annotations' },
  { key: 'pending_approval',    label: 'Review queue' },
  { key: 'needs_rework',        label: 'Sent back' },
  { key: 'flagged_admin',       label: 'Flagged for admin' },
  { key: 'approved',            label: 'Approved' },
];

export default function ManagerPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [pages,   setPages]   = useState([]);
  const [tab,     setTab]     = useState('approve_annotations');
  const [loading, setLoading] = useState(true);
  const [activeRemark, setActiveRemark] = useState(null);
  const [acting,  setActing]  = useState(false);

  const [expandedAnnotator, setExpandedAnnotator] = useState(null);
  const [modal,     setModal]     = useState(null);
  const [modalNote, setModalNote] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setPages(await getManagerPages());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ── Table-view actions ────────────────────────────────────────────────────

  async function handleApprove(page_name) {
    setActing(true);
    try {
      const updated = await approveManagerPage(page_name);
      setPages(prev => prev.map(p => p.page_name === page_name ? { ...p, ...updated } : p));
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to approve.');
    } finally {
      setActing(false);
    }
  }

  async function handleRemarkSubmit() {
    if (!activeRemark) return;
    const { page_name, action, note } = activeRemark;
    setActing(true);
    try {
      const updated = action === 'send_back'
        ? await sendBackPage(page_name, note)
        : await flagAdminPage(page_name, note);
      setPages(prev => prev.map(p => p.page_name === page_name ? { ...p, ...updated } : p));
      setActiveRemark(null);
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed.');
    } finally {
      setActing(false);
    }
  }

  // ── Grid modal actions ────────────────────────────────────────────────────

  function closeModal() {
    if (acting) return;
    setModal(null); setModalNote('');
  }

  async function modalApprove() {
    setActing(true);
    try {
      const updated = await approveManagerPage(modal.page_name);
      setPages(prev => prev.map(p => p.page_name === modal.page_name ? { ...p, ...updated } : p));
      setModal(null);
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed.');
    } finally {
      setActing(false);
    }
  }

  async function modalSendBack() {
    setActing(true);
    try {
      const updated = await sendBackPage(modal.page_name, modalNote);
      setPages(prev => prev.map(p => p.page_name === modal.page_name ? { ...p, ...updated } : p));
      setModal(null); setModalNote('');
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed.');
    } finally {
      setActing(false);
    }
  }

  async function modalFlagAdmin() {
    setActing(true);
    try {
      const updated = await flagAdminPage(modal.page_name, modalNote);
      setPages(prev => prev.map(p => p.page_name === modal.page_name ? { ...p, ...updated } : p));
      setModal(null); setModalNote('');
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed.');
    } finally {
      setActing(false);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const annotatorGroups = useMemo(() => {
    const map = {};
    pages.forEach(p => {
      const u = p.assigned_to || '(unassigned)';
      if (!map[u]) map[u] = { username: u, pending_approval: 0, needs_rework: 0, flagged_admin: 0, approved: 0, pages: [] };
      map[u].pages.push(p);
      if (p.area in map[u]) map[u][p.area]++;
    });
    return Object.values(map).sort((a, b) => a.username.localeCompare(b.username));
  }, [pages]);

  const visible = tab !== 'approve_annotations' ? pages.filter(p => p.area === tab) : [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>

      {/* Annotation review modal */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={closeModal}
        >
          <div
            style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '22px', width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>{modal.page_name}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
                  {MEDIUM_LABEL[modal.medium] || modal.medium}
                  {' · '}{CLASS_LABEL[modal.cls] || modal.cls}
                  {' · '}{SUBJECT_LABEL[modal.subject] || modal.subject}
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                  {modal.box_count ?? 0} box{modal.box_count !== 1 ? 'es' : ''} · by {modal.assigned_to}
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

            <img
              src={`${IMAGE_BASE}/${modal.image_path}`}
              alt={modal.page_name}
              style={{ width: '100%', borderRadius: '8px', border: '1px solid #e0e0e0', display: 'block' }}
              onError={e => { e.target.style.display = 'none'; }}
            />

            {modal.area !== 'approved' && (
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
                  Remark (optional — shown to annotator)
                </label>
                <textarea
                  value={modalNote}
                  onChange={e => setModalNote(e.target.value)}
                  placeholder="e.g. Labels missing on diagram"
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box', resize: 'vertical', minHeight: '56px', fontFamily: 'inherit' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={closeModal} disabled={acting}
                style={{ padding: '8px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'none', color: '#555', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button onClick={() => navigate(`/annotate/${encodeURIComponent(modal.page_name)}`)}
                style={{ padding: '8px 14px', border: '1px solid #c5cae9', borderRadius: '6px', background: 'none', color: '#3949ab', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                View
              </button>
              {modal.area !== 'approved' && <>
                <button onClick={modalSendBack} disabled={acting}
                  style={{ padding: '8px 14px', border: '1px solid #ffcc80', borderRadius: '6px', background: 'none', color: '#e65100', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  {acting ? '…' : 'Send back'}
                </button>
                <button onClick={modalFlagAdmin} disabled={acting}
                  style={{ padding: '8px 14px', border: '1px solid #f48fb1', borderRadius: '6px', background: 'none', color: '#ad1457', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  {acting ? '…' : 'Flag admin'}
                </button>
                <button onClick={modalApprove} disabled={acting}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: '6px', backgroundColor: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  {acting ? '…' : 'Approve'}
                </button>
              </>}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '28px', maxWidth: '960px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e4e4e4' }}>
          <button onClick={() => navigate('/')} style={S.outlineBtn}>← Back</button>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 0 14px', flex: 1 }}>Review</div>
          <span style={{ fontSize: '12px', color: '#aaa', marginRight: '14px' }}>{user?.username}</span>
          <button onClick={() => { logout(); navigate('/login'); }} style={S.outlineBtn}>Sign out</button>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {TABS.map(t => {
            const count = t.key === 'approve_annotations'
              ? pages.filter(p => p.area === 'pending_approval').length
              : pages.filter(p => p.area === t.key).length;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ ...S.tab, ...(tab === t.key ? S.tabOn : {}) }}>
                {t.label}
                {count > 0 && (
                  <span style={{ ...S.tabBadge, ...(tab === t.key ? S.tabBadgeOn : {}) }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Approve Annotations grid ── */}
        {tab === 'approve_annotations' && (
          <div style={S.card}>
            {loading ? <p style={S.muted}>Loading…</p> : annotatorGroups.length === 0 ? (
              <p style={S.muted}>No annotated pages yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {annotatorGroups.map(group => (
                  <div key={group.username}>
                    <button
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px solid #eee', borderRadius: '8px', background: expandedAnnotator === group.username ? '#f5f9ff' : '#fafafa', cursor: 'pointer', textAlign: 'left' }}
                      onClick={() => setExpandedAnnotator(expandedAnnotator === group.username ? null : group.username)}
                    >
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{group.username}</span>
                      {group.pending_approval > 0 && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#fff8e1', color: '#e65100' }}>{group.pending_approval} pending</span>
                      )}
                      {group.needs_rework > 0 && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#fce4ec', color: '#b71c1c' }}>{group.needs_rework} rework</span>
                      )}
                      {group.flagged_admin > 0 && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#fce4ec', color: '#ad1457' }}>{group.flagged_admin} flagged</span>
                      )}
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#e8f5e9', color: '#2e7d32' }}>{group.approved} approved</span>
                      <span style={{ fontSize: '12px', color: '#aaa' }}>{expandedAnnotator === group.username ? '▲' : '▼'}</span>
                    </button>

                    {expandedAnnotator === group.username && (
                      <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '4px 2px 8px' }}>
                        {group.pages.map(p => {
                          const as = AREA_STYLE[p.area] || { border: '#ddd', bg: '#f0f0f0', color: '#555', label: p.area };
                          return (
                            <div
                              key={p.page_name}
                              style={{ width: '88px', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${as.border}`, backgroundColor: '#fff' }}
                              onClick={() => { setModal(p); setModalNote(''); }}
                            >
                              <img
                                src={`${IMAGE_BASE}/${p.image_path}`}
                                alt={p.page_name}
                                style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }}
                                onError={e => { e.target.style.display = 'none'; }}
                              />
                              <div style={{ padding: '4px 6px 6px' }}>
                                <div style={{ fontSize: '10px', color: '#555', wordBreak: 'break-all', lineHeight: '1.3' }}>{p.page_name}</div>
                                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', fontWeight: 600, display: 'inline-block', marginTop: '3px', backgroundColor: as.bg, color: as.color }}>
                                  {as.label}
                                </span>
                                <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>{p.box_count ?? 0} boxes</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Table view ── */}
        {tab !== 'approve_annotations' && (
          <div style={S.card}>
            {loading ? (
              <p style={S.muted}>Loading…</p>
            ) : visible.length === 0 ? (
              <p style={S.muted}>Nothing here.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    {['Page', 'Annotator', 'Subject', 'Boxes', 'Date', ''].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(p => (
                    <PageRow
                      key={p.page_name}
                      page={p}
                      tab={tab}
                      navigate={navigate}
                      onApprove={handleApprove}
                      activeRemark={activeRemark}
                      setActiveRemark={setActiveRemark}
                      onRemarkSubmit={handleRemarkSubmit}
                      acting={acting}
                    />
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

function PageRow({ page, tab, navigate, onApprove, activeRemark, setActiveRemark, onRemarkSubmit, acting }) {
  const isActive    = activeRemark?.page_name === page.page_name;
  const isSendBack  = isActive && activeRemark.action === 'send_back';
  const isFlagAdmin = isActive && activeRemark.action === 'flag_admin';

  function toggleRemark(action) {
    if (isActive && activeRemark.action === action) {
      setActiveRemark(null);
    } else {
      setActiveRemark({ page_name: page.page_name, action, note: '' });
    }
  }

  return (
    <>
      <tr style={{ borderBottom: isActive ? 'none' : '1px solid #f5f5f5' }}>
        <td style={{ ...S.td, fontWeight: 600, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={page.page_name}>
          {page.page_name}
        </td>
        <td style={S.td}>{page.assigned_to || '—'}</td>
        <td style={S.td}>
          <span style={S.tag}>{CLASS_LABEL[page.cls] || page.cls}</span>
          <span style={S.tag}>{SUBJECT_LABEL[page.subject] || page.subject}</span>
        </td>
        <td style={S.td}>{page.box_count ?? 0}</td>
        <td style={{ ...S.td, color: '#aaa', whiteSpace: 'nowrap' }}>
          {new Date(page.uploaded_at).toLocaleDateString()}
        </td>
        <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button onClick={() => navigate(`/annotate/${encodeURIComponent(page.page_name)}`)} style={S.annotateBtn}>
            Annotate
          </button>
          {(tab === 'pending_approval' || tab === 'needs_rework') && (
            <button onClick={() => onApprove(page.page_name)} disabled={acting}
              style={{ ...S.approveBtn, marginLeft: '5px' }}>
              Approve
            </button>
          )}
          {tab === 'pending_approval' && <>
            <button onClick={() => toggleRemark('send_back')}
              style={{ ...S.sendBackBtn, marginLeft: '5px', ...(isSendBack ? { backgroundColor: '#fff3e0', borderColor: '#ff9800' } : {}) }}>
              Send back
            </button>
            <button onClick={() => toggleRemark('flag_admin')}
              style={{ ...S.flagBtn, marginLeft: '5px', ...(isFlagAdmin ? { backgroundColor: '#fce4ec', borderColor: '#e91e63' } : {}) }}>
              Flag admin
            </button>
          </>}
        </td>
      </tr>

      {isActive && (
        <tr>
          <td colSpan={6} style={{ padding: '0 0 10px 0', borderBottom: '1px solid #f5f5f5' }}>
            <div style={{
              backgroundColor: isSendBack ? '#fff8e1' : '#fce4ec',
              border: `1px solid ${isSendBack ? '#ffcc02' : '#f48fb1'}`,
              borderRadius: '6px', padding: '12px 14px', margin: '0 4px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: isSendBack ? '#e65100' : '#b71c1c', marginBottom: '8px' }}>
                {isSendBack ? 'Send back to annotator' : 'Flag for admin review'}
              </div>
              <textarea
                placeholder="Remark (optional)"
                value={activeRemark.note}
                onChange={e => setActiveRemark(r => ({ ...r, note: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '5px', resize: 'vertical', minHeight: '60px', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={onRemarkSubmit} disabled={acting}
                  style={isSendBack ? S.sendBackConfirm : S.flagConfirm}>
                  {acting ? 'Saving…' : (isSendBack ? 'Send back' : 'Flag for admin')}
                </button>
                <button onClick={() => setActiveRemark(null)} style={S.cancelBtn}>Cancel</button>
              </div>
            </div>
          </td>
        </tr>
      )}

      {!isActive && page.review_note && tab !== 'pending_approval' && (
        <tr>
          <td colSpan={6} style={{ padding: '0 0 10px 12px', borderBottom: '1px solid #f5f5f5' }}>
            <span style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
              Remark: {page.review_note}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

const S = {
  outlineBtn:      { background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px', color: '#555' },
  card:            { backgroundColor: '#fff', borderRadius: '10px', padding: '20px 22px', marginBottom: '16px', border: '1px solid #e8e8e8' },
  muted:           { color: '#bbb', fontSize: '13px', margin: 0 },
  tab:             { padding: '6px 14px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '20px', cursor: 'pointer', backgroundColor: '#fafafa', color: '#555', display: 'inline-flex', alignItems: 'center', gap: '6px' },
  tabOn:           { backgroundColor: '#e8eaf6', borderColor: '#7986cb', color: '#283593', fontWeight: 600 },
  tabBadge:        { fontSize: '11px', backgroundColor: '#e0e0e0', color: '#555', padding: '1px 7px', borderRadius: '10px', fontWeight: 600 },
  tabBadgeOn:      { backgroundColor: '#7986cb', color: '#fff' },
  th:              { textAlign: 'left', padding: '6px 10px', color: '#888', fontWeight: 600, fontSize: '11px' },
  td:              { padding: '10px 10px', verticalAlign: 'middle' },
  tag:             { fontSize: '11px', backgroundColor: '#f0f0f0', color: '#555', padding: '2px 7px', borderRadius: '8px', marginRight: '3px', display: 'inline-block', whiteSpace: 'nowrap' },
  annotateBtn:     { padding: '4px 10px', backgroundColor: '#e8eaf6', color: '#3949ab', border: '1px solid #c5cae9', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  approveBtn:      { padding: '4px 10px', background: 'none', border: '1px solid #a5d6a7', color: '#2e7d32', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' },
  sendBackBtn:     { padding: '4px 10px', background: 'none', border: '1px solid #ffcc80', color: '#e65100', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' },
  flagBtn:         { padding: '4px 10px', background: 'none', border: '1px solid #f48fb1', color: '#b71c1c', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' },
  sendBackConfirm: { padding: '6px 16px', backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  flagConfirm:     { padding: '6px 16px', backgroundColor: '#e91e63', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  cancelBtn:       { padding: '6px 16px', background: 'none', border: '1px solid #ddd', color: '#555', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' },
};
