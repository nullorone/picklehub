import tokens from './tokens.json';

export { tokens };
export type DesignTokens = typeof tokens;
export type ThemeName = keyof DesignTokens['theme'];
