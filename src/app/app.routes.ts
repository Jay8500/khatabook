import { Routes } from '@angular/router';
import { authGuard, guestGuard, onboardedGuard, permissionGuard } from './core/guards';

const crudPage = () => import('./shared/crud-page/crud-page').then((m) => m.CrudPage);

/**
 * Main navigation; items show only when the user's role has the permission.
 * On phones the first BOTTOM_BAR_SIZE visible items sit in the bottom bar, the rest under "More".
 */
export const NAV = [
  { path: '/', label: 'nav.home', icon: 'home', permission: null },
  { path: '/stocks', label: 'nav.stocks', icon: 'box', permission: 'can_manage_own_shop' },
  { path: '/purchases', label: 'nav.purchases', icon: 'receipt', permission: 'can_manage_own_shop' },
  { path: '/reminders', label: 'nav.reminders', icon: 'bell', permission: 'can_manage_own_shop' },
  { path: '/vendors', label: 'nav.vendors', icon: 'truck', permission: 'can_manage_own_shop' },
  { path: '/support', label: 'nav.support', icon: 'help', permission: null },
  { path: '/admin', label: 'nav.admin', icon: 'shield', permission: 'can_access_admin' },
];

export const BOTTOM_BAR_SIZE = 4;

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/onboarding').then((m) => m.Onboarding),
  },
  {
    path: '',
    canActivate: [authGuard, onboardedGuard],
    children: [
      { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
      {
        path: 'stocks',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_own_shop', entity: 'stocks' },
        loadComponent: crudPage,
      },
      {
        path: 'vendors',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_own_shop', entity: 'vendors' },
        loadComponent: crudPage,
      },
      {
        path: 'reminders',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_own_shop', entity: 'reminders' },
        loadComponent: crudPage,
      },
      {
        path: 'purchases',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_own_shop' },
        loadComponent: () => import('./features/purchases/purchases').then((m) => m.Purchases),
      },
      { path: 'support', data: { entity: 'support' }, loadComponent: crudPage },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then((m) => m.Profile) },
      {
        path: 'admin',
        canActivate: [permissionGuard],
        data: { permission: 'can_access_admin' },
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
