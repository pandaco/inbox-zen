import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-auth',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth">
      <div class="auth__logo" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42
                   M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      </div>

      <h1 class="auth__title">Inbox Zen</h1>
      <p class="auth__subtitle">Connect your Gmail account to get started</p>

      @if (auth.error()) {
        <p class="auth__error" role="alert">{{ auth.error() }}</p>
      }

      <button
        class="auth__btn"
        [disabled]="auth.isLoading()"
        [attr.aria-busy]="auth.isLoading()"
        (click)="auth.login()"
      >
        @if (auth.isLoading()) {
          <span class="auth__spinner" aria-hidden="true"></span>
          Connecting…
        } @else {
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
               aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26
              1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23
              1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43
              8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09
              14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Connect with Google
        }
      </button>
    </div>
  `,
  styles: `
    .auth {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 2rem;
      gap: 1rem;
      font-family: 'Google Sans', Roboto, sans-serif;
    }

    .auth__logo { color: #1a73e8; }

    .auth__title {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 600;
      color: #202124;
    }

    .auth__subtitle {
      margin: 0;
      font-size: 0.9rem;
      color: #5f6368;
      text-align: center;
    }

    .auth__error {
      margin: 0;
      padding: 0.6rem 1rem;
      border-radius: 6px;
      background: #fce8e6;
      color: #c5221f;
      font-size: 0.85rem;
      text-align: center;
    }

    .auth__btn {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      margin-top: 0.5rem;
      padding: 0.6rem 1.4rem;
      border: 1px solid #dadce0;
      border-radius: 4px;
      background: #fff;
      color: #3c4043;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
      font-family: inherit;
    }

    .auth__btn:hover:not(:disabled) { background: #f8f9fa; }
    .auth__btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .auth__spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #dadce0;
      border-top-color: #1a73e8;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class AuthComponent implements OnInit {
  protected readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.auth.checkStatus();
  }
}
