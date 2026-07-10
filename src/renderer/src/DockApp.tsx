import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './features/auth/useAuth';
import { useCoupleChannel } from './features/realtime/useCoupleChannel';
import { getUnreadNoteCount } from './lib/noteStore';
import AuthScreen from './features/auth/AuthScreen';
import PairingScreen from './features/auth/PairingScreen';
import { playSound, SOUNDS } from './lib/sounds';


const SIZES = {
  auth: { width: 260, height: 320 },
  pairing: { width: 260, height: 260 },
  dock: { width: 280, height: 72 },
};

export default function DockApp() {
  const { session, profile, loading, refreshProfile } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!session || !profile) {
      window.api.resizeDock(SIZES.auth.width, SIZES.auth.height);
    } else if (!profile.partner_id) {
      window.api.resizeDock(SIZES.pairing.width, SIZES.pairing.height);
    } else {
      window.api.resizeDock(SIZES.dock.width, SIZES.dock.height);
    }
  }, [loading, session, profile]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center font-sans">
        <p className="text-xs text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!session || !profile) {
    return <AuthScreen />;
  }

  if (!profile.partner_id) {
    return <PairingScreen profile={profile} onPaired={refreshProfile} />;
  }

  return <DockBar profileId={profile.id} partnerId={profile.partner_id} />;
}

function DockBar({ profileId, partnerId }: { profileId: string; partnerId: string }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(() => {
    getUnreadNoteCount(profileId).then(setUnreadCount);
  }, [profileId]);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  // Refresh badge whenever ANY popup is shown (covers the case where the
  // user opens Notes directly and marks messages seen there)
  useEffect(() => {
    const unsubscribe = window.api.onPopupShown(() => {
      refreshUnread();
    });
    return unsubscribe;
  }, [refreshUnread]);

  useCoupleChannel(profileId, partnerId, {
  onNoteSent: () => {
    playSound(SOUNDS.NOTIFICATION);
    refreshUnread();
  },
  });

  const handleNotesClick = () => {
    window.api.toggleWindow('note');
    setTimeout(refreshUnread, 500);
  };

  const icons: { key: 'pet' | 'note' | 'lamp' | 'settings'; icon: string; label: string }[] = [
    { key: 'pet', icon: './sprites/pixel_cat.gif', label: 'Pet' },
    { key: 'note', icon: './sprites/pixel_letter.gif', label: 'Notes' },
    { key: 'lamp', icon: './sprites/pixel_flame.gif', label: 'Lamp' },
    { key: 'settings', icon: './sprites/pixel_settings.jpg', label: 'Settings' },
  ];

  return (
    <div className="w-full h-full flex items-center justify-center relative">
      <div className="drag-region flex items-center gap-3 bg-white/70 backdrop-blur-md rounded-full px-4 py-3 shadow-xl border border-white/50">
        {icons.map((icon) => (
  <button
    key={icon.key}
    onClick={() => (icon.key === 'note' ? handleNotesClick() : window.api.toggleWindow(icon.key))}
    title={icon.label}
    className="no-drag w-12 h-12 rounded-full bg-gradient-to-br from-blush to-campfire/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-md relative"
  >
    <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
      <img src={icon.icon} className="w-7 h-7 pixel-art" alt={icon.label} />
    </div>
    {icon.key === 'note' && unreadCount > 0 && (
      <span className="absolute -top-2 -right-2 min-w-[20px] h-[20px] px-1 flex items-center justify-center bg-campfire text-white text-[10px] font-pixel rounded-none border-2 border-white shadow-sm z-10">
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    )}
  </button>
))}
      </div>
    </div>
  );
}
