import React, { useState } from 'react';
import { Key, User } from 'lucide-react';
import { dbService } from '../lib/supabase';
import logoUrl from '../assets/molbio_logo.png';
import bgUrl from '../assets/dna_bg.png';


interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const profile = await dbService.login(username, password);
      onLoginSuccess(profile);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Invalid username or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      backgroundImage: `url(${bgUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative'
    }}>
      {/* Soft glassmorphism overlay to ensure the login card remains highly readable */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        backdropFilter: 'blur(6px)',
        zIndex: 0
      }}></div>
      
      <div className="glass-card" style={{ 
        width: '100%', 
        maxWidth: '440px', 
        padding: '32px', 
        position: 'relative', 
        zIndex: 1,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255,255,255,0.5)',
        backgroundColor: 'rgba(255, 255, 255, 0.85)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src={logoUrl} alt="Molbio Logo" style={{ height: '60px', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '6px' }}>Cartridge Assembly Operator Tracker</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Sign in to track production floor attendance
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'var(--bg-absent)',
            color: 'var(--color-absent)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            marginBottom: '20px',
            border: '1px solid rgba(244, 63, 94, 0.2)'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-username">Username</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }} />
              <input
                id="login-username"
                type="text"
                className="form-input"
                placeholder="e.g. admin or supervisor name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ paddingLeft: '44px' }}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label" htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <Key size={18} style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }} />
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '44px' }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '12px', fontSize: '0.95rem', height: '46px' }}
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
