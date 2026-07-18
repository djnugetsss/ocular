/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', './modules/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#0B0B0F',
          raised: '#14141B',
          overlay: '#1D1D27',
        },
        ink: {
          DEFAULT: '#F5F5F7',
          muted: '#A0A0AE',
          faint: '#6B6B7B',
        },
        accent: {
          DEFAULT: '#5B8DEF',
          strong: '#3D6FD9',
          soft: '#1B2740',
        },
        signal: {
          ok: '#3DD68C',
          warn: '#F5B942',
          bad: '#F26D6D',
        },
        hairline: '#262631',
      },
      // Named steps from the type scale in PRODUCT_SPEC.md §5.2. Body (16),
      // callout (14), and caption (12) map onto Tailwind's default
      // text-base/text-sm/text-xs and are intentionally not redefined here.
      fontSize: {
        metric: ['44px', { lineHeight: '48px', letterSpacing: '-1.5px' }],
        title1: ['30px', { lineHeight: '36px', letterSpacing: '-0.5px' }],
        title2: ['22px', { lineHeight: '28px', letterSpacing: '-0.2px' }],
      },
      borderRadius: {
        card: '18px',
        sheet: '24px',
      },
    },
  },
  plugins: [],
};
