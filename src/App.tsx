import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { useI18n } from './i18n';
import { fetchers, keys } from './lib/api';
import { LoginPage } from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const SitesPage = lazy(() => import('./pages/Sites'));
const SiteDetailPage = lazy(() => import('./pages/SiteDetail'));
const ImportPage = lazy(() => import('./pages/Import'));
const RepliesPage = lazy(() => import('./pages/Replies'));
const TemplatesPage = lazy(() => import('./pages/Templates'));
const ActivityPage = lazy(() => import('./pages/ActivityLog'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const Authed = () => {
  const { t } = useI18n();
  // 401 sends the browser to /login (src/lib/api.ts)
  const me = useQuery({ queryKey: keys.me, queryFn: fetchers.me, staleTime: 5 * 60_000 });
  if (!me.data) return <Loading />;
  return (
    <Layout me={me.data}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="sites/:id" element={<SiteDetailPage me={me.data} />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="replies" element={<RepliesPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="settings" element={<SettingsPage me={me.data} />} />
          <Route path="*" element={<p className="py-16 text-center text-sm text-ink-muted">{t('app.notFound')}</p>} />
        </Routes>
      </Suspense>
    </Layout>
  );
};

export const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/*" element={<Authed />} />
  </Routes>
);
