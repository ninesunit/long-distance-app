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
      <div className="w-full h-full rounded-3xl overflow-hidden shadow-xl border border-white/50">
        <div className="w-full h-full bg-white/90 backdrop-blur-md flex flex-col items-center justify-center gap-3 px-6 py-6 no-drag">
          <img src="./sprites/pixel_letter.gif" className="w-10 h-10 pixel-art" alt="app icon" />
          <p className="font-pixel text-xs text-gray-700 text-center">
            {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Say hello' : 'Reset password'}
          </p>

          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2">
            {mode === 'signup' && (
              <input
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="rounded-xl px-3 py-2 text-xs bg-cozy outline-none"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-xl px-3 py-2 text-xs bg-cozy outline-none"
            />
            {mode !== 'forgot' && (
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="rounded-xl px-3 py-2 text-xs bg-cozy outline-none"
              />
            )}

            {error && <p className="text-[10px] text-red-600">{error}</p>}
            {message && <p className="text-[10px] text-green-600">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl py-2 text-xs font-pixel bg-campfire text-white disabled:opacity-50"
            >
              {loading ? '...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send link'}
            </button>
          </form>

          <div className="flex flex-col items-center gap-1">
            {mode === 'signin' && (
              <>
                <button onClick={() => setMode('signup')} className="text-[10px] text-gray-600 underline">
                  Don't have an account? Sign up
                </button>
                <button onClick={() => setMode('forgot')} className="text-[10px] text-gray-500 underline">
                  Forgot password?
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button onClick={() => setMode('signin')} className="text-[10px] text-gray-600 underline">
                Already have an account? Sign in
              </button>
            )}
            {mode === 'forgot' && (
              <button onClick={() => setMode('signin')} className="text-[10px] text-gray-600 underline">
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}