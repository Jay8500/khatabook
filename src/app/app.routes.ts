import { Routes } from '@angular/router';
import { authGuard, guestGuard, homeGuard, onboardedGuard, permissionGuard } from './core/guards';

const crudPage = () => import('./shared/crud-page/crud-page').then((m) => m.CrudPage);

/**
 * Main navigation; items show only when the user's role has the permission.
 * On phones the first BOTTOM_BAR_SIZE visible items sit in the bottom bar, the rest under "More".
 */
export const NAV: NavItem[] = [
  { path: '/', label: 'nav.home', icon: 'home', permission: 'can_manage_own_shop' },
  { path: '/shop-orders', label: 'nav.orders', icon: 'orders', permission: 'can_manage_own_shop' },
  { path: '/stocks', label: 'nav.stocks', icon: 'box', permission: 'can_manage_own_shop' },
  { path: '/purchases', label: 'nav.purchases', icon: 'receipt', permission: 'can_manage_own_shop' },
  { path: '/orders', label: 'nav.myOrders', icon: 'orders', permission: 'can_order', hideWith: 'can_manage_own_shop' },
  { path: '/join', label: 'nav.shops', icon: 'store', permission: 'can_order', hideWith: 'can_manage_own_shop' },
  { path: '/reminders', label: 'nav.reminders', icon: 'bell', permission: 'can_manage_own_shop' },
  { path: '/my-store', label: 'nav.myStore', icon: 'store', permission: 'can_manage_own_shop' },
  { path: '/vendors', label: 'nav.vendors', icon: 'truck', permission: 'can_manage_own_shop' },
  { path: '/support', label: 'nav.support', icon: 'help', permission: null },
  { path: '/admin', label: 'nav.admin', icon: 'shield', permission: 'can_access_admin' },
];

export const BOTTOM_BAR_SIZE = 4;

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Shown only with this permission (null = everyone signed in). */
  permission: string | null;
  /** Hidden when the user also has this permission (e.g. customer-only items). */
  hideWith?: string;
}

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  // Public: shop stores and joining, no login needed to browse.
  { path: 's/:slug', loadComponent: () => import('./features/store/store-page').then((m) => m.StorePage) },
  { path: 's/:slug/cart', loadComponent: () => import('./features/store/cart-page').then((m) => m.CartPage) },
  { path: 'join', loadComponent: () => import('./features/store/join-page').then((m) => m.JoinPage) },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/onboarding').then((m) => m.Onboarding),
  },
  {
    path: '',
    canActivate: [authGuard, onboardedGuard],
    children: [
      { path: '', canActivate: [homeGuard], loadComponent: () => import('./features/home/home').then((m) => m.Home) },
      {
        path: 'orders',
        canActivate: [permissionGuard],
        data: { permission: 'can_order' },
        loadComponent: () => import('./features/orders/my-orders').then((m) => m.MyOrders),
      },
      { path: 'orders/:id', loadComponent: () => import('./features/orders/order-detail').then((m) => m.OrderDetailPage) },
      {
        path: 'shop-orders',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_own_shop' },
        loadComponent: () => import('./features/orders/shop-orders').then((m) => m.ShopOrders),
      },
      {
        path: 'my-store',
        canActivate: [permissionGuard],
        data: { permission: 'can_manage_own_shop' },
        loadComponent: () => import('./features/store/my-store').then((m) => m.MyStore),
      },
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
