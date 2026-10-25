import { describe, expect, it } from 'vitest';
import { buildSolutionFiles } from './solution-files.js';

describe('solution repository layout', () => {
  it('uses one stable problem folder with only the code and one concise README', () => {
    const first = buildSolutionFiles({
      number: 1,
      slug: 'two-sum',
      title: 'Two Sum',
      language: 'python3',
      sourceCode: 'class Solution: pass',
    });
    const repeated = buildSolutionFiles({
      number: 1,
      slug: 'two-sum',
      title: 'Two Sum',
      language: 'python3',
      sourceCode: 'class Solution: return updated',
    });

    expect(first.solutionPath).toBe('solutions/1-two-sum/solution.py');
    expect(first.readmePath).toBe('solutions/1-two-sum/README.md');
    expect(first.files.map(({ path }) => path)).toEqual([
      'solutions/1-two-sum/solution.py',
      'solutions/1-two-sum/README.md',
    ]);
    expect(first.files[0]?.content).toBe('class Solution: pass');
    expect(first.files[1]?.content).toBe(
      '# 1. Two Sum\n\n[View problem on LeetCode](https://leetcode.com/problems/two-sum/)\n',
    );
    expect(repeated.files.map(({ path }) => path)).toEqual(
      first.files.map(({ path }) => path),
    );
    expect(repeated.files[0]?.content).toBe('class Solution: return updated');
  });

  it('uses a safe fallback slug and text extension for unknown languages', () => {
    const result = buildSolutionFiles({
      number: 42,
      slug: '***',
      title: 'Problem',
      language: 'unknown',
      sourceCode: 'source',
    });

    expect(result.solutionPath).toBe('solutions/42-problem-42/solution.txt');
    expect(result.readmePath).toBe('solutions/42-problem-42/README.md');
  });

  it('escapes HTML and Markdown injection in problem titles', () => {
    const result = buildSolutionFiles({
      number: 7,
      slug: 'safe-problem',
      title: '<img src=x onerror=alert(1)> [click](https://attacker.example)',
      language: 'javascript',
      sourceCode: 'console.log(1)',
    });
    const readme = result.files[1]?.content ?? '';

    expect(readme).not.toMatch(/(?<!\\)</);
    expect(readme).not.toContain('[click](');
    expect(readme).toContain('\\<img');
  });
});
