import { createBrowserRouter } from 'react-router'
import { AppLayout } from './AppLayout'
import { HomeRedirect } from './HomeRedirect'
import { PlatformLayout } from './PlatformLayout'
import { RequireAuth } from './RequireAuth'
import { PLATFORM_PATH } from '@/features/auth/model'
import { CampaignRoute, EditCampaignRoute, NewCampaignRoute } from '@/pages/CampaignSheets'
import { CampaignsPage } from '@/pages/CampaignsPage'
import { ConnectionPage } from '@/pages/ConnectionPage'
import { GroupsPage } from '@/pages/GroupsPage'
import { LoginPage } from '@/pages/LoginPage'
import { PlatformAuditPage } from '@/pages/PlatformAuditPage'
import { PlatformTenantsPage, TenantRoute } from '@/pages/PlatformTenantsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth role="SUPERADMIN" />,
    children: [
      {
        path: PLATFORM_PATH,
        element: <PlatformLayout />,
        children: [
          { path: 'audit', element: <PlatformAuditPage /> },
          {
            element: <PlatformTenantsPage />,
            children: [
              { index: true, element: null },
              { path: 'tenants/:id', element: <TenantRoute /> },
            ],
          },
          { path: '*', element: <HomeRedirect /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomeRedirect /> },
          {
            path: '/campaigns',
            element: <CampaignsPage />,
            children: [
              { path: 'new', element: <NewCampaignRoute /> },
              { path: ':id', element: <CampaignRoute /> },
              { path: ':id/edit', element: <EditCampaignRoute /> },
            ],
          },
          { path: '/groups', element: <GroupsPage /> },
          { path: '/connection', element: <ConnectionPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '*', element: <HomeRedirect /> },
        ],
      },
    ],
  },
])
