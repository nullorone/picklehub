import { MotionConfig } from 'framer-motion';
import type { Preview } from '@storybook/react-vite';
import '@picklehub/ui-web/styles.css';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';

const preview: Preview = {
    tags: ['autodocs'],
    initialGlobals: { theme: 'dark' },
    globalTypes: {
        theme: {
            description: 'Тема PickleHub',
            toolbar: { icon: 'paintbrush', items: ['light', 'dark'], dynamicTitle: true },
        },
    },
    parameters: {
        a11y: { test: 'error' },
        viewport: { options: { narrow: { name: 'Узкий экран', styles: { width: '320px', height: '740px' } } } },
    },
    decorators: [
        (Story, context) => (
            <div
                data-ds-theme={context.globals.theme === 'dark' ? 'dark' : 'light'}
                className="min-h-screen bg-ds-background p-6 text-ds-text antialiased"
                style={{ fontFamily: 'Geist, Arial, Helvetica, sans-serif' }}
            >
                {context.title !== 'Foundations/Tokens' ? (
                    <div className="ein-preview">
                        <div className="relative flex w-full items-center justify-center">
                            <MotionConfig reducedMotion="user">
                                <Story />
                            </MotionConfig>
                        </div>
                    </div>
                ) : (
                    <Story />
                )}
            </div>
        ),
    ],
};
export default preview;
