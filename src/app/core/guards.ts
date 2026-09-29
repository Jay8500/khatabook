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
