import { useState } from 'react';
import { useAuth } from './useAuth';

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (mode === 'forgot') {
      const result = await resetPassword(email);
      setLoading(false);
      if (result.error) setError(result.error);
      else setMessage('Check your email for a reset link.');
      return;
    }

    const result = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, displayName);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <div className="w-full h-full relative p-3 font-sans">
      <div className="drag-region absolute top-0 left-0 w-full h-6" />
      <div className="pixel-window w-full h-full flex flex-col items-center justify-center gap-3 px-6 py-6">
        <img src="./sprites/pixel_letter.gif" className="w-10 h-10 pixel-art no-drag" alt="app icon" />
        <p className="font-pixel text-[11px] text-ink text-center no-drag">
          {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Say hello' : 'Reset password'}
        </p>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2 no-drag">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="pixel-input px-3 py-2 text-xs"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="pixel-input px-3 py-2 text-xs"
          />
          {mode !== 'forgot' && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="pixel-input px-3 py-2 text-xs"
            />
          )}

          {error && <p className="text-[10px] text-red-600">{error}</p>}
          {message && <p className="text-[10px] text-green-700">{message}</p>}

          <button type="submit" disabled={loading} className="pixel-btn pixel-btn--primary py-2 text-[11px] mt-1">
            {loading ? '...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send link'}
          </button>
        </form>

        <div className="flex flex-col items-center gap-1 no-drag">
          {mode === 'signin' && (
            <>
              <button onClick={() => setMode('signup')} className="text-[10px] text-ink-soft underline">
                Don't have an account? Sign up
              </button>
              <button onClick={() => setMode('forgot')} className="text-[10px] text-ink-soft underline">
                Forgot password?
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button onClick={() => setMode('signin')} className="text-[10px] text-ink-soft underline">
              Already have an account? Sign in
            </button>
          )}
          {mode === 'forgot' && (
            <button onClick={() => setMode('signin')} className="text-[10px] text-ink-soft underline">
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}