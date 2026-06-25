import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyUploads, deletePage, IMAGE_BASE_URL, RAW_BASE_URL } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const SUBJECT_LABELS = {
  english: 'English', kannada: 'Kannada', science: 'Science',
  social_science: 'Social Science', maths: 'Maths',
};
const MEDIUM_LABELS = { english_medium: 'English Medium', kannada_medium: 'Kannada Medium' };
const CLASS_LABELS  = { class_8: 'Class 8', class_9: 'Class 9', class_10: 'Class 10' };

const APPROVAL_STYLE = {
  pending:  { backgroundColor: '#fff8e1', color: '#e65100' },
  redo:     { backgroundColor: '#fff8e1', color: '#e65100' },
  approved: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
  flagged:  { backgroundColor: '#fce4ec', color: '#b71c1c' },
};
const APPROVAL_LABEL = {
  pending:  'Pending approval',
  redo:     'Pending approval',
  approved: 'Approved',
  flagged:  'Flagged — redo',
};

export default function PictakerPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modifyTarget, setModifyTarget] = useState(null);
  const [mountTs] = useState(() => Date.now());

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

  function handleImageClick(p) {
    setModifyTarget(p);
  }

  function handleRetake(p) {
    setModifyTarget(null);
    navigate('/scan', {
      state: {
        recropPageName: p.page_name,
        recropMedium:   p.medium,
        recropCls:      p.cls,
        recropSubject:  p.subject,
        // no recropUrl → fresh capture flow that replaces the page on Done
      },
    });
  }

  function handleRecrop(p) {
    const recropUrl = p.raw_image_path
      ? `${RAW_BASE_URL}/${p.raw_image_path}`
      : `${IMAGE_BASE_URL}/${p.image_path}`;
    let recropCorners = null;
    if (p.crop_corners) {
      try { recropCorners = JSON.parse(p.crop_corners); } catch {}
    }
    navigate('/scan', {
      state: {
        recropUrl,
        recropPageName: p.page_name,
        recropMedium: p.medium,
        recropCls: p.cls,
        recropSubject: p.subject,
        recropCorners,
      },
    });
  }

  const flagged  = pages.filter((p) => p.upload_approval_status === 'flagged');
  const others   = pages.filter((p) => p.upload_approval_status !== 'flagged');
  const approved = pages.filter((p) => p.upload_approval_status === 'approved').length;
  const pending  = pages.filter((p) => p.upload_approval_status === 'pending' || p.upload_approval_status === 'redo').length;

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#f5f6f8' }}>

      {/* Image viewer overlay */}
      {modifyTarget && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '12px' }}
          onClick={() => setModifyTarget(null)}
        >
          <div
            style={{ backgroundColor: '#fff', borderRadius: '18px', overflow: 'hidden', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', maxHeight: '92dvh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div style={{ flex: 1, minHeight: 0, backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img
                src={`${IMAGE_BASE_URL}/${modifyTarget.image_path}?v=${mountTs}`}
                alt={modifyTarget.page_name}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            </div>
            {/* Footer */}
            <div style={{ padding: '14px 16px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))', borderTop: '1px solid #eee', flexShrink: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {modifyTarget.page_name}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button style={{ ...S.optionBtn, flex: 1, backgroundColor: '#1565C0', padding: '14px' }} onClick={() => handleRecrop(modifyTarget)}>Recrop</button>
                <button style={{ ...S.optionBtn, flex: 1, backgroundColor: '#2e7d32', padding: '14px' }} onClick={() => handleRetake(modifyTarget)}>Retake</button>
                <button style={{ ...S.optionBtn, flex: 1, backgroundColor: '#fff', color: '#555', border: '1px solid #ddd', padding: '14px' }} onClick={() => setModifyTarget(null)}>Back</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '20px 18px', maxWidth: '600px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e4e4e4' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>My Uploads</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>{user?.username}</div>
          </div>
          <button onClick={() => navigate('/scan')} style={S.scanBtn}>
            + Scan / Upload
          </button>
          <button onClick={() => { logout(); navigate('/login'); }} style={S.outlineBtn}>
            Sign out
          </button>
        </div>

        {/* Stats row */}
        {!loading && pages.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: 'Total',    value: pages.length, bg: '#f5f6f8',  color: '#555' },
              { label: 'Pending',  value: pending,      bg: '#fff8e1',  color: '#e65100' },
              { label: 'Approved', value: approved,     bg: '#e8f5e9',  color: '#2e7d32' },
              { label: 'Flagged',  value: flagged.length, bg: '#fce4ec', color: '#b71c1c' },
            ].map(({ label, value, bg, color }) => (
              <div key={label} style={{ flex: 1, backgroundColor: bg, borderRadius: '8px', padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#bbb', textAlign: 'center', padding: '40px 0' }}>Loading…</p>
        ) : pages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#ccc' }}>
            <div style={{ fontSize: '15px' }}>No uploads yet.</div>
            <button onClick={() => navigate('/scan')} style={{ ...S.scanBtn, marginTop: '20px' }}>
              Scan your first page
            </button>
          </div>
        ) : (
          <>
            {/* Flagged section */}
            {flagged.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#b71c1c', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Needs attention
                  <span style={{ fontSize: '11px', backgroundColor: '#fce4ec', color: '#b71c1c', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                    {flagged.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {flagged.map((p) => <UploadCard key={p.page_name} p={p} onModify={handleImageClick} onDelete={handleDelete} onRedo={handleRecrop} />)}
                </div>
              </div>
            )}

            {/* All other uploads */}
            {others.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {others.map((p) => <UploadCard key={p.page_name} p={p} onModify={handleImageClick} onDelete={handleDelete} onRedo={handleRecrop} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function UploadCard({ p, onModify, onDelete, onRedo }) {
  const status = p.upload_approval_status || 'pending';
  const isFlagged = status === 'flagged';

  return (
    <div style={{ ...S.card, borderColor: isFlagged ? '#f48fb1' : '#e8e8e8', backgroundColor: isFlagged ? '#fff9fb' : '#fff' }}>
      <img
        src={`${IMAGE_BASE_URL}/${p.image_path}`}
        alt={p.page_name}
        style={{ ...S.thumb, cursor: 'pointer' }}
        onClick={() => onModify(p)}
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
        {isFlagged && p.upload_approval_note && (
          <div style={{ fontSize: '12px', color: '#b71c1c', marginTop: '6px', fontStyle: 'italic' }}>
            "{p.upload_approval_note}"
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '10px', fontWeight: 600, ...APPROVAL_STYLE[status], whiteSpace: 'nowrap' }}>
          {APPROVAL_LABEL[status] || status}
        </span>
        {isFlagged ? (
          <button
            onClick={() => onRedo(p)}
            style={{ background: 'none', border: '1px solid #f48fb1', color: '#b71c1c', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
          >
            Redo
          </button>
        ) : (
          <button
            onClick={() => onDelete(p.page_name, p.image_path)}
            style={{ background: 'none', border: '1px solid #ffcdd2', color: '#e53935', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px' }}
          >
            Delete
          </button>
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
    borderRadius: '10px', padding: '12px 14px',
    border: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: '12px',
  },
  thumb: {
    width: '52px', height: '68px', objectFit: 'cover',
    borderRadius: '6px', flexShrink: 0, backgroundColor: '#f0f0f0',
  },
  optionBtn: {
    color: '#fff', border: 'none', borderRadius: '8px', padding: '12px',
    fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%',
  },
};
