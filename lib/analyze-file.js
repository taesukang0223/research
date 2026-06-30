/**
 * Gemini File API — 파일 업로드·분석·삭제
 * PDF, 이미지, 음성 파일을 분석하고 결과를 JSON으로 반환합니다.
 */

const { Readable } = require('stream');
const Busboy = require('busboy');
const { GEMINI_API_BASE, DEFAULT_MODEL, getApiKey, isConfigured, formatApiError } = require('./gemini');

const UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta';
// Vercel 요청 본문 한도(~4.5MB) + multipart 오버헤드 고려
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 8000;
const FILE_POLL_INTERVAL_MS = 2000;
const FILE_POLL_MAX_MS = 60000;
const AUDIO_POLL_MAX_MS = 120000;

const EXT_MIME_MAP = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/mp4',
  'audio/webm',
  'audio/x-m4a',
  'video/webm',
]);

const MIME_ALIASES = {
  'audio/mp3': 'audio/mpeg',
  'image/jpg': 'image/jpeg',
  'audio/x-m4a': 'audio/mp4',
  'video/mp4': 'audio/mp4',
  'video/webm': 'audio/webm',
};

function inferMimeFromFilename(fileName) {
  const ext = String(fileName || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  return ext ? EXT_MIME_MAP[ext] || '' : '';
}

function resolveMimeType(mimeType, fileName) {
  const normalized = normalizeMimeType(mimeType);
  if (normalized && normalized !== 'application/octet-stream' && ALLOWED_MIME_TYPES.has(normalized)) {
    return normalized;
  }

  const fromExt = inferMimeFromFilename(fileName);
  if (fromExt) return fromExt;

  return normalized || mimeType || '';
}

function normalizeMimeType(mimeType) {
  const raw = String(mimeType || '').split(';')[0].trim().toLowerCase();
  return MIME_ALIASES[raw] || raw;
}

function validateMimeType(mimeType, fileName = '') {
  const resolved = resolveMimeType(mimeType, fileName);
  const normalized = normalizeMimeType(resolved);
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    return {
      error: `지원하지 않는 파일 형식입니다(${resolved || 'unknown'}). 허용: PDF, JPEG/PNG/WebP/GIF, MP3/WAV/AAC/OGG/M4A/FLAC`,
    };
  }
  return { mimeType: normalized };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiHeaders(extra = {}) {
  return {
    'x-goog-api-key': getApiKey(),
    ...extra,
  };
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = await readRawBody(req);
  if (!raw.length) {
    throw new Error('요청 본문이 비어 있습니다.');
  }

  return JSON.parse(raw.toString('utf8'));
}

async function readBodyBuffer(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' && req.body.length > 0) {
    return Buffer.from(req.body, 'binary');
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseMultipartFromBuffer(buffer, headers) {
  return new Promise((resolve, reject) => {
    if (!buffer?.length) {
      reject(new Error('요청 본문이 비어 있습니다.'));
      return;
    }

    const busboy = Busboy({
      headers,
      limits: { files: 1, fileSize: MAX_FILE_BYTES },
    });

    let prompt = '';
    let fileBuffer = null;
    let fileName = '';
    let mimeType = '';
    let fileReceived = false;

    busboy.on('field', (name, value) => {
      if (name === 'prompt') prompt = String(value || '').trim();
    });

    busboy.on('file', (_name, stream, info) => {
      if (fileReceived) {
        stream.resume();
        return;
      }

      fileReceived = true;
      fileName = info.filename || 'upload';
      mimeType = info.mimeType || 'application/octet-stream';

      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () =>
        reject(new Error(`파일 크기는 ${MAX_FILE_BYTES / (1024 * 1024)}MB 이하여야 합니다.`))
      );
      stream.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('error', reject);
    busboy.on('finish', () => {
      resolve({ prompt, fileBuffer, fileName, mimeType });
    });

    Readable.from(buffer).pipe(busboy);
  });
}

async function parseMultipart(req) {
  const buffer = await readBodyBuffer(req);
  return parseMultipartFromBuffer(buffer, req.headers);
}

async function parseRequest(req) {
  const contentType = String(req.headers['content-type'] || '');

  if (contentType.includes('multipart/form-data')) {
    let parsed;
    try {
      parsed = await parseMultipart(req);
    } catch (err) {
      return {
        error: {
          status: 400,
          body: { error: err.message || 'multipart 요청을 해석할 수 없습니다.' },
        },
      };
    }
    if (!parsed.fileBuffer?.length) {
      return { error: { status: 400, body: { error: 'file 필드에 파일을 첨부하세요.' } } };
    }
    return { data: parsed };
  }

  if (contentType.includes('application/json')) {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return { error: { status: 400, body: { error: 'JSON 본문을 해석할 수 없습니다.' } } };
    }

    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const filePart = body?.file;

    if (!filePart || typeof filePart !== 'object') {
      return { error: { status: 400, body: { error: 'file 객체(data, mimeType)는 필수입니다.' } } };
    }

    const dataField = filePart.data ?? filePart.base64;
    if (typeof dataField !== 'string' || !dataField.trim()) {
      return { error: { status: 400, body: { error: 'file.data(base64)는 필수입니다.' } } };
    }

    let fileBuffer;
    try {
      fileBuffer = Buffer.from(dataField, 'base64');
    } catch {
      return { error: { status: 400, body: { error: 'file.data는 유효한 base64여야 합니다.' } } };
    }

    return {
      data: {
        prompt,
        fileBuffer,
        fileName: typeof filePart.name === 'string' ? filePart.name : 'upload',
        mimeType: filePart.mimeType || filePart.mimetype || 'application/octet-stream',
      },
    };
  }

  return {
    error: {
      status: 415,
      body: { error: 'Content-Type은 multipart/form-data 또는 application/json 이어야 합니다.' },
    },
  };
}

function validateInput({ prompt, fileBuffer, fileName, mimeType }) {
  if (!isConfigured()) {
    return {
      status: 503,
      body: { error: 'Gemini API가 설정되지 않았습니다. GEMINI_API_KEY 환경변수를 확인하세요.' },
    };
  }

  const instruction = typeof prompt === 'string' ? prompt.trim() : '';
  if (!instruction) {
    return { status: 400, body: { error: 'prompt 필드(분석 요청문)는 필수입니다.' } };
  }
  if (instruction.length > MAX_PROMPT_LENGTH) {
    return { status: 400, body: { error: `prompt는 ${MAX_PROMPT_LENGTH}자 이하여야 합니다.` } };
  }

  if (!fileBuffer?.length) {
    return { status: 400, body: { error: '분석할 파일이 없습니다.' } };
  }
  if (fileBuffer.length > MAX_FILE_BYTES) {
    return {
      status: 400,
      body: { error: `파일 크기는 ${MAX_FILE_BYTES / (1024 * 1024)}MB 이하여야 합니다.` },
    };
  }

  const mimeResult = validateMimeType(mimeType, fileName);
  if (mimeResult.error) {
    return { status: 400, body: { error: mimeResult.error } };
  }

  return {
    prompt: instruction,
    fileBuffer,
    fileName: typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'upload',
    mimeType: mimeResult.mimeType,
  };
}

async function uploadFile(buffer, mimeType, displayName) {
  const numBytes = buffer.length;

  const startRes = await fetch(`${UPLOAD_BASE}/files`, {
    method: 'POST',
    headers: apiHeaders({
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(numBytes),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
  });

  if (!startRes.ok) {
    let data;
    try {
      data = await startRes.json();
    } catch {
      data = null;
    }
    return { error: formatApiError(data) || 'Gemini 파일 업로드 시작에 실패했습니다.' };
  }

  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    return { error: 'Gemini 업로드 URL을 받지 못했습니다.' };
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(numBytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type': mimeType,
    },
    body: buffer,
  });

  let data;
  try {
    data = await uploadRes.json();
  } catch {
    return { error: 'Gemini 파일 업로드 응답을 해석할 수 없습니다.' };
  }

  if (!uploadRes.ok) {
    return { error: formatApiError(data) || 'Gemini 파일 업로드에 실패했습니다.' };
  }

  return { file: data.file };
}

async function waitForFileActive(fileName, mimeType) {
  const deadline = Date.now() + (mimeType.startsWith('audio/') ? AUDIO_POLL_MAX_MS : FILE_POLL_MAX_MS);

  while (Date.now() < deadline) {
    const res = await fetch(`${GEMINI_API_BASE}/${fileName}`, {
      method: 'GET',
      headers: apiHeaders(),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      return { error: 'Gemini 파일 상태 조회에 실패했습니다.' };
    }

    if (!res.ok) {
      return { error: formatApiError(data) || 'Gemini 파일 상태 조회에 실패했습니다.' };
    }

    const state = data?.state || data?.file?.state;
    if (state === 'ACTIVE') {
      return { file: data.file || data };
    }
    if (state === 'FAILED') {
      return { error: 'Gemini 파일 처리에 실패했습니다.' };
    }

    await sleep(FILE_POLL_INTERVAL_MS);
  }

  return { error: 'Gemini 파일 처리 시간이 초과되었습니다.' };
}

async function deleteFile(fileName) {
  if (!fileName) return;

  try {
    await fetch(`${GEMINI_API_BASE}/${fileName}`, {
      method: 'DELETE',
      headers: apiHeaders(),
    });
  } catch (err) {
    console.warn('[analyze-file] delete failed:', err.message);
  }
}

async function generateAnalysis({ fileUri, mimeType, prompt, model }) {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { mimeType, fileUri } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
      },
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    return { error: 'Gemini 분석 응답을 해석할 수 없습니다.' };
  }

  if (!response.ok) {
    return { error: formatApiError(data) || 'Gemini 분석 요청에 실패했습니다.' };
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('') || '';

  if (!text) {
    const blockReason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    return {
      error: blockReason ? `Gemini 응답 차단: ${blockReason}` : 'Gemini가 분석 결과를 반환하지 않았습니다.',
    };
  }

  return { text };
}

async function handleAnalyzeFile(input) {
  const validated = validateInput(input);
  if (validated.status) return validated;

  const { prompt, fileBuffer, fileName, mimeType } = validated;
  const model = DEFAULT_MODEL;
  let geminiFileName = null;

  try {
    const uploadResult = await uploadFile(fileBuffer, mimeType, fileName);
    if (uploadResult.error) {
      return { status: 502, body: { error: uploadResult.error } };
    }

    const uploaded = uploadResult.file;
    geminiFileName = uploaded?.name;

    if (!uploaded?.uri || !geminiFileName) {
      return { status: 502, body: { error: 'Gemini 파일 URI를 받지 못했습니다.' } };
    }

    let activeFile = uploaded;
    if (uploaded.state !== 'ACTIVE') {
      const waitResult = await waitForFileActive(geminiFileName, mimeType);
      if (waitResult.error) {
        return { status: 502, body: { error: waitResult.error } };
      }
      activeFile = waitResult.file;
    }

    const fileUri = activeFile.uri;
    const activeMime = activeFile.mimeType || activeFile.mime_type || mimeType;

    const analysisResult = await generateAnalysis({
      fileUri,
      mimeType: activeMime,
      prompt,
      model,
    });

    if (analysisResult.error) {
      return { status: 502, body: { error: analysisResult.error } };
    }

    return {
      status: 200,
      body: {
        analysis: analysisResult.text,
        model,
        file: {
          name: fileName,
          mimeType,
          sizeBytes: fileBuffer.length,
        },
      },
    };
  } catch (err) {
    console.error('[analyze-file]', err.message);
    return { status: 502, body: { error: '파일 분석 중 오류가 발생했습니다.' } };
  } finally {
    await deleteFile(geminiFileName);
  }
}

async function handleAnalyzeFileRequest(req) {
  try {
    const parsed = await parseRequest(req);
    if (parsed.error) return parsed.error;

    return await handleAnalyzeFile(parsed.data);
  } catch (err) {
    console.error('[analyze-file/request]', err.message);
    return { status: 500, body: { error: err.message || '파일 분석 요청 처리에 실패했습니다.' } };
  }
}

function getHealthResponse() {
  return {
    status: 200,
    body: {
      service: 'analyze-file',
      configured: isConfigured(),
      model: DEFAULT_MODEL,
      maxFileBytes: MAX_FILE_BYTES,
      supportedMimeTypes: [...ALLOWED_MIME_TYPES],
      accepts: ['multipart/form-data (fields: file, prompt)', 'application/json (file.data base64, prompt)'],
    },
  };
}

module.exports = {
  handleAnalyzeFile,
  handleAnalyzeFileRequest,
  getHealthResponse,
  MAX_FILE_BYTES,
  ALLOWED_MIME_TYPES,
};
