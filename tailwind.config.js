/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#121212',
        'surface-variant': '#2a2a2a',
        'surface-container-lowest': '#0a0a0a',
        'surface-container-low': '#181818',
        'surface-container': '#1e1e1e',
        'surface-container-high': '#242424',
        'surface-container-highest': '#2a2a2a',
        'on-surface': '#e3e3e3',
        'on-surface-variant': '#aaaaaa',
        primary: '#f5f5f5',
        'primary-fixed': '#e5e5e5',
        'primary-container': '#333333',
        'on-primary': '#111111',
        'on-primary-container': '#ffffff',
        secondary: '#ffb95f',
        'secondary-container': '#ee9800',
        'on-secondary': '#472a00',
        tertiary: '#cccccc',
        outline: '#888888',
        'outline-variant': '#444444',
        error: '#ffb4ab',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
      },
      spacing: {
        gutter: '1rem',
        'sidebar-width': '260px',
        unit: '4px',
        'toolbar-height': '48px',
        'container-padding': '1.5rem',
      },
      fontFamily: {
        'display-lg': ['Inter', 'sans-serif'],
        'headline-md': ['Inter', 'sans-serif'],
        'body-base': ['Inter', 'sans-serif'],
        'label-caps': ['Inter', 'sans-serif'],
        'data-mono': ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-base': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-caps': ['11px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '700' }],
        'data-mono': ['13px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '500' }],
      },
      keyframes: {
        'soft-pulse': {
          '0%, 100%': {
            opacity: '0.55',
            boxShadow: '0 0 0 rgba(255,185,95,0)',
          },
          '50%': {
            opacity: '1',
            boxShadow: '0 0 10px rgba(255,185,95,0.65)',
          },
        },
      },
      animation: {
        'soft-pulse': 'soft-pulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
