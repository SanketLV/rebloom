import type { Config } from 'tailwindcss';

// Palette F, Notion › Brand & Design. The only place hex values live; components use these names.
// Lime is for wins only: here, the day-7 recovery.
export default {
  content: ['index.html', 'privacy.html', 'src/**/*.tsx'],
  theme: {
    extend: {
      colors: {
        bg: '#E8E9DF',
        surface: '#FAFAF5',
        ink: '#1E2619',
        'ink-2': '#4F5947',
        line: '#D4D7C6',
        olive: '#2E3D28',
        sage: '#A9B887',
        walnut: '#5A3E2B',
        amber: '#F2DFC2',
        lime: '#BFE23A',
        warning: '#8A5600',
        // Behind a photo while it loads (app token photoBg).
        photo: '#CFC8B6',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['Figtree', 'system-ui', 'sans-serif'],
      },
      spacing: {
        gutter: 'clamp(16px, 4vw, 56px)',
      },
    },
  },
  plugins: [],
} satisfies Config;
