import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { Component, Injectable, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Router, RouterLink, RouterLinkActive, RouterOutlet, Routes } from '@angular/router';
import { catchError, firstValueFrom, map, of } from 'rxjs';

type AnyRecord = Record<string, any>;
type MessageType = 'success' | 'danger' | 'warning' | 'info';

const MODULE_BY_ROUTE: Record<string, string> = {
  '/usuarios.html': 'usuarios',
  '/reglas-acumulacion.html': 'acumulacion',
  '/reglas-redencion.html': 'redencion',
  '/historial.html': 'historial',
  '/reportes.html': 'reportes',
  '/roles.html': 'configuracion'
};

@Injectable({ providedIn: 'root' })
class ApiService {
  private http = inject(HttpClient);
  private baseUrl = (window as AnyRecord).REWARD_API_BASE_URL || localStorage.getItem('rewardApiBaseUrl') || 'http://localhost:3000';

  request<T = any>(method: string, path: string, payload?: AnyRecord): Promise<T> {
    return firstValueFrom(
      this.http.request<any>(method, `${this.baseUrl}${path}`, {
        body: payload,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json' } : {})
        }
      }).pipe(
        map((body) => {
          if (body?.ok === false) {
            throw new Error(body.mensaje || 'No fue posible completar la solicitud');
          }
          return body?.data ?? body;
        }),
        catchError((error: HttpErrorResponse) => {
          const message = error.error?.mensaje || error.error?.message || error.message || 'No fue posible completar la solicitud';
          throw new Error(message);
        })
      )
    );
  }

  get<T = any>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T = any>(path: string, payload: AnyRecord): Promise<T> {
    return this.request<T>('POST', path, payload);
  }

  put<T = any>(path: string, payload: AnyRecord): Promise<T> {
    return this.request<T>('PUT', path, payload);
  }

  patch<T = any>(path: string, payload: AnyRecord): Promise<T> {
    return this.request<T>('PATCH', path, payload);
  }
}

@Injectable({ providedIn: 'root' })
class SessionService {
  getSession(): AnyRecord | null {
    const raw = localStorage.getItem('rewardSession') || sessionStorage.getItem('rewardSession');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  get user(): AnyRecord | null {
    return this.getSession()?.usuario ?? null;
  }

  isAdmin(): boolean {
    return String(this.user?.rol || '').toLowerCase() === 'administrador';
  }

  save(data: AnyRecord, persistent: boolean): void {
    const target = persistent ? localStorage : sessionStorage;
    const stale = persistent ? sessionStorage : localStorage;
    stale.removeItem('rewardSession');
    target.setItem('rewardSession', JSON.stringify({
      token: data.token,
      usuario: data.usuario,
      createdAt: new Date().toISOString()
    }));
  }

  updateUser(user: AnyRecord): void {
    const rawLocal = localStorage.getItem('rewardSession');
    const storage = rawLocal ? localStorage : sessionStorage;
    const session = this.getSession();
    if (!session) return;
    session.usuario = user;
    storage.setItem('rewardSession', JSON.stringify(session));
  }

  clear(): void {
    localStorage.removeItem('rewardSession');
    sessionStorage.removeItem('rewardSession');
  }
}

@Injectable({ providedIn: 'root' })
class PermissionService {
  permisos: AnyRecord | null = null;
  private api = inject(ApiService);
  private session = inject(SessionService);

  async load(): Promise<void> {
    const user = this.session.user;
    const cached = user?.permisos;
    if (cached) {
      this.permisos = cached;
    }
    try {
      const data = await this.api.get<any>('/api/v1/roles');
      const roles = Array.isArray(data) ? data : data?.roles;
      const role = (roles || []).find((item: AnyRecord) => (
        String(item.codigo || item.nombre || '').toLowerCase() === String(user?.rol || '').toLowerCase()
      ));
      if (role?.permisos) {
        this.permisos = role.permisos;
        this.session.updateUser({ ...user, permisos: role.permisos });
      }
    } catch {
      this.permisos = this.permisos || null;
    }
  }

  canAccess(moduleKey?: string | null): boolean {
    if (!moduleKey) return true;
    if (!this.permisos) return true;
    return this.permisos[moduleKey] !== 'ninguno';
  }
}

function n(value: any): number {
  return Number(value || 0);
}

function money(value: any): string {
  return n(value).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

function num(value: any): string {
  return n(value).toLocaleString('es-CO');
}

function date(value: any, fallback = 'No registrado'): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function initials(name: any): string {
  return String(name || 'Administrador').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function downloadCsv(filename: string, rows: AnyRecord[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvValue = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => csvValue(row[key])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-visual">
        <div class="brand-lockup"><span class="brand-mark"><i class="bi bi-gift-fill"></i></span><span>Sistema de<br>Recompensas</span></div>
        <div>
          <h1>Fideliza. Motiva. Crece.</h1>
          <p>Gestiona usuarios, puntos, reglas, redenciones y reportes desde una experiencia Angular con Bootstrap.</p>
        </div>
        <div class="reward-illustration">
          <i class="bi bi-stars"></i>
          <strong>1,250 pts</strong>
          <span>Programa activo</span>
        </div>
      </section>
      <section class="auth-panel">
        <form class="auth-card" (ngSubmit)="login()">
          <h2>Iniciar sesion</h2>
          <p class="text-secondary">Accede a la plataforma de lealtad</p>
          <div class="mb-3">
            <label class="form-label">Correo o numero de documento</label>
            <input class="form-control" name="identifier" [(ngModel)]="identifier" autocomplete="username" required>
          </div>
          <div class="mb-3">
            <label class="form-label">Contrasena</label>
            <div class="input-group">
              <input class="form-control" name="password" [(ngModel)]="contrasena" [type]="showPassword ? 'text' : 'password'" autocomplete="current-password" required>
              <button class="btn btn-outline-secondary" type="button" (click)="showPassword = !showPassword" title="Mostrar contrasena"><i class="bi" [class.bi-eye]="!showPassword" [class.bi-eye-slash]="showPassword"></i></button>
            </div>
          </div>
          <div class="d-flex justify-content-between align-items-center mb-3">
            <label class="form-check-label"><input class="form-check-input me-2" type="checkbox" name="recordar" [(ngModel)]="recordar">Recordarme</label>
            <a routerLink="/registro.html">Registrate</a>
          </div>
          <div *ngIf="message" class="alert" [class.alert-danger]="messageType === 'danger'" [class.alert-success]="messageType === 'success'">{{ message }}</div>
          <button class="btn btn-primary w-100" [disabled]="loading" type="submit">
            <span *ngIf="loading" class="spinner-border spinner-border-sm me-2"></span>Iniciar sesion
          </button>
        </form>
      </section>
    </main>
  `
})
class LoginComponent {
  private api = inject(ApiService);
  private session = inject(SessionService);
  private router = inject(Router);
  identifier = '';
  contrasena = '';
  recordar = true;
  showPassword = false;
  loading = false;
  message = '';
  messageType: MessageType = 'danger';

  async login(): Promise<void> {
    this.message = '';
    const identifier = this.identifier.trim();
    if (!identifier || !this.contrasena) {
      this.message = 'Ingresa correo o documento y contrasena.';
      this.messageType = 'danger';
      return;
    }
    const payload = identifier.includes('@') ? { correo: identifier, contrasena: this.contrasena } : { numero_documento: identifier, contrasena: this.contrasena };
    try {
      this.loading = true;
      const data = await this.api.post<any>('/api/v1/usuarios/login', payload);
      this.session.save(data, this.recordar);
      this.message = `Sesion iniciada correctamente. Hola, ${data.usuario?.nombre || 'usuario'}.`;
      this.messageType = 'success';
      await this.router.navigateByUrl('/dashboard.html');
    } catch (error: any) {
      this.message = error.message;
      this.messageType = 'danger';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-visual">
        <div class="brand-lockup"><span class="brand-mark"><i class="bi bi-gift-fill"></i></span><span>Sistema de<br>Recompensas</span></div>
        <h1>Crea una cuenta administrativa</h1>
        <p>Registra el usuario que administrara reglas, reportes y trazabilidad del programa.</p>
      </section>
      <section class="auth-panel">
        <form class="auth-card wide" (ngSubmit)="register()">
          <h2>Registro</h2>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">Tipo documento</label><select class="form-select" name="tipo" [(ngModel)]="model.tipo_documento"><option>CC</option><option>CE</option><option>NIT</option><option>TI</option></select></div>
            <div class="col-md-6"><label class="form-label">Numero documento</label><input class="form-control" name="numero" [(ngModel)]="model.numero_documento" required></div>
            <div class="col-md-6"><label class="form-label">Nombre</label><input class="form-control" name="nombre" [(ngModel)]="model.nombre" required></div>
            <div class="col-md-6"><label class="form-label">Correo</label><input class="form-control" name="correo" [(ngModel)]="model.correo" type="email" required></div>
            <div class="col-md-6"><label class="form-label">Telefono</label><input class="form-control" name="telefono" [(ngModel)]="model.telefono"></div>
            <div class="col-md-6"><label class="form-label">Rol</label><select class="form-select" name="rol" [(ngModel)]="model.rol"><option value="administrador">Administrador</option><option value="operador">Operador</option><option value="consulta">Consulta</option></select></div>
            <div class="col-md-6"><label class="form-label">Contrasena</label><input class="form-control" name="contrasena" [(ngModel)]="model.contrasena" type="password" required></div>
            <div class="col-md-6"><label class="form-label">Confirmar</label><input class="form-control" name="confirmar" [(ngModel)]="confirmar" type="password" required></div>
          </div>
          <div *ngIf="message" class="alert mt-3" [class.alert-danger]="messageType === 'danger'" [class.alert-success]="messageType === 'success'">{{ message }}</div>
          <button class="btn btn-primary w-100 mt-3" [disabled]="loading" type="submit"><span *ngIf="loading" class="spinner-border spinner-border-sm me-2"></span>Crear cuenta</button>
          <p class="text-center mt-3 mb-0">Ya tienes cuenta? <a routerLink="/index.html">Inicia sesion</a></p>
        </form>
      </section>
    </main>
  `
})
class RegisterComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  model: AnyRecord = { tipo_documento: 'CC', rol: 'administrador' };
  confirmar = '';
  loading = false;
  message = '';
  messageType: MessageType = 'danger';

  async register(): Promise<void> {
    if (this.model.contrasena !== this.confirmar) {
      this.message = 'Las contrasenas no coinciden.';
      this.messageType = 'danger';
      return;
    }
    if (String(this.model.contrasena || '').length < 6) {
      this.message = 'La contrasena debe tener al menos 6 caracteres.';
      this.messageType = 'danger';
      return;
    }
    try {
      this.loading = true;
      const user = await this.api.post<any>('/api/v1/usuarios/registro', this.model);
      localStorage.setItem('rewardLastRegisteredEmail', user.correo || this.model.correo);
      await this.router.navigateByUrl('/index.html');
    } catch (error: any) {
      this.message = error.message;
      this.messageType = 'danger';
    } finally {
      this.loading = false;
    }
  }
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="admin-shell" [class.sidebar-collapsed]="collapsed">
      <aside class="sidebar">
        <a class="brand-lockup" routerLink="/dashboard.html"><span class="brand-mark"><i class="bi bi-gift-fill"></i></span><span>Sistema de<br>Recompensas</span></a>
        <nav class="nav flex-column gap-1">
          <a *ngFor="let item of nav" class="nav-link" [hidden]="!can(item.module)" [routerLink]="item.path" routerLinkActive="active"><i class="bi" [class]="item.icon"></i><span>{{ item.label }}</span></a>
        </nav>
        <button class="btn btn-outline-secondary mt-auto" type="button" (click)="collapsed = !collapsed"><i class="bi bi-layout-sidebar"></i><span>Menu</span></button>
      </aside>
      <main class="main-panel">
        <header class="topbar">
          <div class="input-group top-search"><span class="input-group-text"><i class="bi bi-search"></i></span><input class="form-control" placeholder="Buscar usuarios, transacciones, reglas..."></div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-light position-relative" type="button" (click)="notificationsOpen = !notificationsOpen"><i class="bi bi-bell"></i><span *ngIf="unread" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">{{ unread }}</span></button>
            <div class="dropdown" [class.show]="profileOpen">
              <button class="btn btn-light d-flex align-items-center gap-2" type="button" (click)="profileOpen = !profileOpen"><span class="avatar">{{ initials(user?.nombre) }}</span><span class="d-none d-md-inline">{{ user?.nombre || 'Administrador' }}</span><i class="bi bi-chevron-down"></i></button>
              <div class="dropdown-menu dropdown-menu-end show" *ngIf="profileOpen">
                <button class="dropdown-item" type="button" (click)="profilePanel = !profilePanel">Mi perfil</button>
                <button class="dropdown-item" type="button" (click)="logout()">Cerrar sesion</button>
              </div>
            </div>
          </div>
          <section *ngIf="notificationsOpen" class="floating-panel notifications">
            <h6>Notificaciones</h6>
            <p *ngIf="!notifications.length" class="text-secondary mb-0">Sin novedades nuevas</p>
            <div *ngFor="let item of notifications" class="notification-item"><i class="bi bi-info-circle"></i><div><strong>{{ item.titulo || 'Novedad registrada' }}</strong><small>{{ item.detalle || 'Actividad reciente' }}</small></div></div>
          </section>
          <section *ngIf="profilePanel" class="floating-panel profile-panel">
            <h6>Mi perfil</h6>
            <dl class="row small mb-0">
              <dt class="col-5">Nombre</dt><dd class="col-7">{{ user?.nombre || 'No registrado' }}</dd>
              <dt class="col-5">Rol</dt><dd class="col-7">{{ user?.rol || 'No registrado' }}</dd>
              <dt class="col-5">Correo</dt><dd class="col-7">{{ user?.correo || 'No registrado' }}</dd>
              <dt class="col-5">Documento</dt><dd class="col-7">{{ user?.numero_documento || 'No registrado' }}</dd>
            </dl>
          </section>
        </header>
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
class AdminLayoutComponent implements OnInit {
  private session = inject(SessionService);
  private permissions = inject(PermissionService);
  private api = inject(ApiService);
  private router = inject(Router);
  user = this.session.user;
  collapsed = localStorage.getItem('rewardAdminSidebarCollapsed') === 'true';
  profileOpen = false;
  profilePanel = false;
  notificationsOpen = false;
  notifications: AnyRecord[] = [];
  unread = 0;
  nav = [
    { path: '/dashboard.html', label: 'Dashboard', icon: 'bi-grid-1x2-fill', module: null },
    { path: '/usuarios.html', label: 'Usuarios', icon: 'bi-people-fill', module: 'usuarios' },
    { path: '/reglas-acumulacion.html', label: 'Reglas de acumulacion', icon: 'bi-plus-circle-fill', module: 'acumulacion' },
    { path: '/reglas-redencion.html', label: 'Reglas de redencion', icon: 'bi-gift-fill', module: 'redencion' },
    { path: '/historial.html', label: 'Historial', icon: 'bi-clock-history', module: 'historial' },
    { path: '/reportes.html', label: 'Reportes', icon: 'bi-bar-chart-fill', module: 'reportes' },
    { path: '/roles.html', label: 'Roles', icon: 'bi-shield-lock-fill', module: 'configuracion' }
  ];
  initials = initials;

  async ngOnInit(): Promise<void> {
    if (!this.session.isAdmin()) {
      this.session.clear();
      await this.router.navigateByUrl('/index.html');
      return;
    }
    await this.permissions.load();
    const moduleKey = MODULE_BY_ROUTE[this.router.url.split('?')[0]];
    if (!this.permissions.canAccess(moduleKey)) {
      await this.router.navigateByUrl('/dashboard.html');
      return;
    }
    this.loadNotifications();
  }

  can(moduleKey?: string | null): boolean {
    return this.permissions.canAccess(moduleKey);
  }

  async loadNotifications(): Promise<void> {
    const dashboard = await this.api.get<any>('/api/v1/dashboard/admin').catch(() => null);
    this.notifications = dashboard?.notificaciones || [];
    this.unread = this.notifications.length;
  }

  async logout(): Promise<void> {
    this.session.clear();
    await this.router.navigateByUrl('/index.html');
  }
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="content-page">
      <div class="page-heading"><div><h1>Dashboard</h1><p>Resumen general del programa de fidelizacion y trazabilidad.</p></div><button class="btn btn-outline-primary" (click)="load()"><i class="bi bi-arrow-clockwise"></i> Actualizar</button></div>
      <div class="row g-3">
        <article class="col-md-6 col-xl-3" *ngFor="let metric of metrics"><div class="metric-card"><span class="metric-icon" [class]="metric.color"><i class="bi" [class]="metric.icon"></i></span><small>{{ metric.label }}</small><strong>{{ num(metric.value) }}</strong><em>{{ metric.trend }}</em></div></article>
      </div>
      <div class="row g-3 mt-1">
        <section class="col-xl-8">
          <div class="panel mb-3">
            <div class="d-flex justify-content-between align-items-center mb-3"><h2>Acumulacion de puntos por mes</h2><select class="form-select w-auto" [(ngModel)]="monthFilter" (change)="filterMonths()"><option value="year">Ano actual</option><option value="3">Ultimos 3 meses</option><option value="6">Ultimos 6 meses</option><option value="12">Ultimos 12 meses</option></select></div>
            <div class="bar-chart"><span *ngFor="let item of monthly" [style.height.%]="barHeight(item.puntos)" [title]="item.periodo + ': ' + num(item.puntos) + ' pts'"><b>{{ monthLabel(item.periodo) }}</b></span><p *ngIf="!monthly.length" class="text-secondary">No hay acumulaciones registradas.</p></div>
          </div>
          <div class="panel">
            <h2>Movimientos recientes</h2>
            <div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Origen</th><th>Puntos</th><th>Estado</th></tr></thead><tbody><tr *ngFor="let m of movements"><td>{{ date(m.fecha_movimiento) }}</td><td><span class="avatar small">{{ initials(m.usuario_nombre) }}</span> {{ m.usuario_nombre || 'Usuario sin nombre' }}</td><td><span class="badge" [class.text-bg-success]="m.tipo_movimiento !== 'REDENCION'" [class.text-bg-danger]="m.tipo_movimiento === 'REDENCION'">{{ m.tipo_movimiento === 'REDENCION' ? 'Redencion' : 'Acumulacion' }}</span></td><td>{{ m.origen || 'Sin origen' }}</td><td [class.text-danger]="m.tipo_movimiento === 'REDENCION'" [class.text-success]="m.tipo_movimiento !== 'REDENCION'">{{ m.tipo_movimiento === 'REDENCION' ? '-' : '+' }}{{ num(m.puntos) }}</td><td>{{ m.estado || 'Completado' }}</td></tr></tbody></table></div>
          </div>
        </section>
        <aside class="col-xl-4">
          <div class="panel mb-3"><h2>Top clientes</h2><ol class="list-group list-group-numbered"><li class="list-group-item d-flex justify-content-between align-items-center" *ngFor="let c of topClients"><span>{{ c.nombre || 'Usuario' }}</span><strong>{{ num(c.saldo_actual) }} pts</strong></li></ol></div>
          <div class="panel"><h2>Saldo total auditado</h2><strong class="display-6">{{ num(audit.saldo_total) }} pts</strong><p class="text-secondary">Equivalente a {{ money(audit.valor_equivalente) }}</p><small>{{ audit.ultima_auditoria ? date(audit.ultima_auditoria) : 'Sin auditorias registradas' }}</small></div>
        </aside>
      </div>
    </section>
  `
})
class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  data: AnyRecord = {};
  metrics: AnyRecord[] = [];
  allMonthly: AnyRecord[] = [];
  monthly: AnyRecord[] = [];
  movements: AnyRecord[] = [];
  topClients: AnyRecord[] = [];
  audit: AnyRecord = {};
  monthFilter = 'year';
  num = num;
  money = money;
  date = date;
  initials = initials;

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.data = await this.api.get<any>('/api/v1/dashboard/admin').catch(() => ({}));
    const m = this.data.metricas || {};
    this.metrics = [
      { label: 'Usuarios activos', value: m.usuarios_activos?.valor, trend: `${n(m.usuarios_activos?.variacion?.porcentaje).toFixed(1)}%`, icon: 'bi-people-fill', color: 'green' },
      { label: 'Puntos acumulados', value: m.puntos_acumulados?.valor, trend: `${n(m.puntos_acumulados?.variacion?.porcentaje).toFixed(1)}%`, icon: 'bi-coin', color: 'blue' },
      { label: 'Puntos redimidos', value: m.puntos_redimidos?.valor, trend: `${n(m.puntos_redimidos?.variacion?.porcentaje).toFixed(1)}%`, icon: 'bi-gift-fill', color: 'red' },
      { label: 'Redenciones hoy', value: m.redenciones_hoy?.valor, trend: `${n(m.redenciones_hoy?.variacion?.porcentaje).toFixed(1)}%`, icon: 'bi-cart-check-fill', color: 'yellow' }
    ];
    this.allMonthly = [...(this.data.graficas?.acumulacion_mensual || [])].sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
    this.movements = this.data.movimientos_recientes || [];
    this.topClients = this.data.top_clientes || [];
    this.audit = this.data.auditoria || {};
    this.filterMonths();
  }

  filterMonths(): void {
    if (this.monthFilter === 'year') {
      const year = new Date().getFullYear();
      this.monthly = this.allMonthly.filter((item) => String(item.periodo).startsWith(`${year}-`));
      return;
    }
    this.monthly = this.allMonthly.slice(-Number(this.monthFilter));
  }

  barHeight(value: any): number {
    const max = Math.max(...this.monthly.map((item) => n(item.puntos)), 1);
    return Math.max((n(value) / max) * 100, n(value) ? 8 : 0);
  }

  monthLabel(period: string): string {
    const [, month] = String(period).split('-').map(Number);
    return new Date(2024, month - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  }
}

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [CommonModule],
  inputs: ['message', 'type'],
  template: `<div *ngIf="message" class="alert" [class.alert-success]="type === 'success'" [class.alert-danger]="type === 'danger'" [class.alert-warning]="type === 'warning'" [class.alert-info]="type === 'info'">{{ message }}</div>`
})
class MessageComponent {
  message = '';
  type: MessageType = 'success';
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, MessageComponent],
  template: `
    <section class="content-page">
      <div class="page-heading"><div><h1>Usuarios</h1><p>Consulta, crea y administra saldos de usuarios.</p></div><div class="d-flex gap-2"><button class="btn btn-outline-secondary" (click)="export()"><i class="bi bi-download"></i> Exportar</button><button class="btn btn-primary" (click)="openCreate()"><i class="bi bi-plus-lg"></i> Nuevo usuario</button></div></div>
      <app-message [message]="message" [type]="messageType"></app-message>
      <div class="row g-3 mb-3"><div class="col-md-3" *ngFor="let metric of userMetrics"><div class="metric-card compact"><small>{{ metric.label }}</small><strong>{{ metric.value }}</strong><em>{{ metric.help }}</em></div></div></div>
      <div class="panel">
        <div class="row g-2 mb-3"><div class="col-md-5"><input class="form-control" placeholder="Buscar por nombre, correo o documento" [(ngModel)]="search" (input)="applyFilters()"></div><div class="col-md-3"><select class="form-select" [(ngModel)]="docFilter" (change)="applyFilters()"><option value="">Todos los documentos</option><option *ngFor="let t of documentTypes" [value]="t">{{ t }}</option></select></div><div class="col-md-2"><select class="form-select" [(ngModel)]="statusFilter" (change)="applyFilters()"><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></div></div>
        <div class="row g-3">
          <div class="col-xl-8"><div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>Documento</th><th>Nombre</th><th>Correo</th><th>Estado</th><th>Saldo</th><th></th></tr></thead><tbody><tr *ngFor="let u of filtered" [class.table-primary]="selected?.id === u.id" (click)="select(u)"><td><span class="badge text-bg-light">{{ u.tipo_documento }}</span> {{ u.numero_documento || u.id }}</td><td>{{ u.nombre }}</td><td>{{ u.correo }}</td><td><span class="badge" [class.text-bg-success]="u.estado !== false" [class.text-bg-secondary]="u.estado === false">{{ u.estado === false ? 'Inactivo' : 'Activo' }}</span></td><td>{{ num(u.saldo_actual) }} pts</td><td><button class="btn btn-sm btn-light" type="button"><i class="bi bi-three-dots-vertical"></i></button></td></tr></tbody></table></div></div>
          <aside class="col-xl-4"><div class="detail-panel" *ngIf="selected; else emptyUser"><div class="d-flex align-items-center gap-3 mb-3"><span class="avatar large">{{ initials(selected.nombre) }}</span><div><h2>{{ selected.nombre }}</h2><span class="badge" [class.text-bg-success]="selected.estado !== false" [class.text-bg-secondary]="selected.estado === false">{{ selected.estado === false ? 'Inactivo' : 'Activo' }}</span></div></div><dl class="row small"><dt class="col-5">Correo</dt><dd class="col-7">{{ selected.correo || 'No registrado' }}</dd><dt class="col-5">Telefono</dt><dd class="col-7">{{ selected.telefono || 'No registrado' }}</dd><dt class="col-5">Rol</dt><dd class="col-7">{{ selected.rol || 'No registrado' }}</dd><dt class="col-5">Registro</dt><dd class="col-7">{{ date(selected.fecha_creacion) }}</dd></dl><div class="balance-box"><span>Saldo actual</span><strong>{{ num(selected.saldo_actual) }} pts</strong><small>{{ money(selected.saldo_actual) }}</small></div><div class="d-grid gap-2 mt-3"><button class="btn btn-outline-primary" (click)="refreshSelected()">Consultar informacion</button><button class="btn btn-outline-warning" (click)="toggleSelected()">{{ selected.estado === false ? 'Activar' : 'Desactivar' }} usuario</button><button class="btn btn-outline-secondary" (click)="loadHistory()">Ver historial</button></div><ul class="list-group list-group-flush mt-3" *ngIf="history.length"><li class="list-group-item" *ngFor="let h of history"><strong>{{ h.tipo_movimiento }}</strong> {{ num(h.puntos) }} pts<br><small>{{ date(h.fecha_movimiento) }}</small></li></ul></div><ng-template #emptyUser><p class="text-secondary">Selecciona un usuario para ver el detalle.</p></ng-template></aside>
        </div>
      </div>
      <div class="modal-backdrop-lite" *ngIf="showCreate" (click)="showCreate=false"></div>
      <div class="modal-card" *ngIf="showCreate"><form (ngSubmit)="create()"><h2>Nuevo usuario</h2><div class="row g-2"><div class="col-md-6"><label class="form-label">Tipo documento</label><input class="form-control" name="tipo" [(ngModel)]="newUser.tipo_documento" required></div><div class="col-md-6"><label class="form-label">Numero</label><input class="form-control" name="numero" [(ngModel)]="newUser.numero_documento" required></div><div class="col-md-6"><label class="form-label">Nombre</label><input class="form-control" name="nombre" [(ngModel)]="newUser.nombre" required></div><div class="col-md-6"><label class="form-label">Correo</label><input class="form-control" name="correo" [(ngModel)]="newUser.correo"></div><div class="col-md-6"><label class="form-label">Telefono</label><input class="form-control" name="telefono" [(ngModel)]="newUser.telefono"></div><div class="col-md-6"><label class="form-label">Rol</label><input class="form-control" name="rol" [(ngModel)]="newUser.rol"></div></div><footer class="d-flex justify-content-end gap-2 mt-3"><button class="btn btn-light" type="button" (click)="showCreate=false">Cancelar</button><button class="btn btn-primary">Guardar</button></footer></form></div>
    </section>
  `
})
class UsersComponent implements OnInit {
  private api = inject(ApiService);
  users: AnyRecord[] = [];
  filtered: AnyRecord[] = [];
  selected: AnyRecord | null = null;
  history: AnyRecord[] = [];
  search = '';
  docFilter = '';
  statusFilter = '';
  documentTypes: string[] = [];
  showCreate = false;
  newUser: AnyRecord = { tipo_documento: 'CC', rol: 'consulta' };
  message = '';
  messageType: MessageType = 'success';
  num = num;
  money = money;
  date = date;
  initials = initials;

  get userMetrics(): AnyRecord[] {
    const total = this.users.length;
    const active = this.users.filter((u) => u.estado !== false).length;
    const inactive = total - active;
    const average = total ? Math.round(this.users.reduce((sum, u) => sum + n(u.saldo_actual), 0) / total) : 0;
    return [
      { label: 'Total usuarios', value: num(total), help: 'Registrados' },
      { label: 'Activos', value: num(active), help: `${total ? ((active / total) * 100).toFixed(1) : '0.0'}% del total` },
      { label: 'Inactivos', value: num(inactive), help: `${total ? ((inactive / total) * 100).toFixed(1) : '0.0'}% del total` },
      { label: 'Saldo promedio', value: `${num(average)} pts`, help: money(average) }
    ];
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.users = await this.api.get<any[]>('/api/v1/usuarios').catch((e) => this.fail(e));
    this.documentTypes = [...new Set(this.users.map((u) => u.tipo_documento).filter(Boolean))].sort();
    this.applyFilters();
  }

  fail(error: any): [] {
    this.message = error.message;
    this.messageType = 'danger';
    return [];
  }

  applyFilters(): void {
    const term = this.search.trim().toLowerCase();
    this.filtered = this.users.filter((u) => {
      const matchesTerm = !term || [u.nombre, u.correo, u.numero_documento, u.id].some((value) => String(value || '').toLowerCase().includes(term));
      const matchesDoc = !this.docFilter || u.tipo_documento === this.docFilter;
      const matchesStatus = !this.statusFilter || String(u.estado !== false) === this.statusFilter;
      return matchesTerm && matchesDoc && matchesStatus;
    });
    this.selected = this.selected ? this.filtered.find((u) => String(u.id) === String(this.selected?.id)) || this.filtered[0] || null : this.filtered[0] || null;
  }

  select(user: AnyRecord): void {
    this.selected = user;
    this.history = [];
  }

  openCreate(): void {
    this.newUser = { tipo_documento: 'CC', rol: 'consulta' };
    this.showCreate = true;
  }

  async create(): Promise<void> {
    await this.api.post('/api/v1/usuarios', this.newUser);
    this.message = 'Usuario creado correctamente.';
    this.messageType = 'success';
    this.showCreate = false;
    await this.load();
  }

  async refreshSelected(): Promise<void> {
    if (!this.selected) return;
    this.selected = await this.api.get(`/api/v1/usuarios/${this.selected.id}`);
    this.message = 'Informacion del usuario actualizada.';
  }

  async toggleSelected(): Promise<void> {
    if (!this.selected) return;
    await this.api.patch(`/api/v1/usuarios/${this.selected.id}/estado`, { estado: this.selected.estado === false });
    this.message = 'Estado actualizado correctamente.';
    await this.load();
  }

  async loadHistory(): Promise<void> {
    if (!this.selected) return;
    this.history = await this.api.get<any[]>(`/api/v1/movimientos/usuario/${this.selected.id}`).catch(() => []);
  }

  export(): void {
    downloadCsv(`usuarios-${new Date().toISOString().slice(0, 10)}.csv`, this.filtered);
  }
}

@Component({
  selector: 'app-rules',
  standalone: true,
  imports: [CommonModule, FormsModule, MessageComponent],
  template: `
    <section class="content-page">
      <div class="page-heading"><div><h1>{{ mode === 'earn' ? 'Reglas de acumulacion' : 'Reglas de redencion' }}</h1><p>{{ mode === 'earn' ? 'Define equivalencias para otorgar puntos.' : 'Configura beneficios y registra canjes.' }}</p></div></div>
      <app-message [message]="message" [type]="messageType"></app-message>
      <div class="row g-3">
        <section class="col-xl-8">
          <div class="panel">
            <div class="d-flex gap-2 mb-3"><input class="form-control" placeholder="Buscar regla" [(ngModel)]="search" (input)="applySearch()"><button class="btn btn-outline-secondary" (click)="load()"><i class="bi bi-arrow-clockwise"></i></button></div>
            <div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>Nombre</th><th>{{ mode === 'earn' ? 'Equivalencia' : 'Beneficio' }}</th><th>Descripcion</th><th>Estado</th><th></th></tr></thead><tbody><tr *ngFor="let r of filtered"><td><strong>{{ r.nombre }}</strong></td><td>{{ mode === 'earn' ? money(r.monto_base) + ' = ' + num(r.puntos_otorgados) + ' pts' : num(r.puntos_requeridos) + ' pts = ' + money(r.valor_equivalente) }}</td><td>{{ r.descripcion || 'Sin descripcion' }}</td><td><span class="badge" [class.text-bg-success]="r.estado !== false" [class.text-bg-secondary]="r.estado === false">{{ r.estado === false ? 'Pausada' : 'Activa' }}</span></td><td><div class="btn-group"><button class="btn btn-sm btn-light" (click)="edit(r)"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light" (click)="toggle(r)"><i class="bi bi-power"></i></button></div></td></tr></tbody></table></div>
          </div>
          <div class="panel mt-3" *ngIf="mode === 'redeem'">
            <h2>Validar redencion</h2>
            <div class="row g-2"><div class="col-md-5"><select class="form-select" [(ngModel)]="redemption.usuario_id" (change)="validate()"><option value="">Usuario</option><option *ngFor="let u of users" [value]="u.id">{{ u.nombre }} - {{ num(u.saldo_actual) }} pts</option></select></div><div class="col-md-5"><select class="form-select" [(ngModel)]="redemption.regla_redencion_id" (change)="validate()"><option value="">Beneficio</option><option *ngFor="let r of rules" [value]="r.id">{{ r.nombre }} - {{ num(r.puntos_requeridos) }} pts</option></select></div><div class="col-md-2"><button class="btn btn-primary w-100" (click)="redeem()" [disabled]="!validation.valid">Redimir</button></div></div>
            <div class="alert mt-3" [class.alert-success]="validation.valid" [class.alert-warning]="!validation.valid">{{ validation.message || 'Selecciona un usuario y un beneficio.' }}</div>
          </div>
        </section>
        <aside class="col-xl-4">
          <form class="panel" (ngSubmit)="save()">
            <h2>{{ form.id ? 'Editar regla' : 'Nueva regla' }}</h2>
            <label class="form-label">Nombre</label><input class="form-control mb-2" name="nombre" [(ngModel)]="form.nombre" required>
            <label class="form-label">Descripcion</label><textarea class="form-control mb-2" name="descripcion" [(ngModel)]="form.descripcion"></textarea>
            <ng-container *ngIf="mode === 'earn'; else redeemFields">
              <label class="form-label">Monto base</label><input class="form-control mb-2" name="monto" type="number" [(ngModel)]="form.monto_base" required>
              <label class="form-label">Puntos otorgados</label><input class="form-control mb-2" name="puntos" type="number" [(ngModel)]="form.puntos_otorgados" required>
            </ng-container>
            <ng-template #redeemFields>
              <label class="form-label">Puntos requeridos</label><input class="form-control mb-2" name="puntosReq" type="number" [(ngModel)]="form.puntos_requeridos" required>
              <label class="form-label">Valor equivalente</label><input class="form-control mb-2" name="valor" type="number" [(ngModel)]="form.valor_equivalente" required>
            </ng-template>
            <label class="form-label">Estado</label><select class="form-select mb-3" name="estado" [(ngModel)]="form.estado"><option [ngValue]="true">Activa</option><option [ngValue]="false">Pausada</option></select>
            <div class="d-grid gap-2"><button class="btn btn-primary">Guardar regla</button><button class="btn btn-light" type="button" (click)="reset()">Limpiar</button></div>
          </form>
        </aside>
      </div>
    </section>
  `
})
class RulesComponent implements OnInit {
  private api = inject(ApiService);
  mode: 'earn' | 'redeem' = location.pathname.includes('redencion') ? 'redeem' : 'earn';
  rules: AnyRecord[] = [];
  filtered: AnyRecord[] = [];
  users: AnyRecord[] = [];
  redemptions: AnyRecord[] = [];
  form: AnyRecord = {};
  search = '';
  redemption: AnyRecord = {};
  validation: AnyRecord = {};
  message = '';
  messageType: MessageType = 'success';
  num = num;
  money = money;

  ngOnInit(): void {
    this.reset();
    this.load();
  }

  get endpoint(): string {
    return this.mode === 'earn' ? '/api/v1/reglas-acumulacion' : '/api/v1/reglas-redencion';
  }

  async load(): Promise<void> {
    const requests: Promise<any>[] = [this.api.get(this.endpoint)];
    if (this.mode === 'redeem') {
      requests.push(this.api.get('/api/v1/usuarios'), this.api.get('/api/v1/redenciones'));
    }
    const [rules, users = [], redemptions = []] = await Promise.all(requests).catch((e) => {
      this.message = e.message;
      this.messageType = 'danger';
      return [[], [], []];
    });
    this.rules = rules;
    this.users = users.filter((u: AnyRecord) => u.estado !== false);
    this.redemptions = redemptions;
    this.applySearch();
  }

  applySearch(): void {
    const term = this.search.toLowerCase();
    this.filtered = this.rules.filter((r) => !term || [r.nombre, r.descripcion, r.id].some((v) => String(v || '').toLowerCase().includes(term)));
  }

  reset(): void {
    this.form = this.mode === 'earn'
      ? { estado: true, monto_base: 1000, puntos_otorgados: 1 }
      : { estado: true, puntos_requeridos: 100, valor_equivalente: 1000 };
  }

  edit(rule: AnyRecord): void {
    this.form = { ...rule, estado: rule.estado !== false };
  }

  async save(): Promise<void> {
    if (this.form.id) {
      await this.api.put(`${this.endpoint}/${this.form.id}`, this.form);
      this.message = 'Regla actualizada correctamente.';
    } else {
      await this.api.post(this.endpoint, this.form);
      this.message = 'Regla creada correctamente.';
    }
    this.messageType = 'success';
    this.reset();
    await this.load();
  }

  async toggle(rule: AnyRecord): Promise<void> {
    await this.api.patch(`${this.endpoint}/${rule.id}/estado`, { estado: rule.estado === false });
    this.message = 'Estado actualizado correctamente.';
    await this.load();
  }

  validate(): void {
    const user = this.users.find((u) => String(u.id) === String(this.redemption.usuario_id));
    const rule = this.rules.find((r) => String(r.id) === String(this.redemption.regla_redencion_id));
    if (!user || !rule) {
      this.validation = { valid: false, message: 'Selecciona un usuario y un beneficio.' };
      return;
    }
    const duplicate = this.redemptions.some((r) => String(r.usuario_id) === String(user.id) && String(r.regla_redencion_id) === String(rule.id));
    const enough = n(user.saldo_actual) >= n(rule.puntos_requeridos);
    this.validation = {
      valid: !duplicate && enough && rule.estado !== false,
      message: duplicate ? 'Ya existe una redencion previa para este beneficio.' : enough ? 'El usuario cumple las condiciones.' : 'El usuario no tiene puntos suficientes.'
    };
  }

  async redeem(): Promise<void> {
    this.validate();
    if (!this.validation.valid) return;
    await this.api.post('/api/v1/redenciones', { ...this.redemption, observacion: 'Redencion desde panel admin Angular' });
    this.message = 'Redencion registrada correctamente.';
    this.messageType = 'success';
    this.redemption = {};
    await this.load();
  }
}

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="content-page">
      <div class="page-heading"><div><h1>{{ reportMode ? 'Reportes' : 'Historial' }}</h1><p>{{ reportMode ? 'Indicadores exportables del programa.' : 'Trazabilidad de movimientos de puntos.' }}</p></div><button class="btn btn-outline-secondary" (click)="export()"><i class="bi bi-download"></i> Exportar CSV</button></div>
      <div class="row g-3 mb-3"><div class="col-md-3"><select class="form-select" [(ngModel)]="filters.usuario_id" (change)="apply()"><option value="">Todos los usuarios</option><option *ngFor="let u of users" [value]="u.id">{{ u.nombre }}</option></select></div><div class="col-md-3"><select class="form-select" [(ngModel)]="filters.tipo_movimiento" (change)="apply()"><option value="">Todos los tipos</option><option value="ACUMULACION">Acumulacion</option><option value="REDENCION">Redencion</option></select></div><div class="col-md-3"><input class="form-control" type="date" [(ngModel)]="filters.desde" (change)="apply()"></div><div class="col-md-3"><input class="form-control" type="date" [(ngModel)]="filters.hasta" (change)="apply()"></div></div>
      <div class="row g-3" *ngIf="reportMode">
        <div class="col-md-3"><div class="metric-card compact"><small>Usuarios</small><strong>{{ num(users.length) }}</strong></div></div>
        <div class="col-md-3"><div class="metric-card compact"><small>Movimientos</small><strong>{{ num(filtered.length) }}</strong></div></div>
        <div class="col-md-3"><div class="metric-card compact"><small>Puntos acumulados</small><strong>{{ num(earned) }}</strong></div></div>
        <div class="col-md-3"><div class="metric-card compact"><small>Puntos redimidos</small><strong>{{ num(redeemed) }}</strong></div></div>
      </div>
      <div class="panel mt-3"><div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Origen</th><th>Puntos</th><th>Referencia</th></tr></thead><tbody><tr *ngFor="let m of filtered"><td>{{ date(m.fecha_movimiento) }}</td><td>{{ m.usuario_nombre || userName(m.usuario_id) }}</td><td><span class="badge" [class.text-bg-success]="m.tipo_movimiento !== 'REDENCION'" [class.text-bg-danger]="m.tipo_movimiento === 'REDENCION'">{{ m.tipo_movimiento }}</span></td><td>{{ m.origen || 'Sin origen' }}</td><td>{{ num(m.puntos) }}</td><td>{{ m.referencia || m.id }}</td></tr></tbody></table></div></div>
    </section>
  `
})
class HistoryComponent implements OnInit {
  private api = inject(ApiService);
  reportMode = location.pathname.includes('reportes');
  users: AnyRecord[] = [];
  movements: AnyRecord[] = [];
  filtered: AnyRecord[] = [];
  filters: AnyRecord = {};
  num = num;
  date = date;

  get earned(): number {
    return this.filtered.filter((m) => m.tipo_movimiento !== 'REDENCION').reduce((sum, m) => sum + n(m.puntos), 0);
  }

  get redeemed(): number {
    return this.filtered.filter((m) => m.tipo_movimiento === 'REDENCION').reduce((sum, m) => sum + n(m.puntos), 0);
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    const [users, movements] = await Promise.all([
      this.api.get<any[]>('/api/v1/usuarios').catch(() => []),
      this.api.get<any[]>('/api/v1/movimientos').catch(() => [])
    ]);
    this.users = users;
    this.movements = movements;
    this.apply();
  }

  apply(): void {
    this.filtered = this.movements.filter((m) => {
      const when = new Date(m.fecha_movimiento || m.fecha || 0).toISOString().slice(0, 10);
      return (!this.filters.usuario_id || String(m.usuario_id) === String(this.filters.usuario_id))
        && (!this.filters.tipo_movimiento || m.tipo_movimiento === this.filters.tipo_movimiento)
        && (!this.filters.desde || when >= this.filters.desde)
        && (!this.filters.hasta || when <= this.filters.hasta);
    });
  }

  userName(id: any): string {
    return this.users.find((u) => String(u.id) === String(id))?.nombre || 'Usuario';
  }

  export(): void {
    downloadCsv(`${this.reportMode ? 'reporte' : 'historial'}-${new Date().toISOString().slice(0, 10)}.csv`, this.filtered);
  }
}

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, MessageComponent],
  template: `
    <section class="content-page">
      <div class="page-heading"><div><h1>Roles</h1><p>Permisos por modulo y asignacion de usuarios.</p></div><button class="btn btn-primary" (click)="newRole()"><i class="bi bi-plus-lg"></i> Nuevo rol</button></div>
      <app-message [message]="message" [type]="messageType"></app-message>
      <div class="row g-3">
        <section class="col-xl-8"><div class="panel"><div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>Rol</th><th *ngFor="let m of modules">{{ m.label }}</th><th>Usuarios</th><th></th></tr></thead><tbody><tr *ngFor="let role of roles"><td><strong>{{ role.nombre }}</strong><br><small>{{ role.descripcion || role.codigo }}</small></td><td *ngFor="let m of modules"><button class="permission-toggle" [class]="role.permisos?.[m.key] || 'ninguno'" (click)="cycle(role, m.key)"><i class="bi" [class.bi-check-lg]="role.permisos?.[m.key] === 'completo'" [class.bi-eye]="role.permisos?.[m.key] === 'lectura'" [class.bi-dash-lg]="!role.permisos?.[m.key] || role.permisos?.[m.key] === 'ninguno'"></i></button></td><td>{{ role.usuarios_count || role.usuarios?.length || 0 }}</td><td><button class="btn btn-sm btn-light" (click)="edit(role)"><i class="bi bi-pencil"></i></button></td></tr></tbody></table></div></div></section>
        <aside class="col-xl-4"><form class="panel" (ngSubmit)="save()"><h2>{{ form.id ? 'Editar rol' : 'Nuevo rol' }}</h2><label class="form-label">Nombre</label><input class="form-control mb-2" name="nombre" [(ngModel)]="form.nombre" required><label class="form-label">Codigo</label><input class="form-control mb-2" name="codigo" [(ngModel)]="form.codigo" required><label class="form-label">Descripcion</label><textarea class="form-control mb-3" name="descripcion" [(ngModel)]="form.descripcion"></textarea><div class="d-grid gap-2"><button class="btn btn-primary">Guardar</button><button class="btn btn-light" type="button" (click)="newRole()">Limpiar</button></div></form></aside>
      </div>
    </section>
  `
})
class RolesComponent implements OnInit {
  private api = inject(ApiService);
  roles: AnyRecord[] = [];
  users: AnyRecord[] = [];
  form: AnyRecord = {};
  message = '';
  messageType: MessageType = 'success';
  modules = [
    { key: 'usuarios', label: 'Usuarios' },
    { key: 'acumulacion', label: 'Acumulacion' },
    { key: 'redencion', label: 'Redencion' },
    { key: 'historial', label: 'Historial' },
    { key: 'reportes', label: 'Reportes' },
    { key: 'configuracion', label: 'Configuracion' }
  ];

  ngOnInit(): void {
    this.newRole();
    this.load();
  }

  async load(): Promise<void> {
    const [roles, users] = await Promise.all([
      this.api.get<any>('/api/v1/roles').catch(() => []),
      this.api.get<any[]>('/api/v1/usuarios').catch(() => [])
    ]);
    this.roles = Array.isArray(roles) ? roles : roles.roles || [];
    this.users = users;
  }

  newRole(): void {
    this.form = { permisos: Object.fromEntries(this.modules.map((m) => [m.key, 'lectura'])) };
  }

  edit(role: AnyRecord): void {
    this.form = { ...role, permisos: { ...(role.permisos || {}) } };
  }

  cycle(role: AnyRecord, key: string): void {
    const values = ['ninguno', 'lectura', 'completo'];
    const current = role.permisos?.[key] || 'ninguno';
    role.permisos = { ...(role.permisos || {}), [key]: values[(values.indexOf(current) + 1) % values.length] };
    this.api.put(`/api/v1/roles/${role.id}`, role).then(() => this.message = 'Permiso actualizado.').catch((e) => {
      this.message = e.message;
      this.messageType = 'danger';
    });
  }

  async save(): Promise<void> {
    if (this.form.id) {
      await this.api.put(`/api/v1/roles/${this.form.id}`, this.form);
      this.message = 'Rol actualizado correctamente.';
    } else {
      await this.api.post('/api/v1/roles', this.form);
      this.message = 'Rol creado correctamente.';
    }
    this.messageType = 'success';
    this.newRole();
    await this.load();
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>'
})
class AppComponent {}

const routes: Routes = [
  { path: '', redirectTo: 'index.html', pathMatch: 'full' },
  { path: 'index.html', component: LoginComponent },
  { path: 'registro.html', component: RegisterComponent },
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: 'dashboard.html', component: DashboardComponent },
      { path: 'usuarios.html', component: UsersComponent },
      { path: 'reglas-acumulacion.html', component: RulesComponent },
      { path: 'reglas-redencion.html', component: RulesComponent },
      { path: 'historial.html', component: HistoryComponent },
      { path: 'reportes.html', component: HistoryComponent },
      { path: 'roles.html', component: RolesComponent }
    ]
  },
  { path: '**', redirectTo: 'index.html' }
];

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideHttpClient()]
}).catch((error) => console.error(error));
