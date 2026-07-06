/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        cardIn: {
          '0%':   { opacity: '0', transform: 'scale(0.94) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        cardOutApprove: {
          '0%':   { opacity: '1', transform: 'scale(1) translateX(0) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'scale(0.9) translateX(120px) rotate(6deg)' },
        },
        cardOutDecline: {
          '0%':   { opacity: '1', transform: 'scale(1) translateX(0) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'scale(0.9) translateX(-120px) rotate(-6deg)' },
        },
        popIn: {
          '0%':   { opacity: '0', transform: 'scale(0.5)' },
          '60%':  { opacity: '1', transform: 'scale(1.08)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        ringPulse: {
          '0%':   { opacity: '0.6', transform: 'scale(0.8)' },
          '100%': { opacity: '0',   transform: 'scale(1.8)' },
        },
        confettiFall: {
          '0%':   { opacity: '1', transform: 'translateY(0) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'translateY(140px) rotate(280deg)' },
        },
      },
      animation: {
        'card-in':           'cardIn 0.32s cubic-bezier(0.16,1,0.3,1)',
        'card-out-approve':  'cardOutApprove 0.28s ease-in forwards',
        'card-out-decline':  'cardOutDecline 0.28s ease-in forwards',
        'pop-in':             'popIn 0.5s cubic-bezier(0.16,1,0.3,1)',
        'ring-pulse':         'ringPulse 1.1s ease-out infinite',
        'confetti-fall':      'confettiFall 0.9s ease-in forwards',
      },
    },
  },
  plugins: [],
}