/**
 * 여행 그림일기 (2단계)
 *  1) handleTravelSearch: 여행지 검색 → 분류별 소재 리스트업
 *  2) handleTravel: 선택 소재 + 날씨 + 가족 구성원 반영 →
 *     Gemini 텍스트 기획 → 이미지 생성 → Storage 업로드 → 저장 → (선택) 카카오 전송
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
const EXTRACT_PROMPT = 'travel-extract-prompt.md';

// 초등학생 그림일기용 색칠된 완성 그림 스타일 (날씨/분위기는 강제하지 않음)
const DRAWING_STYLE_SUFFIX =
  " Draw this as a colorful children's picture-diary illustration: simple cheerful cartoon style, " +
  'bright flat colors fully colored in (not a coloring book outline), thick clean outlines, ' +
  'friendly and cute, like a drawing an elementary school student would proudly make. ' +
  'No text, no letters, no words, no watermark. Square 1:1 composition.';

const WEATHER_MAP = {
  sunny: { label: '맑음', en: 'a bright sunny day with a clear blue sky' },
  cloudy: { label: '흐림', en: 'a cloudy day with soft grey clouds' },
  rainy: { label: '비', en: 'a rainy day, holding a colorful umbrella with puddles on the ground' },
  snowy: { label: '눈', en: 'a snowy winter day with white snowflakes falling' },
  sunset: { label: '노을', en: 'sunset with a warm orange and pink sky' },
  night: { label: '밤', en: 'night time with a dark blue starry sky and glowing lights' },
};

const FAMILY_MAP = {
  mom: { label: '엄마', en: 'mom' },
  dad: { label: '아빠', en: 'dad' },
  sister: { label: '누나/언니', en: 'an older sister' },
  brother: { label: '형/오빠', en: 'an older brother' },
  sibling: { label: '동생', en: 'a little sibling' },
  grandma: { label: '할머니', en: 'grandmother' },
  grandpa: { label: '할아버지', en: 'grandfather' },
  friend: { label: '친구', en: 'a friend' },
};

try {
  preloadPrompts([TRAVEL_PROMPT, EXTRACT_PROMPT]);
} catch (err) {
  console.warn('[prompt] travel prompts preload failed:', err.message);
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
      blocks.push(`${i + 1}. ${truncate(item.title, 200)}\n   ${truncate(item.content, 400) || '(본문 없음)'}`);
    });
  }

  const naverItems = Array.isArray(naver?.items) ? naver.items : [];
  if (naverItems.length) {
    if (blocks.length) blocks.push('');
    blocks.push('## 국내 검색 (Naver)');
    naverItems.forEach((item, i) => {
      blocks.push(`${i + 1}. ${truncate(item.title, 200)}\n   ${truncate(item.content, 400) || '(본문 없음)'}`);
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

function validateDestination(body) {
  const destination = typeof body?.destination === 'string' ? body.destination.trim() : '';
  if (!destination) return { error: 'destination 필드는 필수입니다.' };
  if (destination.length > 60) return { error: 'destination은 60자 이하여야 합니다.' };
  return { destination };
}

async function runSearch(destination) {
  const searchQuery = `${destination} 여행 명소 특징 전시 볼거리`;
  const [tavilyResult, naverResult] = await Promise.all([
    handleSearch({ query: searchQuery, max_results: 5 }),
    searchNews(searchQuery, { display: 5, sort: 'sim' }),
  ]);
  const tavily = tavilyResult.status === 200 ? tavilyResult.body : { error: tavilyResult.body?.error };
  const naver = naverResult.status === 200 ? naverResult.body : { error: naverResult.body?.error };
  return { tavily, naver };
}

/* ───────────────────────── 1단계: 검색 + 분류별 소재 추출 ───────────────────────── */

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'items'],
      },
    },
  },
  required: ['categories'],
};

function normalizeCategories(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((cat) => ({
      name: String(cat?.name || '').replace(/\s+/g, '·').trim().slice(0, 20),
      items: Array.isArray(cat?.items)
        ? [...new Set(cat.items.map((it) => String(it || '').trim()).filter(Boolean).map((it) => it.slice(0, 40)))].slice(0, 6)
        : [],
    }))
    .filter((cat) => cat.name && cat.items.length)
    .slice(0, 5);
}

async function handleTravelSearch(body) {
  const v = validateDestination(body);
  if (v.error) return { status: 400, body: { error: v.error } };

  if (!isGeminiConfigured()) {
    return { status: 503, body: { error: 'Gemini API가 설정되지 않았습니다. GEMINI_API_KEY 환경변수를 확인하세요.' } };
  }

  const { destination } = v;
  const { tavily, naver } = await runSearch(destination);

  if (countSearchItems(tavily, naver) === 0) {
    return { status: 400, body: { destination, error: '여행지 검색 결과가 없습니다. 여행지명을 확인해 주세요.' } };
  }

  const prompt = renderPrompt(EXTRACT_PROMPT, {
    DESTINATION: destination,
    SEARCH_CONTEXT: buildSearchContext(destination, tavily, naver),
  });

  const result = await handleGenerate({
    model: DEFAULT_MODEL,
    prompt,
    temperature: 0.4,
    maxOutputTokens: 4096,
    thinkingBudget: 0,
    responseMimeType: 'application/json',
    responseSchema: EXTRACT_SCHEMA,
  });

  if (result.status !== 200) {
    return { status: 502, body: { destination, error: result.body?.error || '소재 추출에 실패했습니다.' } };
  }

  const categories = normalizeCategories(result.body.json?.categories);
  if (!categories.length) {
    return { status: 502, body: { destination, error: '추출된 소재가 없습니다. 다시 시도해 주세요.' } };
  }

  return { status: 200, body: { destination, categories } };
}

/* ───────────────────────── 2단계: 선택 반영 → 그림일기 생성 ───────────────────────── */

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

function sanitizeFeatures(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((f) => String(f || '').trim()).filter(Boolean).map((f) => f.slice(0, 60)))].slice(0, 12);
}

function resolveWeather(key) {
  return WEATHER_MAP[String(key || '').trim()] || null;
}

function resolveFamily(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const key of input) {
    const entry = FAMILY_MAP[String(key || '').trim()];
    if (entry && !seen.has(key)) {
      seen.add(key);
      out.push(entry);
    }
  }
  return out.slice(0, 6);
}

async function planDrawing({ destination, features, weather, family }) {
  const featureText = features.length ? features.map((f) => `- ${f}`).join('\n') : '(지정 안 함)';
  const weatherText = weather ? weather.label : '(지정 안 함)';
  const familyText = family.length ? family.map((f) => f.label).join(', ') : '(지정 안 함)';

  const prompt = renderPrompt(TRAVEL_PROMPT, {
    DESTINATION: destination,
    SELECTED_FEATURES: featureText,
    WEATHER: weatherText,
    FAMILY: familyText,
  });

  const result = await handleGenerate({
    model: DEFAULT_MODEL,
    prompt,
    temperature: 0.8,
    maxOutputTokens: 4096,
    thinkingBudget: 0,
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

function buildImagePrompt(plan, weather, family) {
  let extra = '';
  if (weather) extra += ` The weather is ${weather.en}.`;
  if (family.length) extra += ` The child is together with ${family.map((f) => f.en).join(' and ')}.`;
  return `${plan.imagePrompt}${extra}${DRAWING_STYLE_SUFFIX}`;
}

async function handleTravel(body, options = {}) {
  const v = validateDestination(body);
  if (v.error) return { status: 400, body: { error: v.error } };

  const { destination } = v;
  const features = sanitizeFeatures(body?.selectedFeatures);
  const weather = resolveWeather(body?.weather);
  const family = resolveFamily(body?.family);

  if (!isGeminiConfigured()) {
    return { status: 503, body: { diary: { error: 'Gemini API가 설정되지 않았습니다.' } } };
  }

  const plan = await planDrawing({ destination, features, weather, family });
  if (plan.error) {
    return { status: 502, body: { destination, diary: { error: plan.error } } };
  }

  const imageResult = await generateImage(buildImagePrompt(plan, weather, family));
  if (imageResult.error) {
    return { status: 502, body: { destination, diary: { ...toDiary(plan), error: `그림 생성 실패: ${imageResult.error}` } } };
  }

  const upload = await uploadImage({
    base64: imageResult.base64,
    mimeType: imageResult.mimeType,
    prefix: 'travel',
  });
  if (upload.error) {
    return { status: 502, body: { destination, diary: { ...toDiary(plan), error: `이미지 저장 실패: ${upload.error}` } } };
  }

  const diary = { ...toDiary(plan), imageUrl: upload.url };

  const saveResult = await saveReport({
    topic: destination,
    title: plan.title,
    summary: plan.diary,
    content: plan.highlights ? `반영한 소재: ${plan.highlights}` : plan.diary,
    sources: null,
    source_type: 'travel',
    image_url: upload.url,
  });

  if (saveResult.status !== 201) {
    diary.saveError = saveResult.body?.error || '그림일기 저장에 실패했습니다.';
    return { status: 502, body: { destination, diary } };
  }

  diary.saved = { id: saveResult.body.id, created_at: saveResult.body.created_at };

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

  return { status: 200, body: { destination, diary }, setCookie: options.setCookie };
}

function toDiary(plan) {
  return { title: plan.title, summary: plan.diary, highlights: plan.highlights };
}

function getHealthResponse() {
  return {
    status: 200,
    body: {
      service: 'travel-drawing',
      description: 'Search → categorize → select → Gemini text/image → Supabase Storage',
      geminiConfigured: isGeminiConfigured(),
      model: DEFAULT_MODEL,
      weatherOptions: Object.entries(WEATHER_MAP).map(([key, v2]) => ({ key, label: v2.label })),
      familyOptions: Object.entries(FAMILY_MAP).map(([key, v2]) => ({ key, label: v2.label })),
    },
  };
}

module.exports = {
  handleTravel,
  handleTravelSearch,
  getHealthResponse,
  buildSearchContext,
  WEATHER_MAP,
  FAMILY_MAP,
};
