import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="navbar">
      <div class="navbar-container">
        <div class="navbar-brand">
          <h1>Trading Platform</h1>
        </div>
        <ul class="navbar-menu">
          <li><a routerLink="/dashboard">Dashboard</a></li>
          <li><a routerLink="/orders/new">Place Order</a></li>
          <li><a routerLink="/orders/history">View Orders</a></li>
          <li><button class="btn-logout" (click)="logout()">Logout</button></li>
        </ul>
      </div>
    </nav>
  `,
  styles: [`
    .navbar {
      background-color: var(--prussian-blue);
      padding: var(--spacing-md) 0;
      box-shadow: var(--shadow-md);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .navbar-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 var(--spacing-lg);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .navbar-brand h1 {
      color: white;
      font-size: var(--font-size-xl);
      margin: 0;
    }

    .navbar-menu {
      list-style: none;
      display: flex;
      gap: var(--spacing-lg);
      align-items: center;
    }

    .navbar-menu a {
      color: white;
      text-decoration: none;
      transition: color 0.3s ease;
    }

    .navbar-menu a:hover {
      color: var(--amber-glow);
    }

    .btn-logout {
      background-color: var(--rosy-copper);
      color: white;
      border: none;
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s ease;
    }

    .btn-logout:hover {
      background-color: #a03d22ff;
      box-shadow: var(--shadow-md);
    }
  `]
})
export class NavbarComponent {
  constructor() {}

  logout(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
    window.location.href = '/login';
  }
}
