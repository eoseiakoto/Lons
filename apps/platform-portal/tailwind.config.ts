import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        card: 'var(--bg-card)',
        sidebar: 'var(--bg-sidebar)',
        elevated: 'var(--bg-elevated)',
        muted: 'var(--bg-muted)',
        hover: 'var(--bg-hover)',
        tinted: 'var(--bg-tinted)',

        'border-subtle': 'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        'border-strong': 'var(--border-strong)',

        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-on-accent': 'var(--text-on-accent)',

        accent: {
          DEFAULT: 'var(--accent-primary)',
          hover: 'var(--accent-primary-hover)',
          soft: 'var(--accent-primary-soft)',
          deep: 'var(--accent-primary-deep)',
          secondary: 'var(--accent-secondary)',
          tertiary: 'var(--accent-tertiary)',
        },

        status: {
          success: 'var(--status-success)',
          'success-soft': 'var(--status-success-soft)',
          warning: 'var(--status-warning)',
          'warning-soft': 'var(--status-warning-soft)',
          error: 'var(--status-error)',
          'error-soft': 'var(--status-error-soft)',
          info: 'var(--status-info)',
          'info-soft': 'var(--status-info-soft)',
        },

        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
        },

        glass: {
          DEFAULT: 'var(--bg-card)',
          hover: 'var(--bg-hover)',
          active: 'var(--bg-muted)',
          border: 'var(--border-subtle)',
        },
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
        floating: 'var(--shadow-floating)',
        focus: 'var(--shadow-focus)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        DEFAULT: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        drawer: 'var(--ease-drawer)',
        spring: 'var(--ease-spring)',
        standard: 'var(--ease-out)',
        emphasized: 'var(--ease-in-out)',
      },
      backdropBlur: {
        '2xl': '40px',
        '3xl': '64px',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.035em',
        tighter: '-0.025em',
        tight: '-0.015em',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        enter: 'fadeUp 420ms var(--ease-out) both',
      },
    },
  },
  plugins: [],
};
export default config;
