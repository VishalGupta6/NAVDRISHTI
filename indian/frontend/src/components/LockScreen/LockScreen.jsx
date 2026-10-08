import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Shield, Anchor, KeyRound, ChevronRight, Terminal, Cpu } from 'lucide-react';
import './LockScreen.css';

const VALID_PASSWORDS = ['0210', 'NAVY2026', 'NAVY', '1234', 'ADMIN'];

function LockScreen({ onUnlock, onOpenShipPortal }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter password');
      return;
    }

    setIsLoading(true);
    setError('');

    setTimeout(() => {
      if (VALID_PASSWORDS.includes(password.trim().toUpperCase())) {
        sessionStorage.setItem('mda_authenticated', 'true');
        sessionStorage.setItem('mda_clearance', password.trim().toUpperCase());
        setIsLoading(false);
        onUnlock();
      } else {
        setIsLoading(false);
        setError('Incorrect password');
        setPassword('');
      }
    }, 350);
  };

  return (
    <div className="clean-lock-container">
      <div className="clean-lock-card">
        {/* Portal Switcher Tabs */}
        {onOpenShipPortal && (
          <div className="clean-portal-tabs">
            <button className="tab-btn active" title="Main Command Portal">
              <Shield size={14} />
              <span>Strategic Command</span>
            </button>
            <button className="tab-btn" onClick={onOpenShipPortal} title="Ship Board Terminal">
              <Anchor size={14} />
              <span>Ship Terminal</span>
            </button>
          </div>
        )}

        {/* Lock Header */}
        <div className="lock-header">
          <div className="lock-badge">
            <Lock size={22} color="#38bdf8" />
          </div>
          <h2>Indian Navy - NMDA</h2>
          <p>National Maritime Domain Awareness Network</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="clean-form">
          <div className="form-field">
            <label className="field-label">
              SECURITY ACCESS PASSWORD <span className="password-hint">(0210)</span>
            </label>
            <div className="clean-input-box">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter Security Access Password (0210)..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                autoFocus
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <div className="clean-error">{error}</div>}

          <button type="submit" className="clean-submit-btn" disabled={isLoading}>
            {isLoading ? 'AUTHENTICATING...' : 'LOGIN TO COMMAND CENTER'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LockScreen;

