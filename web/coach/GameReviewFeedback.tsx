import { useState } from 'react';
import type { AiDifficulty } from '../../src/ai-difficulty.ts';
import {
  appendCoachFeedback,
  createCoachFeedbackRecord,
  formatCoachFeedbackExport,
  loadCoachFeedback,
  type CoachFeedbackStorage,
  type CoachFeedbackVerdict,
} from './coachFeedback';
import type { CoachGameReview } from './gameReview';

interface CoachFeedbackProps {
  difficulty: AiDifficulty;
  review: CoachGameReview;
}

function browserStorage(): CoachFeedbackStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function CoachFeedback({ difficulty, review }: CoachFeedbackProps) {
  const [storage] = useState(browserStorage);
  const [verdict, setVerdict] = useState<CoachFeedbackVerdict | null>(null);
  const [saved, setSaved] = useState(false);

  function record(next: CoachFeedbackVerdict) {
    const record = createCoachFeedbackRecord(next, { difficulty, review });
    setVerdict(next);
    setSaved(appendCoachFeedback(storage, record));
  }

  function exportSamples() {
    if (typeof window === 'undefined') return;
    const records = loadCoachFeedback(storage);
    const blob = new Blob([formatCoachFeedbackExport(records)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'mahjong-coach-feedback.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="coach-feedback">
      <span>{saved ? '本机反馈已记录' : '这局点评有用吗？'}</span>
      <div>
        <button
          aria-pressed={verdict === 'useful'}
          className={verdict === 'useful' ? 'is-active' : ''}
          onClick={() => record('useful')}
          type="button"
        >
          有帮助
        </button>
        <button
          aria-pressed={verdict === 'unclear'}
          className={verdict === 'unclear' ? 'is-active' : ''}
          onClick={() => record('unclear')}
          type="button"
        >
          不够准
        </button>
        {saved && (
          <button onClick={exportSamples} type="button">
            导出样本
          </button>
        )}
      </div>
    </div>
  );
}
