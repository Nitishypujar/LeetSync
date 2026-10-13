const LANGUAGE_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  c: 'c',
  'c++': 'cpp',
  cpp: 'cpp',
  csharp: 'cs',
  csharp3: 'cs',
  dart: 'dart',
  golang: 'go',
  java: 'java',
  javascript: 'js',
  kotlin: 'kt',
  mysql: 'sql',
  php: 'php',
  python: 'py',
  python3: 'py',
  ruby: 'rb',
  rust: 'rs',
  scala: 'scala',
  swift: 'swift',
  typescript: 'ts',
  'typescript3.7': 'ts',
  'python3.11': 'py',
  'python3.12': 'py',
  'python3.13': 'py',
  java21: 'java',
  'c++14': 'cpp',
  'c++17': 'cpp',
  'c++20': 'cpp',
  'c++23': 'cpp',
};

function safeProblemSlug(slug: string, problemNumber: number): string {
  const sanitized = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return sanitized || `problem-${problemNumber}`;
}

function escapeMarkdown(value: string): string {
  const special = new Set([
    '\\',
    '`',
    '*',
    '_',
    '{',
    '}',
    '[',
    ']',
    '(',
    ')',
    '#',
    '+',
    '.',
    '!',
    '|',
    '>',
    '<',
  ]);
  return [...value]
    .map((character) => (special.has(character) ? `\\${character}` : character))
    .join('')
    .replace(/[\r\n]+/g, ' ');
}

export function buildSolutionFiles(input: {
  number: number;
  slug: string;
  title: string;
  language: string;
  sourceCode: string;
}): {
  solutionPath: string;
  readmePath: string;
  files: Array<{ path: string; content: string }>;
} {
  const directory = `solutions/${input.number}-${safeProblemSlug(input.slug, input.number)}`;
  const solutionPath = `${directory}/solution.${LANGUAGE_EXTENSIONS[input.language.toLowerCase()] ?? 'txt'}`;
  const readmePath = `${directory}/README.md`;
  const problemUrl = `https://leetcode.com/problems/${encodeURIComponent(input.slug)}/`;
  const readme = [
    `# ${input.number}. ${escapeMarkdown(input.title)}`,
    '',
    `[View problem on LeetCode](${problemUrl})`,
    '',
  ].join('\n');

  return {
    solutionPath,
    readmePath,
    files: [
      { path: solutionPath, content: input.sourceCode },
      { path: readmePath, content: readme },
    ],
  };
}
