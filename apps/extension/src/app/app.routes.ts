import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () =>
      import('./features/auth/auth.component').then((m) => m.AuthComponent),
  },
  {
    path: 'stats',
    loadComponent: () =>
      import('./features/stats/stats.component').then((m) => m.StatsComponent),
  },
  { path: '**', redirectTo: 'auth' },
];
