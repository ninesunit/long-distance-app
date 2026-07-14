import { useState } from 'react';
import { usePairing } from './usePairing';
import { useAuth } from './useAuth';
import type { Profile } from '../../../../shared/types';

interface Props {
  profile: Profile;
  onPaired: () => void;
}

export default function PairingScreen({ profile, onPaired }: Props) {
  const { pairWithPartner, pairing } = usePairing();
  const { signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = await pairWithPartner(code);
    if (!result.success) {
      setError(result.error ?? 'Something went wrong');
      return;
    }
    onPaired();
  };

  return (
    <div className="w-full h-full relative p-3 font-sans">
      <div className="drag-region absolute top-0 left-0 w-full h-6" />
      <div className="pixel-window w-full h-full flex flex-col items-center justify-center gap-2.5 px-6 py-6">
        <img src="./sprites/pixel_letter.gif" className="w-8 h-8 pixel-art no-drag" alt="pair" />
        <p className="font-pixel text-[10px] text-ink text-center no-drag">Share this code:</p>
        <p className="text-xl font-pixel tracking-widest text-campfire select-all no-drag">{profile.pairing_code}</p>

        <div className="w-full h-0.5 bg-ink/15 no-drag" />

        <p className="font-pixel text-[10px] text-ink text-center no-drag">Or enter theirs:</p>
        <form onSubmit={handlePair} className="w-full flex flex-col gap-2 no-drag">
          <input
            type="text"
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="pixel-input px-3 py-2 text-xs text-center tracking-widest font-pixel"
          />
          {error && <p className="text-[10px] text-red-600">{error}</p>}
          <button type="submit" disabled={pairing || code.length < 6} className="pixel-btn pixel-btn--primary py-2 text-[11px]">
            {pairing ? 'Pairing...' : 'Pair up'}
          </button>
        </form>

        <button onClick={signOut} className="text-[10px] font-pixel text-ink-soft underline no-drag">
          Sign out
        </button>
      </div>
    </div>
  );
}