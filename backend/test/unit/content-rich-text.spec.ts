import { ContentException } from '../../src/content/content.errors';
import {
    assertSafeRichText,
    richTextHash,
    richTextPlainText,
    type SafeRichTextDocument,
} from '../../src/content/content-rich-text';

describe('content rich text boundary', () => {
    const safe: SafeRichTextDocument = {
        format: 'SAFE_RICH_TEXT_V1',
        blocks: [
            {
                kind: 'HEADING',
                headingLevel: 2,
                inlines: [{ text: 'Безопасный заголовок', marks: ['STRONG'] }],
            },
            {
                kind: 'PARAGRAPH',
                inlines: [{ text: 'Источник', href: 'https://example.test/article' }],
            },
        ],
    };

    it('accepts the closed SAFE_RICH_TEXT_V1 vocabulary deterministically', () => {
        expect(() => {
            assertSafeRichText(safe);
        }).not.toThrow();
        expect(richTextPlainText(safe)).toBe('Безопасный заголовок Источник');
        expect(richTextHash(safe)).toMatch(/^[0-9a-f]{64}$/u);
        expect(richTextHash(safe)).toBe(richTextHash(structuredClone(safe)));
    });

    it.each([
        { ...safe, script: 'alert(1)' },
        { format: 'SAFE_RICH_TEXT_V1', blocks: [{ kind: 'PARAGRAPH', inlines: [{ text: 'x', onclick: 'x' }] }] },
        {
            format: 'SAFE_RICH_TEXT_V1',
            blocks: [{ kind: 'PARAGRAPH', inlines: [{ text: '<script>x</script>', href: 'javascript:x' }] }],
        },
        { format: 'SAFE_RICH_TEXT_V1', blocks: [{ kind: 'IFRAME', inlines: [{ text: 'x' }] }] },
        { format: 'SAFE_RICH_TEXT_V1', blocks: [{ kind: 'HEADING', headingLevel: 1, inlines: [{ text: 'x' }] }] },
    ])('rejects executable or unknown shape %#', (value) => {
        expect(() => {
            assertSafeRichText(value);
        }).toThrow(ContentException);
    });
});
