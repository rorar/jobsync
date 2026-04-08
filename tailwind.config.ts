import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			inter: [
  				'var(--font-inter)',
                    ...fontFamily.sans
                ]
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'deck-exit-right': {
  				to: { transform: 'translateX(120%) rotate(15deg)', opacity: '0' }
  			},
  			'deck-exit-left': {
  				to: { transform: 'translateX(-120%) rotate(-15deg)', opacity: '0' }
  			},
  			'deck-exit-up': {
  				to: { transform: 'translateY(-150%) scale(0.8)', opacity: '0' }
  			},
  			'deck-exit-down': {
  				to: { transform: 'translateY(150%) scale(0.8)', opacity: '0' }
  			},
  			'deck-enter': {
  				from: { transform: 'scale(0.95) translateY(8px)', opacity: '0.5' },
  				to: { transform: 'scale(1) translateY(0)', opacity: '1' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'deck-exit-right': 'deck-exit-right 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
  			'deck-exit-left': 'deck-exit-left 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
  			'deck-exit-up': 'deck-exit-up 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
  			'deck-exit-down': 'deck-exit-down 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
  			'deck-enter': 'deck-enter 250ms cubic-bezier(0, 0, 0.2, 1) forwards'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
