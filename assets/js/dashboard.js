(function () {
  const API_BASE_URL =
    window.REWARD_API_BASE_URL ||
    localStorage.getItem('rewardApiBaseUrl') ||
    'http://localhost:3000';

  const colors = ['blue', 'teal', 'green', 'yellow', 'red'];
  const colorHex = {
    blue: '#2563eb',
    teal: '#14b8a6',
    green: '#22c55e',
    yellow: '#facc15',
    red: '#ef4444'
  };
  const MONTH_FILTER_DEFAULT = 'year-to-date';
  const SIDEBAR_COLLAPSED_KEY = 'rewardAdminSidebarCollapsed';
  const NOTIFICATIONS_LAST_SEEN_KEY = 'rewardAdminNotificationsLastSeen';
  const DASHBOARD_REFRESH_INTERVAL = 30000;
  let monthlyChartItems = [];
  let currentMonthlyFilter = MONTH_FILTER_DEFAULT;
  let dashboardNotifications = [];

  function getSession() {
    const rawSession = localStorage.getItem('rewardSession') || sessionStorage.getItem('rewardSession');

    if (!rawSession) {
      return null;
    }

    try {
      return JSON.parse(rawSession);
    } catch (error) {
      return null;
    }
  }

  function getInitials(name) {
    return String(name || 'Administrador')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  function clearSession() {
    localStorage.removeItem('rewardSession');
    sessionStorage.removeItem('rewardSession');
  }

  function numberValue(value) {
    return Number(value || 0);
  }

  function formatNumber(value) {
    return numberValue(value).toLocaleString('es-CO');
  }

  function formatMoney(value) {
    return numberValue(value).toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    });
  }

  function formatDate(value) {
    if (!value) {
      return 'Sin auditorias registradas';
    }

    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function formatValue(value, fallback = 'No registrado') {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    return String(value);
  }

  function formatUserState(value) {
    return value === false ? 'Inactivo' : 'Activo';
  }

  function getNotificationLastSeenKey() {
    const userId = usuario && usuario.id ? usuario.id : 'admin';
    return `${NOTIFICATIONS_LAST_SEEN_KEY}:${userId}`;
  }

  function getNotificationTime(notification) {
    const time = new Date(notification && notification.fecha ? notification.fecha : 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function getLastSeenNotificationsTime() {
    const saved = localStorage.getItem(getNotificationLastSeenKey());
    const time = saved ? new Date(saved).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function formatMonth(period) {
    const [year, month] = String(period).split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const label = new Intl.DateTimeFormat('es-CO', { month: 'short' })
      .format(date)
      .replace('.', '');

    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function parsePeriod(period) {
    const [year, month] = String(period).split('-').map(Number);

    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      return null;
    }

    return { year, month };
  }

  function formatMonthYear(period) {
    const parsed = parsePeriod(period);

    if (!parsed) {
      return '';
    }

    return `${formatMonth(period)} ${parsed.year}`;
  }

  function normalizeMonthlyItems(items) {
    return (Array.isArray(items) ? items : [])
      .filter((item) => parsePeriod(item.periodo))
      .sort((first, second) => {
        const firstPeriod = parsePeriod(first.periodo);
        const secondPeriod = parsePeriod(second.periodo);
        return firstPeriod.year - secondPeriod.year || firstPeriod.month - secondPeriod.month;
      });
  }

  function getFilteredMonthlyItems(items, filterValue) {
    const values = normalizeMonthlyItems(items);

    if (filterValue === MONTH_FILTER_DEFAULT) {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;

      return values.filter((item) => {
        const period = parsePeriod(item.periodo);
        return period.year === currentYear && period.month <= currentMonth;
      });
    }

    const months = Number(filterValue);

    if (!Number.isFinite(months) || months <= 0) {
      return values;
    }

    return values.slice(-months);
  }

  function getSelectedFilterText(filterValue) {
    const select = document.querySelector('[data-month-filter]');
    const selectedOption = select
      ? select.querySelector(`option[value="${filterValue}"]`)
      : null;

    return selectedOption ? selectedOption.textContent : 'Meses del a\u00f1o actual';
  }

  function updateMonthlyRangeLabel(values, filterValue) {
    const label = document.querySelector('[data-monthly-range-label]');

    if (!label) {
      return;
    }

    if (values.length === 0) {
      label.textContent = getSelectedFilterText(filterValue);
      return;
    }

    const first = values[0];
    const last = values[values.length - 1];
    const firstPeriod = parsePeriod(first.periodo);
    const lastPeriod = parsePeriod(last.periodo);

    if (first.periodo === last.periodo) {
      label.textContent = formatMonthYear(first.periodo);
      return;
    }

    label.textContent = firstPeriod.year === lastPeriod.year
      ? `${formatMonth(first.periodo)} - ${formatMonthYear(last.periodo)}`
      : `${formatMonthYear(first.periodo)} - ${formatMonthYear(last.periodo)}`;
  }

  async function getJson(path) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json'
      }
    });

    const body = await response.json();

    if (!response.ok || body.ok === false) {
      throw new Error(body.mensaje || 'No fue posible cargar el dashboard');
    }

    return body.data;
  }

  function setMetric(key, metric) {
    const valueNode = document.querySelector(`[data-metric="${key}"]`);
    const trendNode = document.querySelector(`[data-trend="${key}"]`);

    if (valueNode) {
      valueNode.textContent = formatNumber(metric && metric.valor);
    }

    if (!trendNode) {
      return;
    }

    const variation = metric && metric.variacion ? metric.variacion : {};
    const direction = variation.direccion || 'neutral';
    const percentage = numberValue(variation.porcentaje).toFixed(1);
    const prefix = direction === 'up' ? '+ ' : direction === 'down' ? '- ' : '';

    trendNode.classList.remove('up', 'down', 'neutral');
    trendNode.classList.add(direction);
    trendNode.textContent = `${prefix}${percentage}% ${variation.etiqueta || ''}`.trim();
  }

  function renderMonthlyChart(items) {
    const chart = document.querySelector('[data-monthly-chart]');

    if (!chart) {
      return;
    }

    if (Array.isArray(items)) {
      monthlyChartItems = items;
    }

    chart.innerHTML = '';
    const values = getFilteredMonthlyItems(monthlyChartItems, currentMonthlyFilter);
    const max = Math.max(...values.map((item) => numberValue(item.puntos)), 0);
    chart.style.setProperty('--chart-month-count', String(Math.max(values.length, 1)));
    updateMonthlyRangeLabel(values, currentMonthlyFilter);

    if (values.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No hay acumulaciones registradas aun.';
      chart.appendChild(empty);
      return;
    }

    values.forEach((item, index) => {
      const value = numberValue(item.puntos);
      const bar = document.createElement('span');
      const label = document.createElement('b');
      const height = max > 0 ? Math.max((value / max) * 100, value > 0 ? 8 : 0) : 0;

      if (value === 0) {
        bar.classList.add('is-zero');
      }

      if (index === values.length - 1) {
        bar.classList.add('is-current');
        bar.dataset.tooltip = `${formatNumber(value)} pts`;
      }

      bar.style.height = `${height}%`;
      bar.title = `${formatMonth(item.periodo)}: ${formatNumber(value)} pts`;
      label.textContent = formatMonth(item.periodo);
      bar.appendChild(label);
      chart.appendChild(bar);
    });
  }

  function renderDistribution(items) {
    const donut = document.querySelector('[data-distribution-donut]');
    const totalNode = document.querySelector('[data-distribution-total]');
    const list = document.querySelector('[data-distribution-list]');
    const values = Array.isArray(items) ? items : [];
    const total = values.reduce((sum, item) => sum + numberValue(item.puntos), 0);

    if (totalNode) {
      totalNode.textContent = formatNumber(total);
    }

    if (!donut || !list) {
      return;
    }

    list.innerHTML = '';
    donut.classList.toggle('is-empty', total === 0);
    donut.setAttribute('aria-label', `${formatNumber(total)} puntos totales`);

    if (total === 0) {
      donut.style.background = '';
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No hay transacciones registradas aun.';
      list.appendChild(empty);
      return;
    }

    let start = 0;
    const gradientParts = values.map((item, index) => {
      const colorName = colors[index % colors.length];
      const percent = (numberValue(item.puntos) / total) * 100;
      const end = start + percent;
      const part = `${colorHex[colorName]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
      start = end;
      return part;
    });

    donut.style.background = `conic-gradient(${gradientParts.join(', ')})`;

    values.forEach((item, index) => {
      const colorName = colors[index % colors.length];
      const percent = total > 0 ? (numberValue(item.puntos) / total) * 100 : 0;
      const row = document.createElement('li');
      const dot = document.createElement('span');
      const label = document.createTextNode(item.nombre || 'Sin origen');
      const strong = document.createElement('strong');

      dot.className = `legend-dot ${colorName}`;
      strong.textContent = `${percent.toFixed(1)}%`;
      row.append(dot, label, strong);
      list.appendChild(row);
    });
  }

  function renderTopClients(items) {
    const list = document.querySelector('[data-top-clients]');
    const values = Array.isArray(items) ? items : [];

    if (!list) {
      return;
    }

    list.innerHTML = '';

    if (values.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No hay usuarios con puntos aun.';
      list.appendChild(empty);
      return;
    }

    values.forEach((client) => {
      const row = document.createElement('li');
      const initials = document.createElement('span');
      const name = document.createElement('p');
      const points = document.createElement('strong');

      initials.textContent = getInitials(client.nombre);
      name.textContent = client.nombre || 'Usuario sin nombre';
      points.textContent = `${formatNumber(client.saldo_actual)} pts`;
      row.append(initials, name, points);
      list.appendChild(row);
    });
  }

  function renderMovements(items) {
    const body = document.querySelector('[data-movements-body]');
    const values = Array.isArray(items) ? items : [];

    if (!body) {
      return;
    }

    body.innerHTML = '';

    if (values.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'table-empty';
      cell.colSpan = 6;
      cell.textContent = 'No hay movimientos registrados aun.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    values.forEach((movement) => {
      const isRedemption = movement.tipo_movimiento === 'REDENCION';
      const row = document.createElement('tr');
      const date = document.createElement('td');
      const user = document.createElement('td');
      const type = document.createElement('td');
      const origin = document.createElement('td');
      const points = document.createElement('td');
      const state = document.createElement('td');
      const userPill = document.createElement('span');
      const typePill = document.createElement('span');
      const statePill = document.createElement('span');

      userPill.className = 'user-pill';
      userPill.textContent = getInitials(movement.usuario_nombre);
      user.append(userPill, movement.usuario_nombre || 'Usuario sin nombre');

      typePill.className = `type-pill ${isRedemption ? 'redeem' : 'earn'}`;
      typePill.textContent = isRedemption ? 'Redencion' : 'Acumulacion';

      points.className = isRedemption ? 'points-negative' : 'points-positive';
      points.textContent = `${isRedemption ? '-' : '+'}${formatNumber(movement.puntos)}`;

      statePill.className = 'state-pill done';
      statePill.textContent = movement.estado || 'Completado';

      date.textContent = formatDate(movement.fecha_movimiento);
      origin.textContent = movement.origen || 'Sin origen';
      type.appendChild(typePill);
      state.appendChild(statePill);
      row.append(date, user, type, origin, points, state);
      body.appendChild(row);
    });
  }

  function getNotificationClass(type) {
    const normalizedType = String(type || '').replace(/_/g, '-');
    return `notification-icon ${normalizedType || 'general'}`;
  }

  function updateNotificationBadge() {
    const badge = document.querySelector('[data-notification-badge]');
    const summary = document.querySelector('[data-notification-summary]');
    const unreadCount = dashboardNotifications.filter((notification) => (
      getNotificationTime(notification) > getLastSeenNotificationsTime()
    )).length;

    if (badge) {
      badge.hidden = unreadCount === 0;
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    }

    if (summary) {
      summary.textContent = unreadCount === 0
        ? 'Sin novedades nuevas'
        : `${unreadCount} novedades nuevas`;
    }
  }

  function markNotificationsAsSeen() {
    const lastNotificationTime = Math.max(
      ...dashboardNotifications.map((notification) => getNotificationTime(notification)),
      Date.now()
    );

    localStorage.setItem(
      getNotificationLastSeenKey(),
      new Date(lastNotificationTime).toISOString()
    );
    updateNotificationBadge();
  }

  function renderNotifications(items) {
    const list = document.querySelector('[data-notifications-list]');
    const panel = document.querySelector('[data-notification-panel]');
    dashboardNotifications = Array.isArray(items) ? items : [];

    if (!list) {
      updateNotificationBadge();
      return;
    }

    list.innerHTML = '';

    if (dashboardNotifications.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No hay notificaciones registradas aun.';
      list.appendChild(empty);
      updateNotificationBadge();
      return;
    }

    dashboardNotifications.forEach((notification) => {
      const row = document.createElement('li');
      const icon = document.createElement('span');
      const content = document.createElement('div');
      const title = document.createElement('strong');
      const detail = document.createElement('p');
      const date = document.createElement('small');

      row.className = 'notification-item';
      icon.className = getNotificationClass(notification.tipo);
      title.textContent = notification.titulo || 'Novedad registrada';
      detail.textContent = notification.detalle || 'Actividad reciente en la aplicacion';
      date.textContent = formatDate(notification.fecha);
      content.append(title, detail, date);
      row.append(icon, content);
      list.appendChild(row);
    });

    if (panel && !panel.hidden) {
      markNotificationsAsSeen();
      return;
    }

    updateNotificationBadge();
  }

  function renderProfileDetails(profile) {
    const panel = document.querySelector('[data-profile-details]');
    const list = document.querySelector('[data-profile-details-list]');
    const userProfile = profile || usuario || {};

    if (!panel || !list) {
      return;
    }

    const fields = [
      ['Nombre', userProfile.nombre],
      ['Rol', userProfile.rol],
      ['Tipo de documento', userProfile.tipo_documento],
      ['Numero de documento', userProfile.numero_documento],
      ['Correo', userProfile.correo],
      ['Telefono', userProfile.telefono],
      ['Estado', formatUserState(userProfile.estado)],
      ['Fecha de creacion', userProfile.fecha_creacion ? formatDate(userProfile.fecha_creacion) : 'No registrado']
    ];

    list.innerHTML = '';
    fields.forEach(([labelText, value]) => {
      const label = document.createElement('dt');
      const data = document.createElement('dd');

      label.textContent = labelText;
      data.textContent = formatValue(value);
      list.append(label, data);
    });

    panel.hidden = false;
  }

  function renderAudit(audit) {
    const totalNode = document.querySelector('[data-audit-total]');
    const equivalentNode = document.querySelector('[data-audit-equivalent]');
    const dateNode = document.querySelector('[data-audit-date]');

    if (totalNode) {
      totalNode.textContent = `${formatNumber(audit && audit.saldo_total)} pts`;
    }

    if (equivalentNode) {
      equivalentNode.textContent = `Equivalente a ${formatMoney(audit && audit.valor_equivalente)}`;
    }

    if (dateNode) {
      dateNode.textContent = audit && audit.ultima_auditoria
        ? `Ultima auditoria: ${formatDate(audit.ultima_auditoria)}`
        : 'Sin auditorias registradas';
    }
  }

  function renderDashboard(data) {
    const metricas = data.metricas || {};
    const graficas = data.graficas || {};

    setMetric('usuarios_activos', metricas.usuarios_activos);
    setMetric('puntos_acumulados', metricas.puntos_acumulados);
    setMetric('puntos_redimidos', metricas.puntos_redimidos);
    setMetric('redenciones_hoy', metricas.redenciones_hoy);
    renderMonthlyChart(graficas.acumulacion_mensual);
    renderDistribution(graficas.distribucion_transacciones);
    renderTopClients(data.top_clientes);
    renderMovements(data.movimientos_recientes);
    renderNotifications(data.notificaciones);
    renderAudit(data.auditoria);
  }

  function renderLoadError(error) {
    renderDashboard({
      metricas: {},
      graficas: {
        acumulacion_mensual: [],
        distribucion_transacciones: []
      },
      top_clientes: [],
      movimientos_recientes: [],
      notificaciones: [],
      auditoria: {}
    });

    const chart = document.querySelector('[data-monthly-chart]');

    if (chart) {
      chart.innerHTML = '';
      const message = document.createElement('p');
      message.className = 'empty-state';
      message.textContent = error.message || 'No fue posible cargar el dashboard.';
      chart.appendChild(message);
    }
  }

  async function loadDashboard() {
    try {
      const data = await getJson('/api/v1/dashboard/admin');
      renderDashboard(data);
    } catch (error) {
      renderLoadError(error);
    }
  }

  function setSidebarCollapsed(collapsed) {
    const shell = document.querySelector('[data-admin-shell]');
    const button = document.querySelector('[data-collapse-sidebar]');
    const label = document.querySelector('[data-collapse-label]');

    if (!shell) {
      return;
    }

    shell.classList.toggle('is-sidebar-collapsed', collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'true' : 'false');

    if (button) {
      button.setAttribute('aria-expanded', String(!collapsed));
      button.title = collapsed ? 'Expandir menu' : 'Colapsar menu';
    }

    if (label) {
      label.textContent = collapsed ? 'Expandir menu' : 'Colapsar menu';
    }
  }

  function setPanelOpen(panel, button, isOpen) {
    if (!panel) {
      return;
    }

    panel.hidden = !isOpen;

    if (button) {
      button.setAttribute('aria-expanded', String(isOpen));
    }
  }

  async function openProfileDetails() {
    renderProfileDetails(usuario);

    if (!usuario || !usuario.id) {
      return;
    }

    try {
      const profile = await getJson(`/api/v1/usuarios/${usuario.id}`);
      renderProfileDetails(profile);
    } catch (error) {
      renderProfileDetails(usuario);
    }
  }

  const session = getSession();
  const usuario = session && session.usuario ? session.usuario : null;
  const rol = usuario && usuario.rol ? String(usuario.rol).toLowerCase() : '';

  if (!usuario || rol !== 'administrador') {
    clearSession();
    window.location.replace('/index.html');
    return;
  }

  const name = usuario.nombre || 'Administrador';
  const nameNode = document.querySelector('[data-admin-name]');
  const initialsNode = document.querySelector('[data-admin-initials]');
  const collapseButton = document.querySelector('[data-collapse-sidebar]');
  const notificationToggle = document.querySelector('[data-notification-toggle]');
  const notificationPanel = document.querySelector('[data-notification-panel]');
  const profileMenuToggle = document.querySelector('[data-profile-menu-toggle]');
  const profileMenuPanel = document.querySelector('[data-profile-menu-panel]');
  const openProfileButton = document.querySelector('[data-open-profile]');
  const profileDetailsPanel = document.querySelector('[data-profile-details]');
  const closeProfileDetailsButton = document.querySelector('[data-close-profile-details]');
  const logoutButton = document.querySelector('[data-logout]');
  const monthFilter = document.querySelector('[data-month-filter]');

  if (nameNode) {
    nameNode.textContent = name;
  }

  if (initialsNode) {
    initialsNode.textContent = getInitials(name);
  }

  setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');

  if (collapseButton) {
    collapseButton.addEventListener('click', () => {
      const shell = document.querySelector('[data-admin-shell]');
      const collapsed = shell ? shell.classList.contains('is-sidebar-collapsed') : false;
      setSidebarCollapsed(!collapsed);
    });
  }

  if (notificationToggle) {
    notificationToggle.addEventListener('click', () => {
      const shouldOpen = notificationPanel ? notificationPanel.hidden : false;
      setPanelOpen(notificationPanel, notificationToggle, shouldOpen);
      setPanelOpen(profileMenuPanel, profileMenuToggle, false);

      if (shouldOpen) {
        markNotificationsAsSeen();
      }
    });
  }

  if (profileMenuToggle) {
    profileMenuToggle.addEventListener('click', () => {
      const shouldOpen = profileMenuPanel ? profileMenuPanel.hidden : false;
      setPanelOpen(profileMenuPanel, profileMenuToggle, shouldOpen);
      setPanelOpen(notificationPanel, notificationToggle, false);
    });
  }

  if (openProfileButton) {
    openProfileButton.addEventListener('click', () => {
      setPanelOpen(profileMenuPanel, profileMenuToggle, false);
      openProfileDetails();
    });
  }

  if (closeProfileDetailsButton) {
    closeProfileDetailsButton.addEventListener('click', () => {
      if (profileDetailsPanel) {
        profileDetailsPanel.hidden = true;
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      clearSession();
      window.location.href = '/index.html';
    });
  }

  if (monthFilter) {
    monthFilter.value = currentMonthlyFilter;
    monthFilter.addEventListener('change', (event) => {
      currentMonthlyFilter = event.target.value || MONTH_FILTER_DEFAULT;
      renderMonthlyChart();
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    const notificationWrap = document.querySelector('.notification-wrap');
    const profileWrap = document.querySelector('.profile-wrap');

    if (notificationWrap && !notificationWrap.contains(target)) {
      setPanelOpen(notificationPanel, notificationToggle, false);
    }

    if (profileWrap && !profileWrap.contains(target)) {
      setPanelOpen(profileMenuPanel, profileMenuToggle, false);

      if (profileDetailsPanel) {
        profileDetailsPanel.hidden = true;
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    setPanelOpen(notificationPanel, notificationToggle, false);
    setPanelOpen(profileMenuPanel, profileMenuToggle, false);

    if (profileDetailsPanel) {
      profileDetailsPanel.hidden = true;
    }
  });

  loadDashboard();
  window.setInterval(loadDashboard, DASHBOARD_REFRESH_INTERVAL);
})();
