/** Cores e fontes vêm de variáveis CSS (src/styles.css) para funcionar em tema claro e escuro. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', 'surface-2': 'var(--surface-2)', line: 'var(--line)', 'line-strong': 'var(--line-strong)',
        ink: 'var(--ink)', 'ink-2': 'var(--ink-2)', muted: 'var(--muted)',
        accent: 'var(--accent)', 'accent-soft': 'var(--accent-soft)', 'accent-ink': 'var(--accent-ink)',
        signal: 'var(--signal)', 'signal-soft': 'var(--signal-soft)', ok: 'var(--ok)', 'ok-soft': 'var(--ok-soft)', bad: 'var(--bad)', 'bad-soft': 'var(--bad-soft)',
        // as cores extras das opções dos projetos (1.4)
        roxo: 'var(--roxo)', 'roxo-soft': 'var(--roxo-soft)', 'roxo-ink': 'var(--roxo-ink)',
        rosa: 'var(--rosa)', 'rosa-soft': 'var(--rosa-soft)', 'rosa-ink': 'var(--rosa-ink)',
        turquesa: 'var(--turquesa)', 'turquesa-soft': 'var(--turquesa-soft)', 'turquesa-ink': 'var(--turquesa-ink)',
        amarelo: 'var(--amarelo)', 'amarelo-soft': 'var(--amarelo-soft)', 'amarelo-ink': 'var(--amarelo-ink)',
      },
      fontFamily: { display: ['Sora', 'system-ui', 'sans-serif'], body: ['"Public Sans"', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
      borderRadius: { DEFAULT: '8px', lg: '10px', xl: '14px' },
    },
  },
  plugins: [],
};
