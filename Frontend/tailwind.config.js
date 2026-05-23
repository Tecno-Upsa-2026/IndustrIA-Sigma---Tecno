/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter','system-ui','sans-serif'],
        display: ['Sora','Inter','sans-serif'],
        mono: ['JetBrains Mono','ui-monospace','monospace'],
      },
      colors: {
        ink: {
          950: '#06080F',
          900: '#0B1020',
          850: '#0E152A',
          800: '#111827',
          750: '#162033',
          700: '#1A2336',
          600: '#1E293B',
          500: '#2A3650',
        },
        cyan2: { 400:'#22D3EE', 500:'#06B6D4' },
        blueon: { 400:'#3B82F6', 500:'#2563EB' },
        grind: { 400:'#10B981', 500:'#059669' },
        ai:    { 400:'#A855F7', 500:'#8B5CF6' },
        crit:  { 400:'#EF4444', 500:'#DC2626' },
        warn:  { 400:'#F59E0B', 500:'#D97706' },
      },
      boxShadow: {
        glow:     '0 0 24px rgba(34,211,238,0.25)',
        glowSm:   '0 0 12px rgba(34,211,238,0.18)',
        glowCrit: '0 0 24px rgba(239,68,68,0.35)',
        glowAi:   '0 0 24px rgba(168,85,247,0.30)',
        card:     '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 30px -12px rgba(0,0,0,0.6)',
      },
    }
  },
  plugins: [],
}
