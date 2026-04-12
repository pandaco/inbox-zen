import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ChromeMessagingService } from '../messaging/chrome-messaging.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly messaging = inject(ChromeMessagingService);
  private readonly router = inject(Router);

  readonly isAuthenticated = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  checkStatus(): void {
    this.messaging.send<{ authenticated: boolean }>({ type: 'GET_AUTH_STATUS' }).subscribe({
      next: (res) => {
        this.isAuthenticated.set(res.data?.authenticated ?? false);
        if (res.data?.authenticated) {
          this.router.navigate(['/stats']);
        }
      },
    });
  }

  login(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.messaging.send<{ authenticated: boolean }>({ type: 'AUTHENTICATE' }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.isAuthenticated.set(true);
          this.router.navigate(['/stats']);
        } else {
          this.error.set(res.error ?? 'Authentication failed');
        }
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.error.set(err instanceof Error ? err.message : 'Authentication failed');
      },
    });
  }

  logout(): void {
    this.messaging.send({ type: 'LOGOUT' }).subscribe({
      next: () => {
        this.isAuthenticated.set(false);
        this.router.navigate(['/auth']);
      },
    });
  }
}
