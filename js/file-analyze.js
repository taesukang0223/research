/**
 * 파일 분석 — /api/analyze-file 호출 및 결과 표시
 */

const ANALYSIS_MODES = {
  summary: {
    label: '핵심 요약',
    prompt:
      '이 파일의 핵심 내용을 5~7문장으로 요약해 주세요. 중요한 수치, 날짜, 고유명사, 결론은 빠뜨리지 마세요.',
  },
  checklist: {
    label: '체크리스트 추출',
    prompt:
      '이 파일에서 실행 가능한 항목을 체크리스트 형태로 추출해 주세요. 각 항목은 "- [ ]" 형식으로 작성하고, 주제별로 구분해 주세요.',
  },
  transcript: {
    label: '전체 받아쓰기',
    prompt:
      '이 음성 파일의 전체 내용을 받아쓰기(전사)해 주세요. 화자 구분이 가능하면 [화자1], [화자2] 형식으로 표시하고, 들리지 않는 부분은 (들리지 않음)으로 표기해 주세요.',
  },
};

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ACCEPT_TYPES = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.mp3',
  '.wav',
  '.aac',
  '.ogg',
  '.flac',
  '.m4a',
  '.webm',
  'application/pdf',
  'image/*',
  'audio/*',
].join(',');

const form = document.getElementById('file-analyze-form');
const fileInput = document.getElementById('file-analyze-input');
const filePickBtn = document.getElementById('file-analyze-pick');
const fileNameEl = document.getElementById('file-analyze-filename');
const submitBtn = document.getElementById('file-analyze-submit');
const statusEl = document.getElementById('file-analyze-status');
const resultSection = document.getElementById('file-analyze-result');
const resultContent = document.getElementById('file-analyze-content');
const resultError = document.getElementById('file-analyze-error');
const resultMeta = document.getElementById('file-analyze-meta');
const resultText = document.getElementById('file-analyze-text');

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = 'file-analyze-status' + (type ? ` ${type}` : '');
}

function hideResult() {
  resultSection.hidden = true;
  resultContent.hidden = false;
  resultError.hidden = true;
  resultError.textContent = '';
}

function showResultError(message) {
  resultSection.hidden = false;
  resultContent.hidden = true;
  resultError.hidden = false;
  resultError.textContent = message;
}

function showResult(data, modeKey, file) {
  const mode = ANALYSIS_MODES[modeKey];
  resultSection.hidden = false;
  resultContent.hidden = false;
  resultError.hidden = true;

  resultMeta.innerHTML = `
    <span class="file-analyze-meta-tag">${escapeHtml(mode?.label || modeKey)}</span>
    <span class="file-analyze-meta-file">${escapeHtml(file.name)}</span>
    <span class="file-analyze-meta-size">${escapeHtml(formatBytes(file.size))}</span>
  `;
  resultText.textContent = data.analysis || '(분석 결과 없음)';
}

function updateFileLabel() {
  const file = fileInput.files?.[0];
  if (file) {
    fileNameEl.textContent = `${file.name} (${formatBytes(file.size)})`;
    fileNameEl.classList.add('has-file');
  } else {
    fileNameEl.textContent = '선택된 파일 없음';
    fileNameEl.classList.remove('has-file');
  }
}

function setPickDisabled(disabled) {
  fileInput.disabled = disabled;
  filePickBtn.classList.toggle('is-disabled', disabled);
  if (disabled) {
    filePickBtn.setAttribute('aria-disabled', 'true');
  } else {
    filePickBtn.removeAttribute('aria-disabled');
  }
}

fileInput.addEventListener('change', updateFileLabel);

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = fileInput.files?.[0];
  if (!file) {
    setStatus('분석할 파일을 선택해 주세요.', 'error');
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    setStatus(`파일 크기는 ${MAX_FILE_BYTES / (1024 * 1024)}MB 이하여야 합니다.`, 'error');
    return;
  }

  const modeKey = form.querySelector('input[name="analyze-mode"]:checked')?.value || 'summary';
  const mode = ANALYSIS_MODES[modeKey];
  if (!mode) {
    setStatus('분석 옵션을 선택해 주세요.', 'error');
    return;
  }

  hideResult();
  submitBtn.disabled = true;
  setPickDisabled(true);
  setStatus('AI가 파일을 분석하고 있습니다...');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('prompt', mode.prompt);

  try {
    const response = await fetch('/api/analyze-file', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error || '파일 분석에 실패했습니다.', 'error');
      showResultError(data.error || '파일 분석에 실패했습니다.');
      return;
    }

    setStatus('분석이 완료되었습니다.', 'success');
    showResult(data, modeKey, file);
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch {
    setStatus('서버 연결에 실패했습니다.', 'error');
    showResultError('서버 연결에 실패했습니다.');
  } finally {
    submitBtn.disabled = false;
    setPickDisabled(false);
  }
});

fileInput.accept = ACCEPT_TYPES;
updateFileLabel();
