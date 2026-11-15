import { useMemo, useState } from 'react';
import { projectStateForSeat } from '../../src/view.ts';
import type { GameAction } from '../../src/types.ts';
import { MahjongTable } from '../components/MahjongTable';
import {
  TUTORIAL_CATALOG,
  applyTutorialAction,
  buildTutorialScenario,
  tutorialTargetAction,
  type TutorialScenarioId,
  type TutorialStep,
} from './scenarios';

function TutorialPanel({
  completed,
  lessonIndex,
  onContinue,
  onNext,
  onRestart,
  resolved,
  step,
  stepIndex,
  stepCount,
  title,
}: {
  completed: boolean;
  lessonIndex: number;
  onContinue: () => void;
  onNext: (() => void) | null;
  onRestart: () => void;
  resolved: boolean;
  step: TutorialStep;
  stepIndex: number;
  stepCount: number;
  title: string;
}) {
  return (
    <section className="tutorial-panel" aria-labelledby="tutorial-panel-title">
      <div className="tutorial-panel-head">
        <div>
          <span className="tutorial-kicker">
            教程 {lessonIndex + 1}/{TUTORIAL_CATALOG.length}
          </span>
          <h2 id="tutorial-panel-title">{title}</h2>
        </div>
        <span className="tutorial-step-count">
          {completed ? '已完成' : `第 ${stepIndex + 1}/${stepCount} 步`}
        </span>
      </div>
      <h3>{completed ? '这一课学会了' : step.title}</h3>
      <p>{completed ? '可以重玩本课，或继续下一课。' : step.prompt}</p>
      <div className="tutorial-detail">{completed ? step.success : step.detail}</div>
      {resolved && !completed && (
        <div className="tutorial-success" role="status">
          <strong>做对了</strong>
          <p>{step.success}</p>
        </div>
      )}
      <div className="tutorial-actions">
        {completed ? (
          <>
            <button className="ghost-button" onClick={onRestart} type="button">
              重玩本课
            </button>
            {onNext !== null && (
              <button className="online-primary-button" onClick={onNext} type="button">
                下一课
              </button>
            )}
          </>
        ) : resolved ? (
          <button className="online-primary-button" onClick={onContinue} type="button">
            {stepIndex + 1 === stepCount ? '完成本课' : '继续下一步'}
          </button>
        ) : (
          <button className="ghost-button" onClick={onRestart} type="button">
            重玩本课
          </button>
        )}
      </div>
    </section>
  );
}

export function TutorialMode() {
  const [scenarioId, setScenarioId] = useState<TutorialScenarioId>('fortune');
  const [lessonVersion, setLessonVersion] = useState(0);
  const scenario = useMemo(() => buildTutorialScenario(scenarioId), [lessonVersion, scenarioId]);
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState(scenario.initialState);
  const [resolved, setResolved] = useState(false);
  const [completed, setCompleted] = useState(false);
  const lessonIndex = TUTORIAL_CATALOG.findIndex((item) => item.id === scenarioId);
  const step = scenario.steps[stepIndex] ?? scenario.steps[0]!;
  const target = completed ? null : tutorialTargetAction(state, step);
  const view = useMemo(() => {
    const projected = projectStateForSeat(state, 0);
    return {
      ...projected,
      legalActions: target === null || resolved ? [] : [target],
    };
  }, [resolved, state, target]);

  function selectScenario(id: TutorialScenarioId) {
    setScenarioId(id);
    setLessonVersion((value) => value + 1);
    const next = buildTutorialScenario(id);
    setState(next.initialState);
    setStepIndex(0);
    setResolved(false);
    setCompleted(false);
  }

  function restart() {
    setLessonVersion((value) => value + 1);
    const next = buildTutorialScenario(scenarioId);
    setState(next.initialState);
    setStepIndex(0);
    setResolved(false);
    setCompleted(false);
  }

  function act(action: GameAction) {
    if (resolved || completed) return;
    const next = applyTutorialAction(state, step, action);
    setState(next);
    setResolved(true);
  }

  function continueLesson() {
    if (stepIndex + 1 >= scenario.steps.length) {
      setCompleted(true);
      return;
    }
    setStepIndex((value) => value + 1);
    setResolved(false);
  }

  const nextCatalogItem = TUTORIAL_CATALOG[lessonIndex + 1];

  return (
    <section className="tutorial-shell" aria-labelledby="tutorial-title">
      <div className="tutorial-toolbar">
        <div>
          <h2 id="tutorial-title">规则短教程</h2>
          <p>每一步都由真实合法动作推进，不写入普通对局存档。</p>
        </div>
        <div className="tutorial-lesson-tabs" role="tablist" aria-label="教程课程">
          {TUTORIAL_CATALOG.map((item, index) => (
            <button
              aria-selected={item.id === scenarioId}
              className={item.id === scenarioId ? 'is-active' : ''}
              key={item.id}
              onClick={() => selectScenario(item.id)}
              role="tab"
              type="button"
            >
              <span>{index + 1}</span>
              {item.title}
            </button>
          ))}
        </div>
      </div>

      <MahjongTable
        animateDiscards={false}
        botThinking={false}
        isReplaying={false}
        onAction={act}
        onReset={restart}
        resetLabel="重玩本课"
        roundKey={`tutorial:${scenario.id}:${lessonVersion}`}
        sidePanel={
          <TutorialPanel
            completed={completed}
            lessonIndex={lessonIndex}
            onContinue={continueLesson}
            onNext={nextCatalogItem === undefined ? null : () => selectScenario(nextCatalogItem.id)}
            onRestart={restart}
            resolved={resolved}
            step={step}
            stepCount={scenario.steps.length}
            stepIndex={stepIndex}
            title={scenario.title}
          />
        }
        view={view}
      />
    </section>
  );
}
