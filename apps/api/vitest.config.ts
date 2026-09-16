import { defineConfig } from 'vitest/config';
/** Os testes usam um único banco de teste; rodam em série para não se atropelarem. */
export default defineConfig({ test: { fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 } });
