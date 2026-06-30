/**
 * 이미지 생성 — Pollinations.ai(무료, 키 불필요) 우선, 실패 시 Gemini 폴백
 * 텍스트 프롬프트 → 이미지(base64) 반환
 */

const { generateImage: generateWithGemini } = require('./gemini-image');
const { isConfigured: isGeminiConfigured } = require('./gemini');

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';
const DEFAULT_MODEL = 'flux';
const REQUEST_TIMEOUT_MS = 90000;

async function generateWithPollinations(prompt, options = {}) {
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!cleanPrompt) {
    return { error: '이미지 생성 프롬프트가 비어 있습니다.' };
  }

  const params = new URLSearchParams({
    width: String(options.width || 1024),
    height: String(options.height || 1024),
    model: options.model || DEFAULT_MODEL,
    nologo: 'true',
    seed: String(Math.floor(Math.random() * 1_000_000)),
  });

  const url = `${POLLINATIONS_BASE}/${encodeURIComponent(cleanPrompt)}?${params.toString()}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[image-gen/pollinations]', err.message);
    return { error: `Pollinations 연결 실패: ${err.message}` };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { error: `Pollinations 이미지 생성 실패 (${response.status}) ${detail.slice(0, 120)}` };
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    const body = await response.text().catch(() => '');
    return { error: `Pollinations가 이미지를 반환하지 않았습니다. ${body.slice(0, 120)}` };
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) {
    return { error: 'Pollinations 이미지가 비어 있습니다.' };
  }

  return {
    base64: buffer.toString('base64'),
    mimeType: contentType.split(';')[0] || 'image/jpeg',
    provider: 'pollinations',
  };
}

async function generateImage(prompt, options = {}) {
  const primary = await generateWithPollinations(prompt, options);
  if (!primary.error) {
    return primary;
  }

  console.warn('[image-gen] Pollinations 실패, Gemini 폴백 시도:', primary.error);

  if (isGeminiConfigured()) {
    const fallback = await generateWithGemini(prompt);
    if (!fallback.error) {
      return { ...fallback, provider: 'gemini' };
    }
    return { error: `${primary.error} | Gemini 폴백도 실패: ${fallback.error}` };
  }

  return { error: primary.error };
}

module.exports = {
  POLLINATIONS_BASE,
  generateWithPollinations,
  generateImage,
};
