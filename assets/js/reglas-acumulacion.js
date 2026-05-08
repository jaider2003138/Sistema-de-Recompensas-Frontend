(function () {
  const API_BASE_URL =
    window.REWARD_API_BASE_URL ||
    localStorage.getItem('rewardApiBaseUrl') ||
    'http://localhost:3000';

  const SIDEBAR_COLLAPSED_KEY = 'rewardAdminSidebarCollapsed';
  const NOTIFICATIONS_LAST_SEEN_KEY = 'rewardAdminNotificationsLastSeen';
  const DASHBOARD_REFRESH_INTERVAL = 30000;
  const SEARCH_DELAY = 250;

  let rules = [];
  let filteredRules = [];
  let dashboardNotifications = [];
  let originsCount = 0;
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
    return String(name || 'Administrador')
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

  function putJson(path, payload) {
    return requestJson(path, {
      method: 'PUT',
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
    const node = document.querySelector('[data-rules-message]');

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

  function getEquivalence(rule) {
    return `${formatMoney(rule.monto_base)} = ${formatNumber(rule.puntos_otorgados)} pts`;
  }

  function getRulePayload(form, forcedState) {
    const data = new FormData(form);
    return {
      nombre: String(data.get('nombre') || '').trim(),
      descripcion: String(data.get('descripcion') || '').trim() || undefined,
      monto_base: Number(data.get('monto_base')),
      puntos_otorgados: Number(data.get('puntos_otorgados')),
      estado: typeof forcedState === 'boolean'
        ? forcedState
        : String(data.get('estado')) === 'true'
    };
  }

  function renderMetrics() {
    const total = rules.length;
    const activeRules = rules.filter((rule) => rule.estado !== false);
    const primaryRule = activeRules[0] || null;
    const totalNode = document.querySelector('[data-rule-metric="total"]');
    const activeNode = document.querySelector('[data-rule-metric="active"]');
    const activePercent = document.querySelector('[data-rule-metric="active-percent"]');
    const primaryNode = document.querySelector('[data-rule-metric="primary"]');
    const primaryEquivalence = document.querySelector('[data-rule-metric="primary-equivalence"]');
    const originsNode = document.querySelector('[data-rule-metric="origins"]');

    if (totalNode) totalNode.textContent = formatNumber(total);
    if (activeNode) activeNode.textContent = formatNumber(activeRules.length);
    if (activePercent) activePercent.textContent = `${total ? ((activeRules.length / total) * 100).toFixed(1) : '0.0'}% del total`;
    if (primaryNode) primaryNode.textContent = primaryRule ? primaryRule.nombre : 'Sin regla';
    if (primaryEquivalence) primaryEquivalence.textContent = primaryRule ? getEquivalence(primaryRule) : 'Sin equivalencia';
    if (originsNode) originsNode.textContent = formatNumber(originsCount);
  }

  function applyRulesSearch() {
    const search = document.querySelector('[data-rules-search]');
    const term = search ? search.value.trim().toLowerCase() : '';

    filteredRules = term
      ? rules.filter((rule) => (
        String(rule.id).includes(term) ||
        String(rule.nombre || '').toLowerCase().includes(term) ||
        String(rule.descripcion || '').toLowerCase().includes(term)
      ))
      : [...rules];

    renderRulesTable();
  }

  function renderRulesTable() {
    const body = document.querySelector('[data-rules-body]');
    const summary = document.querySelector('[data-rules-summary]');

    if (!body) {
      return;
    }

    body.innerHTML = '';

    if (summary) {
      summary.textContent = `Mostrando ${formatNumber(filteredRules.length)} de ${formatNumber(rules.length)} reglas`;
    }

    if (filteredRules.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'table-empty';
      cell.textContent = 'No hay reglas que coincidan con la busqueda.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    filteredRules.forEach((rule) => {
      const active = rule.estado !== false;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(rule.nombre)}</td>
        <td><span class="rule-type-pill">Automatica</span></td>
        <td>${escapeHtml(getEquivalence(rule))}</td>
        <td>${escapeHtml(formatValue(rule.descripcion, 'Sin descripcion'))}</td>
        <td><span class="state-pill ${active ? 'done' : 'pending'}">${active ? 'Activa' : 'Pausada'}</span></td>
        <td>
          <div class="row-actions">
            <button class="row-action-button" type="button" data-edit-rule="${rule.id}" aria-label="Editar regla">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.6 9.9-9.9 3.4 3.4L7.4 20H4v-3.4ZM18.7 8.7l-3.4-3.4 1.2-1.2a1.8 1.8 0 0 1 2.5 0l.9.9a1.8 1.8 0 0 1 0 2.5l-1.2 1.2Z" /></svg>
            </button>
            <button class="row-action-button" type="button" data-toggle-rule="${rule.id}" aria-label="${active ? 'Pausar regla' : 'Activar regla'}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5v6h5v2h-7V7h2Z" /></svg>
            </button>
          </div>
        </td>
      `;
      body.appendChild(row);
    });
  }

  function updatePreview() {
    const form = document.querySelector('[data-rule-form]');
    const preview = document.querySelector('[data-rule-preview]');

    if (!form || !preview) {
      return;
    }

    const monto = Number(form.elements.monto_base.value || 0);
    const points = Number(form.elements.puntos_otorgados.value || 0);
    preview.textContent = `Equivalencia: ${formatMoney(monto)} = ${formatNumber(points)} pts`;
  }

  function resetRuleForm() {
    const form = document.querySelector('[data-rule-form]');
    const title = document.querySelector('[data-rule-form-title]');
    const mode = document.querySelector('[data-rule-form-mode]');

    if (form) {
      form.reset();
      form.elements.id.value = '';
      form.elements.estado.value = 'true';
    }

    if (title) title.textContent = 'Configurar nueva regla';
    if (mode) mode.textContent = 'Equivalencia para acumulacion';
    updatePreview();
  }

  function fillRuleForm(rule) {
    const form = document.querySelector('[data-rule-form]');
    const title = document.querySelector('[data-rule-form-title]');
    const mode = document.querySelector('[data-rule-form-mode]');

    if (!form || !rule) {
      return;
    }

    form.elements.id.value = rule.id;
    form.elements.nombre.value = rule.nombre || '';
    form.elements.descripcion.value = rule.descripcion || '';
    form.elements.monto_base.value = rule.monto_base || '';
    form.elements.puntos_otorgados.value = rule.puntos_otorgados || '';
    form.elements.estado.value = rule.estado === false ? 'false' : 'true';

    if (title) title.textContent = 'Editar regla';
    if (mode) mode.textContent = `Regla #${rule.id}`;
    updatePreview();
  }

  async function loadDashboardData() {
    try {
      const dashboard = await getJson('/api/v1/dashboard/admin');
      const distribution = dashboard.graficas && Array.isArray(dashboard.graficas.distribucion_transacciones)
        ? dashboard.graficas.distribucion_transacciones
        : [];
      originsCount = distribution.length;
      renderNotifications(dashboard.notificaciones);
      renderMetrics();
    } catch (error) {
      originsCount = 0;
      renderNotifications([]);
      renderMetrics();
    }
  }

  async function loadRules() {
    try {
      rules = await getJson('/api/v1/reglas-acumulacion');
      filteredRules = [...rules];
      renderMetrics();
      applyRulesSearch();
    } catch (error) {
      rules = [];
      filteredRules = [];
      renderMetrics();
      renderRulesTable();
      showMessage(error.message, 'error');
    }
  }

  async function saveRule(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const forcedState = submitter && submitter.dataset.saveRule === 'true'
      ? true
      : submitter && submitter.dataset.saveRule === 'false'
        ? false
        : undefined;
    const payload = getRulePayload(form, forcedState);
    const id = form.elements.id.value;

    try {
      if (id) {
        await putJson(`/api/v1/reglas-acumulacion/${id}`, payload);
        showMessage('Regla actualizada correctamente.');
      } else {
        await postJson('/api/v1/reglas-acumulacion', payload);
        showMessage('Regla creada correctamente.');
      }

      resetRuleForm();
      await loadRules();
      await loadDashboardData();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function toggleRule(ruleId) {
    const rule = rules.find((item) => String(item.id) === String(ruleId));

    if (!rule) {
      return;
    }

    try {
      await patchJson(`/api/v1/reglas-acumulacion/${rule.id}/estado`, {
        estado: rule.estado === false
      });
      showMessage(`Regla ${rule.estado === false ? 'activada' : 'pausada'} correctamente.`);
      await loadRules();
      await loadDashboardData();
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
    const searchInput = document.querySelector('[data-rules-search]');
    const form = document.querySelector('[data-rule-form]');
    const body = document.querySelector('[data-rules-body]');

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
        searchTimer = window.setTimeout(applyRulesSearch, SEARCH_DELAY);
      });
    }

    if (form) {
      form.addEventListener('submit', saveRule);
      form.addEventListener('input', updatePreview);
      form.addEventListener('change', updatePreview);
    }

    document.querySelectorAll('[data-new-rule], [data-reset-rule]').forEach((button) => {
      button.addEventListener('click', resetRuleForm);
    });

    if (body) {
      body.addEventListener('click', (event) => {
        const editButton = event.target.closest('[data-edit-rule]');
        const toggleButton = event.target.closest('[data-toggle-rule]');

        if (editButton) {
          const rule = rules.find((item) => String(item.id) === String(editButton.dataset.editRule));
          fillRuleForm(rule);
          return;
        }

        if (toggleButton) {
          toggleRule(toggleButton.dataset.toggleRule);
        }
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
  }

  setupEvents();
  resetRuleForm();
  loadRules();
  loadDashboardData();
  window.setInterval(loadDashboardData, DASHBOARD_REFRESH_INTERVAL);
})();
