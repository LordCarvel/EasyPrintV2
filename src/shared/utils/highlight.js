
export const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const clampTone = (tone) => {
  if (!Number.isFinite(tone)) return 50;
  return Math.min(100, Math.max(0, tone));
};

const bgFromTone = (tone) => `hsl(0, 0%, ${clampTone(tone)}%)`;
const textFromTone = (tone) => (clampTone(tone) > 60 ? '#000000' : '#FFFFFF');

const escapeRegex = (word = '') => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wrapContent = (content, entry) => {
  const bg = bgFromTone(entry.tone);
  const color = textFromTone(entry.tone);
  const base =
    `background-color:${bg};color:${color};padding:2px 6px;border-radius:6px;` +
    `font-size:${entry.fontSize || 14}px;display:inline-block;`;

  const style =
    entry.highlightType === 'box'
      ? `${base}border:2px solid ${color};font-weight:700;`
      : `${base}font-weight:700;`;

  return `<span data-kw-highlight="1" style="${style}">${content}</span>`;
};

export const buildHighlighter = (topics = []) => {
  const normalizedTopics = Array.isArray(topics)
    ? topics
        .map((t) => ({
          words: Array.isArray(t?.words) ? t.words.filter(Boolean) : [],
          tone: t?.tone ?? 50,
          fontSize: t?.fontSize ?? 14,
          highlightMode: t?.highlightMode === 'line' ? 'line' : 'word',
          highlightType: t?.highlightType === 'box' ? 'box' : 'bold'
        }))
        .filter((t) => t.words.length)
    : [];

  if (!normalizedTopics.length) {
    return (text = '') => escapeHtml(text ?? '');
  }
  const entries = normalizedTopics
    .flatMap((topic) => topic.words.map((word) => ({ ...topic, word })))
    .sort((a, b) => b.word.length - a.word.length);

  return (text = '') => {
    let output = escapeHtml(text ?? '');
    if (!output) return '';

    entries.forEach((entry) => {
      if (!entry.word) return;
      const lowerWord = entry.word.toLowerCase();

      if (entry.highlightMode === 'line') {
        if (output.toLowerCase().includes(lowerWord) && !output.includes('data-kw-highlight')) {
          output = wrapContent(output, entry);
        }
        return;
      }
      const escapedWord = escapeRegex(entry.word);
      const boundaryRegex = new RegExp(
        `(^|[^\\p{L}\\p{N}_])(${escapedWord})(?=$|[^\\p{L}\\p{N}_])`,
        'giu'
      );
      output = output.replace(boundaryRegex, (match, prefix, found) => `${prefix}${wrapContent(found, entry)}`);
    });

    return output;
  };
};

