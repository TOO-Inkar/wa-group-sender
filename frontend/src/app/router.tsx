import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from './AppLayout'
import { RequireAuth } from './RequireAuth'
import { CampaignRoute, EditCampaignRoute, NewCampaignRoute } from '@/pages/CampaignSheets'
import { CampaignsPage } from '@/pages/CampaignsPage'
import { ConnectionPage } from '@/pages/ConnectionPage'
import { GroupsPage } from '@/pages/GroupsPage'
import { LoginPage } from '@/pages/LoginPage'
import { SettingsPage } from '@/pages/SettingsPage'

/** Адреса страниц; SpaController на бэкенде отдаёт на них index.html. */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/campaigns" replace /> },
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
          { path: '*', element: <Navigate to="/campaigns" replace /> },
        ],
      },
    ],
  },
])
