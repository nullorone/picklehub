export const clientChannels = ['web', 'telegram'] as const;
export const supportedLocales = ['ru-RU'] as const;

export type ClientChannel = (typeof clientChannels)[number];
export type SupportedLocale = (typeof supportedLocales)[number];

export interface ClientContext {
    readonly channel: ClientChannel;
    readonly locale: SupportedLocale;
}
