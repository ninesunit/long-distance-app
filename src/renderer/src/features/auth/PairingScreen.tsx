import { useState } from 'react';
import { usePairing } from './usePairing';
import type { Profile } from '../../../../shared/types';

interface Props {
  profile: Profile;
  onPaired: () => void;
}

export default function PairingScreen({ profile, onPaired }: Props) {
  const { pairWithPartner, pairing } = usePairing();
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
      <div className="w-full h-full rounded-3xl overflow-hidden shadow-xl border border-white/50">
        <div className="w-full h-full bg-white/90 backdrop-blur-md flex flex-col items-center justify-center gap-3 px-6 py-6 no-drag">
          <img src="./sprites/pixel_letter.gif" className="w-8 h-8 pixel-art" alt="pair" />
          <p className="font-pixel text-[10px] text-gray-700 text-center">Share this code:</p>
          <p className="text-xl font-pixel tracking-widest text-campfire select-all">{profile.pairing_code}</p>

          <div className="w-full h-px bg-gray-200" />

          <p className="font-pixel text-[10px] text-gray-700 text-center">Or enter theirs:</p>
          <form onSubmit={handlePair} className="w-full flex flex-col gap-2">
            <input
              type="text"
              placeholder="ABC123"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="rounded-xl px-3 py-2 text-xs bg-cozy outline-none text-center tracking-widest font-mono"
            />
            {error && <p className="text-[10px] text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={pairing || code.length < 6}
              className="rounded-xl py-2 text-xs font-pixel bg-campfire text-white disabled:opacity-50"
            >
              {pairing ? 'Pairing...' : 'Pair up'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}