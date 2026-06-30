/**
 * 보고서 상세 페이지를 Open Graph 메타태그와 함께 동적 렌더링
 * (카카오톡 등 링크 미리보기에서 보고서 제목·요약·그림이 보이도록)
 */

const fs = require('fs');
const path = require('path');
const { getReportById } = require('./reports-db');

const TEMPLATE_PATH = path.join(__dirname, '..', 'report.html');
const SITE_NAME = '그림일기 & 리서치 보고서 아카이브';

let cachedTemplate = null;

function getTemplate() {
  if (cachedTemplate == null) {
    cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  }
  return cachedTemplate;
}

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(text, max) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function buildOgTags({ title, description, image, url }) {
  const lines = [
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}">`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
  ];
  if (url) lines.push(`<meta property="og:url" content="${escapeAttr(url)}">`);
  if (image) {
    lines.push(`<meta property="og:image" content="${escapeAttr(image)}">`);
    lines.push(`<meta name="twitter:card" content="summary_large_image">`);
  } else {
    lines.push(`<meta name="twitter:card" content="summary">`);
  }
  lines.push(`<meta name="twitter:title" content="${escapeAttr(title)}">`);
  lines.push(`<meta name="twitter:description" content="${escapeAttr(description)}">`);
  if (image) lines.push(`<meta name="twitter:image" content="${escapeAttr(image)}">`);
  return lines.join('\n  ');
}

async function renderReportPage(id, baseUrl) {
  const template = getTemplate();

  let og;
  let pageTitle = SITE_NAME;

  const numId = Number(id);
  if (Number.isInteger(numId) && numId > 0) {
    const result = await getReportById(numId);
    if (result.status === 200 && result.body?.report) {
      const r = result.body.report;
      const title = r.title || SITE_NAME;
      const description = truncate(r.summary || r.content || '', 150) || SITE_NAME;
      pageTitle = `${title} — ${SITE_NAME}`;
      og = buildOgTags({
        title,
        description,
        image: r.image_url || null,
        url: baseUrl ? `${baseUrl}/report?id=${encodeURIComponent(numId)}` : null,
      });
    }
  }

  if (!og) {
    og = buildOgTags({
      title: SITE_NAME,
      description: '여행 그림일기와 리서치 보고서를 모아둔 아카이브',
      image: null,
      url: baseUrl || null,
    });
  }

  return template.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeAttr(pageTitle)}</title>\n  ${og}`
  );
}

module.exports = {
  SITE_NAME,
  renderReportPage,
};
