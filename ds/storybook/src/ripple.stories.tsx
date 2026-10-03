import { ComponentPreview } from './ein-preview';
import { GlassRipple, GlassRippleButton } from '@picklehub/ui-web';
const basicCode = `import { GlassRippleButton } from "@/components/glass-ripple"

<GlassRippleButton variant="primary">
  Click Me
</GlassRippleButton>`;
const wrapperCode = `import { GlassRipple } from "@/components/glass-ripple"

<GlassRipple color="cyan" className="rounded-xl">
  <div className="p-6 bg-white/10">
    Click anywhere in this area
  </div>
</GlassRipple>`;
function RipplePage() {
    return (
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-4xl">
            <ComponentPreview
                title="Ripple Buttons"
                description="Buttons with built-in ripple effects on click."
                preview={
                    <div className="flex flex-wrap gap-4">
                        <GlassRippleButton variant="default">Default</GlassRippleButton>
                        <GlassRippleButton variant="primary">Primary</GlassRippleButton>
                        <GlassRippleButton variant="outline">Outline</GlassRippleButton>
                    </div>
                }
                code={basicCode}
            />

            <ComponentPreview
                title="Ripple Container"
                description="Wrap any element to add ripple effects on interaction."
                preview={
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                        <GlassRipple color="cyan" className="rounded-xl">
                            <div className="p-6 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl text-center">
                                <p className="text-white/80">Cyan Ripple</p>
                            </div>
                        </GlassRipple>
                        <GlassRipple color="purple" className="rounded-xl">
                            <div className="p-6 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl text-center">
                                <p className="text-white/80">Purple Ripple</p>
                            </div>
                        </GlassRipple>
                    </div>
                }
                code={wrapperCode}
            />
        </div>
    );
}
export default { title: 'Innovative/ripple', component: RipplePage };
export const Examples = {};
