/**
 * prompt/ 폴더의 마크다운 프롬프트 템플릿 로더
 */

const fs = require('fs');
const path = require('path');

const PROMPT_DIR = path.join(__dirname, '..', 'prompt');
const cache = new Map();

function loadTemplate(filename) {
  const safeName = path.basename(filename);
  if (cache.has(safeName)) return cache.get(safeName);

  const filePath = path.join(PROMPT_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`프롬프트 파일을 찾을 수 없습니다: prompt/${safeName}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  cache.set(safeName, content);
  return content;
}

function renderPrompt(filename, variables = {}) {
  let text = loadTemplate(filename);
  for (const [key, value] of Object.entries(variables)) {
    text = text.split(`{{${key}}}`).join(value ?? '');
  }
  return text;
}

function preloadPrompts(filenames) {
  filenames.forEach((name) => loadTemplate(name));
}

module.exports = {
  PROMPT_DIR,
  loadTemplate,
  renderPrompt,
  preloadPrompts,
};
