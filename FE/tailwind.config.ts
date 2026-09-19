import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const withOpacity = (cssVar: string) => `rgb(var(${cssVar}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Semantic surface/text/border tokens — flip automatically between
        // light & dark via CSS custom properties (see globals.css). Use these
        // for any new markup instead of gray/slate/white/black.
        canvas:   withOpacity('--canvas'),    // page background
        surface:  withOpacity('--surface'),   // card / panel background
        surface2: withOpacity('--surface-2'), // nested / hover surface
        ink:      withOpacity('--ink'),       // primary text
        muted:    withOpacity('--ink-muted'), // secondary text
        subtle:   withOpacity('--ink-subtle'),// tertiary text / placeholders
        line:     withOpacity('--line'),      // default border
        linesoft: withOpacity('--line-soft'),

        // ── ResearchMind Clay brand accents (constant across themes) ──
        clay: {
          DEFAULT: withOpacity('--clay'),
          hover:   withOpacity('--clay-hover'),
          tint:    withOpacity('--clay-tint'),
          soft:    withOpacity('--clay-soft'),
        },
        ochre:    withOpacity('--ochre'),
        espresso: '#2B2622',
        cream:    '#F5EFE7',
        stone:    '#8A7F76',

        // ── Status ──
        success: withOpacity('--success'),
        warning: withOpacity('--warning'),
        danger:  withOpacity('--danger'),
        info:    withOpacity('--info'),

        // Re-theme every existing `blue-*` class app-wide to the Clay accent
        // ramp — this is the brand's primary accent (buttons, links, focus).
        blue: {
          50:  '#FBF2E9',
          100: '#F3C9B5',
          200: '#EDB099',
          300: '#E89B7C',
          400: '#DE8A6A',
          500: '#D97757',
          600: '#B85A3E',
          700: '#9E4C33',
          800: '#8F4129',
          900: '#6B2F1C',
        },

        primary: withOpacity('--clay'),
        brand: {
          DEFAULT: withOpacity('--clay'),
          hover:   withOpacity('--clay-hover'),
        },
      },
      fontFamily: {
        sans:  ['Inter', 'sans-serif'],
        serif: ['Georgia', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [typography],
};

export default config;
