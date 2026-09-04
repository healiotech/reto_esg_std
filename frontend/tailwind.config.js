/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        santander: {
          red: '#EC0000',
          black: '#000000',
          white: '#FFFFFF',
          sky: '#DEEDF2',
          cream: '#FDF0EC',
          coral: '#F4B5A3',
          coralMid: '#EC8B76',
          grayText: '#333333',
          grayBorder: '#E5E5E5',
        },
        banda: {
          bajo: '#2E7D32',
          medio: '#F9A825',
          alto: '#EF6C00',
          critico: '#EC0000',
        },
        // Santander Design System token scales (claude.ai/design project b120775c)
        brand: {
          100: '#FBE5E5',
          300: '#F27878',
          500: '#EC0000',
          600: '#CC0000',
          700: '#990000',
          800: '#7A0000',
        },
        sky: {
          100: '#DEEDF2',
          300: '#AFD3E0',
          500: '#4FA6C4',
        },
        neutral: {
          0: '#FFFFFF',
          50: '#F5F5F5',
          100: '#F0F0F0',
          200: '#E2E2E2',
          300: '#C2C2C2',
          500: '#6D6D6D',
          700: '#454545',
          800: '#333333',
          900: '#1A1A1A',
          1000: '#000000',
        },
      },
      fontFamily: {
        head: ['Ubuntu', 'system-ui', 'sans-serif'],
        body: ['Ubuntu', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
