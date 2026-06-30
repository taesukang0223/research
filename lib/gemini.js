/**
 * Google Gemini API 프록시 공통 로직
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const DEFAULT_MODEL = 'gemini-2.5-flash';

const ALLOWED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

function getApiKey() {
  return process.env.GEMINI_API_KEY || '';
}

function isConfigured() {
  const key = getApiKey();
  return Boolean(key && !key.includes('your-api-key') && !key.includes('your-gemini'));
}

function formatApiError(data) {
  if (!data) return 'Gemini API 요청 실패';

  const raw = data.error?.message ?? data.error ?? data.message;
  if (typeof raw === 'string') return raw;

  if (raw && typeof raw === 'object') {
    return raw.message || JSON.stringify(raw);
  }

  return 'Gemini API 요청 실패';
}

function validateModel(model) {
  const id = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_MODEL;
  if (!ALLOWED_MODELS.includes(id)) {
    return {
      error: {
        status: 400,
        body: { error: `지원하지 않는 모델입니다. 허용: ${ALLOWED_MODELS.join(', ')}` },
      },
    };
  }
  return { model: id };
}

function buildGeneratePayload(body) {
  if (!isConfigured()) {
    return {
      error: {
        status: 503,
        body: { error: 'Gemini API가 설정되지 않았습니다. GEMINI_API_KEY 환경변수를 확인하세요.' },
      },
    };
  }

  const modelResult = validateModel(body?.model);
  if (modelResult.error) return modelResult;

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return { error: { status: 400, body: { error: 'prompt 필드는 필수입니다.' } } };
  }
  if (prompt.length > 32000) {
    return { error: { status: 400, body: { error: 'prompt는 32000자 이하여야 합니다.' } } };
  }

  const temperature = body?.temperature != null ? Number(body.temperature) : 0.7;
  const maxOutputTokens = Math.min(Math.max(Number(body?.maxOutputTokens) || 8192, 256), 8192);

  const generationConfig = {
    temperature: Number.isFinite(temperature) ? Math.min(Math.max(temperature, 0), 2) : 0.7,
    maxOutputTokens,
  };

  if (body?.responseMimeType === 'application/json') {
    generationConfig.responseMimeType = 'application/json';
    if (body.responseSchema && typeof body.responseSchema === 'object') {
      generationConfig.responseSchema = body.responseSchema;
    }
  }

  // gemini-2.5 계열은 thinking 토큰이 maxOutputTokens를 소비하므로,
  // 구조화 출력처럼 사고가 불필요한 경우 thinkingBudget=0으로 끌 수 있다.
  if (body?.thinkingBudget != null) {
    const budget = Number(body.thinkingBudget);
    if (Number.isFinite(budget) && budget >= 0) {
      generationConfig.thinkingConfig = { thinkingBudget: Math.floor(budget) };
    }
  }

  const contents = [{ role: 'user', parts: [{ text: prompt }] }];

  const payload = {
    contents,
    generationConfig,
  };

  const systemInstruction = typeof body?.systemInstruction === 'string' ? body.systemInstruction.trim() : '';
  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  return { model: modelResult.model, payload };
}

async function callGemini(model, payload) {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(getApiKey())}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    return { status: 502, body: { error: 'Gemini API 응답을 해석할 수 없습니다.' } };
  }

  if (!response.ok) {
    return {
      status: response.status >= 400 && response.status < 600 ? response.status : 502,
      body: { error: formatApiError(data) },
    };
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('') || '';

  if (!text) {
    const blockReason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    return {
      status: 502,
      body: {
        error: blockReason
          ? `Gemini 응답 차단: ${blockReason}`
          : 'Gemini가 응답을 반환하지 않았습니다.',
      },
    };
  }

  const result = { text, model };

  if (payload.generationConfig?.responseMimeType === 'application/json') {
    try {
      result.json = JSON.parse(text);
    } catch {
      result.json = null;
    }
  }

  return { status: 200, body: result };
}

async function handleGenerate(body) {
  const built = buildGeneratePayload(body);
  if (built.error) return built.error;

  try {
    return await callGemini(built.model, built.payload);
  } catch (err) {
    console.error('[gemini]', err.message);
    return { status: 502, body: { error: 'Gemini API 연결에 실패했습니다.' } };
  }
}

function getHealthResponse() {
  return {
    status: 200,
    body: {
      service: 'gemini-proxy',
      configured: isConfigured(),
      defaultModel: DEFAULT_MODEL,
      models: ALLOWED_MODELS,
    },
  };
}

module.exports = {
  GEMINI_API_BASE,
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  getApiKey,
  isConfigured,
  formatApiError,
  handleGenerate,
  getHealthResponse,
};
