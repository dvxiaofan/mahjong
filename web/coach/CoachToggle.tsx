interface CoachToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  compact?: boolean;
}

export function CoachToggle({ enabled, onChange, compact = false }: CoachToggleProps) {
  return (
    <button
      aria-pressed={enabled}
      className={`coach-toggle${enabled ? ' coach-toggle--on' : ''}${compact ? ' coach-toggle--compact' : ''}`}
      onClick={() => onChange(!enabled)}
      type="button"
    >
      <span className="coach-toggle-track" aria-hidden="true">
        <span />
      </span>
      <span>{enabled ? '教练模式 · 开' : '教练模式 · 关'}</span>
    </button>
  );
}
