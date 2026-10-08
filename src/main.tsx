import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { App } from './App';
import { I18nProvider } from './i18n';
import { ApiError } from './lib/api';
import { ThemeProvider, useTheme } from './lib/theme';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2
    }
  }
});

const Toasts = () => {
  const { resolved } = useTheme();
  return <Toaster position="top-center" richColors closeButton theme={resolved} />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
            <Toasts />
          </BrowserRouter>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);
