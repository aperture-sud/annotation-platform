import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listUsers, createUser, deleteUser, getAnnotationRequests, approveAnnotationRequest, rejectAnnotationRequest, getManagerPages } from '../api/client.js';
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

const ROLE_COLOURS = {
  admin:     { bg: '#fce4ec', color: '#b71c1c' },
  manager:   { bg: '#e8f5e9', color: '#1b5e20' },
  annotator: { bg: '#e3f2fd', color: '#0d47a1' },
  pictaker:  { bg: '#fff8e1', color: '#e65100' },
};

export default function AdminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers]       = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState('annotator');
  const [error, setError]       = useState('');
  const [creating, setCreating] = useState(false);

  const [requests, setRequests] = useState([]);
  const [flagged,  setFlagged]  = useState([]);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [u, r, mp] = await Promise.all([listUsers(), getAnnotationRequests(), getManagerPages()]);
      setUsers(u);
      setRequests(r);
      setFlagged(mp.filter(p => p.area === 'flagged_admin'));
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6f8' }}>
      <div style={{ padding: '28px', maxWidth: '760px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e4e4e4' }}>
          <button onClick={() => navigate('/')} style={S.back}>← Back</button>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 0 14px', flex: 1 }}>
            Admin
          </h1>
          <span style={{ fontSize: '12px', color: '#aaa', marginRight: '14px' }}>
            {user?.username}
          </span>
          <button onClick={() => { logout(); navigate('/login'); }} style={S.logout}>Sign out</button>
        </div>

        {/* Annotation requests */}
        <div style={{ ...S.card, borderColor: requests.some(r => r.status === 'pending') ? '#c5cae9' : '#e8e8e8' }}>
          <h2 style={S.cardTitle}>
            Annotation requests
            {requests.filter(r => r.status === 'pending').length > 0 && (
              <span style={{ fontSize: '12px', fontWeight: 600, backgroundColor: '#e8eaf6', color: '#3949ab', padding: '1px 8px', borderRadius: '10px' }}>
                {requests.filter(r => r.status === 'pending').length} pending
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

        {/* Flagged pages */}
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

        {/* Create user form */}
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

        {/* Users table */}
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
  cardTitle: { fontSize: '14px', fontWeight: 600, color: '#333', margin: '0 0 14px' },
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
