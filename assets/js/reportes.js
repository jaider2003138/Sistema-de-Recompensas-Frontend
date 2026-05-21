(function () {
  const API_BASE_URL =
    window.REWARD_API_BASE_URL ||
    localStorage.getItem('rewardApiBaseUrl') ||
    'http://localhost:3000';

  const SIDEBAR_COLLAPSED_KEY = 'rewardAdminSidebarCollapsed';
  const NOTIFICATIONS_LAST_SEEN_KEY = 'rewardAdminNotificationsLastSeen';
  const DASHBOARD_REFRESH_INTERVAL = 30000;
  const SEARCH_DELAY = 350;
  const CHANNEL_COLORS = ['#2563eb', '#14b8a6', '#facc15', '#ef4444', '#8b5cf6', '#f97316'];

  let users = [];
  let baseMovements = [];
  let reportMovements = [];
  let monthlyStats = [];
  let topClients = [];
  let dashboardNotifications = [];
  let searchTimer = null;

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

  function clearSession() {
    localStorage.removeItem('rewardSession');
    sessionStorage.removeItem('rewardSession');
  }

  const session = getSession();
  const usuario = session && session.usuario ? session.usuario : null;
  const rol = usuario && usuario.rol ? String(usuario.rol).toLowerCase() : '';

  if (!usuario || rol !== 'administrador') {
    clearSession();
    window.location.replace('/index.html');
    return;
  }

  function numberValue(value) {
    return Number(value || 0);
  }

  function formatNumber(value) {
    return numberValue(value).toLocaleString('es-CO');
  }

  function formatPercent(value) {
    return `${numberValue(value).toFixed(1)}%`;
  }

  function formatDate(value) {
    if (!value) {
      return 'No registrado';
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

  function escapeHtml(value) {
    return formatValue(value, '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function getInitials(name) {
    return String(name || 'Usuario')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const body = await response.json();

    if (!response.ok || body.ok === false) {
      throw new Error(body.mensaje || 'No fue posible completar la solicitud');
    }

    return body.data;
  }

  function getJson(path) {
    return requestJson(path);
  }

  function showMessage(message, type = 'success') {
    const node = document.querySelector('[data-report-message]');

    if (!node) {
      return;
    }

    node.hidden = false;
    node.className = `users-feedback ${type}`;
    node.textContent = message;
    window.setTimeout(() => {
      node.hidden = true;
    }, 3500);
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
    localStorage.setItem(getNotificationLastSeenKey(), new Date(lastNotificationTime).toISOString());
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

  async function loadNotifications() {
    try {
      const dashboard = await getJson('/api/v1/dashboard/admin');
      renderNotifications(dashboard.notificaciones);
    } catch (error) {
      renderNotifications([]);
    }
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
      ['Estado', userProfile.estado === false ? 'Inactivo' : 'Activo'],
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

  async function openProfileDetails() {
    renderProfileDetails(usuario);

    if (!usuario || !usuario.id) {
      return;
    }

    try {
      renderProfileDetails(await getJson(`/api/v1/usuarios/${usuario.id}`));
    } catch (error) {
      renderProfileDetails(usuario);
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

  function isRedemption(movement) {
    return String(movement && movement.tipo_movimiento || '').toUpperCase() === 'REDENCION';
  }

  function getMovementPoints(movement) {
    return Math.abs(numberValue(movement && movement.puntos));
  }

  function dateValue(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function localDateString(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function monthLabel(key) {
    const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic'];
    const parts = String(key).split('-');
    const month = Number(parts[1]) - 1;
    return labels[month] || key;
  }

  function getPeriodLabel(value) {
    const labels = {
      12: 'Ultimos 12 meses',
      6: 'Ultimos 6 meses',
      3: 'Ultimos 3 meses',
      ytd: 'Ano actual',
      month: 'Mes actual',
      all: 'Todo el historial'
    };

    return labels[value] || 'Periodo seleccionado';
  }

  function getSelectedPeriod() {
    const period = document.querySelector('[data-report-period]');
    return period ? period.value : '12';
  }

  function getSelectedChannel() {
    const channel = document.querySelector('[data-report-channel]');
    return channel ? channel.value : '';
  }

  function getSelectedOrigin() {
    const origin = document.querySelector('[data-report-origin]');
    return origin ? origin.value : '';
  }

  function getSearchTerm() {
    const search = document.querySelector('[data-report-search]');
    return search ? search.value.trim().toLowerCase() : '';
  }

  function getPeriodRange(value = getSelectedPeriod()) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (value === 'all') {
      return { start: null, end, label: getPeriodLabel(value) };
    }

    if (value === 'ytd') {
      return {
        start: new Date(end.getFullYear(), 0, 1),
        end,
        label: getPeriodLabel(value)
      };
    }

    if (value === 'month') {
      return {
        start: new Date(end.getFullYear(), end.getMonth(), 1),
        end,
        label: getPeriodLabel(value)
      };
    }

    const months = Number(value) || 12;
    return {
      start: new Date(end.getFullYear(), end.getMonth() - months + 1, 1),
      end,
      label: getPeriodLabel(value)
    };
  }

  function getPreviousRange(range) {
    if (!range.start) {
      return null;
    }

    const currentStart = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
    const currentEnd = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
    const duration = currentEnd.getTime() - currentStart.getTime();
    const previousEnd = new Date(currentStart.getTime() - 86400000);
    const previousStart = new Date(previousEnd.getTime() - duration);

    return { start: previousStart, end: previousEnd };
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function getChannel(origin) {
    const text = normalizeText(origin);

    if (text.includes('linea') || text.includes('e-commerce') || text.includes('web')) return 'E-commerce';
    if (text.includes('campana') || text.includes('referido')) return 'Campanas';
    if (text.includes('app') || text.includes('movil')) return 'App movil';
    if (text.includes('catalogo') || text.includes('premio')) return 'Catalogo';
    if (text.includes('aliado')) return 'Aliados';
    if (text.includes('tienda') || text.includes('fisica')) return 'Tienda fisica';
    return 'Otros';
  }

  function getUserById(id) {
    return users.find((user) => String(user.id) === String(id)) || null;
  }

  function matchesSearch(movement, term = getSearchTerm()) {
    if (!term) {
      return true;
    }

    const user = getUserById(movement.usuario_id) || {};
    const haystack = [
      movement.id,
      movement.usuario_id,
      movement.usuario_nombre,
      movement.numero_documento,
      user.nombre,
      user.numero_documento,
      user.correo,
      movement.origen,
      movement.descripcion,
      movement.referencia_id,
      movement.tipo_movimiento
    ].join(' ').toLowerCase();

    return haystack.includes(term);
  }

  function matchesRange(movement, range) {
    if (!range || !range.start) {
      return true;
    }

    const date = dateValue(movement.fecha_movimiento);

    if (!date) {
      return false;
    }

    const movementDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return movementDay >= range.start && movementDay <= range.end;
  }

  function matchesReportFilters(movement, range = getPeriodRange()) {
    const selectedOrigin = getSelectedOrigin();
    const selectedChannel = getSelectedChannel();

    if (!matchesRange(movement, range)) {
      return false;
    }

    if (selectedOrigin && formatValue(movement.origen, 'Sin origen') !== selectedOrigin) {
      return false;
    }

    if (selectedChannel && getChannel(movement.origen) !== selectedChannel) {
      return false;
    }

    return matchesSearch(movement);
  }

  function getStats(items) {
    const values = Array.isArray(items) ? items : [];
    const earned = values
      .filter((movement) => !isRedemption(movement))
      .reduce((sum, movement) => sum + getMovementPoints(movement), 0);
    const redeemed = values
      .filter(isRedemption)
      .reduce((sum, movement) => sum + getMovementPoints(movement), 0);
    const clients = new Set(values.map((movement) => movement.usuario_id).filter(Boolean)).size;
    const rate = earned + redeemed > 0 ? (redeemed / (earned + redeemed)) * 100 : 0;

    return { earned, redeemed, clients, rate };
  }

  function renderTrend(selector, currentValue, previousValue, mode = 'percent') {
    const node = document.querySelector(selector);

    if (!node) {
      return;
    }

    let value = 0;
    let text = '0.0% vs. periodo anterior';

    if (mode === 'points') {
      value = numberValue(currentValue) - numberValue(previousValue);
      text = `${value > 0 ? '+' : ''}${value.toFixed(1)} p.p. vs. periodo anterior`;
    } else if (numberValue(previousValue) !== 0) {
      value = ((numberValue(currentValue) - numberValue(previousValue)) / numberValue(previousValue)) * 100;
      text = `${value > 0 ? '+' : ''}${value.toFixed(1)}% vs. periodo anterior`;
    } else if (numberValue(currentValue) > 0) {
      value = 100;
      text = '+100.0% vs. periodo anterior';
    }

    node.className = `trend ${value > 0 ? 'up' : value < 0 ? 'down' : 'neutral'}`;
    node.textContent = text;
  }

  function buildMovementQuery() {
    const params = new URLSearchParams();
    const range = getPeriodRange();
    const origin = getSelectedOrigin();
    const search = getSearchTerm();

    if (range.start) {
      params.set('fecha_desde', localDateString(range.start));
      params.set('fecha_hasta', localDateString(range.end));
    }

    if (origin) {
      params.set('origen', origin);
    }

    if (search) {
      params.set('buscar', search);
    }

    const query = params.toString();
    return query ? `/api/v1/movimientos?${query}` : '/api/v1/movimientos';
  }

  function renderSelectOptions() {
    const channelSelect = document.querySelector('[data-report-channel]');
    const originSelect = document.querySelector('[data-report-origin]');
    const selectedChannel = channelSelect ? channelSelect.value : '';
    const selectedOrigin = originSelect ? originSelect.value : '';
    const channels = [...new Set(baseMovements.map((movement) => getChannel(movement.origen)))]
      .sort((first, second) => first.localeCompare(second, 'es'));
    const origins = [...new Set(baseMovements.map((movement) => formatValue(movement.origen, 'Sin origen')))]
      .sort((first, second) => first.localeCompare(second, 'es'));

    if (channelSelect) {
      channelSelect.innerHTML = '<option value="">Todos los canales</option>';
      channels.forEach((channel) => {
        const option = document.createElement('option');
        option.value = channel;
        option.textContent = channel;
        channelSelect.appendChild(option);
      });
      channelSelect.value = channels.includes(selectedChannel) ? selectedChannel : '';
    }

    if (originSelect) {
      originSelect.innerHTML = '<option value="">Todos los puntos</option>';
      origins.forEach((origin) => {
        const option = document.createElement('option');
        option.value = origin;
        option.textContent = origin;
        originSelect.appendChild(option);
      });
      originSelect.value = origins.includes(selectedOrigin) ? selectedOrigin : '';
    }
  }

  function getChartMonths(range) {
    const end = range && range.end ? range.end : new Date();
    const start = range && range.start
      ? new Date(range.start.getFullYear(), range.start.getMonth(), 1)
      : new Date(end.getFullYear(), end.getMonth() - 11, 1);
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor <= last) {
      months.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months.slice(-12);
  }

  function buildMonthlyStats(items, range = getPeriodRange()) {
    const statsByMonth = new Map(getChartMonths(range).map((key) => [
      key,
      { key, earned: 0, redeemed: 0, rate: 0 }
    ]));

    items.forEach((movement) => {
      const date = dateValue(movement.fecha_movimiento);

      if (!date) {
        return;
      }

      const key = monthKey(date);
      const stats = statsByMonth.get(key);

      if (!stats) {
        return;
      }

      if (isRedemption(movement)) {
        stats.redeemed += getMovementPoints(movement);
      } else {
        stats.earned += getMovementPoints(movement);
      }
    });

    return [...statsByMonth.values()].map((item) => ({
      ...item,
      rate: item.earned + item.redeemed > 0 ? (item.redeemed / (item.earned + item.redeemed)) * 100 : 0
    }));
  }

  function polarPoint(centerX, centerY, radius, angle) {
    const radians = (angle - 90) * Math.PI / 180;

    return {
      x: centerX + radius * Math.cos(radians),
      y: centerY + radius * Math.sin(radians)
    };
  }

  function describeDonutSegment(centerX, centerY, outerRadius, innerRadius, startAngle, endAngle) {
    const outerStart = polarPoint(centerX, centerY, outerRadius, endAngle);
    const outerEnd = polarPoint(centerX, centerY, outerRadius, startAngle);
    const innerStart = polarPoint(centerX, centerY, innerRadius, startAngle);
    const innerEnd = polarPoint(centerX, centerY, innerRadius, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return [
      `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
      `L ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
      'Z'
    ].join(' ');
  }

  function renderMetrics() {
    const stats = getStats(reportMovements);
    const previousRange = getPreviousRange(getPeriodRange());
    const previousMovements = previousRange
      ? baseMovements.filter((movement) => matchesReportFilters(movement, previousRange))
      : [];
    const previousStats = getStats(previousMovements);
    const earnedNode = document.querySelector('[data-report-metric="earned"]');
    const redeemedNode = document.querySelector('[data-report-metric="redeemed"]');
    const clientsNode = document.querySelector('[data-report-metric="clients"]');
    const rateNode = document.querySelector('[data-report-metric="rate"]');

    if (earnedNode) earnedNode.textContent = formatNumber(stats.earned);
    if (redeemedNode) redeemedNode.textContent = formatNumber(stats.redeemed);
    if (clientsNode) clientsNode.textContent = formatNumber(stats.clients);
    if (rateNode) rateNode.textContent = formatPercent(stats.rate);

    if (!previousRange) {
      document.querySelectorAll('[data-report-trend]').forEach((node) => {
        node.className = 'trend neutral';
        node.textContent = 'Segun filtros';
      });
      return;
    }

    renderTrend('[data-report-trend="earned"]', stats.earned, previousStats.earned);
    renderTrend('[data-report-trend="redeemed"]', stats.redeemed, previousStats.redeemed);
    renderTrend('[data-report-trend="rate"]', stats.rate, previousStats.rate, 'points');
  }

  function renderComparisonChart() {
    const chart = document.querySelector('[data-report-comparison-chart]');
    const label = document.querySelector('[data-report-period-label]');

    if (!chart) {
      return;
    }

    if (label) {
      label.textContent = getPeriodLabel(getSelectedPeriod());
    }

    monthlyStats = buildMonthlyStats(reportMovements);
    const maxValue = Math.max(...monthlyStats.map((item) => Math.max(item.earned, item.redeemed)), 1);
    chart.style.removeProperty('--report-month-count');
    chart.innerHTML = '';

    if (monthlyStats.length === 0) {
      chart.innerHTML = '<p class="empty-state">No hay datos para graficar.</p>';
      return;
    }

    const width = 760;
    const height = 250;
    const padding = { top: 18, right: 16, bottom: 34, left: 16 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const baseline = padding.top + innerHeight;
    const groupWidth = innerWidth / monthlyStats.length;
    const barWidth = Math.max(8, Math.min(18, groupWidth * 0.24));
    const barGap = Math.max(3, Math.min(7, groupWidth * 0.08));
    const grid = [0, 25, 50, 75, 100].map((value) => {
      const y = baseline - (value / 100) * innerHeight;
      return `
        <line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" class="report-bar-grid"></line>
      `;
    }).join('');
    const bars = monthlyStats.map((item, index) => {
      const centerX = padding.left + groupWidth * index + groupWidth / 2;
      const earnedHeight = item.earned > 0
        ? Math.max((item.earned / maxValue) * innerHeight, 3)
        : 1;
      const redeemedHeight = item.redeemed > 0
        ? Math.max((item.redeemed / maxValue) * innerHeight, 3)
        : 1;
      const earnedX = centerX - barWidth - barGap / 2;
      const redeemedX = centerX + barGap / 2;
      const earnedY = baseline - earnedHeight;
      const redeemedY = baseline - redeemedHeight;

      return `
        <g>
          <rect x="${earnedX.toFixed(1)}" y="${earnedY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${earnedHeight.toFixed(1)}" rx="4" class="report-bar-earned" fill="#2563eb">
            <title>${monthLabel(item.key)}: ${formatNumber(item.earned)} pts acumulados</title>
          </rect>
          <rect x="${redeemedX.toFixed(1)}" y="${redeemedY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${redeemedHeight.toFixed(1)}" rx="4" class="report-bar-redeemed" fill="#16a34a">
            <title>${monthLabel(item.key)}: ${formatNumber(item.redeemed)} pts redimidos</title>
          </rect>
          <text x="${centerX.toFixed(1)}" y="${height - 10}" class="report-bar-label" text-anchor="middle">${monthLabel(item.key)}</text>
        </g>
      `;
    }).join('');

    chart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Puntos acumulados vs redimidos por mes">
        ${grid}
        <line x1="${padding.left}" y1="${baseline}" x2="${width - padding.right}" y2="${baseline}" class="report-bar-axis"></line>
        ${bars}
      </svg>
    `;
  }

  function buildTopClients() {
    const grouped = new Map();

    reportMovements.forEach((movement) => {
      const id = movement.usuario_id || 'sin-id';
      const existing = grouped.get(id) || {
        id,
        nombre: movement.usuario_nombre || 'Usuario',
        documento: movement.numero_documento || '',
        earned: 0,
        redeemed: 0
      };
      const user = getUserById(id);

      if (user) {
        existing.nombre = user.nombre || existing.nombre;
        existing.documento = user.numero_documento || existing.documento;
      }

      if (isRedemption(movement)) {
        existing.redeemed += getMovementPoints(movement);
      } else {
        existing.earned += getMovementPoints(movement);
      }

      grouped.set(id, existing);
    });

    return [...grouped.values()]
      .map((client) => ({ ...client, points: client.earned - client.redeemed }))
      .sort((first, second) => second.points - first.points || first.nombre.localeCompare(second.nombre, 'es'))
      .slice(0, 5);
  }

  function renderTopClients() {
    const body = document.querySelector('[data-report-top-clients]');

    if (!body) {
      return;
    }

    topClients = buildTopClients();
    body.innerHTML = '';

    if (topClients.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'table-empty';
      cell.textContent = 'No hay clientes para los filtros seleccionados.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    topClients.forEach((client, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>
          <div class="history-user-cell">
            <span>${escapeHtml(getInitials(client.nombre))}</span>
            <div>
              <strong>${escapeHtml(client.nombre)}</strong>
              <small>ID ${escapeHtml(client.id)}</small>
            </div>
          </div>
        </td>
        <td>${escapeHtml(formatValue(client.documento, 'Sin documento'))}</td>
        <td>${formatNumber(client.points)} pts</td>
      `;
      body.appendChild(row);
    });
  }

  function renderChannelDistribution() {
    const donut = document.querySelector('[data-report-donut]');
    const totalNode = document.querySelector('[data-report-donut-total]');
    const list = document.querySelector('[data-report-channel-list]');
    const summary = document.querySelector('[data-report-channel-summary]');
    const grouped = new Map();

    reportMovements
      .filter((movement) => !isRedemption(movement))
      .forEach((movement) => {
        const channel = getChannel(movement.origen);
        grouped.set(channel, numberValue(grouped.get(channel)) + getMovementPoints(movement));
      });

    const rows = [...grouped.entries()]
      .map(([channel, points]) => ({ channel, points }))
      .sort((first, second) => second.points - first.points);
    const total = rows.reduce((sum, item) => sum + item.points, 0);

    if (totalNode) {
      totalNode.textContent = formatNumber(total);
    }

    if (summary) {
      summary.textContent = `${formatNumber(total)} puntos acumulados`;
    }

    if (donut) {
      const previousSvg = donut.querySelector('svg');

      if (previousSvg) {
        previousSvg.remove();
      }

      let svg = '<circle cx="82" cy="82" r="57" class="report-donut-empty"></circle>';

      if (total > 0) {
        let cursor = 0;
        svg = rows.map((item, index) => {
          const start = cursor;
          const angle = (item.points / total) * 360;
          cursor += angle;
          const color = CHANNEL_COLORS[index % CHANNEL_COLORS.length];

          if (angle >= 359.99) {
            return `
              <circle cx="82" cy="82" r="57" fill="none" stroke="${color}" stroke-width="42">
                <title>${escapeHtml(item.channel)}: ${formatPercent(100)}</title>
              </circle>
            `;
          }

          return `
            <path d="${describeDonutSegment(82, 82, 78, 36, start, cursor)}" fill="${color}">
              <title>${escapeHtml(item.channel)}: ${formatPercent((item.points / total) * 100)}</title>
            </path>
          `;
        }).join('');
      }

      donut.style.background = 'transparent';
      donut.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 164 164" aria-hidden="true">${svg}</svg>`);
    }

    if (!list) {
      return;
    }

    list.innerHTML = '';

    if (rows.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No hay distribucion para mostrar.';
      list.appendChild(empty);
      return;
    }

    rows.forEach((item, index) => {
      const percent = total > 0 ? (item.points / total) * 100 : 0;
      const row = document.createElement('li');
      row.innerHTML = `
        <span class="report-channel-dot" style="background: ${CHANNEL_COLORS[index % CHANNEL_COLORS.length]}"></span>
        <strong>${escapeHtml(item.channel)}</strong>
        <em>${formatPercent(percent)}</em>
        <small>${formatNumber(item.points)} pts</small>
      `;
      list.appendChild(row);
    });
  }

  function renderRateLine() {
    const chart = document.querySelector('[data-report-rate-line]');
    const summary = document.querySelector('[data-report-rate-summary]');

    if (!chart) {
      return;
    }

    if (summary) {
      summary.textContent = getPeriodLabel(getSelectedPeriod());
    }

    const data = monthlyStats.length > 0 ? monthlyStats : buildMonthlyStats(reportMovements);

    if (data.length === 0) {
      chart.innerHTML = '<p class="empty-state">No hay datos para graficar.</p>';
      return;
    }

    const width = 560;
    const height = 240;
    const padding = 36;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const points = data.map((item, index) => {
      const x = data.length === 1 ? width / 2 : padding + (index / (data.length - 1)) * innerWidth;
      const y = padding + innerHeight - (Math.min(item.rate, 100) / 100) * innerHeight;
      return { x, y, item };
    });
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const grid = [0, 25, 50, 75, 100].map((value) => {
      const y = padding + innerHeight - (value / 100) * innerHeight;
      return `
        <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="report-line-grid"></line>
        <text x="${padding - 10}" y="${y + 4}" class="report-line-label" text-anchor="end">${value}%</text>
      `;
    }).join('');
    const circles = points.map((point) => `
      <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" class="report-line-point"></circle>
      <title>${monthLabel(point.item.key)}: ${formatPercent(point.item.rate)}</title>
    `).join('');
    const labels = points.map((point) => `
      <text x="${point.x.toFixed(1)}" y="${height - 10}" class="report-line-label" text-anchor="middle">${monthLabel(point.item.key)}</text>
    `).join('');

    chart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia de tasa de redencion">
        ${grid}
        <path d="${path}" class="report-line-path"></path>
        ${circles}
        ${labels}
      </svg>
    `;
  }

  function renderGeneratedAt() {
    const node = document.querySelector('[data-report-generated-at]');

    if (node) {
      node.textContent = formatDate(new Date());
    }
  }

  function renderReport() {
    renderMetrics();
    renderComparisonChart();
    renderTopClients();
    renderChannelDistribution();
    renderRateLine();
    renderGeneratedAt();
  }

  async function loadBaseData() {
    try {
      const [usersData, movementsData] = await Promise.all([
        getJson('/api/v1/usuarios'),
        getJson('/api/v1/movimientos')
      ]);

      users = Array.isArray(usersData) ? usersData : [];
      baseMovements = Array.isArray(movementsData) ? movementsData : [];
      renderSelectOptions();
    } catch (error) {
      users = [];
      baseMovements = [];
      renderSelectOptions();
      showMessage(error.message, 'error');
    }
  }

  async function loadReport({ silent = false } = {}) {
    try {
      const range = getPeriodRange();
      const data = await getJson(buildMovementQuery());
      const channel = getSelectedChannel();
      const movements = Array.isArray(data) ? data : [];

      reportMovements = movements.filter((movement) => (
        (!channel || getChannel(movement.origen) === channel) &&
        matchesRange(movement, range)
      ));

      renderReport();
      if (!silent) {
        showMessage('Reporte generado correctamente.');
      }
    } catch (error) {
      reportMovements = [];
      renderReport();
      showMessage(error.message, 'error');
    }
  }

  async function refreshReport() {
    await loadBaseData();
    await loadReport({ silent: true });
  }

  function csvValue(value) {
    return `"${formatValue(value, '').replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    if (reportMovements.length === 0) {
      showMessage('No hay datos para exportar.', 'error');
      return;
    }

    const stats = getStats(reportMovements);
    const movementHeaders = [
      'id',
      'fecha',
      'usuario_id',
      'usuario',
      'documento',
      'tipo',
      'canal',
      'origen',
      'puntos',
      'referencia',
      'descripcion'
    ];
    const movementRows = reportMovements.map((movement) => [
      movement.id,
      formatDate(movement.fecha_movimiento),
      movement.usuario_id,
      movement.usuario_nombre,
      movement.numero_documento,
      isRedemption(movement) ? 'Redencion' : 'Acumulacion',
      getChannel(movement.origen),
      movement.origen,
      `${isRedemption(movement) ? '-' : '+'}${formatNumber(getMovementPoints(movement))}`,
      movement.referencia_id,
      movement.descripcion
    ].map(csvValue).join(','));
    const topRows = topClients.map((client, index) => [
      index + 1,
      client.nombre,
      client.documento,
      client.points
    ].map(csvValue).join(','));
    const monthRows = monthlyStats.map((item) => [
      item.key,
      item.earned,
      item.redeemed,
      formatPercent(item.rate)
    ].map(csvValue).join(','));
    const csv = [
      'Resumen',
      ['Periodo', getPeriodLabel(getSelectedPeriod())].map(csvValue).join(','),
      ['Canal', getSelectedChannel() || 'Todos'].map(csvValue).join(','),
      ['Punto de venta', getSelectedOrigin() || 'Todos'].map(csvValue).join(','),
      ['Puntos acumulados', stats.earned].map(csvValue).join(','),
      ['Puntos redimidos', stats.redeemed].map(csvValue).join(','),
      ['Clientes con movimientos', stats.clients].map(csvValue).join(','),
      ['Tasa de redencion', formatPercent(stats.rate)].map(csvValue).join(','),
      '',
      'Top clientes',
      ['ranking', 'cliente', 'documento', 'puntos'].join(','),
      ...topRows,
      '',
      'Mensual',
      ['periodo', 'puntos_acumulados', 'puntos_redimidos', 'tasa_redencion'].join(','),
      ...monthRows,
      '',
      'Movimientos',
      movementHeaders.join(','),
      ...movementRows
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `reporte-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage('Reporte CSV generado.');
  }

  function exportPdf() {
    showMessage('Se abrira la vista de impresion para guardar el reporte como PDF.');
    window.setTimeout(() => window.print(), 150);
  }

  function setupEvents() {
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
    const filtersForm = document.querySelector('[data-report-filters]');
    const searchInput = document.querySelector('[data-report-search]');

    if (nameNode) nameNode.textContent = name;
    if (initialsNode) initialsNode.textContent = getInitials(name);

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

    if (filtersForm) {
      filtersForm.addEventListener('submit', (event) => {
        event.preventDefault();
        loadReport();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => loadReport({ silent: true }), SEARCH_DELAY);
      });
    }

    const csvButton = document.querySelector('[data-export-report-csv]');
    if (csvButton) {
      csvButton.addEventListener('click', exportCsv);
    }

    const pdfButton = document.querySelector('[data-export-report-pdf]');
    if (pdfButton) {
      pdfButton.addEventListener('click', exportPdf);
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
  }

  setupEvents();
  refreshReport();
  loadNotifications();
  window.setInterval(loadNotifications, DASHBOARD_REFRESH_INTERVAL);
})();
