// @ts-check
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import estante from './src/integration/estante.ts';

// https://astro.build/config
export default defineConfig({
  integrations: [estante(), react()],
});
