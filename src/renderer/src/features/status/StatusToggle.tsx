import type { StatusValue } from '../../../../shared/types';

interface Props {
  myStatus: StatusValue;
  partnerStatus: StatusValue;
  onChange: (status: StatusValue) => void;
}

const STATUS_CONFIG: Record<StatusValue, { label: string; emoji: string; color: string }> = {
  busy: { label: 'Busy working', emoji: '💻', color: 'bg-gray-400' },
  free: { label: 'Free to chat', emoji: '☀️', color: 'bg-green-400' },
  missing_you: { label: 'Missing you', emoji: '🥹', color: 'bg-pink-400' },
};

export default function StatusToggle({ myStatus, partnerStatus, onChange }: Props) {
  const partnerConfig = STATUS_CONFIG[partnerStatus];

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <span className={'w-2 h-2 rounded-full ' + partnerConfig.color} />
        <span>
          They're {partnerConfig.label.toLowerCase()} {partnerConfig.emoji}
        </span>
      </div>

      <div className="flex gap-1">
        {(Object.keys(STATUS_CONFIG) as StatusValue[]).map((status) => {
          const config = STATUS_CONFIG[status];
          const active = myStatus === status;
          const btnClass = active
            ? 'flex-1 text-xs py-1.5 rounded-lg transition bg-campfire text-white'
            : 'flex-1 text-xs py-1.5 rounded-lg transition bg-white/60 text-gray-600 hover:bg-white/80';
          return (
            <button key={status} onClick={() => onChange(status)} className={btnClass} title={config.label}>
              {config.emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
