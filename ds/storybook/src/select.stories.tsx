import {
    GlassSelect,
    GlassSelectTrigger,
    GlassSelectValue,
    GlassSelectContent,
    GlassSelectItem,
    GlassSelectGroup,
    GlassSelectLabel,
    GlassSelectSeparator,
} from '@picklehub/ui-web';
export default { title: 'Forms/Select' };
export const Example1 = {
    name: 'Basic Select',
    render: () => (
        <GlassSelect>
            <GlassSelectTrigger aria-label="Fruit" className="w-50">
                <GlassSelectValue placeholder="Select a fruit" />
            </GlassSelectTrigger>
            <GlassSelectContent>
                <GlassSelectItem value="apple">Apple</GlassSelectItem>
                <GlassSelectItem value="banana">Banana</GlassSelectItem>
                <GlassSelectItem value="orange">Orange</GlassSelectItem>
                <GlassSelectItem value="grape">Grape</GlassSelectItem>
            </GlassSelectContent>
        </GlassSelect>
    ),
};
export const Example2 = {
    name: 'Grouped Options',
    render: () => (
        <GlassSelect>
            <GlassSelectTrigger aria-label="Timezone" className="w-60">
                <GlassSelectValue placeholder="Select a timezone" />
            </GlassSelectTrigger>
            <GlassSelectContent>
                <GlassSelectGroup>
                    <GlassSelectLabel>North America</GlassSelectLabel>
                    <GlassSelectItem value="est">Eastern Standard Time</GlassSelectItem>
                    <GlassSelectItem value="cst">Central Standard Time</GlassSelectItem>
                    <GlassSelectItem value="pst">Pacific Standard Time</GlassSelectItem>
                </GlassSelectGroup>
                <GlassSelectSeparator />
                <GlassSelectGroup>
                    <GlassSelectLabel>Europe</GlassSelectLabel>
                    <GlassSelectItem value="gmt">Greenwich Mean Time</GlassSelectItem>
                    <GlassSelectItem value="cet">Central European Time</GlassSelectItem>
                </GlassSelectGroup>
            </GlassSelectContent>
        </GlassSelect>
    ),
};
