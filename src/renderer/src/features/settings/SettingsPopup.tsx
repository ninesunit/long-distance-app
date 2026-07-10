import { useAuth } from '../auth/useAuth';
import { usePairing } from '../auth/usePairing';
import { useCoupleChannel } from '../realtime/useCoupleChannel';
import { useStatusSync } from '../status/useStatusSync';
import { useState, useEffect } from 'react';
import type { StatusBroadcastPayload } from '../../../../shared/types';
import StatusToggle from '../status/StatusToggle';
import { supabase } from '../../lib/supabaseClient';

export default function SettingsPopup() {
  const { profile, loading, signOut, refreshProfile } = useAuth();
  const { unpair } = usePairing();
  const [incomingStatus, setIncomingStatus] = useState<StatusBroadcastPayload | null>(null);
  const [taskbarOffset, setTaskbarOffset] = useState(-10);
  const [catSize, setCatSize] = useState(64);
  const [overlayMode, setOverlayModeState] = useState<'full' | 'semi' | 'none'>('semi');
  const [reconnecting, setReconnecting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [partnerName, setPartnerName] = useState('');

  const { connected, sendStatusChanged } = useCoupleChannel(profile?.id, profile?.partner_id ?? undefined, {
    onStatusChanged: (payload) => setIncomingStatus({ ...payload }),
  });

  const { myStatus, partnerStatus, updateMyStatus } = useStatusSync(
    profile?.id ?? '',
    profile?.partner_id ?? '',
    sendStatusChanged,
    incomingStatus
  );

  useEffect(() => {
    window.api.getPetSettings().then((s: any) => {
      setTaskbarOffset(s.taskbarOffset);
      setCatSize(s.catSize);
      setOverlayModeState(s.overlayMode ?? 'semi');
    });
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

  const handleOffsetChange = (value: number) => {
    setTaskbarOffset(value);
    window.api.setPetSettings({ taskbarOffset: value, catSize, overlayMode });
  };

  const handleSizeChange = (value: number) => {
    setCatSize(value);
    window.api.setPetSettings({ taskbarOffset, catSize: value, overlayMode });
  };

  const handleOverlayModeChange = (mode: 'full' | 'semi' | 'none') => {
    setOverlayModeState(mode);
    window.api.setPetSettings({ taskbarOffset, catSize, overlayMode: mode });
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
      <div className="w-full h-full rounded-3xl overflow-hidden shadow-xl border border-white/50">
        <div className="w-full h-full bg-white/90 backdrop-blur-md flex flex-col gap-3 p-4 overflow-y-auto no-drag">
          <p className="text-xs font-semibold text-gray-600">⚙️ Settings</p>

          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500">{connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
            <button
              onClick={handleReconnect}
              className="text-xs px-2 py-0.5 rounded-full bg-lavender/70 hover:bg-lavender transition"
            >
              {reconnecting ? 'Reconnecting...' : '🔄 Reconnect'}
            </button>
          </div>

          {partnerName && (
            <p className="text-xs text-gray-500">
              Connected to <span className="font-semibold">{partnerName}</span>
            </p>
          )}

          {profile.partner_id && (
            <StatusToggle myStatus={myStatus} partnerStatus={partnerStatus} onChange={updateMyStatus} />
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Your name</label>
            {editingName ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  maxLength={30}
                  className="flex-1 text-xs px-2 py-1 rounded-lg bg-cozy outline-none"
                />
                <button onClick={handleSaveName} className="text-xs px-2 py-1 rounded-lg bg-campfire text-white">
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setNameInput(profile.display_name);
                  setEditingName(true);
                }}
                className="text-xs text-left px-2 py-1 rounded-lg bg-white/50"
              >
                {profile.display_name} ✏️
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Taskbar offset: {taskbarOffset}px</label>
            <input
              type="range"
              min={-50}
              max={100}
              value={taskbarOffset}
              onChange={(e) => handleOffsetChange(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Cat size: {catSize}px</label>
            <input
              type="range"
              min={32}
              max={128}
              value={catSize}
              onChange={(e) => handleSizeChange(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Pet overlay priority</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleOverlayModeChange('full')}
                className={`flex-1 text-[10px] py-1.5 rounded-lg transition ${
                  overlayMode === 'full' ? 'bg-campfire text-white' : 'bg-white/50 text-gray-600'
                }`}
              >
                All apps
              </button>
              <button
                type="button"
                onClick={() => handleOverlayModeChange('semi')}
                className={`flex-1 text-[10px] py-1.5 rounded-lg transition ${
                  overlayMode === 'semi' ? 'bg-campfire text-white' : 'bg-white/50 text-gray-600'
                }`}
              >
                Windowed
              </button>
              <button
                type="button"
                onClick={() => handleOverlayModeChange('none')}
                className={`flex-1 text-[10px] py-1.5 rounded-lg transition ${
                  overlayMode === 'none' ? 'bg-campfire text-white' : 'bg-white/50 text-gray-600'
                }`}
              >
                None
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-auto">
            <button onClick={handleUnpair} className="text-xs text-gray-500 underline text-left">
              Unpair
            </button>
            <button onClick={signOut} className="text-xs text-gray-500 underline text-left">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}