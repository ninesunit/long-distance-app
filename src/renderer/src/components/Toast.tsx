import { useEffect, useState } from 'react';

interface ToastPayload {
  id: string;
  type: 'note' | 'pet' | 'status';
  title: string;
  message?: string;
  emoji?: string;
}

export default function Toast() {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = window.api.onToastRelay((payload) => {
      setToast(payload);
      setVisible(true);

      const hideTimer = setTimeout(() => setVisible(false), 4000);
      const clearTimer = setTimeout(() => {
        setToast(null);
        window.api.hideToast();
      }, 4400);

      return () => {
        clearTimeout(hideTimer);
        clearTimeout(clearTimer);
      };
    });

    return unsubscribe;
  }, []);

  if (!toast) return null;

  const isNote = toast.type === 'note';

  return (
    <div
      className={`w-full h-full flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg bg-cozy font-sans ${
        visible ? 'animate-slide-in' : 'animate-slide-out'
      }`}
    >
      {isNote ? (
        <img src="./assets/sprites/pixel_letter.gif" className="w-8 h-8 pixel-art flex-shrink-0" alt="letter" />
      ) : (
        <span className="text-2xl">{toast.emoji ?? '💌'}</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{toast.title}</p>
        {toast.message && <p className="text-xs text-gray-600 truncate">{toast.message}</p>}
      </div>
    </div>
  );
}
