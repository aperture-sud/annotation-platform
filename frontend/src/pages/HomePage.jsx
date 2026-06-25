import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getDocuments, uploadFiles, renameDocument, deleteDocument, renamePage,
  getAdminUploads, getAnnotationRequests, approveAnnotationRequest, rejectAnnotationRequest,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const MEDIUM_LABEL  = { english_medium: 'English Medium', kannada_medium: 'Kannada Medium' };
const CLASS_LABEL   = { class_8: 'Class 8', class_9: 'Class 9', class_10: 'Class 10' };
const SUBJECT_LABEL = { english: 'English', kannada: 'Kannada', science: 'Science', social_science: 'Social Science', maths: 'Maths' };

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [uploadGroups, setUploadGroups] = useState([]);
  const [requests, setRequests] = useState([]);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch (e) {
      console.error('Failed to load documents', e);
    }
    if (isAdmin) {
      try { setUploadGroups(await getAdminUploads()); } catch {}
      try { setRequests(await getAnnotationRequests()); } catch {}
    }
  }

  async function handleApprove(id) {
    try {
      const updated = await approveAnnotationRequest(id);
      setRequests((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) { alert(e.response?.data?.detail || 'Failed to approve.'); }
  }

  async function handleReject(id) {
    try {
      const updated = await rejectAnnotationRequest(id);
      setRequests((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) { alert(e.response?.data?.detail || 'Failed to reject.'); }
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      await uploadFiles(files);
      await load();
    } catch (err) {
      console.error('Upload failed', err);
      alert('Upload failed. Is the backend running on port 8000?');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const pendingUploads = uploadGroups.reduce((s, g) => s + g.pending + (g.redo || 0), 0);
  const pendingRequests = requests.filter((r) => r.status === 'pending').length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>
      <div style={{ padding: '36px 28px', maxWidth: isAdmin ? '1340px' : '1040px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid #e4e4e4' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Answer Script Annotation</h1>
            <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>Open a page to annotate, or add new scripts below.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#aaa' }}>{user?.username}</span>
            {isAdmin && (
              <button onClick={() => navigate('/admin', { state: { tab: 'users' } })} style={S.headerBtn}>Users</button>
            )}
            <button onClick={() => { logout(); navigate('/login'); }} style={S.headerBtn}>Sign out</button>
          </div>
        </div>

        {/* Body: main content + optional right sidebar */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

          {/* Main column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '14px', marginBottom: '36px' }}>
              <ActionTile icon="📷" label="Scan" sub="Use camera" onClick={() => navigate('/scan')} />
              <ActionTile icon="↑" label="Upload" sub="Image or PDF" loading={uploading} onClick={() => fileInputRef.current?.click()} />
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={handleFileChange} />
            </div>

            {documents.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#ccc', padding: '60px 0', fontSize: '15px' }}>No scripts yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {documents.map((doc) => (
                  <DocCard key={doc.display_name} doc={doc} onRefresh={load} navigate={navigate} />
                ))}
              </div>
            )}
          </div>

          {/* Admin right sidebar */}
          {isAdmin && (
            <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Approve Uploads shortcut */}
              <div
                onClick={() => navigate('/admin', { state: { tab: 'uploads' } })}
                style={{
                  backgroundColor: pendingUploads > 0 ? '#fffde7' : '#fff',
                  borderRadius: '10px',
                  border: `1px solid ${pendingUploads > 0 ? '#ffe082' : '#e8e8e8'}`,
                  overflow: 'hidden', cursor: 'pointer',
                }}
              >
                <div style={{
                  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px',
                  backgroundColor: pendingUploads > 0 ? '#fffde7' : '#fafafa',
                }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#333', flex: 1 }}>Approve Uploads</span>
                  {pendingUploads > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#fff8e1', color: '#e65100', padding: '1px 8px', borderRadius: '10px' }}>
                      {pendingUploads} pending
                    </span>
                  )}
                  <span style={{ fontSize: '12px', color: '#bbb' }}>→</span>
                </div>
              </div>

              {/* Page Requests */}
              <div style={{
                backgroundColor: '#fff', borderRadius: '10px',
                border: `1px solid ${pendingRequests ? '#c5cae9' : '#e8e8e8'}`, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  backgroundColor: pendingRequests ? '#f8f9ff' : '#fafafa',
                }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#333', flex: 1 }}>Page Requests</span>
                  {pendingRequests > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#e8eaf6', color: '#3949ab', padding: '1px 8px', borderRadius: '10px' }}>
                      {pendingRequests} pending
                    </span>
                  )}
                </div>
                {requests.length === 0 ? (
                  <p style={{ padding: '20px 16px', color: '#bbb', fontSize: '12px', margin: 0 }}>No requests yet.</p>
                ) : (
                  <div>
                    {requests.map((r) => (
                      <div key={r.id} style={{
                        padding: '12px 16px', borderBottom: '1px solid #f5f5f5',
                        backgroundColor: r.status === 'pending' ? '#fafbff' : 'transparent',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '12px', color: '#1a1a1a', flex: 1 }}>{r.requested_by}</span>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '8px',
                            ...{ pending: { backgroundColor: '#fff8e1', color: '#e65100' }, approved: { backgroundColor: '#e8f5e9', color: '#1b5e20' }, rejected: { backgroundColor: '#fce4ec', color: '#b71c1c' } }[r.status],
                          }}>{r.status}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: r.status === 'pending' ? '8px' : 0 }}>
                          {[MEDIUM_LABEL[r.medium], CLASS_LABEL[r.cls], SUBJECT_LABEL[r.subject]].filter(Boolean).map((l) => (
                            <span key={l} style={{ fontSize: '10px', backgroundColor: '#f0f0f0', color: '#555', padding: '1px 6px', borderRadius: '6px' }}>{l}</span>
                          ))}
                          <span style={{ fontSize: '10px', color: '#aaa', marginLeft: '2px' }}>× {r.quantity}</span>
                        </div>
                        {r.status === 'approved' && (
                          <div style={{ fontSize: '11px', color: '#888' }}>{r.fulfilled} of {r.quantity} assigned</div>
                        )}
                        {r.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => handleApprove(r.id)} style={S.approveBtn}>Approve</button>
                            <button onClick={() => handleReject(r.id)} style={S.rejectBtn}>Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const S = {
  approveBtn: {
    flex: 1, padding: '4px 0', fontSize: '11px', fontWeight: 600,
    border: '1px solid #a5d6a7', color: '#2e7d32', backgroundColor: '#f1f8f1',
    borderRadius: '4px', cursor: 'pointer',
  },
  rejectBtn: {
    flex: 1, padding: '4px 0', fontSize: '11px', fontWeight: 600,
    border: '1px solid #ffcdd2', color: '#c62828', backgroundColor: '#fff5f5',
    borderRadius: '4px', cursor: 'pointer',
  },
  headerBtn: {
    background: 'none', border: '1px solid #ddd', borderRadius: '6px',
    padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: '#555',
  },
};

function ActionTile({ icon, label, sub, onClick, loading }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
        padding: '28px 20px', backgroundColor: hover ? '#e8f0fe' : '#fff',
        border: `1.5px dashed ${hover ? '#90b4f0' : '#d4d4d4'}`,
        borderRadius: '12px', cursor: loading ? 'default' : 'pointer',
        transition: 'background 0.15s, border-color 0.15s', opacity: loading ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: '32px', lineHeight: 1 }}>{loading ? '…' : icon}</span>
      <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>{label}</span>
      <span style={{ fontSize: '12px', color: '#aaa' }}>{sub}</span>
    </button>
  );
}

function DocCard({ doc, onRefresh, navigate }) {
  const isSingle = (doc.pages || []).length === 1;
  const firstPage = doc.pages?.[0];
  const storedName = isSingle ? (firstPage?.display_name || null) : (doc.display_name || null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(storedName || '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(storedName || ''); }, [storedName]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commitRename() {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === storedName) return;
    try {
      if (isSingle && firstPage) {
        const res = await renamePage(firstPage.display_name, trimmed);
        if (!res.ok && res.conflict) {
          const replace = window.confirm(`${res.message}\n\nReplace the existing page?`);
          if (replace) await renamePage(firstPage.display_name, trimmed, true);
          else return;
        }
      } else {
        await renameDocument(doc.display_name, trimmed);
      }
      onRefresh();
    } catch (e) { console.error(e); }
  }

  async function handleDelete() {
    const name = storedName || 'this document';
    if (!window.confirm(`Delete "${name}" and all its pages? This cannot be undone.`)) return;
    try { await deleteDocument(doc.display_name); onRefresh(); } catch { alert('Delete failed.'); }
  }

  const [hover, setHover] = useState(false);
  const displayTitle = storedName || 'Untitled';
  const isUntitled = !storedName;

  return (
    <div
      style={{
        backgroundColor: '#fff', border: `1px solid ${hover ? '#c5cae9' : '#e8e8e8'}`,
        borderRadius: '10px', padding: '16px 18px',
        boxShadow: hover ? '0 4px 16px rgba(0,0,0,0.08)' : 'none',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        {editing ? (
          <input
            ref={inputRef}
            style={{ flex: 1, fontSize: '14px', fontWeight: 600, border: '1px solid #90caf9', borderRadius: '4px', padding: '3px 7px', outline: 'none', fontFamily: 'inherit' }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="Rename to…"
          />
        ) : (
          <span
            style={{ flex: 1, fontWeight: 600, fontSize: '14px', color: isUntitled ? '#bbb' : '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: isUntitled ? 'italic' : 'normal', cursor: 'text' }}
            title="Double-click to rename"
            onDoubleClick={() => setEditing(true)}
          >
            {displayTitle}
          </span>
        )}
        <button
          title="Rename" onClick={() => setEditing((v) => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: '4px', fontSize: '20px', color: '#777', lineHeight: 1 }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >✏</button>
        <button
          title="Delete" onClick={handleDelete}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: '4px', color: '#e57373', lineHeight: 1, display: 'flex', alignItems: 'center' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fde8e8'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 2h4v1H6zM3 4h10v1H3zm1 2h8l-.8 7H4.8z"/>
          </svg>
        </button>
      </div>

      <div style={{ fontSize: '11px', color: '#bbb', marginBottom: '10px' }}>
        {doc.upload_date ? new Date(doc.upload_date).toLocaleString() : '—'}
        {doc.page_count > 1 && <span style={{ marginLeft: '8px', backgroundColor: '#f0f0f0', color: '#777', padding: '1px 7px', borderRadius: '8px', fontSize: '10px' }}>{doc.page_count} pages</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {(doc.pages || []).map((p) => (
          <PageChip key={p.display_name} page={p} navigate={navigate} />
        ))}
      </div>
    </div>
  );
}

function PageChip({ page, navigate }) {
  const [hover, setHover] = useState(false);
  const name = page.display_name || `p${page.page_number}`;
  return (
    <span
      onClick={() => navigate(`/annotate/${encodeURIComponent(page.display_name)}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={name}
      style={{
        padding: '4px 11px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer',
        color: hover ? '#1a237e' : '#444',
        backgroundColor: hover ? '#e8eaf6' : '#f5f5f5',
        border: `1px solid ${hover ? '#9fa8da' : '#e8e8e8'}`,
        whiteSpace: 'nowrap',
        transition: 'background 0.1s, color 0.1s, border-color 0.1s',
      }}
    >
      Annotate
    </span>
  );
}
