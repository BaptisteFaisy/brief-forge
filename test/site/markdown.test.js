const { renderMarkdown, escapeHtml } = require('../../site/assets/markdown.js');

describe('markdown renderer', () => {
  test('escapes HTML before anything else (no injection)', () => {
    const out = renderMarkdown('Hello <script>alert(1)</script> & <b>bold</b>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(out).toContain('&amp;');
  });

  test('renders h1/h2/h3 headings', () => {
    const out = renderMarkdown('# Un\n\n## Deux\n\n### Trois');
    expect(out).toContain('<h1>Un</h1>');
    expect(out).toContain('<h2>Deux</h2>');
    expect(out).toContain('<h3>Trois</h3>');
  });

  test('renders bold, italic and inline code on escaped text', () => {
    const out = renderMarkdown('**gras** _italique_ `ben <code>`');
    expect(out).toContain('<strong>gras</strong>');
    expect(out).toContain('<em>italique</em>');
    expect(out).toContain('<code>ben &lt;code&gt;</code>');
  });

  test('groups consecutive blockquotes', () => {
    const out = renderMarkdown('> ligne un\n> ligne deux');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<p>ligne un</p>');
    expect(out).toContain('<p>ligne deux</p>');
    expect(out.match(/<blockquote>/g)).toHaveLength(1);
  });

  test('renders unordered and ordered lists', () => {
    const out = renderMarkdown('- a\n- b\n\n1. un\n2. deux');
    expect(out).toContain('<ul><li>a</li><li>b</li></ul>');
    expect(out).toContain('<ol><li>un</li><li>deux</li></ol>');
  });

  test('renders safe links but drops javascript: URLs', () => {
    const out = renderMarkdown('[doc](/browse/PAY-6) and [x](javascript:alert(1))');
    expect(out).toContain('<a href="/browse/PAY-6" rel="noopener noreferrer">doc</a>');
    expect(out).not.toContain('href="javascript:');
  });

  test('renders a horizontal rule for ---', () => {
    expect(renderMarkdown('avant\n\n---\n\naprès')).toContain('<hr>');
  });

  test('escapeHtml escapes the five special characters', () => {
    expect(escapeHtml(`<a href="x">'&`))
      .toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });
});