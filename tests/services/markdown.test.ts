import { describe, it, expect } from 'vitest';
import { requestsToMarkdown } from '../../src/services/markdown';
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
