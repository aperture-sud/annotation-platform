import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await loginUser(username, password);
      login({ username: data.username, role: data.role }, data.access_token);
      navigate(data.role === 'pictaker' ? '/pictaker' : '/');
    } catch {
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#f5f6f8',
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: '#fff', padding: '36px 32px', borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)', width: '320px',
        }}
      >
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 24px' }}>
          Sign in
        </h1>

        <label style={S.label}>Username</label>
        <input
          style={S.input} type="text" autoFocus required
          value={username} onChange={(e) => setUsername(e.target.value)}
        />

        <label style={{ ...S.label, marginTop: '12px' }}>Password</label>
        <input
          style={S.input} type="password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p style={{ fontSize: '13px', color: '#c62828', margin: '10px 0 0' }}>{error}</p>
        )}

        <button
          type="submit" disabled={loading}
          style={{
            width: '100%', marginTop: '20px', padding: '10px',
            backgroundColor: loading ? '#90caf9' : '#2196F3',
            color: '#fff', border: 'none', borderRadius: '6px',
            fontSize: '14px', fontWeight: 600, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const S = {
  label: { display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: 500 },
  input: {
    width: '100%', padding: '8px 10px', fontSize: '14px',
    border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box', outline: 'none',
  },
};
