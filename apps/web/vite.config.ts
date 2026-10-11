import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * O vídeo do patch (1.9) só vai como arquivo na PRÉVIA (`build:demo`), que não tem servidor. No
 * sistema de verdade o vídeo vem do servidor: sem isto, o Vite copiaria os megas do vídeo para o
 * `dist/` mesmo sem ninguém usar (a prévia inteira fica fora do build, mas o arquivo não).
 */
const semVideoDaPrevia: Plugin = {
  name: 'sem-video-da-previa',
  enforce: 'pre',
  resolveId(fonte) {
    return process.env.VITE_DEMO !== '1' && /docs\/novidades\/.+\.(mp4|webm|mov)$/.test(fonte) ? '\0video-da-previa' : null;
  },
  load(id) {
    return id === '\0video-da-previa' ? 'export default "";' : null;
  },
};

export default defineConfig({
  plugins: [react(), semVideoDaPrevia],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3333', changeOrigin: true } } },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
});
