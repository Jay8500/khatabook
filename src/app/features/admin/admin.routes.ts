import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards';

/** Admin sub-pages; each is visible and reachable only with its permission. */
export const ADMIN_SECTIONS = [
  { path: 'dashboard', label: 'admin.dashboard', permission: 'can_manage_shops' },
  { path: 'login-codes', label: 'admin.loginCodes', permission: 'can_view_login_codes' },
  { path: 'settings', label: 'admin.settings', permission: 'can_manage_settings' },
  { path: 'admin-phones', label: 'admin.adminPhones', permission: 'can_manage_settings' },
  { path: 'messages', label: 'admin.messages', permission: 'can_manage_settings' },
  { path: 'roles', label: 'admin.roles', permission: 'can_manage_roles', entity: 'roles' },
  { path: 'pricing', label: 'admin.pricing', permission: 'can_manage_pricing', entity: 'pricing' },
  { path: 'shops', label: 'admin.shops', permission: 'can_manage_shops', entity: 'shops' },
  { path: 'users', label: 'admin.users', permission: 'can_manage_users', entity: 'users' },
  { path: 'tickets', label: 'admin.tickets', permission: 'can_manage_support', entity: 'tickets' },
];

const crudPage = () => import('../../shared/crud-page/crud-page').then((m) => m.CrudPage);

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./admin-layout').then((m) => m.AdminLayout),
    children: [
      ...ADMIN_SECTIONS.filter((s) => s.entity).map((s) => ({
        path: s.path,
        canActivate: [permissionGuard],
        data: { permission: s.permission, entity: s.entity },
        loadComponent: crudPage,
      })),
      {
        path: 'dashboard',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_shops' },
        loadComponent: () => import('./dashboard').then((m) => m.AdminDashboard),
      },
      {
        path: 'login-codes',
        canActivate: [permissionGuard],
        data: { permission: 'can_view_login_codes' },
        loadComponent: () => import('./login-codes').then((m) => m.LoginCodes),
      },
      {
        path: 'settings',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_settings' },
        loadComponent: () => import('./settings-page').then((m) => m.SettingsPage),
      },
      {
        path: 'admin-phones',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_settings' },
        loadComponent: () => import('./admin-phones').then((m) => m.AdminPhones),
      },
      {
        path: 'messages',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_settings' },
        loadComponent: () => import('./messages-editor').then((m) => m.MessagesEditor),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];
