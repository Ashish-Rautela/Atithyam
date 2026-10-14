import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import '@fontsource-variable/fraunces/soft.css';
import '@fontsource-variable/fraunces/soft-italic.css';
import '@fontsource-variable/manrope';
import '@fontsource/tiro-devanagari-hindi';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    // Retry network/server errors once; never retry "sign in", "not allowed" or "upgrade" answers.
    queries: { retry: (n, err) => n < 1 && !(err?.status >= 400 && err?.status < 500), refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
