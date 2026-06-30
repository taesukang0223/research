/**
 * 여행 그림일기 — 검색 → Gemini 텍스트(장면 기획) → Gemini 이미지 생성 →
 * Supabase Storage 업로드 → 보고서 저장 → 카카오톡 전송
 */

const { handleSearch } = require('./tavily');
const { searchNews } = require('./search');
const { handleGenerate, isConfigured: isGeminiConfigured, DEFAULT_MODEL } = require('./gemini');
const { generateImage } = require('./image-gen');
const { uploadImage } = require('./storage');
const { renderPrompt, preloadPrompts } = require('./prompt-loader');
const { saveReport } = require('./reports-db');
const { trySendReportMemo } = require('./kakao');

const TRAVEL_PROMPT = 'travel-drawing-prompt.md';

// 초등학생 그림일기용 색칠된 완성 그림 스타일 (이미지 모델에 항상 덧붙임)
const DRAWING_STYLE_SUFFIX =
  ' Draw this as a colorful children\'s picture-diary illustration: simple cheerful cartoon style, ' +
  'bright flat colors fully colored in (not a coloring book outline), thick clean outlines, ' +
  'friendly and cute, like a drawing an elementary school student would proudly make. ' +
  'Bright sunny mood, plain light background, no text, no letters, no words, no watermark. ' +
  'Square 1:1 composition.';

try {
  preloadPrompts([TRAVEL_PROMPT]);
} catch (err) {
  console.warn(`[prompt] ${TRAVEL_PROMPT} preload failed:`, err.message);
}

function truncate(text, max = 400) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

function buildSearchContext(destination, tavily, naver) {
  const blocks = [];

  const tavilyItems = Array.isArray(tavily?.results) ? tavily.results : [];
  if (tavilyItems.length) {
    blocks.push('## 글로벌 검색 (Tavily)');
    tavilyItems.forEach((item, i) => {
      blocks.push(
        `${i + 1}. ${truncate(item.title, 200)}\n` +
          `   ${truncate(item.content, 400) || '(본문 없음)'}`
      );
    });
  }

  const naverItems = Array.isArray(naver?.items) ? naver.items : [];
  if (naverItems.length) {
    if (blocks.length) blocks.push('');
    blocks.push('## 국내 검색 (Naver)');
    naverItems.forEach((item, i) => {
      blocks.push(
        `${i + 1}. ${truncate(item.title, 200)}\n` +
          `   ${truncate(item.content, 400) || '(본문 없음)'}`
      );
    });
  }

  if (!blocks.length) {
    return `(여행지 "${destination}"에 대한 검색 결과 없음)`;
  }

  return blocks.join('\n\n');
}

function countSearchItems(tavily, naver) {
  const tavilyCount = Array.isArray(tavily?.results) ? tavily.results.length : 0;
  const naverCount = Array.isArray(naver?.items) ? naver.items.length : 0;
  return tavilyCount + naverCount;
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    diary: { type: 'string' },
    highlights: { type: 'string' },
    image_prompt: { type: 'string' },
  },
  required: ['title', 'diary', 'image_prompt'],
};

async function planDrawing(destination, tavily, naver) {
  if (!isGeminiConfigured()) {
    return { error: 'Gemini API가 설정되지 않았습니다. GEMINI_API_KEY 환경변수를 확인하세요.' };
  }

  const prompt = renderPrompt(TRAVEL_PROMPT, {
    DESTINATION: destination,
    SEARCH_CONTEXT: buildSearchContext(destination, tavily, naver),
  });

  const result = await handleGenerate({
    model: DEFAULT_MODEL,
    prompt,
    temperature: 0.8,
    maxOutputTokens: 2048,
    responseMimeType: 'application/json',
    responseSchema: PLAN_SCHEMA,
  });

  if (result.status !== 200) {
    return { error: result.body?.error || '그림일기 기획에 실패했습니다.' };
  }

  const plan = result.body.json;
  if (!plan || !plan.title || !plan.image_prompt) {
    return { error: '그림일기 기획 결과를 해석하지 못했습니다.' };
  }

  return {
    title: String(plan.title).trim(),
    diary: String(plan.diary || '').trim(),
    highlights: String(plan.highlights || '').trim(),
    imagePrompt: String(plan.image_prompt).trim(),
  };
}

async function handleTravel(body, options = {}) {
  const destination = typeof body?.destination === 'string' ? body.destination.trim() : '';

  if (!destination) {
    return { status: 400, body: { error: 'destination 필드는 필수입니다.' } };
  }

  if (destination.length > 60) {
    return { status: 400, body: { error: 'destination은 60자 이하여야 합니다.' } };
  }

  const searchQuery = `${destination} 여행 명소 특징 볼거리`;

  const [tavilyResult, naverResult] = await Promise.all([
    handleSearch({ query: searchQuery, max_results: 5 }),
    searchNews(searchQuery, { display: 5, sort: 'sim' }),
  ]);

  const tavily = tavilyResult.status === 200 ? tavilyResult.body : { error: tavilyResult.body?.error };
  const naver = naverResult.status === 200 ? naverResult.body : { error: naverResult.body?.error };

  if (countSearchItems(tavily, naver) === 0) {
    return {
      status: 400,
      body: {
        destination,
        tavily,
        naver,
        diary: { error: '여행지 검색 결과가 없어 그림일기를 만들 수 없습니다.' },
      },
    };
  }

  const plan = await planDrawing(destination, tavily, naver);
  if (plan.error) {
    return { status: 502, body: { destination, tavily, naver, diary: { error: plan.error } } };
  }

  const imageResult = await generateImage(`${plan.imagePrompt}${DRAWING_STYLE_SUFFIX}`);
  if (imageResult.error) {
    return {
      status: 502,
      body: { destination, tavily, naver, diary: { ...plan, error: `그림 생성 실패: ${imageResult.error}` } },
    };
  }

  const upload = await uploadImage({
    base64: imageResult.base64,
    mimeType: imageResult.mimeType,
    prefix: 'travel',
  });
  if (upload.error) {
    return {
      status: 502,
      body: { destination, tavily, naver, diary: { ...plan, error: `이미지 저장 실패: ${upload.error}` } },
    };
  }

  const diary = {
    title: plan.title,
    summary: plan.diary,
    highlights: plan.highlights,
    imageUrl: upload.url,
  };

  const saveResult = await saveReport({
    topic: destination,
    title: plan.title,
    summary: plan.diary,
    content: plan.highlights ? `명소·특징: ${plan.highlights}` : plan.diary,
    sources: null,
    source_type: 'travel',
    image_url: upload.url,
  });

  if (saveResult.status !== 201) {
    diary.saveError = saveResult.body?.error || '그림일기 저장에 실패했습니다.';
    return { status: 502, body: { destination, tavily, naver, diary } };
  }

  diary.saved = {
    id: saveResult.body.id,
    created_at: saveResult.body.created_at,
  };

  if (body?.sendKakao) {
    const kakaoResult = await trySendReportMemo(options.cookieHeader, {
      title: plan.title,
      summary: plan.diary,
      reportId: saveResult.body.id,
      imageUrl: upload.url,
    });

    diary.kakao = {
      sent: Boolean(kakaoResult.sent),
      reason: kakaoResult.reason || null,
      error: kakaoResult.error || null,
      reportUrl: kakaoResult.reportUrl || null,
    };

    if (kakaoResult.refreshCookie) {
      options.setCookie = options.setCookie || [];
      options.setCookie.push(kakaoResult.refreshCookie);
    }
  } else {
    diary.kakao = { sent: false, reason: 'skipped' };
  }

  return {
    status: 200,
    body: { destination, tavily, naver, diary },
    setCookie: options.setCookie,
  };
}

function getHealthResponse() {
  return {
    status: 200,
    body: {
      service: 'travel-drawing',
      description: 'Search + Gemini text/image + Supabase Storage',
      geminiConfigured: isGeminiConfigured(),
      model: DEFAULT_MODEL,
    },
  };
}

module.exports = {
  handleTravel,
  getHealthResponse,
  buildSearchContext,
};
