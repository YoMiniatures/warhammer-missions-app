/** @type {import('tailwindcss').Config} */
export default {
    content: ['./public/**/*.{html,js}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                'primary': '#d41132',
                'primary-dark': '#8a0b20',
                'secondary': '#c5a065',
                'accent-cogitator': '#2efc84',
                'background-dark': '#0f0f10',
                'surface-dark': '#1a1718',
                'surface-accent': '#261e1f',
                'accent-green': '#10b981',
                'accent-green-dark': '#064e3b',
                'grim-red': '#990000',
                'sickly-green': '#0F520F',
                'sickly-green-light': '#1A821A',
            },
            fontFamily: {
                'display': ['Space Grotesk', 'system-ui', 'sans-serif'],
                'body': ['Noto Sans', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
