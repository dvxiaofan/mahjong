import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from '../../src/game.ts';
import {
  TUTORIAL_CATALOG,
  applyTutorialAction,
  buildTutorialScenario,
  tutorialTargetAction,
} from './scenarios';

describe('自有规则短教程', () => {
  it('四课都存在，且每一步目标动作在当前局面合法', () => {
    for (const item of TUTORIAL_CATALOG) {
      const scenario = buildTutorialScenario(item.id);
      let state = scenario.initialState;
      for (const step of scenario.steps) {
        const target = tutorialTargetAction(state, step);
        expect(target, `${scenario.title} / ${step.title}`).not.toBeNull();
        expect(getLegalActions(state, 0)).toContainEqual(target);
        state = applyTutorialAction(state, step, target!);
      }
    }
  });

  it('发财补牌真实增加发财数并完成自摸', () => {
    const scenario = buildTutorialScenario('fortune');
    const drawStep = scenario.steps[0]!;
    const drawn = applyAction(
      scenario.initialState,
      tutorialTargetAction(scenario.initialState, drawStep)!,
    );
    expect(drawn.players[0]!.fortuneCount).toBe(1);
    expect(drawn.players[0]!.concealedTiles).toContain('s1');
    expect(getLegalActions(drawn, 0)).toContainEqual({ type: 'win', seat: 0 });
  });

  it('三财未报嘴时不能直接接炮，报嘴后才出现胡牌动作', () => {
    const scenario = buildTutorialScenario('mouth');
    const actions = getLegalActions(scenario.initialState, 0);
    expect(actions).toContainEqual({ type: 'declare-mouth', seat: 0 });
    expect(actions).not.toContainEqual({ type: 'win', seat: 0 });

    const declared = applyTutorialAction(
      scenario.initialState,
      scenario.steps[0]!,
      tutorialTargetAction(scenario.initialState, scenario.steps[0]!)!,
    );
    expect(getLegalActions(declared, 0)).toContainEqual({ type: 'win', seat: 0 });
  });

  it('暗杠后只能先补牌，不能跳过', () => {
    const scenario = buildTutorialScenario('kong');
    const afterKong = applyTutorialAction(
      scenario.initialState,
      scenario.steps[0]!,
      tutorialTargetAction(scenario.initialState, scenario.steps[0]!)!,
    );
    expect(afterKong.phase).toBe('awaiting-draw');
    expect(getLegalActions(afterKong, 0)).toEqual([{ type: 'draw', seat: 0 }]);
  });
});
