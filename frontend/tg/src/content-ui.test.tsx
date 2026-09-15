// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { type components } from '@picklehub/api-client';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SafeRichText } from './content-ui';

afterEach(cleanup);

describe('TMA content renderer', () => {
    it('renders only typed nodes and visibly marks HTTPS links as external', () => {
        const richText: components['schemas']['SafeRichTextDocument'] = {
            blocks: [
                {
                    inlines: [
                        { text: '<script>alert(1)</script>' },
                        { href: 'https://source.example.test', marks: ['EMPHASIS'], text: 'Источник' },
                    ],
                    kind: 'PARAGRAPH',
                },
            ],
            format: 'SAFE_RICH_TEXT_V1',
        };
        render(<SafeRichText document={richText} />);
        expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
        expect(document.querySelector('.article-body script')).toBeNull();
        const link = screen.getByRole('link', { name: /Источник/u });
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(link).toHaveTextContent('внешняя ссылка');
    });
});
