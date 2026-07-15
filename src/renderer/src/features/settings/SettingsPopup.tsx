import { useAuth } from '../auth/useAuth';
import { usePairing } from '../auth/usePairing';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { useStatusSync } from '../status/useStatusSync';
import { useState, useEffect, useRef } from 'react';
import type { StatusBroadcastPayload } from '../../../../shared/types';
import StatusToggle from '../status/StatusToggle';
import { supabase } from '../../lib/supabaseClient';
import { LampGlowLayer } from '../../components/LampGlow';

export default function SettingsPopup() {
  const { profile, loading, signOut, refreshProfile } = useAuth();
  const { unpair } = usePairing();
  const [incomingStatus, setIncomingStatus] = useState<StatusBroadcastPayload | null>(null);
  const [catSize, setCatSize] = useState(64);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [overlayMode, setOverlayModeState] = useState<'full' | 'semi' | 'none'>('semi');
  const [reconnecting, setReconnecting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [lampGlow, setLampGlow] = useState(0);
  const lampIntensitiesRef = useRef<Record<string, number>>({});
  const [update, setUpdate] = useState<{
    state: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
    version?: string;
    percent?: number;
    message?: string;
  }>({ state: 'idle' });

  const { connected, sendStatusChanged } = useCoupleChannel(profile?.id, profile?.partner_id ?? undefined, {
    onStatusChanged: (payload) => setIncomingStatus({ ...payload }),
    onLampUpdate: (p) => {
      lampIntensitiesRef.current[p.holderId] = p.intensity;
      setLampGlow(Math.max(0, ...Object.values(lampIntensitiesRef.current)));
    },
  });

  const { myStatus, partnerStatus, updateMyStatus } = useStatusSync(
    profile?.id ?? '',
    profile?.partner_id ?? '',
    sendStatusChanged,
    incomingStatus
  );

  useEffect(() => {
    window.api.getPetSettings().then((s: any) => {
      setCatSize(s.catSize);
      setBottomOffset(s.bottomOffset ?? 0);
      setOverlayModeState(s.overlayMode ?? 'semi');
    });
  }, []);

  // Listen for update status + kick off a check whenever Settings is shown.
  useEffect(() => {
    const unsub = window.api.onUpdateStatus((s) => {
      if (s.state === 'none') {
        setUpdate((u) => (u.state === 'downloaded' ? u : { state: 'idle' }));
      } else if (s.state === 'available') {
        setUpdate({ state: 'available', version: s.version });
      } else if (s.state === 'downloading') {
        setUpdate({ state: 'downloading', percent: s.percent });
      } else if (s.state === 'downloaded') {
        setUpdate({ state: 'downloaded', version: s.version });
      } else if (s.state === 'error') {
        setUpdate({ state: 'error', message: s.message });
      }
    });
    window.api.checkForUpdate();
    const reCheck = window.api.onPopupShown(() => window.api.checkForUpdate());
    return () => {
      unsub();
      reCheck();
    };
  }, []);

  useEffect(() => {
    if (!profile?.partner_id) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', profile.partner_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPartnerName(data.display_name);
      });
  }, [profile]);

  if (loading || !profile) return <div className="w-full h-full" />;

  const handleUnpair = async () => {
    const result = await unpair();
    if (result.success) refreshProfile();
  };

  const handleSizeChange = (value: number) => {
    setCatSize(value);
    window.api.setPetSettings({ catSize: value, overlayMode, bottomOffset });
  };

  const handleBottomOffsetChange = (value: number) => {
    setBottomOffset(value);
    window.api.setPetSettings({ catSize, overlayMode, bottomOffset: value });
  };

  const handleOverlayModeChange = (mode: 'full' | 'semi' | 'none') => {
    setOverlayModeState(mode);
    window.api.setPetSettings({ catSize, overlayMode: mode, bottomOffset });
  };

  const handleReconnect = () => {
    setReconnecting(true);
    window.api.notifyAuthChanged();
    setTimeout(() => setReconnecting(false), 1500);
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !profile) return;
    await supabase.from('profiles').update({ display_name: trimmed }).eq('id', profile.id);
    await refreshProfile();
    setEditingName(false);
  };

  return (
    <div className="w-full h-full relative p-3 font-sans">
      <div className="drag-region absolute top-0 left-0 w-full h-5" />
      <div className="pixel-window relative w-full h-full flex flex-col gap-3 p-4 overflow-y-auto no-drag">
          <LampGlowLayer intensity={lampGlow} />
          <p className="font-pixel text-[10px] text-ink">⚙️ Settings</p>

          <div className="flex items-center gap-2">
            <p className="text-xs text-ink-soft">{connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
            <button onClick={handleReconnect} className="pixel-btn pixel-btn--accent text-[9px] px-2 py-1">
              {reconnecting ? 'Reconnecting...' : '🔄 Reconnect'}
            </button>
          </div>

          {partnerName && (
            <p className="text-xs text-ink-soft">
              Connected to <span className="font-pixel text-[9px] text-campfire-dark">{partnerName}</span>
            </p>
          )}

          {/* Update — only visible when there's actually a newer version on GitHub. */}
          {(update.state === 'available' || update.state === 'downloading' || update.state === 'downloaded') && (
            <div className="pixel-panel flex flex-col gap-1.5 p-2 border-campfire">
              {update.state === 'available' && (
                <>
                  <p className="font-pixel text-[9px] text-campfire-dark">⬆️ Update available{update.version ? ` (v${update.version})` : ''}</p>
                  <button
                    onClick={() => {
                      window.api.downloadUpdate();
                      setUpdate({ state: 'downloading', percent: 0 });
                    }}
                    className="pixel-btn pixel-btn--primary text-[10px] py-1.5"
                  >
                    ⬇️ Download update
                  </button>
                </>
              )}
              {update.state === 'downloading' && (
                <>
                  <p className="font-pixel text-[8px] text-ink-soft">Downloading… {update.percent ?? 0}%</p>
                  <div className="h-2 border-2 border-ink bg-cozy overflow-hidden">
                    <div className="h-full bg-campfire transition-all" style={{ width: `${update.percent ?? 0}%` }} />
                  </div>
                </>
              )}
              {update.state === 'downloaded' && (
                <>
                  <p className="font-pixel text-[9px] text-campfire-dark">✅ Update ready{update.version ? ` (v${update.version})` : ''}</p>
                  <button
                    onClick={() => window.api.installUpdate()}
                    className="pixel-btn pixel-btn--primary text-[10px] py-1.5"
                  >
                    🔄 Restart &amp; install
                  </button>
                </>
              )}
            </div>
          )}
          {update.state === 'error' && (
            <p className="text-[10px] text-red-600">Update check failed. Try again later.</p>
          )}

          {profile.partner_id && (
            <StatusToggle myStatus={myStatus} partnerStatus={partnerStatus} onChange={updateMyStatus} />
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-soft">Your name</label>
            {editingName ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  maxLength={30}
                  className="pixel-input flex-1 text-xs px-2 py-1"
                />
                <button onClick={handleSaveName} className="pixel-btn pixel-btn--primary text-[10px] px-2 py-1">
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setNameInput(profile.display_name);
                  setEditingName(true);
                }}
                className="pixel-panel text-xs text-left px-2 py-1.5 text-ink"
              >
                {profile.display_name} ✏️
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1">
  <label className="text-xs text-ink-soft">Bottom offset: {bottomOffset}px</label>
  <input
    type="range"
    min={-100}
    max={60}
    value={bottomOffset}
    onChange={(e) => handleBottomOffsetChange(Number(e.target.value))}
  />
</div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-soft">Cat size: {catSize}px</label>
            <input
              type="range"
              min={32}
              max={128}
              value={catSize}
              onChange={(e) => handleSizeChange(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-soft">Pet overlay priority</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleOverlayModeChange('full')}
                className={`pixel-btn flex-1 text-[9px] py-1.5 ${overlayMode === 'full' ? 'pixel-btn--primary' : ''}`}
              >
                All apps
              </button>
              <button
                type="button"
                onClick={() => handleOverlayModeChange('semi')}
                className={`pixel-btn flex-1 text-[9px] py-1.5 ${overlayMode === 'semi' ? 'pixel-btn--primary' : ''}`}
              >
                Windowed
              </button>
              <button
                type="button"
                onClick={() => handleOverlayModeChange('none')}
                className={`pixel-btn flex-1 text-[9px] py-1.5 ${overlayMode === 'none' ? 'pixel-btn--primary' : ''}`}
              >
                None
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-auto pt-1">
            <button onClick={handleUnpair} className="pixel-btn text-[10px] py-1.5">
              Unpair
            </button>
            <button onClick={signOut} className="pixel-btn text-[10px] py-1.5">
              Sign out
            </button>
          </div>
      </div>
    </div>
  );
}