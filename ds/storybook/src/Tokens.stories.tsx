import type { Meta, StoryObj } from '@storybook/react-vite';
import { tokens } from '@picklehub/design-tokens';

function TokenCatalog() {
    return (
        <div className="space-y-8">
            <h1 className="text-2xl font-semibold">Токены PickleHub</h1>
            <section aria-label="Палитра">
                <h2 className="mb-4 text-xl font-semibold">Цвета</h2>
                <div className="flex flex-wrap gap-4">
                    {Object.entries(tokens.ein.color).flatMap(([group, values]) =>
                        Object.entries(values).map(([step, value]) => (
                            <div key={`${group}-${step}`} className="w-32">
                                <div
                                    className="h-16 rounded-ds-control border border-ds-border"
                                    style={{ background: value }}
                                />
                                <p>
                                    {group}.{step}
                                </p>
                                <code>{value}</code>
                            </div>
                        ))
                    )}
                </div>
            </section>
            <section aria-label="Типографика">
                <h2 className="mb-4 text-xl font-semibold">Типографика</h2>
                {Object.entries(tokens.fontSize).map(([name, size]) => (
                    <p key={name} style={{ fontSize: size }}>
                        {name} · {size} · Играем в пиклбол
                    </p>
                ))}
            </section>
            <section aria-label="Интервалы">
                <h2 className="mb-4 text-xl font-semibold">Интервалы</h2>
                {Object.entries(tokens.space).map(([name, size]) => (
                    <div key={name} className="mb-2 flex items-center gap-4">
                        <code>
                            {name} · {size}
                        </code>
                        <div className="h-4 bg-ds-accent" style={{ width: size }} />
                    </div>
                ))}
            </section>
            <section aria-label="Скругления">
                <h2 className="mb-4 text-xl font-semibold">Скругления</h2>
                <div className="flex flex-wrap gap-4">
                    {Object.entries(tokens.radius).map(([name, radius]) => (
                        <div
                            key={name}
                            className="border border-ds-border bg-ds-surface p-4"
                            style={{ borderRadius: radius }}
                        >
                            {name} · {radius}
                        </div>
                    ))}
                </div>
            </section>
            <section aria-label="Поверхности">
                <h2 className="mb-4 text-xl font-semibold">Стеклянная поверхность</h2>
                <div
                    className="rounded-ds-card p-6"
                    style={{ background: 'var(--token-ein-preview-surface)', color: '#ffffff' }}
                >
                    <div className="ds-glass rounded-ds-card p-6">
                        <p>EIN: белый фон 20%, рамка 30%, размытие 24 px.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
const meta = { title: 'Foundations/Tokens', component: TokenCatalog } satisfies Meta<typeof TokenCatalog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
