import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocuments, uploadFiles, renameDocument, deleteDocument } from '../api/client.js';

const S = {
  page: { padding: '24px', maxWidth: '960px', margin: '0 auto' },
  header: { marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 'bold', marginBottom: '6px' },
  subtitle: { color: '#666', fontSize: '14px' },
  actions: { display: 'flex', gap: '12px', marginBottom: '32px', flexWrap: 'wrap' },
  btn: { padding: '11px 22px', fontSize: '14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  btnPrimary: { backgroundColor: '#2196F3', color: '#fff' },
  btnSecondary: { backgroundColor: '#fff', color: '#333', border: '1px solid #ccc' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' },
  card: {
    backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px',
    padding: '14px 16px', transition: 'box-shadow 0.15s',
  },
  cardTop: { display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' },
  cardTitle: {
    fontWeight: '600', fontSize: '14px', flex: 1,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  renameInput: {
    flex: 1, fontSize: '14px', fontWeight: '600', border: '1px solid #2196F3',
    borderRadius: '3px', padding: '2px 6px', outline: 'none',
  },
  iconBtn: {
    flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '14px', padding: '2px 4px', borderRadius: '3px', color: '#888',
  },
  cardMeta: { fontSize: '12px', color: '#888', marginBottom: '8px' },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
    fontSize: '11px', backgroundColor: '#e3f2fd', color: '#1565c0', marginBottom: '8px',
  },
  pageLinks: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  pageLink: {
    padding: '3px 10px', backgroundColor: '#f5f5f5', border: '1px solid #ddd',
    borderRadius: '4px', fontSize: '12px', cursor: 'pointer', color: '#333',
  },
  empty: { textAlign: 'center', color: '#aaa', padding: '48px', fontSize: '15px' },
};

function DocumentCard({ doc, onRefresh, navigate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(doc.display_name || doc.original_filename);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commitRename() {
    const trimmed = name.trim();
    if (!trimmed) { setName(doc.display_name || doc.original_filename); setEditing(false); return; }
    try {
      await renameDocument(doc.id, trimmed);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
    setEditing(false);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${name}" and all its pages? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc.id);
      onRefresh();
    } catch (e) {
      console.error(e);
      alert('Delete failed.');
    }
  }

  return (
    <div
      style={S.card}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={S.cardTop}>
        {editing ? (
          <input
            ref={inputRef}
            style={S.renameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(doc.display_name || doc.original_filename); setEditing(false); } }}
          />
        ) : (
          <span style={S.cardTitle} title={name}>{name}</span>
        )}
        <button
          style={{ ...S.iconBtn, color: '#2196F3' }}
          title="Rename"
          onClick={() => setEditing((v) => !v)}
        >
          ✏️
        </button>
        <button
          style={{ ...S.iconBtn, color: '#F44336' }}
          title="Delete document"
          onClick={handleDelete}
        >
          🗑
        </button>
      </div>

      <div style={S.cardMeta}>
        {doc.upload_date ? new Date(doc.upload_date).toLocaleString() : '—'}
      </div>
      <div>
        <span style={S.badge}>{doc.page_count} page{doc.page_count !== 1 ? 's' : ''}</span>
      </div>
      <div style={S.pageLinks}>
        {(doc.pages || []).map((p) => (
          <span
            key={p.id}
            style={S.pageLink}
            onClick={() => navigate(`/annotate/${p.id}`)}
          >
            p{p.page_number}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setDocuments(await getDocuments());
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
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>Answer Script Annotation Platform</h1>
        <p style={S.subtitle}>Scan or upload handwritten exam answer sheets for structured annotation.</p>
      </div>

      <div style={S.actions}>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => navigate('/scan')}>
          📷 Scan Answer Sheet
        </button>
        <button
          style={{ ...S.btn, ...S.btnSecondary }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : '⬆ Upload Image'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {documents.length === 0 ? (
        <div style={S.empty}>No documents yet. Upload or scan an answer sheet to begin.</div>
      ) : (
        <div style={S.grid}>
          {documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onRefresh={load} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}
