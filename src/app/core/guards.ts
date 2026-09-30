import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { ToastService } from './services/toast.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() || inject(Router).createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return !auth.isLoggedIn() || inject(Router).createUrlTree(['/']);
};

export const onboardedGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return !auth.needsOnboarding() || inject(Router).createUrlTree(['/onboarding']);
};

/** Route data { permission: '<key in roles.permissions>' }. */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const permission = route.data['permission'] as string | undefined;
  if (!permission || auth.can(permission)) return true;
  inject(ToastService).show('permissionDenied', 'error');
  return inject(Router).createUrlTree(['/']);
};

/** Customers (no shop of their own) land on their orders instead of the shop dashboard. */
export const homeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.can('can_manage_own_shop')) return true;
  const home = auth.can('can_access_admin') ? '/admin' : auth.can('can_order') ? '/orders' : '/support';
  return inject(Router).createUrlTree([home]);
};
