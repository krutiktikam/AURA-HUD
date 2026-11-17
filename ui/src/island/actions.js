// Ported verbatim from ui/src/App.jsx lines 370-414 (handleNodeAction)

export const ACTION_TEMPLATES = {
  refactor: (clipboardText) =>
    `Find bugs, optimize performance, and provide the clean refactored code:\n\n${clipboardText}`,
  explain: (clipboardText) =>
    `Explain this code or text succinctly in 2-3 clear sentences:\n\n${clipboardText}`,
  summarize: (clipboardText) =>
    `Summarize this text in 3 concise bullet points:\n\n${clipboardText}`,
  format_json: (clipboardText) =>
    `Format, validate, and structure this JSON data:\n\n${clipboardText}`,
  telemetry: () =>
    `Show current CPU, RAM and hardware telemetry status.`,
  status: () =>
    `System status diagnostic report.`,
};

export const CATEGORY_ACTIONS = {
  code: [
    { id: 'refactor', label: 'Refactor', prompt: (text) => ACTION_TEMPLATES.refactor(text) },
    { id: 'explain', label: 'Explain', prompt: (text) => ACTION_TEMPLATES.explain(text) },
  ],
  json: [
    { id: 'format_json', label: 'Format JSON', prompt: (text) => ACTION_TEMPLATES.format_json(text) },
    { id: 'explain', label: 'Explain', prompt: (text) => ACTION_TEMPLATES.explain(text) },
  ],
  url: [
    { id: 'summarize', label: 'Summarize', prompt: (text) => ACTION_TEMPLATES.summarize(text) },
    { id: 'explain', label: 'Explain', prompt: (text) => ACTION_TEMPLATES.explain(text) },
  ],
  text: [
    { id: 'summarize', label: 'Summarize', prompt: (text) => ACTION_TEMPLATES.summarize(text) },
    { id: 'explain', label: 'Explain', prompt: (text) => ACTION_TEMPLATES.explain(text) },
  ],
};

export function categorizeClipboard(text) {
  if (!text) return 'text';
  const s = text.trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return 'url';
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) return 'json';
  const codeKeywords = ['def ', 'const ', 'let ', 'var ', 'function ', 'class ', 'import ', 'return ', '=>', 'SELECT ', 'fn '];
  if (codeKeywords.some((k) => s.includes(k)) || (s.includes('\n') && (s.includes('{') || s.includes(';')))) return 'code';
  return 'text';
}

export function getActionsForCategory(category) {
  return CATEGORY_ACTIONS[category] || CATEGORY_ACTIONS.text;
}
