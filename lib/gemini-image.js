/**
 * Gemini 이미지 생성 (gemini-2.5-flash-image, 일명 Nano Banana)
 * 텍스트 프롬프트 → 이미지(base64) 반환
 */

const { GEMINI_API_BASE, getApiKey, isConfigured } = require('./gemini');

const IMAGE_MODEL = 'gemini-2.5-flash-image';

async function generateImage(prompt) {
  if (!isConfigured()) {
    return { error: 'Gemini API가 설정되지 않았습니다. GEMINI_API_KEY 환경변수를 확인하세요.' };
  }

  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!cleanPrompt) {
    return { error: '이미지 생성 프롬프트가 비어 있습니다.' };
  }

  const url = `${GEMINI_API_BASE}/models/${IMAGE_MODEL}:generateContent?key=${encodeURIComponent(getApiKey())}`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: cleanPrompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[gemini-image]', err.message);
    return { error: 'Gemini 이미지 API 연결에 실패했습니다.' };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { error: 'Gemini 이미지 응답을 해석할 수 없습니다.' };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || 'Gemini 이미지 생성에 실패했습니다.';
    return { error: typeof message === 'string' ? message : JSON.stringify(message) };
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const inline = imagePart?.inlineData || imagePart?.inline_data;

  if (!inline?.data) {
    const blockReason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    return {
      error: blockReason
        ? `이미지 생성이 차단되었습니다: ${blockReason}`
        : 'Gemini가 이미지를 반환하지 않았습니다.',
    };
  }

  return {
    base64: inline.data,
    mimeType: inline.mimeType || inline.mime_type || 'image/png',
    model: IMAGE_MODEL,
  };
}

module.exports = {
  IMAGE_MODEL,
  generateImage,
};
