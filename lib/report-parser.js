/**
 * Gemini 보고서 텍스트 파싱
 */

function parseReport(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('보고서 내용이 비어 있습니다.');
  }

  const cleaned = text.trim();

  const title = extractSection(cleaned, '제목');
  const summary = extractSection(cleaned, '요약');
  const bodyBlock = extractSection(cleaned, '본문');

  let body = bodyBlock;
  let sources = '';

  const sourcesMatch = bodyBlock.match(
    /^([\s\S]*?)(?:\n\s*4\.\s*참고(?:한)?\s*출처[^\n]*\n)([\s\S]*)$/i
  );

  if (sourcesMatch) {
    body = sourcesMatch[1].trim();
    sources = sourcesMatch[2].trim();
  } else {
    const inlineSources = bodyBlock.match(/^([\s\S]*?)(?:\n\s*4\.\s*[\s\S]*)$/);
    if (inlineSources && /참고.*출처/i.test(bodyBlock)) {
      const splitIndex = bodyBlock.search(/\n\s*4\.\s*/);
      if (splitIndex >= 0) {
        body = bodyBlock.slice(0, splitIndex).trim();
        sources = bodyBlock
          .slice(splitIndex)
          .replace(/^\s*4\.\s*참고(?:한)?\s*출처[^\n]*\n?/i, '')
          .trim();
      }
    }
  }

  return {
    title: title || '제목 없음',
    summary: summary || '',
    body: body || '',
    sources: sources || '',
  };
}

function extractSection(text, label) {
  const pattern = new RegExp(
    `\\[${label}\\]\\s*([\\s\\S]*?)(?=\\n\\[(?:제목|요약|본문)\\]|$)`,
    'i'
  );
  const match = text.match(pattern);
  return match?.[1]?.trim() || '';
}

module.exports = {
  parseReport,
};
