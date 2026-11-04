import { GlassSeparator, GlassScrollArea, GlassScrollBar } from '@picklehub/ui-web';
import { artists } from './EinMockData';
export default { title: 'Data display/ScrollArea' };
export const Example1 = {
    name: 'Vertical Scroll',
    render: () => (
        <GlassScrollArea className="h-48 w-48 rounded-xl border border-white/10">
            <div className="p-4">
                <h4 className="mb-4 text-sm font-medium text-white leading-none">Tags</h4>
                {Array.from({ length: 15 }).map((_, i) => (
                    <div key={i} className="text-sm text-white/70 py-2 border-b border-white/5 last:border-0">
                        Tag {i + 1}
                    </div>
                ))}
            </div>
        </GlassScrollArea>
    ),
};
export const Example2 = {
    name: 'Horizontal Scroll',
    render: () => (
        <GlassScrollArea className="w-96 whitespace-nowrap rounded-xl border border-white/10">
            <div className="flex gap-4 p-4">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div
                        key={i}
                        className="shrink-0 w-32 h-32 rounded-lg bg-white/5 flex items-center justify-center text-white/70"
                    >
                        Item {i + 1}
                    </div>
                ))}
            </div>
            <GlassScrollBar orientation="horizontal" />
        </GlassScrollArea>
    ),
};
export const Example3 = {
    name: 'Content List',
    render: () => (
        <GlassScrollArea className="h-64 w-full max-w-sm rounded-xl border border-white/10 bg-white/5">
            <div className="p-4">
                {artists.map((artist, index) => (
                    <div key={artist.handle}>
                        <div className="flex items-center gap-3 py-3">
                            <div className="h-10 w-10 rounded-full bg-linear-to-br from-cyan-500/40 to-blue-500/40 shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-white">{artist.name}</p>
                                <p className="text-xs text-white/60">{artist.handle}</p>
                            </div>
                        </div>
                        {index < artists.length - 1 && <GlassSeparator />}
                    </div>
                ))}
            </div>
        </GlassScrollArea>
    ),
};
