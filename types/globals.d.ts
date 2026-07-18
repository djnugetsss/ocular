/**
 * Ambient declarations for non-code imports.
 *
 * Metro resolves `global.css` through the NativeWind transformer, but
 * TypeScript has no notion of a CSS module and rejects the side-effect import
 * without this.
 */
declare module '*.css';
