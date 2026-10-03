import { ComponentPreview } from './ein-preview';
import { Package, Truck, CheckCircle, Clock } from 'lucide-react';
import { GlassTimeline, TimelineItem } from '@picklehub/ui-web';
const basicCode = `import { GlassTimeline } from "@/components/glass-timeline"

const items = [
  { id: "1", title: "Step 1", status: "completed" },
  { id: "2", title: "Step 2", status: "current" },
  { id: "3", title: "Step 3", status: "upcoming" },
]

<GlassTimeline items={items} />`;
const horizontalCode = `<GlassTimeline
  items={items}
  orientation="horizontal"
/>`;
function TimelinePage() {
    return (
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-4xl">
            <ComponentPreview
                title="Vertical Timeline"
                description="A vertical timeline showing order tracking progress."
                preview={
                    <div className="w-full max-w-md">
                        <GlassTimeline items={timelineItems} />
                    </div>
                }
                code={basicCode}
            />

            <ComponentPreview
                title="Horizontal Timeline"
                description="A horizontal timeline for step-by-step progress."
                preview={
                    <GlassTimeline
                        items={[
                            {
                                id: '1',
                                title: 'Order',
                                date: 'Step 1',
                                status: 'completed',
                                icon: <Package className="w-4 h-4" />,
                            },
                            {
                                id: '2',
                                title: 'Processing',
                                date: 'Step 2',
                                status: 'completed',
                                icon: <Clock className="w-4 h-4" />,
                            },
                            {
                                id: '3',
                                title: 'Shipping',
                                date: 'Step 3',
                                status: 'current',
                                icon: <Truck className="w-4 h-4" />,
                            },
                            {
                                id: '4',
                                title: 'Delivered',
                                date: 'Step 4',
                                status: 'upcoming',
                                icon: <CheckCircle className="w-4 h-4" />,
                            },
                        ]}
                        orientation="horizontal"
                    />
                }
                code={horizontalCode}
            />
        </div>
    );
}
export default { title: 'Innovative/timeline', component: TimelinePage };
export const Examples = {};

const timelineItems: TimelineItem[] = [
    {
        id: '1',
        title: 'Order Placed',
        description: 'Your order has been confirmed',
        date: 'Jan 1',
        status: 'completed',
    },
    { id: '2', title: 'Processing', description: 'Order is being prepared', date: 'Jan 2', status: 'completed' },
    { id: '3', title: 'Shipped', description: 'Package is on the way', date: 'Jan 3', status: 'current' },
    { id: '4', title: 'Delivered', description: 'Estimated arrival', date: 'Jan 5', status: 'upcoming' },
];
