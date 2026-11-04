import { ComponentPreview } from './EinPreview';
import { GlassWaveform } from '@picklehub/ui-web';
const basicCode = `import { GlassWaveform } from "@/registry/innovative/glass-waveform"

<GlassWaveform />`;
const pausedCode = `// Live waveform
<GlassWaveform amplitude={0.85} color="gradient" />

// Frozen glass visualizer
<GlassWaveform paused />`;
function WaveformPage() {
    return (
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-4xl">
            <ComponentPreview
                title="Live Audio Visualizer"
                description="A liquid glass waveform with animated frequency bars and gradient glow."
                preview={
                    <div className="rounded-4xl border border-white/5 bg-black/20 p-6">
                        <GlassWaveform />
                    </div>
                }
                code={basicCode}
            />

            <ComponentPreview
                title="Frozen Glass Mode"
                description="Toggle a paused visual state for silent or paused audio contexts."
                preview={
                    <div className="rounded-4xl border border-white/5 bg-black/20 p-6">
                        <GlassWaveform paused showLabels />
                    </div>
                }
                code={pausedCode}
            />
        </div>
    );
}
export default { title: 'Innovative/waveform', component: WaveformPage };
export const Examples = {};
