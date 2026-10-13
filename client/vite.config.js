import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The API runs on :4000; proxying avoids CORS configuration in development.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
