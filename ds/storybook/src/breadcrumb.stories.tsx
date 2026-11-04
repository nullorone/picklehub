import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { Home } from 'lucide-react';
import {
    GlassBreadcrumbSteps,
    GlassBreadcrumb,
    GlassBreadcrumbList,
    GlassBreadcrumbItem,
    GlassBreadcrumbLink,
    GlassBreadcrumbSeparator,
    GlassBreadcrumbPage,
    GlassBreadcrumbEllipsis,
} from '@picklehub/ui-web';
export default { title: 'Components/Breadcrumb' };
export const Example1 = {
    name: 'Basic Breadcrumb',
    render: () => (
        <GlassBreadcrumb>
            <GlassBreadcrumbList>
                <GlassBreadcrumbItem>
                    <GlassBreadcrumbLink href="/" aria-label="Home">
                        <Home className="h-4 w-4" />
                    </GlassBreadcrumbLink>
                </GlassBreadcrumbItem>
                <GlassBreadcrumbSeparator />
                <GlassBreadcrumbItem>
                    <GlassBreadcrumbLink href="/docs">Documentation</GlassBreadcrumbLink>
                </GlassBreadcrumbItem>
                <GlassBreadcrumbSeparator />
                <GlassBreadcrumbItem>
                    <GlassBreadcrumbPage>Components</GlassBreadcrumbPage>
                </GlassBreadcrumbItem>
            </GlassBreadcrumbList>
        </GlassBreadcrumb>
    ),
};
export const Example2 = {
    name: 'With Ellipsis',
    render: () => (
        <GlassBreadcrumb>
            <GlassBreadcrumbList>
                <GlassBreadcrumbItem>
                    <GlassBreadcrumbLink href="/" aria-label="Home">
                        Home
                    </GlassBreadcrumbLink>
                </GlassBreadcrumbItem>
                <GlassBreadcrumbSeparator />
                <GlassBreadcrumbItem>
                    <GlassBreadcrumbEllipsis />
                </GlassBreadcrumbItem>
                <GlassBreadcrumbSeparator />
                <GlassBreadcrumbItem>
                    <GlassBreadcrumbLink href="/docs/components">Components</GlassBreadcrumbLink>
                </GlassBreadcrumbItem>
                <GlassBreadcrumbSeparator />
                <GlassBreadcrumbItem>
                    <GlassBreadcrumbPage>Breadcrumb</GlassBreadcrumbPage>
                </GlassBreadcrumbItem>
            </GlassBreadcrumbList>
        </GlassBreadcrumb>
    ),
};

function StepsExample() {
    const [currentStep, setCurrentStep] = useState(4);
    return (
        <GlassBreadcrumbSteps
            currentStep={currentStep}
            items={['Home', 'Event type', 'Game format', 'Venue', 'Date and time'].map((label, index) => ({
                label,
                onSelect: () => setCurrentStep(index),
            }))}
        />
    );
}

export const StepsWithEllipsis = {
    name: 'Steps With Ellipsis',
    render: () => <StepsExample />,
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Date and time')).toHaveAttribute('aria-current', 'page');
        await expect(canvas.queryByRole('button', { name: 'Event type' })).not.toBeInTheDocument();
        await userEvent.click(canvas.getByRole('button', { name: 'Show intermediate steps' }));
        await expect(canvas.getByRole('button', { name: 'Event type' })).toBeVisible();
        await userEvent.click(canvas.getByRole('button', { name: 'Game format' }));
        await expect(canvas.getByText('Game format')).toHaveAttribute('aria-current', 'page');
        await expect(canvas.queryByText('Date and time')).not.toBeInTheDocument();
    },
};
