import { useState, FormEvent } from 'react';
import { apiFetch, setToken } from '../lib/api';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      if (data.requires_totp) {
        setChallengeToken(data.challenge_token);
        setStep('totp');
      } else {
        setToken(data.token);
        onLogin();
      }
    } catch (err: any) {
      if (err.status === 429) {
        setError('Too many login attempts. Please wait a few minutes and try again.');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiFetch('/auth/totp/verify', {
        method: 'POST',
        body: JSON.stringify({ challenge_token: challengeToken, code: totpCode }),
      });
      setToken(data.token);
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Srijan</h1>
          <p className="text-muted-foreground text-base">Cloud AI Development Environment</p>
        </div>

        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoComplete="username"
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoComplete="current-password"
            />

            {error && <p className="text-base text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter the 6-digit code from your authenticator app
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData('text').trim().replace(/\D/g, '').slice(0, 6);
                setTotpCode(pasted);
              }}
              className="w-full rounded-xl border border-border bg-muted px-4 py-3.5 text-base text-center font-mono tracking-[0.5em] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />

            {error && <p className="text-base text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('password'); setError(''); setTotpCode(''); }}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
