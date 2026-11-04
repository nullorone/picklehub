import { ComponentPreview } from './EinPreview';
import { GlassOrb } from '@picklehub/ui-web';
const basicCode = `import { GlassOrb } from "@/registry/innovative/glass-orb"

<GlassOrb />`;
const statusCode = `// Idle status
<GlassOrb status="idle" />

// Active interaction status
<GlassOrb status="active" />

// Loading state with subtle pulse
<GlassOrb status="loading" />`;
function OrbPage() {
    return (
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-4xl">
            <ComponentPreview
                title="Interactive Orb"
                description="A floating glass orb that follows the cursor with elastic motion and subtle visual feedback."
                preview={
                    <div className="rounded-[2rem] border border-white/5 bg-black/20 p-12">
                        <GlassOrb />
                    </div>
                }
                code={basicCode}
            />

            <ComponentPreview
                title="Status Variants"
                description="Use different orb states to represent idle, active, or loading conditions."
                preview={
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="rounded-[2rem] border border-white/5 bg-black/20 p-8">
                            <GlassOrb status="idle" />
                            <p className="mt-4 text-center text-white/60 text-sm">Idle</p>
                        </div>
                        <div className="rounded-[2rem] border border-white/5 bg-black/20 p-8">
                            <GlassOrb status="active" />
                            <p className="mt-4 text-center text-white/60 text-sm">Active</p>
                        </div>
                        <div className="rounded-[2rem] border border-white/5 bg-black/20 p-8">
                            <GlassOrb status="loading" />
                            <p className="mt-4 text-center text-white/60 text-sm">Loading</p>
                        </div>
                    </div>
                }
                code={statusCode}
            />
        </div>
    );
}
export default { title: 'Innovative/orb', component: OrbPage };
export const Examples = {};
