import { GDocsDocument, GDocsParagraph, GDocsTextRun } from '../types';

export function requestsToMarkdown(doc: GDocsDocument): string {
  let result = '';

  for (const element of doc.body.content) {
    const para = element.paragraph;
    if (!para) continue;

    const bullet = para.bullet;
    const listId = bullet?.listId;
    const list = listId ? doc.lists?.[listId] : undefined;
    const nestingLevel = list?.listProperties?.nestingLevels?.[bullet?.nestingLevel ?? 0];

    const isCheckbox = nestingLevel?.glyphFormat === '[%0]' ||
      (nestingLevel?.glyphType === 'GLYPH_TYPE_UNSPECIFIED' && !nestingLevel?.glyphFormat);

    const isBullet = !!bullet;

    // Determine if this is a checked checkbox: any text run has strikethrough
    const isChecked = isCheckbox &&
      para.elements.some(el => el.textRun?.textStyle?.strikethrough === true);

    // Build styled text from runs in order (fixes multi-occurrence bug)
    const lineText = buildLineText(para);

    // An empty paragraph (only whitespace/newline) becomes a blank line
    const trimmed = lineText.replace(/\n$/, '');
    if (trimmed === '') {
      result += '\n';
      continue;
    }

    // Paragraph-level prefix
    let prefix = '';
    if (isCheckbox) {
      prefix = isChecked ? '- [x] ' : '- [ ] ';
    } else if (isBullet) {
      prefix = '- ';
    } else {
      const style = para.paragraphStyle?.namedStyleType ?? '';
      if (style.startsWith('HEADING_')) {
        const level = parseInt(style.replace('HEADING_', ''), 10);
        prefix = '#'.repeat(level) + ' ';
      }
    }

    result += prefix + trimmed + '\n';
  }

  return result;
}

function buildLineText(para: GDocsParagraph): string {
  let text = '';
  for (const el of para.elements) {
    const run = el.textRun;
    if (!run?.content) continue;
    text += decorateRun(run);
  }
  return text;
}

function decorateRun(run: GDocsTextRun): string {
  const content = run.content ?? '';
  const style = run.textStyle;
  if (!style) return content;

  // Strip trailing newline before decorating, re-add after
  const trailingNewline = content.endsWith('\n') ? '\n' : '';
  const inner = content.slice(0, content.length - trailingNewline.length);
  if (!inner) return content;

  if (style.weightedFontFamily?.fontFamily === 'Courier New') {
    return '`' + inner + '`' + trailingNewline;
  }
  if (style.link?.url) {
    return '[' + inner + '](' + style.link.url + ')' + trailingNewline;
  }
  let s = inner;
  if (style.bold) s = '**' + s + '**';
  if (style.italic) s = '*' + s + '*';
  if (style.underline && !style.link) s = '__' + s + '__';
  return s + trailingNewline;
}
