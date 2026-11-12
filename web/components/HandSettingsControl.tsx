import { useRef, type KeyboardEvent } from 'react';
import type { HandSettings } from '../handSettings';

interface HandSettingsControlProps {
  settings: HandSettings;
  saved: boolean;
  update: (patch: Partial<HandSettings>) => void;
  variant: 'dock' | 'rail';
}

export function HandSettingsControl({
  settings,
  saved,
  update,
  variant,
}: HandSettingsControlProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function closeOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== 'Escape' || detailsRef.current === null) return;
    detailsRef.current.open = false;
    detailsRef.current.querySelector('summary')?.focus();
  }

  return (
    <details
      className={`hand-settings hand-settings--${variant}`}
      ref={detailsRef}
      onKeyDown={closeOnEscape}
    >
      <summary>
        <span>{variant === 'rail' ? '手牌与出牌设置' : '手牌设置'}</span>
        {variant === 'rail' && <small>排列与确认方式</small>}
      </summary>
      <div className="hand-settings-panel">
        <label>
          出牌方式
          <select
            aria-label="出牌方式"
            value={settings.confirmation}
            onChange={(event) =>
              update({
                confirmation: event.currentTarget.value as HandSettings['confirmation'],
              })
            }
          >
            <option value="auto">自动：触屏或窄屏先确认</option>
            <option value="confirm">先选牌，再确认</option>
            <option value="direct">直接点击出牌</option>
          </select>
        </label>
        <label>
          手牌排列
          <select
            aria-label="手牌排列"
            value={settings.layout}
            onChange={(event) =>
              update({
                layout: event.currentTarget.value as HandSettings['layout'],
              })
            }
          >
            <option value="wrap">放不下时分行</option>
            <option value="scroll">单行横向滚动</option>
          </select>
        </label>
        <small>{saved ? '设置已保存到本设备' : '设置仅在本次使用中生效'}</small>
      </div>
    </details>
  );
}
