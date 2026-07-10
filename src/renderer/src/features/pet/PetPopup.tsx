import { useState, useEffect } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { fetchPetData, setPetName, setPetGender, type PetGender } from '../../lib/petStore';
import { playSound, SOUNDS } from '../../lib/sounds';
import type { PetBroadcastPayload } from '../../../../shared/types';

export default function PetPopup() {
  const { profile, loading } = useAuth();
  const [petName, setPetNameState] = useState('Kitty');
  const [petGender, setPetGenderState] = useState<PetGender>('male');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  const { sendPetInteraction } = useCoupleChannel(profile?.id, profile?.partner_id ?? undefined, {
    onPetInteraction: (payload: PetBroadcastPayload) => {
      const verb = payload.interactionType === 'feed' ? 'fed' : 'petted';
      setLastEvent(`${payload.actorName} ${verb} ${petName}`);
      playSound(SOUNDS.MEOW);
    },
  });

  useEffect(() => {
    if (!profile?.partner_id) return;
    fetchPetData(profile.id, profile.partner_id).then((data) => {
      setPetNameState(data.pet_name);
      setPetGenderState(data.pet_gender);
    });
  }, [profile]);

  if (loading || !profile || !profile.partner_id) return <div className="w-full h-full" />;

  const handleInteract = (type: 'feed' | 'pet') => {
    const verb = type === 'feed' ? 'fed' : 'petted';
    setLastEvent(`${profile.display_name} ${verb} ${petName}`);
    playSound(SOUNDS.MEOW);
    sendPetInteraction({ interactionType: type, actorId: profile.id, actorName: profile.display_name });
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !profile.partner_id) return;
    await setPetName(profile.id, profile.partner_id, trimmed);
    setPetNameState(trimmed);
    setEditingName(false);
  };

  const handleGenderChange = async (gender: PetGender) => {
    if (!profile.partner_id) return;
    setPetGenderState(gender);
    await setPetGender(profile.id, profile.partner_id, gender);
  };

  return (
    <div className="w-full h-full relative p-3 font-sans">
      <div className="drag-region absolute top-0 left-0 w-full h-5" />
      <div className="w-full h-full rounded-3xl overflow-hidden shadow-xl border border-white/50">
        <div className="w-full h-full bg-white/90 backdrop-blur-md flex flex-col items-center justify-center gap-2 p-4 no-drag">
          <img src="./sprites/pixel_cat.gif" className="w-16 h-16 pixel-art" alt="cat" />

          {editingName ? (
            <div className="flex gap-1">
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                maxLength={20}
                className="text-xs px-2 py-1 rounded-lg bg-cozy outline-none w-24"
                placeholder="Pet name"
              />
              <button onClick={handleSaveName} className="text-xs px-2 py-1 rounded-lg bg-campfire text-white">
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setNameInput(petName);
                setEditingName(true);
              }}
              className="text-sm font-semibold text-gray-700"
              title="Click to rename"
            >
              {petName} ✏️
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGenderChange('male')}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                petGender === 'male' ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-white/50'
              }`}
              title="Male"
            >
              <img src="./sprites/pixel_male.png" className="w-5 h-5 pixel-art" alt="male" />
            </button>
            <button
              onClick={() => handleGenderChange('female')}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                petGender === 'female' ? 'bg-pink-100 ring-2 ring-pink-400' : 'bg-white/50'
              }`}
              title="Female"
            >
              <img src="./sprites/pixel_female.png" className="w-5 h-5 pixel-art" alt="female" />
            </button>
          </div>

          <p className="text-xs text-gray-500 h-8 text-center px-2">
            {lastEvent ?? `${petName} is roaming your desktop!`}
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => handleInteract('feed')}
              className="text-xs px-3 py-1.5 rounded-full bg-blush/70 hover:bg-blush transition font-medium text-gray-700"
            >
              🍎 Feed
            </button>
            <button
              onClick={() => handleInteract('pet')}
              className="text-xs px-3 py-1.5 rounded-full bg-lavender/70 hover:bg-lavender transition font-medium text-gray-700"
            >
              ✋ Pet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}