import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyUploads, deletePage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const IMAGE_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000/uploads`;

const SUBJECT_LABELS = {
  english: 'English', kannada: 'Kannada', science: 'Science',
  social_science: 'Social Science', maths: 'Maths',
};
const MEDIUM_LABELS = { english_medium: 'English Medium', kannada_medium: 'Kannada Medium' };
const CLASS_LABELS  = { class_8: 'Class 8', class_9: 'Class 9', class_10: 'Class 10' };

export default function PictakerPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setPages(await getMyUploads());
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(pageName, imagePath) {
    const fname = imagePath.split('/').pop();
    if (!window.confirm(`Delete "${fname}"? This cannot be undone.`)) return;
    try {
      await deletePage(pageName);
      setPages((prev) => prev.filter((p) => p.page_name !== pageName));
    } catch {
      alert('Delete failed.');
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>
      <div style={{ padding: '20px 18px', maxWidth: '600px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e4e4e4' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>My Uploads</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>{user?.username}</div>
          </div>
          <button
            onClick={() => navigate('/scan')}
            style={S.scanBtn}
          >
            + Scan / Upload
          </button>
          <button onClick={() => { logout(); navigate('/login'); }} style={S.outlineBtn}>
            Sign out
          </button>
        </div>

        {/* Upload list */}
        {loading ? (
          <p style={{ color: '#bbb', textAlign: 'center', padding: '40px 0' }}>Loading…</p>
        ) : pages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#ccc' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📷</div>
            <div style={{ fontSize: '15px' }}>No uploads yet.</div>
            <button onClick={() => navigate('/scan')} style={{ ...S.scanBtn, marginTop: '20px' }}>
              Scan your first page
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pages.map((p) => (
              <div key={p.page_name} style={S.card}>
                <img
                  src={`${IMAGE_BASE_URL}/${p.image_path}`}
                  alt={p.page_name}
                  style={S.thumb}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.page_name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
                    {SUBJECT_LABELS[p.subject] || p.subject}
                  </div>
                  <div style={{ fontSize: '12px', color: '#777' }}>
                    {CLASS_LABELS[p.cls] || p.cls} · {MEDIUM_LABELS[p.medium] || p.medium}
                  </div>
                  <div style={{ fontSize: '11px', color: '#bbb', marginTop: '4px' }}>
                    {new Date(p.uploaded_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '11px', padding: '3px 9px', borderRadius: '10px', fontWeight: 600,
                    backgroundColor: p.area === 'final' ? '#e8f5e9' : '#fff8e1',
                    color: p.area === 'final' ? '#2e7d32' : '#e65100',
                    whiteSpace: 'nowrap',
                  }}>
                    {p.area === 'final' ? 'Approved' : 'Pending'}
                  </span>
                  <button
                    onClick={() => handleDelete(p.page_name, p.image_path)}
                    style={{ background: 'none', border: '1px solid #ffcdd2', color: '#e53935', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  scanBtn: {
    backgroundColor: '#2196F3', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '9px 16px', fontSize: '13px',
    fontWeight: 600, cursor: 'pointer', marginRight: '8px',
  },
  outlineBtn: {
    background: 'none', border: '1px solid #ddd', borderRadius: '8px',
    padding: '9px 14px', fontSize: '13px', color: '#555', cursor: 'pointer',
  },
  card: {
    backgroundColor: '#fff', borderRadius: '10px', padding: '12px 14px',
    border: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: '12px',
  },
  thumb: {
    width: '52px', height: '68px', objectFit: 'cover',
    borderRadius: '6px', flexShrink: 0, backgroundColor: '#f0f0f0',
  },
};
