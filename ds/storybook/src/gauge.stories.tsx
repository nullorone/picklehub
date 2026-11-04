import { ComponentPreview } from './EinPreview';
import { GlassGauge } from '@picklehub/ui-web';
const basicCode = `import { GlassGauge } from "@/components/glass-gauge"

<GlassGauge value={75} label="Progress" />`;
const sizesCode = `<GlassGauge value={60} size="xxs" /> <GlassGauge value={60} size="xs" /> <GlassGauge value={60} size="s" />
<GlassGauge value={60} size="sm" />
<GlassGauge value={75} size="md" />
<GlassGauge value={90} size="lg" />`;
const colorsCode = `<GlassGauge value={85} colorScheme="cyan" />
<GlassGauge value={70} colorScheme="purple" />
<GlassGauge value={95} colorScheme="gradient" />`;
function GaugePage() {
    return (
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-4xl">
            <ComponentPreview
                title="Basic Gauge"
                description="A simple gauge with value and label."
                preview={<GlassGauge value={75} label="Progress" />}
                code={basicCode}
            />

            <ComponentPreview
                title="Sizes"
                description="Available in small, medium, and large sizes."
                preview={
                    <div className="flex flex-col sm:flex-row items-center sm:items-end justify-center gap-6 sm:gap-8 py-4 sm:py-0">
                        <GlassGauge value={60} size="xxs" />
                        <GlassGauge value={60} size="xs" label="Extra Small" />
                        <GlassGauge value={60} size="s" label="Small" />
                        <GlassGauge value={60} text={'64/64'} size="sm" label="игроков" />
                        <GlassGauge value={75} size="md" label="Medium" />
                        <GlassGauge value={90} size="lg" label="Large" />
                    </div>
                }
                code={sizesCode}
            />

            <ComponentPreview
                title="Color Schemes"
                description="Multiple color schemes including gradient option."
                preview={
                    <div className="flex flex-wrap items-center justify-center gap-8">
                        <GlassGauge value={85} colorScheme="cyan" label="Cyan" />
                        <GlassGauge value={70} colorScheme="purple" label="Purple" />
                        <GlassGauge value={60} colorScheme="green" label="Green" />
                        <GlassGauge value={95} colorScheme="gradient" label="Gradient" />
                    </div>
                }
                code={colorsCode}
            />
            <ComponentPreview
                title="Progress Gradient"
                description="Muted red below 20, yellow from 20 to below 70, and green from 70. Colors follow value."
                preview={
                    <div className="flex flex-wrap items-center justify-center gap-8">
                        {[10, 20, 69, 70, 100].map((value) => (
                            <GlassGauge key={value} value={value} colorScheme="gradient-progress" />
                        ))}
                    </div>
                }
                code={'<GlassGauge value={70} colorScheme="gradient-progress" />'}
            />
        </div>
    );
}
export default { title: 'Innovative/gauge', component: GaugePage };
export const Examples = {};
