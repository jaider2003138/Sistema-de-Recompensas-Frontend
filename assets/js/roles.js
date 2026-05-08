(function () {
  const API_BASE_URL =
    window.REWARD_API_BASE_URL ||
    localStorage.getItem('rewardApiBaseUrl') ||
    'http://localhost:3000';

  const SIDEBAR_COLLAPSED_KEY = 'rewardAdminSidebarCollapsed';
  const NOTIFICATIONS_LAST_SEEN_KEY = 'rewardAdminNotificationsLastSeen';
  const DASHBOARD_REFRESH_INTERVAL = 30000;
  const SEARCH_DELAY = 250;
  const PERMISSION_ORDER = ['completo', 'lectura', 'ninguno'];
  const MODULES = [
    { key: 'usuarios', label: 'Usuarios' },
    { key: 'acumulacion', label: 'Acumulacion' },
    { key: 'redencion', label: 'Redencion' },
    { key: 'historial', label: 'Historial' },
    { key: 'reportes', label: 'Reportes' },
    { key: 'exportacion', label: 'Exportacion' },
    { key: 'configuracion', label: 'Configuracion' }
  ];

  let roles = [];
  let filteredRoles = [];
  let users = [];
  let selectedRoleId = null;
  let dirtyRoles = new Set();
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
    return String(name || 'Rol')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  function displayRoleName(name) {
    return String(name || '')
      .toLowerCase()
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Rol';
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

  const getJson = (path) => requestJson(path);
  const postJson = (path, payload) => requestJson(path, { method: 'POST', body: JSON.stringify(payload) });
  const putJson = (path, payload) => requestJson(path, { method: 'PUT', body: JSON.stringify(payload) });

  function showMessage(message, type = 'success') {
    const node = document.querySelector('[data-role-message]');

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

  function getSelectedRole() {
    return roles.find((role) => String(role.id) === String(selectedRoleId)) || roles[0] || null;
  }

  function getRoleIconClass(role) {
    const code = String(role && role.codigo || '').toLowerCase();

    if (code === 'administrador') return 'violet';
    if (code === 'operador') return 'coral';
    if (code === 'consulta') return 'mint';
    return 'blue';
  }

  function getPermissionIcon(level) {
    if (level === 'completo') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 15.2-3.2-3.2-1.4 1.4L10 18 19 9l-1.4-1.4L10 15.2Z" /></svg>';
    }

    if (level === 'lectura') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5 0 9 4 10 7-1 3-5 7-10 7S3 15 2 12c1-3 5-7 10-7Zm0 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg>';
    }

    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 11h12v2H6v-2Z" /></svg>';
  }

  function getPermissionLabel(level) {
    if (level === 'completo') return 'Acceso completo';
    if (level === 'lectura') return 'Solo lectura';
    return 'Sin acceso';
  }

  function nextPermission(level) {
    const index = PERMISSION_ORDER.indexOf(level);
    return PERMISSION_ORDER[(index + 1) % PERMISSION_ORDER.length] || 'ninguno';
  }

  function renderMetrics(metricas = {}) {
    const configured = document.querySelector('[data-role-metric="configured"]');
    const admins = document.querySelector('[data-role-metric="admins"]');
    const operators = document.querySelector('[data-role-metric="operators"]');
    const readers = document.querySelector('[data-role-metric="readers"]');

    if (configured) configured.textContent = formatNumber(metricas.roles_configurados);
    if (admins) admins.textContent = formatNumber(metricas.usuarios_administradores);
    if (operators) operators.textContent = formatNumber(metricas.operadores_activos);
    if (readers) readers.textContent = formatNumber(metricas.usuarios_consulta);
  }

  function applySearch() {
    const search = document.querySelector('[data-role-search]');
    const term = search ? search.value.trim().toLowerCase() : '';

    filteredRoles = term
      ? roles.filter((role) => (
        String(role.nombre || '').toLowerCase().includes(term) ||
        String(role.descripcion || '').toLowerCase().includes(term) ||
        String(role.codigo || '').toLowerCase().includes(term)
      ))
      : [...roles];

    renderRolesTable();
  }

  function renderRolesTable() {
    const body = document.querySelector('[data-roles-body]');

    if (!body) {
      return;
    }

    body.innerHTML = '';

    if (filteredRoles.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 10;
      cell.className = 'table-empty';
      cell.textContent = 'No hay roles que coincidan con la busqueda.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    filteredRoles.forEach((role) => {
      const selected = String(role.id) === String(selectedRoleId);
      const row = document.createElement('tr');

      row.className = selected ? 'is-selected' : '';
      row.dataset.roleRow = role.id;
      row.innerHTML = `
        <td>
          <div class="role-name-cell">
            <span class="role-icon-badge ${getRoleIconClass(role)}">${escapeHtml(getInitials(displayRoleName(role.nombre)).slice(0, 1))}</span>
            <strong>${escapeHtml(displayRoleName(role.nombre))}</strong>
          </div>
        </td>
        <td><p class="role-description">${escapeHtml(formatValue(role.descripcion, 'Sin descripcion'))}</p></td>
        <td><strong>${formatNumber(role.usuarios_asignados)}</strong><small>usuarios</small></td>
        ${MODULES.map((module) => {
          const level = role.permisos && role.permisos[module.key] ? role.permisos[module.key] : 'ninguno';
          return `
            <td>
              <button class="permission-toggle ${level}" type="button" data-permission-role="${role.id}" data-permission-module="${module.key}" title="${getPermissionLabel(level)}" aria-label="${module.label}: ${getPermissionLabel(level)}">
                ${getPermissionIcon(level)}
              </button>
            </td>
          `;
        }).join('')}
      `;
      body.appendChild(row);
    });
  }

  function selectRole(roleId) {
    selectedRoleId = roleId;
    renderRolesTable();
  }

  function updateRolesData(data) {
    roles = Array.isArray(data && data.roles) ? data.roles : [];
    selectedRoleId = roles.some((role) => String(role.id) === String(selectedRoleId))
      ? selectedRoleId
      : roles[0] && roles[0].id;
    dirtyRoles = new Set();
    renderMetrics(data && data.metricas ? data.metricas : {});
    applySearch();
    renderAssignRoleOptions();

    if (window.AdminPermissions && typeof window.AdminPermissions.applyRolesData === 'function') {
      window.AdminPermissions.applyRolesData(data);
    }
  }

  async function loadData() {
    try {
      const [rolesData, usersData] = await Promise.all([
        getJson('/api/v1/roles'),
        getJson('/api/v1/usuarios')
      ]);

      users = Array.isArray(usersData) ? usersData : [];
      updateRolesData(rolesData);
    } catch (error) {
      roles = [];
      users = [];
      updateRolesData({ roles: [], metricas: {} });
      showMessage(error.message, 'error');
    }
  }

  function changePermission(roleId, moduleKey) {
    const role = roles.find((item) => String(item.id) === String(roleId));

    if (!role) {
      return;
    }

    role.permisos = role.permisos || {};
    role.permisos[moduleKey] = nextPermission(role.permisos[moduleKey] || 'ninguno');
    dirtyRoles.add(String(role.id));
    renderRolesTable();
  }

  function openRoleModal(role = null) {
    const modal = document.querySelector('[data-role-modal]');
    const form = document.querySelector('[data-role-form]');
    const title = document.querySelector('[data-role-modal-title]');

    if (!modal || !form) {
      return;
    }

    form.reset();
    form.elements.id.value = role ? role.id : '';
    form.elements.nombre.value = role ? displayRoleName(role.nombre) : '';
    form.elements.descripcion.value = role ? formatValue(role.descripcion, '') : '';
    form.elements.plantilla.value = role && role.codigo === 'administrador'
      ? 'ADMINISTRADOR'
      : role && role.codigo === 'operador'
        ? 'OPERADOR'
        : 'CONSULTA';

    if (title) {
      title.textContent = role ? 'Editar rol' : 'Nuevo rol';
    }

    modal.hidden = false;
    form.elements.nombre.focus();
  }

  function closeRoleModal() {
    const modal = document.querySelector('[data-role-modal]');

    if (modal) {
      modal.hidden = true;
    }
  }

  async function saveRole(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const id = data.get('id');
    const payload = {
      nombre: String(data.get('nombre') || '').trim(),
      descripcion: String(data.get('descripcion') || '').trim(),
      plantilla: data.get('plantilla')
    };

    try {
      const response = id
        ? await putJson(`/api/v1/roles/${id}`, {
          ...payload,
          permisos: (roles.find((role) => String(role.id) === String(id)) || {}).permisos
        })
        : await postJson('/api/v1/roles', payload);

      closeRoleModal();
      updateRolesData(response);
      showMessage(id ? 'Rol actualizado correctamente.' : 'Rol creado correctamente.');
      await loadData();
      await loadNotifications();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function savePermissions() {
    if (dirtyRoles.size === 0) {
      showMessage('No hay cambios de permisos por guardar.', 'error');
      return;
    }

    try {
      let lastResponse = null;

      for (const roleId of dirtyRoles) {
        const role = roles.find((item) => String(item.id) === String(roleId));

        if (role) {
          lastResponse = await putJson(`/api/v1/roles/${role.id}`, {
            nombre: role.nombre,
            descripcion: role.descripcion,
            permisos: role.permisos
          });
        }
      }

      if (lastResponse) {
        updateRolesData(lastResponse);
      }

      showMessage('Permisos guardados correctamente.');
      await loadData();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  function renderAssignRoleOptions() {
    const select = document.querySelector('[data-assign-role-select]');

    if (!select) {
      return;
    }

    const currentValue = select.value || selectedRoleId || '';
    select.innerHTML = '';

    roles.forEach((role) => {
      const option = document.createElement('option');
      option.value = role.id;
      option.textContent = displayRoleName(role.nombre);
      select.appendChild(option);
    });

    select.value = roles.some((role) => String(role.id) === String(currentValue))
      ? currentValue
      : selectedRoleId || '';
  }

  function renderAssignUsers() {
    const list = document.querySelector('[data-assign-users]');
    const select = document.querySelector('[data-assign-role-select]');
    const role = roles.find((item) => String(item.id) === String(select && select.value));

    if (!list) {
      return;
    }

    list.innerHTML = '';

    if (!role) {
      list.innerHTML = '<p class="empty-state">Selecciona un rol.</p>';
      return;
    }

    if (users.length === 0) {
      list.innerHTML = '<p class="empty-state">No hay usuarios disponibles.</p>';
      return;
    }

    users.forEach((user) => {
      const label = document.createElement('label');
      const currentRole = String(user.rol || '').toLowerCase();
      const disabled = String(user.id) === String(usuario.id) && role.codigo !== 'administrador';

      label.className = disabled ? 'is-disabled' : '';
      label.innerHTML = `
        <input type="checkbox" name="usuarios_ids" value="${user.id}" ${currentRole === role.codigo ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
        <span>${escapeHtml(getInitials(user.nombre))}</span>
        <div>
          <strong>${escapeHtml(formatValue(user.nombre, 'Usuario'))}</strong>
          <small>${escapeHtml(formatValue(user.correo || user.numero_documento, `ID ${user.id}`))} - ${escapeHtml(displayRoleName(user.rol))}</small>
        </div>
      `;
      list.appendChild(label);
    });
  }

  function openAssignModal() {
    const modal = document.querySelector('[data-assign-modal]');

    if (!modal) {
      return;
    }

    renderAssignRoleOptions();
    renderAssignUsers();
    modal.hidden = false;
  }

  function closeAssignModal() {
    const modal = document.querySelector('[data-assign-modal]');

    if (modal) {
      modal.hidden = true;
    }
  }

  async function assignUsers(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const roleId = data.get('rol_id');
    const selectedUsers = data.getAll('usuarios_ids').map(Number).filter(Boolean);

    if (selectedUsers.length === 0) {
      showMessage('Selecciona al menos un usuario para asignar.', 'error');
      return;
    }

    try {
      const response = await postJson(`/api/v1/roles/${roleId}/usuarios`, {
        usuarios_ids: selectedUsers
      });
      closeAssignModal();
      updateRolesData(response);
      showMessage('Usuarios asignados correctamente.');
      await loadData();
      await loadNotifications();
    } catch (error) {
      showMessage(error.message, 'error');
    }
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
    const searchInput = document.querySelector('[data-role-search]');
    const tableBody = document.querySelector('[data-roles-body]');
    const roleForm = document.querySelector('[data-role-form]');
    const assignForm = document.querySelector('[data-assign-form]');
    const assignRoleSelect = document.querySelector('[data-assign-role-select]');

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
        searchTimer = window.setTimeout(applySearch, SEARCH_DELAY);
      });
    }

    if (tableBody) {
      tableBody.addEventListener('click', (event) => {
        const permissionButton = event.target.closest('[data-permission-role]');
        const row = event.target.closest('[data-role-row]');

        if (permissionButton) {
          changePermission(
            permissionButton.dataset.permissionRole,
            permissionButton.dataset.permissionModule
          );
          selectRole(permissionButton.dataset.permissionRole);
          return;
        }

        if (row) {
          selectRole(row.dataset.roleRow);
        }
      });
    }

    document.querySelectorAll('[data-open-role-modal]').forEach((button) => {
      button.addEventListener('click', () => openRoleModal());
    });

    document.querySelectorAll('[data-edit-selected-role]').forEach((button) => {
      button.addEventListener('click', () => {
        const role = getSelectedRole();

        if (!role) {
          showMessage('Selecciona un rol para editar.', 'error');
          return;
        }

        openRoleModal(role);
      });
    });

    document.querySelectorAll('[data-close-role-modal]').forEach((button) => {
      button.addEventListener('click', closeRoleModal);
    });

    document.querySelectorAll('[data-open-assign-users]').forEach((button) => {
      button.addEventListener('click', openAssignModal);
    });

    document.querySelectorAll('[data-close-assign-modal]').forEach((button) => {
      button.addEventListener('click', closeAssignModal);
    });

    document.querySelectorAll('[data-save-role-permissions]').forEach((button) => {
      button.addEventListener('click', savePermissions);
    });

    if (roleForm) {
      roleForm.addEventListener('submit', saveRole);
    }

    if (assignForm) {
      assignForm.addEventListener('submit', assignUsers);
    }

    if (assignRoleSelect) {
      assignRoleSelect.addEventListener('change', renderAssignUsers);
    }

    document.querySelectorAll('[data-role-modal], [data-assign-modal]').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          modal.hidden = true;
        }
      });
    });

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
      closeRoleModal();
      closeAssignModal();

      if (profileDetailsPanel) {
        profileDetailsPanel.hidden = true;
      }
    });
  }

  setupEvents();
  loadData();
  loadNotifications();
  window.setInterval(loadNotifications, DASHBOARD_REFRESH_INTERVAL);
})();
