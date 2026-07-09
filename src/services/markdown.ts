import { GDocsDocument, GDocsParagraph, GDocsTextRun, GDocsRequest } from '../types';

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

// ── markdownToRequests ───────────────────────────────────────────────────────

export interface FormattedDoc {
  plainText: string;
  paragraphRequests: GDocsRequest[];
  inlineRequests: GDocsRequest[];
}

interface InlineMatch {
  originalStart: number;
  originalEnd: number;
  content: string;
  style: 'bold' | 'italic' | 'underline' | 'code' | 'strikethrough' | { link: string };
}

export function markdownToRequests(body: string): FormattedDoc {
  let plainText = '';
  const paragraphRequests: GDocsRequest[] = [];
  const inlineRequests: GDocsRequest[] = [];
  let currentOffset = 1; // GDocs body starts at index 1

  const lines = body.split('\n');

  for (let idx = 0; idx < lines.length; idx++) {
    const isLastLine = idx === lines.length - 1;
    let lineContent = lines[idx];

    // 1. Checkbox check — MUST come before bare bullet check
    let bulletPreset: string | null = null;
    let isCheckedCheckbox = false;

    const trimmed = lineContent.trimStart();
    const indent = lineContent.length - trimmed.length;
    const indentStr = lineContent.slice(0, indent);

    if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('* [ ] ')) {
      bulletPreset = 'BULLET_CHECKBOX';
      lineContent = indentStr + trimmed.slice(6);
    } else if (trimmed.startsWith('- [x] ') || trimmed.startsWith('* [x] ')) {
      bulletPreset = 'BULLET_CHECKBOX';
      isCheckedCheckbox = true;
      lineContent = indentStr + trimmed.slice(6);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ')) {
      bulletPreset = 'BULLET_DISC_CIRCLE_SQUARE';
      lineContent = indentStr + trimmed.slice(2);
    } else if (/^\d+\. /.test(trimmed)) {
      bulletPreset = 'NUMBERED_DECIMAL_ALPHA_ROMAN';
      lineContent = indentStr + trimmed.replace(/^\d+\. /, '');
    }

    // 2. Heading check
    let headingLevel: number | null = null;
    const headingMatch = lineContent.match(/^(#{1,6}) (.*)$/);
    if (headingMatch) {
      headingLevel = headingMatch[1].length;
      lineContent = headingMatch[2];
    }

    // 3. Parse inline styles, get clean text and requests
    const { cleanedLine, lineInlineRequests } = parseInline(lineContent, currentOffset);

    const lineWithNewline = cleanedLine + (isLastLine ? '' : '\n');
    plainText += lineWithNewline;

    inlineRequests.push(...lineInlineRequests);

    // Paragraph range: include the newline. Last line gets +1 for doc's trailing newline.
    const rangeLen = utf16Len(lineWithNewline) + (isLastLine ? 1 : 0);
    const paraRange = { startIndex: currentOffset, endIndex: currentOffset + rangeLen };
    const textRange = { startIndex: currentOffset, endIndex: currentOffset + utf16Len(cleanedLine) };

    // 4. Apply bullet/checkbox
    if (bulletPreset && paraRange.startIndex < paraRange.endIndex) {
      paragraphRequests.push({ createParagraphBullets: { range: paraRange, bulletPreset } });
    }

    // 5. Strikethrough for checked checkbox
    if (isCheckedCheckbox && textRange.startIndex < textRange.endIndex) {
      inlineRequests.push({
        updateTextStyle: { range: textRange, textStyle: { strikethrough: true }, fields: 'strikethrough' },
      });
    }

    // 6. Heading style
    if (headingLevel !== null && paraRange.startIndex < paraRange.endIndex) {
      paragraphRequests.push({
        updateParagraphStyle: {
          range: paraRange,
          paragraphStyle: { namedStyleType: `HEADING_${headingLevel}` },
          fields: 'namedStyleType',
        },
      });
    }

    currentOffset += utf16Len(lineWithNewline);
  }

  return { plainText, paragraphRequests, inlineRequests };
}

function utf16Len(s: string): number {
  let len = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    len += (code >= 0xD800 && code <= 0xDBFF) ? 2 : 1;
  }
  return len;
}

function parseInline(
  text: string,
  baseOffset: number,
): { cleanedLine: string; lineInlineRequests: GDocsRequest[] } {
  const matches: InlineMatch[] = [];

  const patterns: Array<[RegExp, InlineMatch['style']]> = [
    [/\*\*(.*?)\*\*/g, 'bold'],
    [/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, 'italic'],
    [/__(.*?)__/g, 'underline'],
    [/`(.*?)`/g, 'code'],
  ];

  for (const [re, style] of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        originalStart: m.index,
        originalEnd: m.index + m[0].length,
        content: m[1],
        style,
      });
    }
  }

  // Links [text](url)
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(text)) !== null) {
    matches.push({
      originalStart: lm.index,
      originalEnd: lm.index + lm[0].length,
      content: lm[1],
      style: { link: lm[2] },
    });
  }

  // Sort by position; skip overlapping
  matches.sort((a, b) => a.originalStart - b.originalStart);

  let cleanedLine = '';
  const lineInlineRequests: GDocsRequest[] = [];
  let lastOriginal = 0;
  let cleanOffset = 0;

  for (const m of matches) {
    if (m.originalStart < lastOriginal) continue; // overlapping — skip

    // Add text before this match
    const prefix = text.slice(lastOriginal, m.originalStart);
    cleanedLine += prefix;
    cleanOffset += utf16Len(prefix);

    const cleanStart = baseOffset + cleanOffset;
    cleanedLine += m.content;
    const cleanEnd = cleanStart + utf16Len(m.content);
    cleanOffset += utf16Len(m.content);

    if (cleanStart < cleanEnd) {
      const range = { startIndex: cleanStart, endIndex: cleanEnd };
      const s = m.style;
      if (s === 'bold') {
        lineInlineRequests.push({ updateTextStyle: { range, textStyle: { bold: true }, fields: 'bold' } });
      } else if (s === 'italic') {
        lineInlineRequests.push({ updateTextStyle: { range, textStyle: { italic: true }, fields: 'italic' } });
      } else if (s === 'underline') {
        lineInlineRequests.push({ updateTextStyle: { range, textStyle: { underline: true }, fields: 'underline' } });
      } else if (s === 'code') {
        lineInlineRequests.push({ updateTextStyle: { range, textStyle: { weightedFontFamily: { fontFamily: 'Courier New' } }, fields: 'weightedFontFamily' } });
      } else if (typeof s === 'object' && 'link' in s) {
        lineInlineRequests.push({ updateTextStyle: { range, textStyle: { link: { url: s.link } }, fields: 'link' } });
      }
    }

    lastOriginal = m.originalEnd;
  }

  // Remaining text after last match
  cleanedLine += text.slice(lastOriginal);

  return { cleanedLine, lineInlineRequests };
}
