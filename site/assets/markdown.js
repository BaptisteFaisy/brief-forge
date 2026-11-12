// Tiny Markdown renderer for brief payloads.
//
// The source content is foreign data (Jira tickets, comments, Confluence):
// HTML is escaped FIRST, then a small, allow-listed subset of Markdown is
// applied on the escaped text. Nothing can become executable markup.

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Escape HTML so no tag/attribute can survive from foreign data. */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `[/browse/PAY-1]`, `https://…`, `mailto:…` are fine; anything else is text. */
function safeHref(url) {
  const target = String(url).trim();
  if (target.startsWith('/') || target.startsWith('.') || target.startsWith('#')) {
    return target;
  }
  try {
    const parsed = new URL(target, 'https://example.invalid');
    return SAFE_PROTOCOLS.has(parsed.protocol) ? target : null;
  } catch {
    return null;
  }
}

/** Inline: `code`, **bold**, _italic_, [label](url). Input is already escaped. */
function renderInline(text) {
  let out = '';
  const parts = text.split('`');
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 1) {
      out += `<code>${parts[i]}</code>`;
      continue;
    }
    let chunk = parts[i]
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/_([^_]+)_/g, '<em>$1</em>');
    chunk = chunk.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, url) => {
      const href = safeHref(url);
      return href === null
        ? label
        : `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${label}</a>`;
    });
    out += chunk;
  }
  return out;
}

/** Render a Markdown string into safe HTML restricted to the subset used by briefs. */
export function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').split(/\r?\n/);
  const html = [];
  const blocks = [];
  let list = null; // { type: 'ul' | 'ol', items: [] }

  const flushList = () => {
    if (!list || list.items.length === 0) return;
    const tag = list.type;
    const items = list.items.map((i) => `<li>${i}</li>`).join('');
    blocks.push(`<${tag}>${items}</${tag}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushList();
      blocks.push('<hr>');
      continue;
    }
    if (line.startsWith('>')) {
      flushList();
      const text = line.replace(/^>\s?/, '');
      const last = blocks[blocks.length - 1];
      if (last && last.startsWith('<blockquote>')) {
        blocks[blocks.length - 1] = last.slice(0, -'</blockquote>'.length)
          + `<p>${renderInline(escapeHtml(text))}</p></blockquote>`;
      } else {
        blocks.push(`<blockquote><p>${renderInline(escapeHtml(text))}</p></blockquote>`);
      }
      continue;
    }
    const ul = /^\s*-\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      const content = renderInline(escapeHtml((ul || ol)[1]));
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [content] };
      } else {
        list.items.push(content);
      }
      continue;
    }
    if (line.trim() === '') {
      flushList();
      continue;
    }
    flushList();
    blocks.push(`<p>${renderInline(escapeHtml(line.trim()))}</p>`);
  }
  flushList();
  return blocks.join('\n');
}