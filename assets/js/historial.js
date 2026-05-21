(function () {
  const API_BASE_URL =
    window.REWARD_API_BASE_URL ||
    localStorage.getItem('rewardApiBaseUrl') ||
    'http://localhost:3000';

  const SIDEBAR_COLLAPSED_KEY = 'rewardAdminSidebarCollapsed';
  const NOTIFICATIONS_LAST_SEEN_KEY = 'rewardAdminNotificationsLastSeen';
  const DASHBOARD_REFRESH_INTERVAL = 30000;
  const SEARCH_DELAY = 350;

  let users = [];
  let baseMovements = [];
  let movements = [];
  let selectedMovement = null;
  let currentPage = 1;
  let pageSize = 12;
  let searchTimer = null;
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
    const node = document.querySelector('[data-history-message]');

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

  function getSignedPoints(movement) {
    const points = getMovementPoints(movement);
    return `${isRedemption(movement) ? '-' : '+'}${formatNumber(points)} pts`;
  }

  function getTypeLabel(movement) {
    return isRedemption(movement) ? 'Redencion' : 'Acumulacion';
  }

  function getMovementId(movement) {
    const date = movement && movement.fecha_movimiento ? new Date(movement.fecha_movimiento) : new Date();
    const year = Number.isFinite(date.getTime()) ? date.getFullYear() : new Date().getFullYear();
    return `TXN-${year}-${String(movement && movement.id ? movement.id : 0).padStart(6, '0')}`;
  }

  function renderMetrics() {
    const total = movements.length;
    const earnMovements = movements.filter((movement) => !isRedemption(movement));
    const redeemMovements = movements.filter(isRedemption);
    const earnPoints = earnMovements.reduce((sum, movement) => sum + getMovementPoints(movement), 0);
    const redeemPoints = redeemMovements.reduce((sum, movement) => sum + getMovementPoints(movement), 0);
    const origins = new Set(movements.map((movement) => formatValue(movement.origen, 'Sin origen')));

    const totalNode = document.querySelector('[data-history-metric="total"]');
    const earnCountNode = document.querySelector('[data-history-metric="earn-count"]');
    const earnPointsNode = document.querySelector('[data-history-metric="earn-points"]');
    const redeemCountNode = document.querySelector('[data-history-metric="redeem-count"]');
    const redeemPointsNode = document.querySelector('[data-history-metric="redeem-points"]');
    const originsNode = document.querySelector('[data-history-metric="origins"]');

    if (totalNode) totalNode.textContent = formatNumber(total);
    if (earnCountNode) earnCountNode.textContent = formatNumber(earnMovements.length);
    if (earnPointsNode) earnPointsNode.textContent = `+${formatNumber(earnPoints)} pts`;
    if (redeemCountNode) redeemCountNode.textContent = formatNumber(redeemMovements.length);
    if (redeemPointsNode) redeemPointsNode.textContent = `-${formatNumber(redeemPoints)} pts`;
    if (originsNode) originsNode.textContent = formatNumber(origins.size);
  }

  function renderUserOptions() {
    const select = document.querySelector('[data-history-user]');

    if (!select) {
      return;
    }

    const currentValue = select.value;
    select.innerHTML = '<option value="">Todos los usuarios</option>';
    users
      .slice()
      .sort((first, second) => String(first.nombre || '').localeCompare(String(second.nombre || ''), 'es'))
      .forEach((user) => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${formatValue(user.nombre, 'Usuario')} - ${formatValue(user.numero_documento, user.id)}`;
        select.appendChild(option);
      });

    select.value = users.some((user) => String(user.id) === String(currentValue)) ? currentValue : '';
  }

  function renderOriginOptions() {
    const select = document.querySelector('[data-history-origin]');

    if (!select) {
      return;
    }

    const currentValue = select.value;
    const origins = [...new Set(baseMovements
      .map((movement) => formatValue(movement.origen, 'Sin origen'))
      .filter(Boolean))]
      .sort((first, second) => first.localeCompare(second, 'es'));

    select.innerHTML = '<option value="">Todos</option>';
    origins.forEach((origin) => {
      const option = document.createElement('option');
      option.value = origin;
      option.textContent = origin;
      select.appendChild(option);
    });

    select.value = origins.includes(currentValue) ? currentValue : '';
  }

  function buildMovementQuery() {
    const params = new URLSearchParams();
    const search = document.querySelector('[data-history-search]');
    const form = document.querySelector('[data-history-filters]');

    if (search && search.value.trim()) {
      params.set('buscar', search.value.trim());
    }

    if (form) {
      const data = new FormData(form);
      ['fecha_desde', 'fecha_hasta', 'tipo_movimiento', 'origen', 'usuario_id'].forEach((field) => {
        const value = String(data.get(field) || '').trim();

        if (value) {
          params.set(field, value);
        }
      });
    }

    const query = params.toString();
    return query ? `/api/v1/movimientos?${query}` : '/api/v1/movimientos';
  }

  function getPaginatedMovements() {
    const totalPages = Math.max(Math.ceil(movements.length / pageSize), 1);
    currentPage = Math.min(Math.max(currentPage, 1), totalPages);
    const start = (currentPage - 1) * pageSize;
    return movements.slice(start, start + pageSize);
  }

  function renderTable() {
    const body = document.querySelector('[data-history-body]');
    const summary = document.querySelector('[data-history-summary]');
    const paginationSummary = document.querySelector('[data-history-pagination-summary]');
    const pageNode = document.querySelector('[data-history-page]');
    const prev = document.querySelector('[data-history-prev]');
    const next = document.querySelector('[data-history-next]');

    if (!body) {
      return;
    }

    body.innerHTML = '';
    const pageMovements = getPaginatedMovements();
    const totalPages = Math.max(Math.ceil(movements.length / pageSize), 1);

    if (movements.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.className = 'table-empty';
      cell.textContent = 'No hay movimientos que coincidan con los filtros.';
      row.appendChild(cell);
      body.appendChild(row);
    } else {
      pageMovements.forEach((movement) => {
        const row = document.createElement('tr');
        const selected = selectedMovement && String(selectedMovement.id) === String(movement.id);

        row.className = selected ? 'is-selected' : '';
        row.dataset.movementRow = movement.id;
        row.innerHTML = `
          <td>${escapeHtml(formatDate(movement.fecha_movimiento))}</td>
          <td><span class="history-transaction">${escapeHtml(getMovementId(movement))}</span></td>
          <td>
            <div class="history-user-cell">
              <span>${escapeHtml(getInitials(movement.usuario_nombre))}</span>
              <div>
                <strong>${escapeHtml(formatValue(movement.usuario_nombre, 'Usuario'))}</strong>
                <small>${escapeHtml(formatValue(movement.numero_documento, `ID ${movement.usuario_id}`))}</small>
              </div>
            </div>
          </td>
          <td><span class="type-pill ${isRedemption(movement) ? 'redeem' : 'earn'}">${escapeHtml(getTypeLabel(movement))}</span></td>
          <td>${escapeHtml(formatValue(movement.origen, 'Sin origen'))}</td>
          <td><span class="${isRedemption(movement) ? 'points-negative' : 'points-positive'}">${escapeHtml(getSignedPoints(movement))}</span></td>
          <td>${escapeHtml(formatValue(movement.referencia_id, 'Sin referencia'))}</td>
          <td><span class="state-pill done">Completado</span></td>
        `;
        body.appendChild(row);
      });
    }

    if (summary) {
      summary.textContent = `Mostrando ${formatNumber(movements.length)} movimientos`;
    }

    if (paginationSummary) {
      const start = movements.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
      const end = Math.min(currentPage * pageSize, movements.length);
      paginationSummary.textContent = `Mostrando ${start} a ${end} de ${formatNumber(movements.length)} movimientos`;
    }

    if (pageNode) {
      pageNode.textContent = String(currentPage);
    }

    if (prev) {
      prev.disabled = currentPage <= 1;
    }

    if (next) {
      next.disabled = currentPage >= totalPages;
    }
  }

  function renderTraceability() {
    const panel = document.querySelector('[data-traceability-panel]');

    if (!panel) {
      return;
    }

    if (!selectedMovement) {
      panel.innerHTML = '<p class="empty-state">Selecciona un movimiento para ver la trazabilidad.</p>';
      return;
    }

    const movement = selectedMovement;
    const typeLabel = getTypeLabel(movement);
    const signedPoints = getSignedPoints(movement);
    const stateText = isRedemption(movement)
      ? 'Se descontaron puntos del saldo del usuario.'
      : 'Se sumaron puntos al saldo del usuario.';

    panel.innerHTML = `
      <header class="panel-header compact">
        <div>
          <h2>Trazabilidad</h2>
          <span>Detalle de la transaccion seleccionada</span>
        </div>
      </header>
      <div class="trace-id">${escapeHtml(getMovementId(movement))}</div>
      <div class="trace-timeline">
        <article class="trace-step">
          <span class="trace-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4V4Zm2 2v12h12V6H6Zm2 3h8v2H8V9Zm0 4h5v2H8v-2Z" /></svg>
          </span>
          <div class="trace-content">
            <h3>Creacion de transaccion</h3>
            <small>${escapeHtml(formatDate(movement.fecha_movimiento))}</small>
            <dl>
              <dt>Usuario</dt>
              <dd>${escapeHtml(formatValue(movement.usuario_nombre, 'Usuario'))}</dd>
              <dt>Origen</dt>
              <dd>${escapeHtml(formatValue(movement.origen, 'Sin origen'))}</dd>
            </dl>
          </div>
        </article>
        <article class="trace-step">
          <span class="trace-icon success" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m10 15.2-3.2-3.2-1.4 1.4L10 18 19 9l-1.4-1.4L10 15.2Z" /></svg>
          </span>
          <div class="trace-content">
            <h3>Validacion</h3>
            <small>${escapeHtml(formatDate(movement.fecha_movimiento))}</small>
            <dl>
              <dt>Tipo</dt>
              <dd>${escapeHtml(typeLabel)}</dd>
              <dt>Referencia</dt>
              <dd>${escapeHtml(formatValue(movement.referencia_id, 'Sin referencia'))}</dd>
            </dl>
          </div>
        </article>
        <article class="trace-step">
          <span class="trace-icon ${isRedemption(movement) ? 'danger' : 'success'}" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3C7 3 4 4.8 4 7v10c0 2.2 3 4 8 4s8-1.8 8-4V7c0-2.2-3-4-8-4Zm0 2c3.9 0 6 1.3 6 2s-2.1 2-6 2-6-1.3-6-2 2.1-2 6-2Z" /></svg>
          </span>
          <div class="trace-content">
            <h3>Aplicacion al saldo</h3>
            <small>${escapeHtml(stateText)}</small>
            <dl>
              <dt>Puntos</dt>
              <dd class="${isRedemption(movement) ? 'points-negative' : 'points-positive'}">${escapeHtml(signedPoints)}</dd>
              <dt>Descripcion</dt>
              <dd>${escapeHtml(formatValue(movement.descripcion, 'Movimiento de puntos'))}</dd>
            </dl>
          </div>
        </article>
        <article class="trace-step">
          <span class="trace-icon success" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1 14-3.5-3.5 1.4-1.4 2.1 2.1 4.6-4.6L17 10l-6 6Z" /></svg>
          </span>
          <div class="trace-content">
            <h3>Auditoria</h3>
            <small>Revision automatica completada</small>
            <dl>
              <dt>Estado</dt>
              <dd><span class="state-pill done">Completado</span></dd>
            </dl>
          </div>
        </article>
      </div>
    `;
  }

  function setSelectedMovement(movement) {
    selectedMovement = movement || null;
    renderTable();
    renderTraceability();
  }

  async function loadBaseData() {
    try {
      const [usersData, movementsData] = await Promise.all([
        getJson('/api/v1/usuarios'),
        getJson('/api/v1/movimientos')
      ]);

      users = Array.isArray(usersData) ? usersData : [];
      baseMovements = Array.isArray(movementsData) ? movementsData : [];
      renderUserOptions();
      renderOriginOptions();
    } catch (error) {
      users = [];
      baseMovements = [];
      renderUserOptions();
      renderOriginOptions();
      showMessage(error.message, 'error');
    }
  }

  async function loadMovements({ resetPage = false } = {}) {
    if (resetPage) {
      currentPage = 1;
    }

    try {
      movements = await getJson(buildMovementQuery());
      movements = Array.isArray(movements) ? movements : [];

      const previousSelection = selectedMovement;
      selectedMovement = previousSelection
        ? movements.find((movement) => String(movement.id) === String(previousSelection.id)) || null
        : null;

      if (!selectedMovement && movements.length > 0) {
        selectedMovement = movements[0];
      }

      renderMetrics();
      renderTable();
      renderTraceability();
    } catch (error) {
      movements = [];
      selectedMovement = null;
      renderMetrics();
      renderTable();
      renderTraceability();
      showMessage(error.message, 'error');
    }
  }

  async function refreshAll({ resetPage = false } = {}) {
    await loadBaseData();
    await loadMovements({ resetPage });
  }

  function clearFilters() {
    const form = document.querySelector('[data-history-filters]');
    const search = document.querySelector('[data-history-search]');

    if (form) {
      form.reset();
    }

    if (search) {
      search.value = '';
    }

    loadMovements({ resetPage: true });
  }

  function toggleFilters() {
    const form = document.querySelector('[data-history-filters]');
    const button = document.querySelector('[data-toggle-history-filters]');

    if (!form) {
      return;
    }

    const shouldHide = !form.hidden;
    form.hidden = shouldHide;

    if (button) {
      button.textContent = shouldHide ? 'Mostrar filtros' : 'Ocultar filtros';
    }
  }

  function csvValue(value) {
    return `"${formatValue(value, '').replace(/"/g, '""')}"`;
  }

  function exportMovements() {
    if (movements.length === 0) {
      showMessage('No hay movimientos para exportar.', 'error');
      return;
    }

    const headers = [
      'id_transaccion',
      'fecha',
      'usuario_id',
      'usuario',
      'documento',
      'tipo',
      'origen',
      'puntos',
      'referencia',
      'descripcion',
      'estado'
    ];
    const rows = movements.map((movement) => [
      getMovementId(movement),
      formatDate(movement.fecha_movimiento),
      movement.usuario_id,
      movement.usuario_nombre,
      movement.numero_documento,
      getTypeLabel(movement),
      movement.origen,
      getSignedPoints(movement),
      movement.referencia_id,
      movement.descripcion,
      'Completado'
    ].map(csvValue).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage('Exportacion generada con los movimientos filtrados.');
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
    const searchInput = document.querySelector('[data-history-search]');
    const filtersForm = document.querySelector('[data-history-filters]');
    const pageSizeSelect = document.querySelector('[data-history-page-size]');
    const prevButton = document.querySelector('[data-history-prev]');
    const nextButton = document.querySelector('[data-history-next]');
    const tableBody = document.querySelector('[data-history-body]');

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

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
          loadMovements({ resetPage: true });
        }, SEARCH_DELAY);
      });
    }

    if (filtersForm) {
      filtersForm.addEventListener('submit', (event) => {
        event.preventDefault();
        loadMovements({ resetPage: true });
      });
    }

    document.querySelectorAll('[data-clear-history-filters]').forEach((button) => {
      button.addEventListener('click', clearFilters);
    });

    document.querySelectorAll('[data-toggle-history-filters]').forEach((button) => {
      button.addEventListener('click', toggleFilters);
    });

    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => {
        pageSize = Number(pageSizeSelect.value) || 12;
        currentPage = 1;
        renderTable();
      });
    }

    if (prevButton) {
      prevButton.addEventListener('click', () => {
        currentPage -= 1;
        renderTable();
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', () => {
        currentPage += 1;
        renderTable();
      });
    }

    if (tableBody) {
      tableBody.addEventListener('click', (event) => {
        const row = event.target.closest('[data-movement-row]');
        const movement = row
          ? movements.find((item) => String(item.id) === String(row.dataset.movementRow))
          : null;

        if (movement) {
          setSelectedMovement(movement);
        }
      });
    }

    const exportButton = document.querySelector('[data-export-history]');
    if (exportButton) {
      exportButton.addEventListener('click', exportMovements);
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
  refreshAll({ resetPage: true });
  loadNotifications();
  window.setInterval(loadNotifications, DASHBOARD_REFRESH_INTERVAL);
})();
