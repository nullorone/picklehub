import { Home } from 'lucide-react';
import {
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
