import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocuments, uploadFiles, renameDocument, deleteDocument, renamePage } from '../api/client.js';

export default function HomePage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch (e) {
      console.error('Failed to load documents', e);
    }
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>
      <div style={{ padding: '36px 28px', maxWidth: '1040px', margin: '0 auto' }}>

        <div style={{ marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid #e4e4e4' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Answer Script Annotation</h1>
          <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>Open a page to annotate, or add new scripts below.</p>
        </div>

        {/* Upload / Scan actions */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '36px' }}>
          <ActionTile
            icon="📷"
            label="Scan"
            sub="Use camera"
            onClick={() => navigate('/scan')}
          />
          <ActionTile
            icon="↑"
            label="Upload"
            sub="Image or PDF"
            loading={uploading}
            onClick={() => fileInputRef.current?.click()}
          />
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={handleFileChange} />
        </div>

        {documents.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#ccc', padding: '60px 0', fontSize: '15px' }}>No scripts yet.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
            {documents.map((doc) => (
              <DocCard key={doc.id} doc={doc} onRefresh={load} navigate={navigate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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

  // For single-page docs the page display_name is the identity; for multi-page use the doc name.
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
        await renamePage(firstPage.id, trimmed);
      } else {
        await renameDocument(doc.id, trimmed);
      }
      onRefresh();
    } catch (e) { console.error(e); }
  }

  async function handleDelete() {
    const name = storedName || 'this document';
    if (!window.confirm(`Delete "${name}" and all its pages? This cannot be undone.`)) return;
    try { await deleteDocument(doc.id); onRefresh(); } catch { alert('Delete failed.'); }
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
          <PageChip key={p.id} page={p} navigate={navigate} />
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
      onClick={() => navigate(`/annotate/${page.id}`)}
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
