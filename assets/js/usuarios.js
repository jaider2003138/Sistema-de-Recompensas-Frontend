(function () {
  const API_BASE_URL =
    window.REWARD_API_BASE_URL ||
    localStorage.getItem('rewardApiBaseUrl') ||
    'http://localhost:3000';

  const SIDEBAR_COLLAPSED_KEY = 'rewardAdminSidebarCollapsed';
  const NOTIFICATIONS_LAST_SEEN_KEY = 'rewardAdminNotificationsLastSeen';
  const DASHBOARD_REFRESH_INTERVAL = 30000;
  const SEARCH_DELAY = 350;

  let allUsers = [];
  let filteredUsers = [];
  let selectedUser = null;
  let currentPage = 1;
  let pageSize = 10;
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

  function formatMoney(value) {
    return numberValue(value).toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    });
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

  function formatShortDate(value) {
    if (!value) {
      return 'No registrado';
    }

    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
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

  function postJson(path, payload) {
    return requestJson(path, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  function patchJson(path, payload) {
    return requestJson(path, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  function showMessage(message, type = 'success') {
    const node = document.querySelector('[data-users-message]');

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
      const profile = await getJson(`/api/v1/usuarios/${usuario.id}`);
      renderProfileDetails(profile);
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

  function getUserBalance(user) {
    return numberValue(user && user.saldo_actual);
  }

  function buildUserQuery() {
    const params = new URLSearchParams();
    const search = document.querySelector('[data-users-search]');
    const documentFilter = document.querySelector('[data-document-filter]');
    const statusFilter = document.querySelector('[data-status-filter]');

    if (search && search.value.trim()) {
      params.set('buscar', search.value.trim());
    }

    if (documentFilter && documentFilter.value) {
      params.set('tipo_documento', documentFilter.value);
    }

    if (statusFilter && statusFilter.value) {
      params.set('estado', statusFilter.value);
    }

    const query = params.toString();
    return query ? `/api/v1/usuarios?${query}` : '/api/v1/usuarios';
  }

  function renderMetrics(users) {
    const values = Array.isArray(users) ? users : [];
    const total = values.length;
    const active = values.filter((user) => user.estado !== false).length;
    const inactive = total - active;
    const average = total > 0
      ? Math.round(values.reduce((sum, user) => sum + getUserBalance(user), 0) / total)
      : 0;

    const totalNode = document.querySelector('[data-users-metric="total"]');
    const activeNode = document.querySelector('[data-users-metric="active"]');
    const inactiveNode = document.querySelector('[data-users-metric="inactive"]');
    const averageNode = document.querySelector('[data-users-metric="average"]');
    const activePercent = document.querySelector('[data-users-percent="active"]');
    const inactivePercent = document.querySelector('[data-users-percent="inactive"]');
    const averageMoney = document.querySelector('[data-users-average-money]');

    if (totalNode) totalNode.textContent = formatNumber(total);
    if (activeNode) activeNode.textContent = formatNumber(active);
    if (inactiveNode) inactiveNode.textContent = formatNumber(inactive);
    if (averageNode) averageNode.textContent = `${formatNumber(average)} pts`;
    if (activePercent) activePercent.textContent = `${total ? ((active / total) * 100).toFixed(1) : '0.0'}% del total`;
    if (inactivePercent) inactivePercent.textContent = `${total ? ((inactive / total) * 100).toFixed(1) : '0.0'}% del total`;
    if (averageMoney) averageMoney.textContent = `Equivalente a ${formatMoney(average)}`;
  }

  function renderFilterOptions(users) {
    const documentFilter = document.querySelector('[data-document-filter]');

    if (!documentFilter) {
      return;
    }

    const currentValue = documentFilter.value;
    const types = [...new Set((Array.isArray(users) ? users : [])
      .map((user) => user.tipo_documento)
      .filter(Boolean))]
      .sort((first, second) => String(first).localeCompare(String(second), 'es'));

    documentFilter.innerHTML = '<option value="">Todos</option>';
    types.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      documentFilter.appendChild(option);
    });

    if (types.includes(currentValue)) {
      documentFilter.value = currentValue;
    }
  }

  function getPaginatedUsers() {
    const totalPages = Math.max(Math.ceil(filteredUsers.length / pageSize), 1);
    currentPage = Math.min(Math.max(currentPage, 1), totalPages);
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }

  function setSelectedUser(user) {
    selectedUser = user || null;
    renderUsersTable();
    renderUserDetail(selectedUser);
  }

  function renderUsersTable() {
    const body = document.querySelector('[data-users-body]');
    const summary = document.querySelector('[data-users-pagination-summary]');
    const pageNode = document.querySelector('[data-users-page]');
    const prev = document.querySelector('[data-users-prev]');
    const next = document.querySelector('[data-users-next]');

    if (!body) {
      return;
    }

    body.innerHTML = '';
    const pageUsers = getPaginatedUsers();
    const totalPages = Math.max(Math.ceil(filteredUsers.length / pageSize), 1);

    if (filteredUsers.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.className = 'table-empty';
      cell.textContent = 'No hay usuarios que coincidan con la busqueda.';
      row.appendChild(cell);
      body.appendChild(row);
    } else {
      pageUsers.forEach((user) => {
        const row = document.createElement('tr');
        const selected = selectedUser && String(selectedUser.id) === String(user.id);

        row.className = selected ? 'is-selected' : '';
        row.dataset.userRow = user.id;
        row.innerHTML = `
          <td><span class="doc-pill">${escapeHtml(user.tipo_documento)}</span></td>
          <td>${escapeHtml(user.numero_documento || user.id)}</td>
          <td>${escapeHtml(user.nombre)}</td>
          <td>${escapeHtml(user.correo)}</td>
          <td><span class="state-pill ${user.estado === false ? 'pending' : 'done'}">${user.estado === false ? 'Inactivo' : 'Activo'}</span></td>
          <td>${formatNumber(getUserBalance(user))} pts</td>
          <td>${escapeHtml(formatShortDate(user.fecha_creacion))}</td>
          <td><button class="row-action-button" type="button" data-select-user="${user.id}" aria-label="Ver detalle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" /></svg></button></td>
        `;
        body.appendChild(row);
      });
    }

    if (summary) {
      const start = filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
      const end = Math.min(currentPage * pageSize, filteredUsers.length);
      summary.textContent = `Mostrando ${start} a ${end} de ${formatNumber(filteredUsers.length)} usuarios`;
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

  function renderUserDetail(user) {
    const detail = document.querySelector('[data-user-detail]');

    if (!detail) {
      return;
    }

    if (!user) {
      detail.innerHTML = '<p class="empty-state">Selecciona un usuario para ver el detalle.</p>';
      return;
    }

    const active = user.estado !== false;

    detail.innerHTML = `
      <header class="user-detail-header">
        <button class="profile-details-close" type="button" data-clear-user-detail aria-label="Cerrar detalle">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4 6.4 5Zm12.6 1.4L6.4 19 5 17.6 17.6 5 19 6.4Z" /></svg>
        </button>
      </header>
      <div class="user-detail-identity">
        <span>${escapeHtml(getInitials(user.nombre))}</span>
        <div>
          <h2>${escapeHtml(user.nombre)}</h2>
          <small class="state-pill ${active ? 'done' : 'pending'}">${active ? 'Activo' : 'Inactivo'}</small>
        </div>
      </div>
      <dl class="user-detail-list">
        <dt>${escapeHtml(user.tipo_documento)}</dt>
        <dd>${escapeHtml(user.numero_documento)}</dd>
        <dt>Correo</dt>
        <dd>${escapeHtml(user.correo)}</dd>
        <dt>Telefono</dt>
        <dd>${escapeHtml(user.telefono)}</dd>
        <dt>Registrado</dt>
        <dd>${escapeHtml(formatShortDate(user.fecha_creacion))}</dd>
        <dt>Rol</dt>
        <dd>${escapeHtml(user.rol)}</dd>
      </dl>
      <div class="user-balance-box">
        <span>Saldo de puntos</span>
        <strong>${formatNumber(getUserBalance(user))} pts</strong>
        <small>Equivalente a ${formatMoney(getUserBalance(user))}</small>
      </div>
      <div class="quick-actions">
        <button type="button" data-refresh-user>Consultar informacion</button>
        <button type="button" data-toggle-user-state>${active ? 'Desactivar' : 'Activar'} usuario</button>
        <button type="button" data-load-user-history>Ver historial</button>
      </div>
      <div class="user-history" data-user-history hidden></div>
    `;
  }

  async function loadUsers() {
    try {
      filteredUsers = await getJson(buildUserQuery());

      if (selectedUser) {
        selectedUser = filteredUsers.find((user) => String(user.id) === String(selectedUser.id)) ||
          filteredUsers[0] ||
          null;
      } else {
        selectedUser = filteredUsers[0] || null;
      }

      if (filteredUsers.length === 0) {
        selectedUser = null;
      }

      renderUsersTable();
      renderUserDetail(selectedUser);
    } catch (error) {
      filteredUsers = [];
      renderUsersTable();
      renderUserDetail(null);
      showMessage(error.message, 'error');
    }
  }

  async function loadUsersBaseData() {
    try {
      allUsers = await getJson('/api/v1/usuarios');
      renderMetrics(allUsers);
      renderFilterOptions(allUsers);
    } catch (error) {
      allUsers = [];
      renderMetrics([]);
      renderFilterOptions([]);
      showMessage(error.message, 'error');
    }
  }

  async function refreshUsers({ resetPage = false } = {}) {
    if (resetPage) {
      currentPage = 1;
    }

    await loadUsersBaseData();
    await loadUsers();
  }

  async function refreshSelectedUser() {
    if (!selectedUser) {
      return;
    }

    try {
      const user = await getJson(`/api/v1/usuarios/${selectedUser.id}`);
      selectedUser = user;
      renderUserDetail(user);
      renderUsersTable();
      showMessage('Informacion del usuario actualizada.');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function toggleSelectedUserState() {
    if (!selectedUser) {
      return;
    }

    try {
      const updatedUser = await patchJson(`/api/v1/usuarios/${selectedUser.id}/estado`, {
        estado: selectedUser.estado === false
      });
      selectedUser = updatedUser;
      showMessage(`Usuario ${updatedUser.estado === false ? 'desactivado' : 'activado'} correctamente.`);
      await refreshUsers();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function loadSelectedUserHistory() {
    const history = document.querySelector('[data-user-history]');

    if (!selectedUser || !history) {
      return;
    }

    history.hidden = false;
    history.innerHTML = '<p class="empty-state">Cargando historial...</p>';

    try {
      const movements = await getJson(`/api/v1/movimientos/usuario/${selectedUser.id}`);

      if (!Array.isArray(movements) || movements.length === 0) {
        history.innerHTML = '<p class="empty-state">No hay movimientos para este usuario.</p>';
        return;
      }

      const list = document.createElement('ul');
      movements.slice(0, 6).forEach((movement) => {
        const item = document.createElement('li');
        const isRedemption = movement.tipo_movimiento === 'REDENCION';
        item.innerHTML = `
          <strong>${isRedemption ? 'Redencion' : 'Acumulacion'} ${isRedemption ? '-' : '+'}${formatNumber(movement.puntos)} pts</strong>
          <span>${escapeHtml(formatValue(movement.origen, 'Sin origen'))}</span>
          <small>${escapeHtml(formatDate(movement.fecha_movimiento))}</small>
        `;
        list.appendChild(item);
      });

      history.innerHTML = '';
      history.appendChild(list);
    } catch (error) {
      history.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    }
  }

  function openCreateUserModal() {
    const modal = document.querySelector('[data-user-modal]');
    const form = document.querySelector('[data-create-user-form]');

    if (form) {
      form.reset();
    }

    if (modal) {
      modal.hidden = false;
      const firstInput = modal.querySelector('input, select');
      if (firstInput) {
        firstInput.focus();
      }
    }
  }

  function closeCreateUserModal() {
    const modal = document.querySelector('[data-user-modal]');

    if (modal) {
      modal.hidden = true;
    }
  }

  async function createUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      tipo_documento: data.get('tipo_documento'),
      numero_documento: data.get('numero_documento'),
      nombre: data.get('nombre'),
      correo: data.get('correo') || undefined,
      telefono: data.get('telefono') || undefined,
      rol: data.get('rol') || 'consulta'
    };

    try {
      const newUser = await postJson('/api/v1/usuarios', payload);
      selectedUser = newUser;
      closeCreateUserModal();
      showMessage('Usuario creado correctamente.');
      await refreshUsers({ resetPage: true });
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  function csvValue(value) {
    return `"${formatValue(value, '').replace(/"/g, '""')}"`;
  }

  function exportUsers() {
    const headers = [
      'id',
      'tipo_documento',
      'numero_documento',
      'nombre',
      'correo',
      'telefono',
      'rol',
      'estado',
      'saldo_actual',
      'fecha_creacion'
    ];
    const rows = filteredUsers.map((user) => headers.map((key) => {
      if (key === 'estado') {
        return csvValue(user.estado === false ? 'Inactivo' : 'Activo');
      }
      return csvValue(user[key]);
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage('Exportacion generada con los usuarios filtrados.');
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
    const searchInput = document.querySelector('[data-users-search]');
    const documentFilter = document.querySelector('[data-document-filter]');
    const statusFilter = document.querySelector('[data-status-filter]');
    const pageSizeSelect = document.querySelector('[data-users-page-size]');
    const prevButton = document.querySelector('[data-users-prev]');
    const nextButton = document.querySelector('[data-users-next]');
    const usersBody = document.querySelector('[data-users-body]');
    const detail = document.querySelector('[data-user-detail]');
    const createForm = document.querySelector('[data-create-user-form]');

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
          currentPage = 1;
          loadUsers();
        }, SEARCH_DELAY);
      });
    }

    [documentFilter, statusFilter].forEach((filter) => {
      if (filter) {
        filter.addEventListener('change', () => {
          currentPage = 1;
          loadUsers();
        });
      }
    });

    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => {
        pageSize = Number(pageSizeSelect.value) || 10;
        currentPage = 1;
        renderUsersTable();
      });
    }

    if (prevButton) {
      prevButton.addEventListener('click', () => {
        currentPage -= 1;
        renderUsersTable();
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', () => {
        currentPage += 1;
        renderUsersTable();
      });
    }

    if (usersBody) {
      usersBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-select-user]');
        const row = event.target.closest('[data-user-row]');
        const id = button ? button.dataset.selectUser : row && row.dataset.userRow;
        const user = filteredUsers.find((item) => String(item.id) === String(id));

        if (user) {
          setSelectedUser(user);
        }
      });
    }

    if (detail) {
      detail.addEventListener('click', (event) => {
        if (event.target.closest('[data-clear-user-detail]')) {
          setSelectedUser(null);
          return;
        }

        if (event.target.closest('[data-refresh-user]')) {
          refreshSelectedUser();
          return;
        }

        if (event.target.closest('[data-toggle-user-state]')) {
          toggleSelectedUserState();
          return;
        }

        if (event.target.closest('[data-load-user-history]')) {
          loadSelectedUserHistory();
        }
      });
    }

    document.querySelectorAll('[data-open-create-user]').forEach((button) => {
      button.addEventListener('click', openCreateUserModal);
    });

    document.querySelectorAll('[data-close-create-user]').forEach((button) => {
      button.addEventListener('click', closeCreateUserModal);
    });

    const modal = document.querySelector('[data-user-modal]');
    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          closeCreateUserModal();
        }
      });
    }

    if (createForm) {
      createForm.addEventListener('submit', createUser);
    }

    const exportButton = document.querySelector('[data-export-users]');
    if (exportButton) {
      exportButton.addEventListener('click', exportUsers);
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
      closeCreateUserModal();

      if (profileDetailsPanel) {
        profileDetailsPanel.hidden = true;
      }
    });
  }

  setupEvents();
  refreshUsers({ resetPage: true });
  loadNotifications();
  window.setInterval(loadNotifications, DASHBOARD_REFRESH_INTERVAL);
})();
