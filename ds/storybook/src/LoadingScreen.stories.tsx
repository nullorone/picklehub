import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadingScreen } from '@picklehub/ui-web';

const meta = {
    title: 'Components/LoadingScreen',
    component: LoadingScreen,
    args: { text: 'Загружаем события…', backgroundColor: '#101827', backgroundOpacity: 1 },
    argTypes: {
        backgroundColor: { control: 'color' },
        backgroundOpacity: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
        backgroundImage: { control: 'text' },
        backgroundVideo: { control: 'text' },
    },
} satisfies Meta<typeof LoadingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Embedded: Story = {
    render: (args) => (
        <div style={{ width: '100%', maxWidth: 480, height: 360, borderRadius: 24 }}>
            <LoadingScreen {...args} />
        </div>
    ),
};

export const FullScreen: Story = { args: { fullScreen: true } };

export const CustomText: Story = {
    ...Embedded,
    args: {
        backgroundOpacity: 0.5,
        text: (
            <>
                <strong>Готовим площадку</strong>
                <div>Ещё немного — и можно играть</div>
            </>
        ),
    },
};
