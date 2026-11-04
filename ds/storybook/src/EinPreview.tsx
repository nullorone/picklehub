import type { ReactNode } from 'react';
export function ComponentPreview({
    title,
    description,
    preview,
}: {
    title: string;
    description: string;
    preview: ReactNode;
    code?: string;
}) {
    return (
        <section className="space-y-4 py-6">
            <h2 className="text-xl">{title}</h2>
            <p className="text-white/80">{description}</p>
            <div className="flex flex-wrap items-center justify-center gap-4">{preview}</div>
        </section>
    );
}
