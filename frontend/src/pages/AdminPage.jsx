import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  listUsers, createUser, deleteUser,
  getAnnotationRequests, approveAnnotationRequest, rejectAnnotationRequest,
  getManagerPages, getAdminUploads, approveUpload, flagUpload, unflagUpload,
  approveManagerPage, sendBackPage,
  IMAGE_BASE_URL as IMAGE_BASE, RAW_BASE_URL as RAW_BASE,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const ROLES = ['annotator', 'pictaker', 'manager', 'admin'];

const MEDIUM_LABEL  = { english_medium: 'English Medium', kannada_medium: 'Kannada Medium' };
const CLASS_LABEL   = { class_8: 'Class 8', class_9: 'Class 9', class_10: 'Class 10' };
const SUBJECT_LABEL = { english: 'English', kannada: 'Kannada', science: 'Science', social_science: 'Social Science', maths: 'Maths' };

const STATUS_STYLE  = {
  pending:  { bg: '#fff8e1', color: '#e65100' },
  approved: { bg: '#e8f5e9', color: '#1b5e20' },
  rejected: { bg: '#fce4ec', color: '#b71c1c' },
};

const APPROVAL_STYLE = {
  pending:  { backgroundColor: '#fff8e1', color: '#e65100' },
  redo:     { backgroundColor: '#e8eaf6', color: '#283593' },
  approved: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
  flagged:  { backgroundColor: '#fce4ec', color: '#b71c1c' },
};
const APPROVAL_LABEL = { pending: 'Pending', redo: 'Flag redone', approved: 'Approved', flagged: 'Flagged' };

const ROLE_COLOURS = {
  admin:     { bg: '#fce4ec', color: '#b71c1c' },
  manager:   { bg: '#e8f5e9', color: '#1b5e20' },
  annotator: { bg: '#e3f2fd', color: '#0d47a1' },
  pictaker:  { bg: '#fff8e1', color: '#e65100' },
};

const TABS = [
  { id: 'uploads',     label: 'Approve Uploads' },
  { id: 'annotations', label: 'Approve Annotations' },
  { id: 'requests',    label: 'Requests' },
  { id: 'users',       label: 'Users' },
];

const AREA_STYLE = {
  pending_approval: { border: '#ffcc80', bg: '#fff8e1', color: '#e65100', label: 'Pending' },
  needs_rework:     { border: '#ef9a9a', bg: '#fce4ec', color: '#b71c1c', label: 'Rework' },
  flagged_admin:    { border: '#f48fb1', bg: '#fce4ec', color: '#ad1457', label: 'Flagged' },
  approved:         { border: '#a5d6a7', bg: '#e8f5e9', color: '#1b5e20', label: 'Approved' },
};

export default function AdminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(location.state?.tab || 'uploads');
  const focused = location.state?.tab === 'uploads';

  const [users, setUsers]       = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState('annotator');
  const [error, setError]       = useState('');
  const [creating, setCreating] = useState(false);

  const [requests, setRequests]         = useState([]);
  const [flagged,  setFlagged]          = useState([]);
  const [uploadGroups, setUploadGroups] = useState([]);
  const [expandedUser,  setExpandedUser]  = useState(null);
  const [docModalName,  setDocModalName]  = useState(null);
  const [reviewModal, setReviewModal]   = useState(null);
  const [flagNote, setFlagNote]         = useState('');
  const [actionBusy, setActionBusy]     = useState(false);

  const [annotationPages,    setAnnotationPages]    = useState([]);
  const [expandedAnnotator,  setExpandedAnnotator]  = useState(null);
  const [annotationModal,    setAnnotationModal]    = useState(null);
  const [annotationNote,     setAnnotationNote]     = useState('');
  const [annotationBusy,     setAnnotationBusy]     = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [u, r, mp, ug] = await Promise.all([
        listUsers(), getAnnotationRequests(), getManagerPages(), getAdminUploads(),
      ]);
      setUsers(u);
      setRequests(r);
      setAnnotationPages(mp);
      setFlagged(mp.filter(p => p.area === 'flagged_admin'));
      setUploadGroups(ug);
    } catch {}
  }

  async function handleApprove(id) {
    try {
      const updated = await approveAnnotationRequest(id);
      setRequests((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to approve.');
    }
  }

  async function handleReject(id) {
    try {
      const updated = await rejectAnnotationRequest(id);
      setRequests((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to reject.');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await createUser(username, password, role);
      setUsername(''); setPassword(''); setRole('annotator');
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(uname) {
    if (!window.confirm(`Delete user "${uname}"? This cannot be undone.`)) return;
    try { await deleteUser(uname); await load(); } catch {}
  }

  function openReview(upload) {
    setReviewModal({ upload });
    setFlagNote(upload.upload_approval_note || '');
  }

  async function handleApproveUpload() {
    if (!reviewModal) return;
    setActionBusy(true);
    try {
      await approveUpload(reviewModal.upload.page_name);
      await load();
      setReviewModal(null);
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleFlagUpload() {
    if (!reviewModal) return;
    setActionBusy(true);
    try {
      await flagUpload(reviewModal.upload.page_name, flagNote || null);
      await load();
      setReviewModal(null);
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUnflagUpload() {
    if (!reviewModal) return;
    setActionBusy(true);
    try {
      await unflagUpload(reviewModal.upload.page_name);
      await load();
      setReviewModal(null);
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleApproveAll(pages) {
    const toApprove = pages.filter(p => (p.upload_approval_status || 'pending') !== 'approved');
    if (!toApprove.length) return;
    setActionBusy(true);
    try {
      await Promise.all(toApprove.map(p => approveUpload(p.page_name)));
      await load();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to approve all.');
    } finally {
      setActionBusy(false);
    }
  }

  function closeAnnotationModal() {
    if (annotationBusy) return;
    setAnnotationModal(null); setAnnotationNote('');
  }

  async function annotationApprove() {
    setAnnotationBusy(true);
    try {
      const updated = await approveManagerPage(annotationModal.page_name);
      setAnnotationPages(prev => prev.map(p => p.page_name === annotationModal.page_name ? { ...p, ...updated } : p));
      setAnnotationModal(null);
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed.');
    } finally {
      setAnnotationBusy(false);
    }
  }

  async function annotationSendBack() {
    setAnnotationBusy(true);
    try {
      const updated = await sendBackPage(annotationModal.page_name, annotationNote);
      setAnnotationPages(prev => prev.map(p => p.page_name === annotationModal.page_name ? { ...p, ...updated } : p));
      setAnnotationModal(null); setAnnotationNote('');
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed.');
    } finally {
      setAnnotationBusy(false);
    }
  }

  const annotatorGroups = useMemo(() => {
    const map = {};
    annotationPages.forEach(p => {
      const u = p.assigned_to || '(unassigned)';
      if (!map[u]) map[u] = { username: u, pending_approval: 0, needs_rework: 0, flagged_admin: 0, approved: 0, pages: [] };
      map[u].pages.push(p);
      if (p.area in map[u]) map[u][p.area]++;
    });
    return Object.values(map).sort((a, b) => a.username.localeCompare(b.username));
  }, [annotationPages]);

  const groupByUser = Object.fromEntries(uploadGroups.map(g => [g.username, g]));
  const pictakers   = users.filter(u => u.role === 'pictaker');
  const allGroups   = pictakers.map(u =>
    groupByUser[u.username] || { username: u.username, pending: 0, redo: 0, approved: 0, flagged: 0, uploads: [] }
  );

  const totalPending  = allGroups.reduce((s, g) => s + g.pending + (g.redo || 0), 0);
  const totalFlagged  = allGroups.reduce((s, g) => s + g.flagged, 0);
  const totalRedo     = allGroups.reduce((s, g) => s + (g.redo || 0), 0);
  const totalApproved = allGroups.reduce((s, g) => s + g.approved, 0);
  const totalUploads  = allGroups.reduce((s, g) => s + g.pending + (g.redo || 0) + g.approved + g.flagged, 0);
  const pendingRequests = requests.filter(r => r.status === 'pending').length;

  const docModalData = (() => {
    if (!docModalName) return null;
    for (const group of uploadGroups) {
      const pages = group.uploads
        .filter(up => up.doc_name === docModalName)
        .sort((a, b) => a.page_number - b.page_number);
      if (!pages.length) continue;
      const pending  = pages.filter(p => !p.upload_approval_status || p.upload_approval_status === 'pending').length;
      const redo     = pages.filter(p => p.upload_approval_status === 'redo').length;
      const approved = pages.filter(p => p.upload_approval_status === 'approved').length;
      const flagged  = pages.filter(p => p.upload_approval_status === 'flagged').length;
      return { doc_name: docModalName, uploaded_by: pages[0].uploaded_by, pages, pending, redo, approved, flagged };
    }
    return null;
  })();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>

      {/* Image review modal */}
      {reviewModal && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => !actionBusy && setReviewModal(null)}
        >
          <div
            style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '860px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>{reviewModal.upload.page_name}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                  {MEDIUM_LABEL[reviewModal.upload.medium] || reviewModal.upload.medium} ·{' '}
                  {CLASS_LABEL[reviewModal.upload.cls] || reviewModal.upload.cls} ·{' '}
                  {SUBJECT_LABEL[reviewModal.upload.subject] || reviewModal.upload.subject}
                </div>
              </div>
              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '10px', fontWeight: 600, ...APPROVAL_STYLE[reviewModal.upload.upload_approval_status || 'pending'] }}>
                {APPROVAL_LABEL[reviewModal.upload.upload_approval_status] || 'Pending'}
              </span>
            </div>

            {/* Previous flag note (for redo status) */}
            {reviewModal.upload.upload_approval_status === 'redo' && reviewModal.upload.upload_approval_note && (
              <div style={{ backgroundColor: '#e8eaf6', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#283593' }}>
                <span style={{ fontWeight: 600 }}>Previous flag: </span>
                {reviewModal.upload.upload_approval_note}
              </div>
            )}

            {/* Raw vs processed images */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {reviewModal.upload.raw_image_path && (
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Raw</div>
                  <img
                    src={`${RAW_BASE}/${reviewModal.upload.raw_image_path}`}
                    alt="raw"
                    style={{ width: '100%', borderRadius: '8px', border: '1px solid #e0e0e0', display: 'block' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              )}
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Processed</div>
                <img
                  src={`${IMAGE_BASE}/${reviewModal.upload.image_path}`}
                  alt="processed"
                  style={{ width: '100%', borderRadius: '8px', border: '1px solid #e0e0e0', display: 'block' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            </div>

            {/* Flag note input */}
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
                Flag note (optional — shown to pictaker)
              </label>
              <input
                style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }}
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                placeholder="e.g. Image is blurry, please retake"
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                style={{ padding: '9px 20px', border: '1px solid #ddd', borderRadius: '6px', background: 'none', color: '#555', cursor: 'pointer', fontSize: '13px' }}
                onClick={() => setReviewModal(null)}
                disabled={actionBusy}
              >
                Cancel
              </button>
              {reviewModal.upload.upload_approval_status === 'flagged' ? (
                <button
                  style={{ padding: '9px 20px', border: '1px solid #c5cae9', borderRadius: '6px', background: 'none', color: '#3949ab', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                  onClick={handleUnflagUpload}
                  disabled={actionBusy}
                >
                  {actionBusy ? '…' : 'Unflag'}
                </button>
              ) : (
                <button
                  style={{ padding: '9px 20px', border: '1px solid #f48fb1', borderRadius: '6px', background: 'none', color: '#b71c1c', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                  onClick={handleFlagUpload}
                  disabled={actionBusy}
                >
                  {actionBusy ? '…' : 'Flag'}
                </button>
              )}
              <button
                style={{ padding: '9px 20px', border: 'none', borderRadius: '6px', backgroundColor: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                onClick={handleApproveUpload}
                disabled={actionBusy}
              >
                {actionBusy ? '…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Annotation review modal */}
      {annotationModal && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)', zIndex: 1010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={closeAnnotationModal}
        >
          <div
            style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '22px', width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>{annotationModal.page_name}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
                  {MEDIUM_LABEL[annotationModal.medium] || annotationModal.medium}
                  {' · '}{CLASS_LABEL[annotationModal.cls] || annotationModal.cls}
                  {' · '}{SUBJECT_LABEL[annotationModal.subject] || annotationModal.subject}
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                  {annotationModal.box_count ?? 0} box{annotationModal.box_count !== 1 ? 'es' : ''} · by {annotationModal.assigned_to}
                </div>
              </div>
              {AREA_STYLE[annotationModal.area] && (
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '10px', fontWeight: 600, backgroundColor: AREA_STYLE[annotationModal.area].bg, color: AREA_STYLE[annotationModal.area].color }}>
                  {AREA_STYLE[annotationModal.area].label}
                </span>
              )}
            </div>

            {annotationModal.review_note && (
              <div style={{ backgroundColor: '#fff8e1', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#e65100' }}>
                <span style={{ fontWeight: 600 }}>Previous remark: </span>{annotationModal.review_note}
              </div>
            )}

            <img
              src={`${IMAGE_BASE}/${annotationModal.image_path}`}
              alt={annotationModal.page_name}
              style={{ width: '100%', borderRadius: '8px', border: '1px solid #e0e0e0', display: 'block' }}
              onError={e => { e.target.style.display = 'none'; }}
            />

            {annotationModal.area !== 'approved' && (
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>
                  Remark (optional — shown to annotator on send back)
                </label>
                <textarea
                  value={annotationNote}
                  onChange={e => setAnnotationNote(e.target.value)}
                  placeholder="e.g. Labels missing on diagram"
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box', resize: 'vertical', minHeight: '56px', fontFamily: 'inherit' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={closeAnnotationModal} disabled={annotationBusy}
                style={{ padding: '8px 14px', border: '1px solid #ddd', borderRadius: '6px', background: 'none', color: '#555', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button onClick={() => navigate(`/annotate/${encodeURIComponent(annotationModal.page_name)}`)}
                style={{ padding: '8px 14px', border: '1px solid #c5cae9', borderRadius: '6px', background: 'none', color: '#3949ab', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                View
              </button>
              {annotationModal.area !== 'approved' && <>
                <button onClick={annotationSendBack} disabled={annotationBusy}
                  style={{ padding: '8px 14px', border: '1px solid #ffcc80', borderRadius: '6px', background: 'none', color: '#e65100', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  {annotationBusy ? '…' : 'Send back'}
                </button>
                <button onClick={annotationApprove} disabled={annotationBusy}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: '6px', backgroundColor: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  {annotationBusy ? '…' : 'Approve'}
                </button>
              </>}
            </div>
          </div>
        </div>
      )}

      {/* Doc pages overlay */}
      {docModalData && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => !actionBusy && setDocModalName(null)}>
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '22px', width: '100%', maxWidth: '700px', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>{docModalData.doc_name}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{docModalData.uploaded_by} · {docModalData.pages.length} pages</div>
              </div>
              {(docModalData.pending + docModalData.redo) > 0 && (
                <button onClick={() => handleApproveAll(docModalData.pages)} disabled={actionBusy}
                  style={{ padding: '7px 16px', border: 'none', borderRadius: '6px', backgroundColor: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  {actionBusy ? '…' : `Approve all (${docModalData.pending + docModalData.redo})`}
                </button>
              )}
              <button onClick={() => setDocModalName(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#aaa', lineHeight: 1, padding: '0 4px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {docModalData.pages.map(up => {
                const status = up.upload_approval_status || 'pending';
                return (
                  <div key={up.page_name}
                    style={{ width: '100px', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${status === 'flagged' ? '#f48fb1' : status === 'redo' ? '#9fa8da' : status === 'approved' ? '#a5d6a7' : '#ddd'}`, backgroundColor: '#fff' }}
                    onClick={() => openReview(up)}>
                    <img src={`${IMAGE_BASE}/${up.image_path}`} alt={up.page_name}
                      style={{ width: '100%', height: '130px', objectFit: 'cover', display: 'block' }}
                      onError={e => { e.target.style.display = 'none'; }} />
                    <div style={{ padding: '4px 7px 7px' }}>
                      <div style={{ fontSize: '11px', color: '#555' }}>p{up.page_number}</div>
                      <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', fontWeight: 600, display: 'inline-block', marginTop: '3px', ...APPROVAL_STYLE[status] }}>
                        {APPROVAL_LABEL[status]}
                      </span>
                      {up.upload_approval_note && (
                        <div style={{ fontSize: '9px', color: '#5c6bc0', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={up.upload_approval_note}>
                          {up.upload_approval_note}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '28px', maxWidth: '760px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e4e4e4' }}>
          <button onClick={() => navigate('/')} style={S.back}>← Back</button>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 0 14px', flex: 1 }}>Admin</h1>
          <span style={{ fontSize: '12px', color: '#aaa', marginRight: '14px' }}>{user?.username}</span>
          <button onClick={() => { logout(); navigate('/login'); }} style={S.logout}>Sign out</button>
        </div>

        {/* Tab bar — hidden when opened directly from Approve Uploads shortcut */}
        <div style={{ display: focused ? 'none' : 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid #e4e4e4', paddingBottom: '0' }}>
          {TABS.map((tab) => {
            const badge = tab.id === 'uploads'
              ? totalPending + totalRedo
              : tab.id === 'annotations'
              ? annotationPages.filter(p => p.area === 'pending_approval').length
              : tab.id === 'requests'
              ? pendingRequests + flagged.length
              : 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  border: 'none', background: 'none', borderBottom: activeTab === tab.id ? '2px solid #1565C0' : '2px solid transparent',
                  color: activeTab === tab.id ? '#1565C0' : '#888',
                  marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {tab.label}
                {badge > 0 && (
                  <span style={{ fontSize: '11px', backgroundColor: activeTab === tab.id ? '#e3f2fd' : '#f0f0f0', color: activeTab === tab.id ? '#1565C0' : '#888', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Approve Uploads tab ── */}
        {activeTab === 'uploads' && (
          <div>
            <div style={{ ...S.card, borderColor: totalPending + totalRedo > 0 ? '#ffe082' : '#e8e8e8' }}>
              <h2 style={{ ...S.cardTitle, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                Image approval
                <span style={{ fontSize: '12px', fontWeight: 600, backgroundColor: '#f0f0f0', color: '#555', padding: '1px 8px', borderRadius: '10px' }}>
                  {totalUploads} uploaded
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '1px 8px', borderRadius: '10px' }}>
                  {totalApproved} approved
                </span>
                {totalPending > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 600, backgroundColor: '#fff8e1', color: '#e65100', padding: '1px 8px', borderRadius: '10px' }}>
                    {totalPending} pending
                  </span>
                )}
                {totalRedo > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 600, backgroundColor: '#e8eaf6', color: '#283593', padding: '1px 8px', borderRadius: '10px' }}>
                    {totalRedo} redone
                  </span>
                )}
                {totalFlagged > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 600, backgroundColor: '#fce4ec', color: '#b71c1c', padding: '1px 8px', borderRadius: '10px' }}>
                    {totalFlagged} flagged
                  </span>
                )}
              </h2>

              {allGroups.length === 0 ? (
                <p style={{ color: '#bbb', fontSize: '13px' }}>No pictakers yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {allGroups.map((group) => {
                    const total = group.pending + (group.redo || 0) + group.approved + group.flagged;
                    const needsReview = group.pending + (group.redo || 0);

                    // Group this pictaker's uploads by document
                    const docMap = {};
                    group.uploads.forEach(up => {
                      if (!docMap[up.doc_name]) docMap[up.doc_name] = { doc_name: up.doc_name, pending: 0, redo: 0, approved: 0, flagged: 0, pages: [] };
                      docMap[up.doc_name].pages.push(up);
                      const st = up.upload_approval_status || 'pending';
                      if (st in docMap[up.doc_name]) docMap[up.doc_name][st]++;
                    });
                    const groupDocs = Object.values(docMap)
                      .sort((a, b) => a.doc_name.localeCompare(b.doc_name, undefined, { numeric: true, sensitivity: 'base' }))
                      .map(d => ({ ...d, pages: [...d.pages].sort((a, b) => a.page_number - b.page_number) }));

                    return (
                      <div key={group.username}>
                        <button
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px solid #eee', borderRadius: '8px', background: expandedUser === group.username ? '#f5f9ff' : '#fafafa', cursor: group.uploads.length > 0 ? 'pointer' : 'default', textAlign: 'left' }}
                          onClick={() => group.uploads.length > 0 && setExpandedUser(expandedUser === group.username ? null : group.username)}
                        >
                          <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{group.username}</span>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#f0f0f0', color: '#555' }}>{total} uploaded</span>
                          {needsReview > 0 && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#fff8e1', color: '#e65100' }}>{needsReview} pending</span>}
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#e8f5e9', color: '#2e7d32' }}>{group.approved} approved</span>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#fce4ec', color: '#b71c1c' }}>{group.flagged} flagged</span>
                          {group.uploads.length > 0 && <span style={{ fontSize: '12px', color: '#aaa' }}>{expandedUser === group.username ? '▲' : '▼'}</span>}
                        </button>

                        {expandedUser === group.username && (
                          <div style={{ marginTop: '6px', padding: '4px 2px 8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {groupDocs.map(doc => {
                              const firstPage = doc.pages[0];
                              const docNeeds = doc.pending + (doc.redo || 0);
                              const borderColor = doc.flagged > 0 ? '#f48fb1' : docNeeds > 0 ? '#ffcc80' : '#a5d6a7';
                              return (
                                <div
                                  key={doc.doc_name}
                                  style={{ width: '88px', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${borderColor}`, backgroundColor: '#fff' }}
                                  onClick={() => setDocModalName(doc.doc_name)}
                                >
                                  {firstPage ? (
                                    <img
                                      src={`${IMAGE_BASE}/${firstPage.image_path}`}
                                      alt={doc.doc_name}
                                      style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }}
                                      onError={e => { e.target.style.display = 'none'; }}
                                    />
                                  ) : (
                                    <div style={{ width: '100%', height: '110px', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#bbb' }}>no img</div>
                                  )}
                                  <div style={{ padding: '4px 6px 6px' }}>
                                    <div style={{ fontSize: '10px', color: '#555', wordBreak: 'break-all', lineHeight: '1.3' }}>{doc.doc_name}</div>
                                    <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '8px', fontWeight: 600, display: 'inline-block', marginTop: '2px', ...(docNeeds > 0 ? { backgroundColor: '#fff8e1', color: '#e65100' } : { backgroundColor: '#e8f5e9', color: '#2e7d32' }) }}>
                                      {docNeeds > 0 ? `${docNeeds} pending` : 'all ok'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Approve Annotations tab ── */}
        {activeTab === 'annotations' && (
          <div style={S.card}>
            {annotatorGroups.length === 0 ? (
              <p style={{ color: '#bbb', fontSize: '13px' }}>No annotated pages yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {annotatorGroups.map(group => (
                  <div key={group.username}>
                    <button
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px solid #eee', borderRadius: '8px', background: expandedAnnotator === group.username ? '#f5f9ff' : '#fafafa', cursor: group.pages.length > 0 ? 'pointer' : 'default', textAlign: 'left' }}
                      onClick={() => group.pages.length > 0 && setExpandedAnnotator(expandedAnnotator === group.username ? null : group.username)}
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
                      {group.pages.length > 0 && (
                        <span style={{ fontSize: '12px', color: '#aaa' }}>{expandedAnnotator === group.username ? '▲' : '▼'}</span>
                      )}
                    </button>

                    {expandedAnnotator === group.username && (
                      <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '4px 2px 8px' }}>
                        {group.pages.map(p => {
                          const as = AREA_STYLE[p.area] || { border: '#ddd', bg: '#f0f0f0', color: '#555', label: p.area };
                          return (
                            <div
                              key={p.page_name}
                              style={{ width: '88px', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${as.border}`, backgroundColor: '#fff' }}
                              onClick={() => { setAnnotationModal(p); setAnnotationNote(''); }}
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

        {/* ── Requests tab ── */}
        {activeTab === 'requests' && (
          <div>
            <div style={{ ...S.card, borderColor: pendingRequests > 0 ? '#c5cae9' : '#e8e8e8' }}>
              <h2 style={S.cardTitle}>
                Annotation requests
                {pendingRequests > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 600, backgroundColor: '#e8eaf6', color: '#3949ab', padding: '1px 8px', borderRadius: '10px' }}>
                    {pendingRequests} pending
                  </span>
                )}
              </h2>
              {requests.length === 0 ? (
                <p style={{ color: '#bbb', fontSize: '13px' }}>No requests yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      {['Annotator', 'Filters', 'Qty', 'Got', 'Date', 'Status', ''].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#888', fontWeight: 600, fontSize: '11px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: r.status === 'pending' ? '#fafbff' : 'transparent' }}>
                        <td style={{ padding: '9px 10px', fontWeight: 500 }}>{r.requested_by}</td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={S.tag}>{MEDIUM_LABEL[r.medium] || r.medium}</span>
                          <span style={S.tag}>{CLASS_LABEL[r.cls] || r.cls}</span>
                          <span style={S.tag}>{SUBJECT_LABEL[r.subject] || r.subject}</span>
                        </td>
                        <td style={{ padding: '9px 10px' }}>{r.quantity}</td>
                        <td style={{ padding: '9px 10px', color: '#888' }}>{r.status === 'approved' ? r.fulfilled : '—'}</td>
                        <td style={{ padding: '9px 10px', color: '#aaa', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ ...STATUS_STYLE[r.status], padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.status === 'pending' && <>
                            <button onClick={() => handleApprove(r.id)} style={S.approveBtn}>Approve</button>
                            <button onClick={() => handleReject(r.id)} style={{ ...S.deleteBtn, marginLeft: '6px' }}>Reject</button>
                          </>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {flagged.length > 0 && (
              <div style={{ ...S.card, borderColor: '#f48fb1' }}>
                <h2 style={S.cardTitle}>
                  Flagged for review
                  <span style={{ fontSize: '12px', fontWeight: 600, backgroundColor: '#fce4ec', color: '#b71c1c', padding: '1px 8px', borderRadius: '10px' }}>
                    {flagged.length}
                  </span>
                </h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      {['Page', 'Annotator', 'Flagged by', 'Remark', ''].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#888', fontWeight: 600, fontSize: '11px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flagged.map(p => (
                      <tr key={p.page_name} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: '#fff9fb' }}>
                        <td style={{ padding: '9px 10px', fontWeight: 500 }}>{p.page_name}</td>
                        <td style={{ padding: '9px 10px' }}>{p.assigned_to || '—'}</td>
                        <td style={{ padding: '9px 10px', color: '#888' }}>{p.reviewed_by || '—'}</td>
                        <td style={{ padding: '9px 10px', color: '#555', fontStyle: p.review_note ? 'normal' : 'italic', maxWidth: '240px' }}>
                          {p.review_note || <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                          <button onClick={() => navigate(`/annotate/${encodeURIComponent(p.page_name)}`)}
                            style={{ background: 'none', border: '1px solid #c5cae9', color: '#3949ab', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px' }}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Users tab ── */}
        {activeTab === 'users' && (
          <div>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Create new user</h2>
              <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={S.label}>Username</label>
                  <input
                    style={S.input} required value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                  />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={S.label}>Password</label>
                  <input
                    style={S.input} type="text" required value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password"
                  />
                </div>
                <div style={{ flex: '0 1 130px' }}>
                  <label style={S.label}>Role</label>
                  <select style={S.input} value={role} onChange={(e) => setRole(e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={creating} style={S.createBtn}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </form>
              {error && <p style={{ fontSize: '13px', color: '#c62828', marginTop: '8px' }}>{error}</p>}
            </div>

            <div style={S.card}>
              <h2 style={S.cardTitle}>All users ({users.length})</h2>
              {users.length === 0 ? (
                <p style={{ color: '#bbb', fontSize: '13px' }}>No users yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      {['Username', 'Role', 'Created', ''].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#888', fontWeight: 600, fontSize: '11px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '9px 10px', fontWeight: 500, color: '#1a1a1a' }}>{u.username}</td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ ...ROLE_COLOURS[u.role], padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: '#aaa' }}>
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                          {u.username !== user?.username && (
                            <button onClick={() => handleDelete(u.username)} style={S.deleteBtn}>Delete</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const S = {
  back: {
    background: 'none', border: '1px solid #ddd', borderRadius: '6px',
    padding: '5px 12px', cursor: 'pointer', fontSize: '13px', color: '#555',
  },
  logout: {
    background: 'none', border: '1px solid #ddd', borderRadius: '6px',
    padding: '5px 12px', cursor: 'pointer', fontSize: '13px', color: '#555',
  },
  card: {
    backgroundColor: '#fff', borderRadius: '10px', padding: '20px 22px',
    marginBottom: '16px', border: '1px solid #e8e8e8',
  },
  cardTitle: { fontSize: '14px', fontWeight: 600, color: '#333', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' },
  label: { display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px', fontWeight: 500 },
  input: {
    width: '100%', padding: '7px 10px', fontSize: '13px',
    border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box',
    backgroundColor: '#fff',
  },
  createBtn: {
    padding: '7px 18px', backgroundColor: '#2196F3', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
    fontWeight: 600, whiteSpace: 'nowrap', alignSelf: 'flex-end',
  },
  deleteBtn: {
    background: 'none', border: '1px solid #ffcdd2', color: '#e53935',
    borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px',
  },
  approveBtn: {
    background: 'none', border: '1px solid #a5d6a7', color: '#2e7d32',
    borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px',
  },
  tag: {
    fontSize: '11px', backgroundColor: '#f0f0f0', color: '#555',
    padding: '2px 7px', borderRadius: '8px', marginRight: '3px',
    display: 'inline-block', whiteSpace: 'nowrap',
  },
};
