import { describe, it, expect } from 'vitest';
import { requestsToMarkdown, markdownToRequests } from '../../src/services/markdown';
import { GDocsDocument, GDocsParagraph } from '../../src/types';

function doc(paragraphs: GDocsParagraph[]): GDocsDocument {
  return {
    documentId: 'd',
    title: 'T',
    body: {
      content: paragraphs.map((p, i) => ({
        startIndex: i * 10,
        endIndex: i * 10 + 10,
        paragraph: p,
      })),
    },
  };
}

function textPara(text: string, namedStyleType?: string): GDocsParagraph {
  return {
    elements: [{ textRun: { content: text } }],
    paragraphStyle: namedStyleType ? { namedStyleType } : undefined,
  };
}

function boldPara(plainText: string, boldText: string): GDocsParagraph {
  const before = plainText.slice(0, plainText.indexOf(boldText));
  const after = plainText.slice(plainText.indexOf(boldText) + boldText.length);
  return {
    elements: [
      ...(before ? [{ textRun: { content: before } }] : []),
      { textRun: { content: boldText, textStyle: { bold: true } } },
      ...(after ? [{ textRun: { content: after } }] : []),
    ],
  };
}

describe('requestsToMarkdown', () => {
  it('renders a plain paragraph', () => {
    expect(requestsToMarkdown(doc([textPara('Hello world\n')]))).toBe('Hello world\n');
  });

  it('renders H1 through H3 headings', () => {
    const result = requestsToMarkdown(doc([
      textPara('Title\n', 'HEADING_1'),
      textPara('Sub\n', 'HEADING_2'),
      textPara('Sub-sub\n', 'HEADING_3'),
    ]));
    expect(result).toContain('# Title');
    expect(result).toContain('## Sub');
    expect(result).toContain('### Sub-sub');
  });

  it('renders a bullet list', () => {
    const para: GDocsParagraph = {
      elements: [{ textRun: { content: 'Item one\n' } }],
      bullet: { listId: 'list1' },
    };
    const d: GDocsDocument = {
      documentId: 'd', title: 'T',
      body: { content: [{ paragraph: para }] },
      lists: { list1: { listProperties: { nestingLevels: [{ glyphType: 'DISC' }] } } },
    };
    expect(requestsToMarkdown(d)).toContain('- Item one');
  });

  it('renders a numbered list as 1. prefix', () => {
    const para: GDocsParagraph = {
      elements: [{ textRun: { content: 'First item\n' } }],
      bullet: { listId: 'list1' },
    };
    const d: GDocsDocument = {
      documentId: 'd', title: 'T',
      body: { content: [{ paragraph: para }] },
      lists: { list1: { listProperties: { nestingLevels: [{ glyphType: 'DECIMAL' }] } } },
    };
    expect(requestsToMarkdown(d)).toContain('1. First item');
  });

  it('renders an unchecked checkbox', () => {
    const para: GDocsParagraph = {
      elements: [{ textRun: { content: 'Task\n' } }],
      bullet: { listId: 'list1' },
    };
    const d: GDocsDocument = {
      documentId: 'd', title: 'T',
      body: { content: [{ paragraph: para }] },
      lists: { list1: { listProperties: { nestingLevels: [{ glyphFormat: '[%0]' }] } } },
    };
    expect(requestsToMarkdown(d)).toContain('- [ ] Task');
  });

  it('renders a checked checkbox (strikethrough text run)', () => {
    const para: GDocsParagraph = {
      elements: [{ textRun: { content: 'Done\n', textStyle: { strikethrough: true } } }],
      bullet: { listId: 'list1' },
    };
    const d: GDocsDocument = {
      documentId: 'd', title: 'T',
      body: { content: [{ paragraph: para }] },
      lists: { list1: { listProperties: { nestingLevels: [{ glyphFormat: '[%0]' }] } } },
    };
    expect(requestsToMarkdown(d)).toContain('- [x] Done');
  });

  it('renders bold inline text', () => {
    expect(requestsToMarkdown(doc([boldPara('Say hello world ok\n', 'hello world')]))).toContain('**hello world**');
  });

  it('renders italic inline text', () => {
    const para: GDocsParagraph = {
      elements: [{ textRun: { content: 'em\n', textStyle: { italic: true } } }],
    };
    expect(requestsToMarkdown(doc([para]))).toContain('*em*');
  });

  it('renders inline code (Courier New)', () => {
    const para: GDocsParagraph = {
      elements: [{ textRun: { content: 'foo\n', textStyle: { weightedFontFamily: { fontFamily: 'Courier New' } } } }],
    };
    expect(requestsToMarkdown(doc([para]))).toContain('`foo`');
  });

  it('renders a hyperlink', () => {
    const para: GDocsParagraph = {
      elements: [{ textRun: { content: 'click\n', textStyle: { link: { url: 'https://example.com' } } } }],
    };
    expect(requestsToMarkdown(doc([para]))).toContain('[click](https://example.com)');
  });

  it('preserves empty paragraphs as blank lines (bug fix)', () => {
    const result = requestsToMarkdown(doc([
      textPara('First\n'),
      textPara('\n'),
      textPara('Third\n'),
    ]));
    expect(result).toContain('First\n\nThird');
  });

  it('does not replace all occurrences of same text (bug fix)', () => {
    // Two text runs with different styles but same content
    const para: GDocsParagraph = {
      elements: [
        { textRun: { content: 'foo ' } },
        { textRun: { content: 'foo', textStyle: { bold: true } } },
        { textRun: { content: '\n' } },
      ],
    };
    const result = requestsToMarkdown(doc([para]));
    expect(result).toBe('foo **foo**\n');
  });
});

describe('markdownToRequests', () => {
  it('returns plain text with no requests for a plain paragraph', () => {
    const { plainText, paragraphRequests, inlineRequests } = markdownToRequests('Hello world');
    expect(plainText).toBe('Hello world');
    expect(paragraphRequests).toHaveLength(0);
    expect(inlineRequests).toHaveLength(0);
  });

  it('strips # prefix and emits heading paragraph request', () => {
    const { plainText, paragraphRequests } = markdownToRequests('# My Heading\nBody');
    expect(plainText).toBe('My Heading\nBody');
    expect(paragraphRequests.some(r => r.updateParagraphStyle?.paragraphStyle.namedStyleType === 'HEADING_1')).toBe(true);
  });

  it('strips - prefix and emits bullet paragraph request', () => {
    const { plainText, paragraphRequests } = markdownToRequests('- Item one');
    expect(plainText).toBe('Item one');
    expect(paragraphRequests.some(r => r.createParagraphBullets?.bulletPreset === 'BULLET_DISC_CIRCLE_SQUARE')).toBe(true);
  });

  it('handles unchecked checkbox (- [ ] )', () => {
    const { plainText, paragraphRequests } = markdownToRequests('- [ ] Todo');
    expect(plainText).toBe('Todo');
    expect(paragraphRequests.some(r => r.createParagraphBullets?.bulletPreset === 'BULLET_CHECKBOX')).toBe(true);
  });

  it('handles checked checkbox (- [x] ) with strikethrough inline request', () => {
    const { plainText, paragraphRequests, inlineRequests } = markdownToRequests('- [x] Done');
    expect(plainText).toBe('Done');
    expect(paragraphRequests.some(r => r.createParagraphBullets?.bulletPreset === 'BULLET_CHECKBOX')).toBe(true);
    expect(inlineRequests.some(r => r.updateTextStyle?.textStyle.strikethrough === true)).toBe(true);
  });

  it('strips ** and emits bold inline request', () => {
    const { plainText, inlineRequests } = markdownToRequests('Say **hello** world');
    expect(plainText).toBe('Say hello world');
    expect(inlineRequests.some(r => r.updateTextStyle?.textStyle.bold === true)).toBe(true);
  });

  it('strips * and emits italic inline request', () => {
    const { plainText, inlineRequests } = markdownToRequests('Say *hi* now');
    expect(plainText).toBe('Say hi now');
    expect(inlineRequests.some(r => r.updateTextStyle?.textStyle.italic === true)).toBe(true);
  });

  it('strips backticks and emits code inline request (Courier New)', () => {
    const { plainText, inlineRequests } = markdownToRequests('Use `npm test`');
    expect(plainText).toBe('Use npm test');
    expect(inlineRequests.some(r => r.updateTextStyle?.textStyle.weightedFontFamily?.fontFamily === 'Courier New')).toBe(true);
  });

  it('strips [text](url) and emits link inline request', () => {
    const { plainText, inlineRequests } = markdownToRequests('[click here](https://example.com)');
    expect(plainText).toBe('click here');
    expect(inlineRequests.some(r => r.updateTextStyle?.textStyle.link?.url === 'https://example.com')).toBe(true);
  });

  it('skips overlapping inline matches', () => {
    // **bold *and italic** should not produce nested match
    const { inlineRequests } = markdownToRequests('**bold *and italic**');
    expect(inlineRequests.some(r => r.updateTextStyle?.textStyle.bold === true)).toBe(true);
    // italic match inside bold should be skipped (overlapping)
    expect(inlineRequests.filter(r => r.updateTextStyle?.textStyle.italic === true)).toHaveLength(0);
  });

  it('inline request indices start at 1 (GDocs offset)', () => {
    const { inlineRequests } = markdownToRequests('**hi**');
    const boldReq = inlineRequests.find(r => r.updateTextStyle?.textStyle.bold);
    expect(boldReq?.updateTextStyle?.range.startIndex).toBe(1);
    expect(boldReq?.updateTextStyle?.range.endIndex).toBe(3); // 'hi' = 2 chars, starts at 1
  });

  it('handles emoji in inline text without index misalignment (utf16Len = s.length)', () => {
    const { plainText, inlineRequests } = markdownToRequests('Say **hi 👋** ok');
    expect(plainText).toBe('Say hi 👋 ok');
    const boldReq = inlineRequests.find(r => r.updateTextStyle?.textStyle.bold);
    // offset 1, 'Say ' = 4 UTF-16 units → startIndex = 5
    // 'hi 👋' = h(1)+i(1)+space(1)+👋(2) = 5 UTF-16 units → endIndex = 10
    expect(boldReq?.updateTextStyle?.range.startIndex).toBe(5);
    expect(boldReq?.updateTextStyle?.range.endIndex).toBe(10);
  });
});

describe('round-trip: markdownToRequests → requestsToMarkdown', () => {
  function simulateDoc(body: string): import('../../src/types').GDocsDocument {
    // Build a minimal GDocsDocument from the plainText + paragraph structure
    // This is a simplified simulation — real round-trip goes through GDocs API
    const { plainText, paragraphRequests } = markdownToRequests(body);
    // Split and drop trailing empty string produced by a trailing '\n'
    const allLines = plainText.split('\n');
    const lines = allLines[allLines.length - 1] === '' ? allLines.slice(0, -1) : allLines;
    const content = lines.map((line, i) => {
      const req = paragraphRequests.find(r =>
        r.updateParagraphStyle && r.updateParagraphStyle.range.startIndex === (i === 0 ? 1 : lines.slice(0, i).join('\n').length + 2)
      );
      const namedStyleType = req?.updateParagraphStyle?.paragraphStyle.namedStyleType;
      return {
        paragraph: {
          elements: [{ textRun: { content: line + '\n' } }],
          paragraphStyle: namedStyleType ? { namedStyleType } : undefined,
        },
      };
    });
    return { documentId: 'd', title: 'T', body: { content } };
  }

  it('plain paragraph round-trips', () => {
    const body = 'Hello world\n';
    expect(requestsToMarkdown(simulateDoc(body))).toBe(body);
  });

  it('heading round-trips', () => {
    const body = '# Title\n';
    expect(requestsToMarkdown(simulateDoc(body))).toBe(body);
  });
});
