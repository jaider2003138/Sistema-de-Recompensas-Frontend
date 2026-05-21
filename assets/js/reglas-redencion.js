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
  let users = [];
  let redemptions = [];
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

  const getJson = (path) => requestJson(path);
  const postJson = (path, payload) => requestJson(path, { method: 'POST', body: JSON.stringify(payload) });
  const putJson = (path, payload) => requestJson(path, { method: 'PUT', body: JSON.stringify(payload) });
  const patchJson = (path, payload) => requestJson(path, { method: 'PATCH', body: JSON.stringify(payload) });

  function showMessage(message, type = 'success') {
    const node = document.querySelector('[data-redemption-message]');

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

  function getRuleCategory(rule) {
    const text = `${rule.nombre || ''} ${rule.descripcion || ''}`.toLowerCase();

    if (text.includes('cupon')) return 'Cupones';
    if (text.includes('producto')) return 'Productos';
    if (text.includes('envio')) return 'Envios';
    if (text.includes('tarjeta')) return 'Tarjetas regalo';
    if (text.includes('vip') || text.includes('experiencia')) return 'Experiencias';
    return 'Descuentos';
  }

  function getRulePayload(form, forcedState) {
    const data = new FormData(form);
    return {
      nombre: String(data.get('nombre') || '').trim(),
      descripcion: String(data.get('descripcion') || '').trim() || undefined,
      puntos_requeridos: Number(data.get('puntos_requeridos')),
      valor_equivalente: Number(data.get('valor_equivalente')),
      estado: typeof forcedState === 'boolean'
        ? forcedState
        : String(data.get('estado')) === 'true'
    };
  }

  function renderMetrics() {
    const total = rules.length;
    const active = rules.filter((rule) => rule.estado !== false).length;
    const paused = total - active;
    const delivered = redemptions.reduce((sum, item) => sum + numberValue(item.valor_redimido), 0);
    const activeNode = document.querySelector('[data-redemption-metric="active"]');
    const activePercent = document.querySelector('[data-redemption-metric="active-percent"]');
    const approvedNode = document.querySelector('[data-redemption-metric="approved"]');
    const pausedNode = document.querySelector('[data-redemption-metric="paused"]');
    const pausedPercent = document.querySelector('[data-redemption-metric="paused-percent"]');
    const deliveredNode = document.querySelector('[data-redemption-metric="delivered"]');

    if (activeNode) activeNode.textContent = formatNumber(active);
    if (activePercent) activePercent.textContent = `${total ? ((active / total) * 100).toFixed(1) : '0.0'}% del total`;
    if (approvedNode) approvedNode.textContent = formatNumber(redemptions.length);
    if (pausedNode) pausedNode.textContent = formatNumber(paused);
    if (pausedPercent) pausedPercent.textContent = `${total ? ((paused / total) * 100).toFixed(1) : '0.0'}% del total`;
    if (deliveredNode) deliveredNode.textContent = formatMoney(delivered);
  }

  function applySearch() {
    const search = document.querySelector('[data-redemption-search]');
    const term = search ? search.value.trim().toLowerCase() : '';

    filteredRules = term
      ? rules.filter((rule) => (
        String(rule.id).includes(term) ||
        String(rule.nombre || '').toLowerCase().includes(term) ||
        String(rule.descripcion || '').toLowerCase().includes(term) ||
        getRuleCategory(rule).toLowerCase().includes(term)
      ))
      : [...rules];

    renderRulesTable();
    renderValidationSnapshot();
  }

  function renderRulesTable() {
    const body = document.querySelector('[data-redemption-rules-body]');
    const summary = document.querySelector('[data-redemption-summary]');

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
        <td>
          <div class="benefit-cell">
            <span class="benefit-icon">${escapeHtml(getInitials(rule.nombre).slice(0, 1))}</span>
            <div>
              <strong>${escapeHtml(rule.nombre)}</strong>
              <small>${escapeHtml(formatValue(rule.descripcion, 'Beneficio de redencion'))}</small>
            </div>
          </div>
        </td>
        <td><span class="category-pill">${escapeHtml(getRuleCategory(rule))}</span></td>
        <td>${formatNumber(rule.puntos_requeridos)} pts</td>
        <td>${escapeHtml(formatMoney(rule.valor_equivalente))}</td>
        <td><span class="state-pill ${active ? 'done' : 'pending'}">${active ? 'Activa' : 'Pausada'}</span></td>
        <td>
          <div class="row-actions">
            <button class="row-action-button" type="button" data-edit-redemption-rule="${rule.id}" aria-label="Editar regla">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.6 9.9-9.9 3.4 3.4L7.4 20H4v-3.4ZM18.7 8.7l-3.4-3.4 1.2-1.2a1.8 1.8 0 0 1 2.5 0l.9.9a1.8 1.8 0 0 1 0 2.5l-1.2 1.2Z" /></svg>
            </button>
            <button class="row-action-button" type="button" data-toggle-redemption-rule="${rule.id}" aria-label="${active ? 'Pausar regla' : 'Activar regla'}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5v6h5v2h-7V7h2Z" /></svg>
            </button>
          </div>
        </td>
      `;
      body.appendChild(row);
    });
  }

  function renderSelectOptions() {
    const userSelect = document.querySelector('[data-redemption-user]');
    const benefitSelect = document.querySelector('[data-redemption-benefit]');
    const previousUser = userSelect ? userSelect.value : '';
    const previousBenefit = benefitSelect ? benefitSelect.value : '';

    if (userSelect) {
      userSelect.innerHTML = '<option value="">Selecciona un usuario</option>';
      users
        .filter((user) => user.estado !== false)
        .forEach((user) => {
          const option = document.createElement('option');
          option.value = user.id;
          option.textContent = `${user.nombre} - ${user.numero_documento || user.id}`;
          userSelect.appendChild(option);
        });
      userSelect.value = previousUser;
    }

    if (benefitSelect) {
      benefitSelect.innerHTML = '<option value="">Selecciona un beneficio</option>';
      rules
        .filter((rule) => rule.estado !== false)
        .forEach((rule) => {
          const option = document.createElement('option');
          option.value = rule.id;
          option.textContent = `${rule.nombre} - ${formatNumber(rule.puntos_requeridos)} pts`;
          benefitSelect.appendChild(option);
        });
      benefitSelect.value = previousBenefit;
    }
  }

  function getSelectedUser() {
    const select = document.querySelector('[data-redemption-user]');
    return select ? users.find((user) => String(user.id) === String(select.value)) : null;
  }

  function getSelectedRule() {
    const select = document.querySelector('[data-redemption-benefit]');
    return select ? rules.find((rule) => String(rule.id) === String(select.value)) : null;
  }

  function getValidation() {
    const user = getSelectedUser();
    const rule = getSelectedRule();

    if (!user || !rule) {
      return { user, rule, valid: false, duplicate: false };
    }

    const duplicate = redemptions.some((redemption) => (
      String(redemption.usuario_id) === String(user.id) &&
      String(redemption.regla_redencion_id) === String(rule.id)
    ));
    const enoughBalance = numberValue(user.saldo_actual) >= numberValue(rule.puntos_requeridos);

    return { user, rule, valid: enoughBalance && !duplicate && rule.estado !== false, duplicate, enoughBalance };
  }

  function renderValidationSnapshot() {
    const snapshot = document.querySelector('[data-redemption-snapshot]');
    const validation = getValidation();

    if (!snapshot) {
      return;
    }

    if (!validation.user || !validation.rule) {
      snapshot.innerHTML = '<p class="empty-state">Selecciona un usuario y un beneficio.</p>';
      return;
    }

    const stateClass = validation.valid ? 'success' : 'error';
    const stateTitle = validation.valid ? 'Validacion exitosa' : 'Validacion pendiente';
    const stateMessage = validation.valid
      ? 'El usuario cuenta con saldo suficiente y no tiene duplicados.'
      : validation.duplicate
        ? 'Ya existe una redencion previa para este beneficio.'
        : 'El usuario no tiene puntos suficientes para este beneficio.';

    snapshot.innerHTML = `
      <div class="validation-user">
        <span>${escapeHtml(getInitials(validation.user.nombre))}</span>
        <div>
          <strong>${escapeHtml(validation.user.nombre)}</strong>
          <small>ID: ${escapeHtml(validation.user.id)}</small>
        </div>
      </div>
      <div class="validation-balance">
        <span>Saldo actual</span>
        <strong>${formatNumber(validation.user.saldo_actual)} pts</strong>
        <small>Equivalente a ${escapeHtml(formatMoney(validation.user.saldo_actual))}</small>
      </div>
      <div class="validation-benefit">
        <strong>${escapeHtml(validation.rule.nombre)}</strong>
        <span>${formatNumber(validation.rule.puntos_requeridos)} pts - ${escapeHtml(formatMoney(validation.rule.valor_equivalente))}</span>
      </div>
      <div class="validation-result ${stateClass}">
        <strong>${stateTitle}</strong>
        <span>${stateMessage}</span>
      </div>
    `;
  }

  function updateRulePreview() {
    const form = document.querySelector('[data-redemption-rule-form]');
    const preview = document.querySelector('[data-redemption-rule-preview]');

    if (!form || !preview) {
      return;
    }

    const points = Number(form.elements.puntos_requeridos.value || 0);
    const value = Number(form.elements.valor_equivalente.value || 0);
    preview.textContent = `${formatNumber(points)} pts = ${formatMoney(value)}`;
  }

  function resetRuleForm() {
    const form = document.querySelector('[data-redemption-rule-form]');
    const title = document.querySelector('[data-redemption-form-title]');
    const mode = document.querySelector('[data-redemption-form-mode]');

    if (form) {
      form.reset();
      form.elements.id.value = '';
      form.elements.estado.value = 'true';
    }

    if (title) title.textContent = 'Configurar beneficio';
    if (mode) mode.textContent = 'Regla de redencion';
    updateRulePreview();
  }

  function fillRuleForm(rule) {
    const form = document.querySelector('[data-redemption-rule-form]');
    const title = document.querySelector('[data-redemption-form-title]');
    const mode = document.querySelector('[data-redemption-form-mode]');

    if (!form || !rule) {
      return;
    }

    form.elements.id.value = rule.id;
    form.elements.nombre.value = rule.nombre || '';
    form.elements.descripcion.value = rule.descripcion || '';
    form.elements.puntos_requeridos.value = rule.puntos_requeridos || '';
    form.elements.valor_equivalente.value = rule.valor_equivalente || '';
    form.elements.estado.value = rule.estado === false ? 'false' : 'true';

    if (title) title.textContent = 'Editar beneficio';
    if (mode) mode.textContent = `Regla #${rule.id}`;
    updateRulePreview();
  }

  async function loadDashboardData() {
    try {
      const dashboard = await getJson('/api/v1/dashboard/admin');
      renderNotifications(dashboard.notificaciones);
    } catch (error) {
      renderNotifications([]);
    }
  }

  async function loadData() {
    try {
      const [rulesData, usersData, redemptionsData] = await Promise.all([
        getJson('/api/v1/reglas-redencion'),
        getJson('/api/v1/usuarios'),
        getJson('/api/v1/redenciones')
      ]);
      rules = Array.isArray(rulesData) ? rulesData : [];
      users = Array.isArray(usersData) ? usersData : [];
      redemptions = Array.isArray(redemptionsData) ? redemptionsData : [];
      filteredRules = [...rules];
      renderMetrics();
      renderSelectOptions();
      applySearch();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function saveRule(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = event.submitter;
    const forcedState = submitter && submitter.dataset.saveRedemptionRule === 'true'
      ? true
      : submitter && submitter.dataset.saveRedemptionRule === 'false'
        ? false
        : undefined;
    const payload = getRulePayload(form, forcedState);
    const id = form.elements.id.value;

    try {
      if (id) {
        await putJson(`/api/v1/reglas-redencion/${id}`, payload);
        showMessage('Regla de redencion actualizada correctamente.');
      } else {
        await postJson('/api/v1/reglas-redencion', payload);
        showMessage('Regla de redencion creada correctamente.');
      }

      resetRuleForm();
      await loadData();
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
      await patchJson(`/api/v1/reglas-redencion/${rule.id}/estado`, {
        estado: rule.estado === false
      });
      showMessage(`Regla ${rule.estado === false ? 'activada' : 'pausada'} correctamente.`);
      await loadData();
      await loadDashboardData();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function handleValidation(event) {
    event.preventDefault();
    const action = event.submitter && event.submitter.dataset.redemptionAction;
    const validation = getValidation();
    renderValidationSnapshot();

    if (action === 'validate') {
      showMessage(validation.valid ? 'Validacion exitosa.' : 'La redencion no cumple las condiciones.', validation.valid ? 'success' : 'error');
      return;
    }

    if (!validation.valid) {
      showMessage('No se puede redimir: revisa saldo, estado o duplicados.', 'error');
      return;
    }

    try {
      await postJson('/api/v1/redenciones', {
        usuario_id: validation.user.id,
        regla_redencion_id: validation.rule.id,
        observacion: `Redencion desde panel admin: ${validation.rule.nombre}`
      });
      showMessage('Redencion registrada correctamente.');
      await loadData();
      await loadDashboardData();
      renderValidationSnapshot();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  function clearValidation() {
    const form = document.querySelector('[data-redemption-validation-form]');

    if (form) {
      form.reset();
    }

    renderValidationSnapshot();
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
    const searchInput = document.querySelector('[data-redemption-search]');
    const form = document.querySelector('[data-redemption-rule-form]');
    const validationForm = document.querySelector('[data-redemption-validation-form]');
    const body = document.querySelector('[data-redemption-rules-body]');

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
        if (profileDetailsPanel) profileDetailsPanel.hidden = true;
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

    if (form) {
      form.addEventListener('submit', saveRule);
      form.addEventListener('input', updateRulePreview);
      form.addEventListener('change', updateRulePreview);
    }

    document.querySelectorAll('[data-new-redemption-rule], [data-reset-redemption-rule]').forEach((button) => {
      button.addEventListener('click', resetRuleForm);
    });

    if (body) {
      body.addEventListener('click', (event) => {
        const editButton = event.target.closest('[data-edit-redemption-rule]');
        const toggleButton = event.target.closest('[data-toggle-redemption-rule]');

        if (editButton) {
          const rule = rules.find((item) => String(item.id) === String(editButton.dataset.editRedemptionRule));
          fillRuleForm(rule);
          return;
        }

        if (toggleButton) {
          toggleRule(toggleButton.dataset.toggleRedemptionRule);
        }
      });
    }

    if (validationForm) {
      validationForm.addEventListener('submit', handleValidation);
      validationForm.addEventListener('change', renderValidationSnapshot);
    }

    const clearValidationButton = document.querySelector('[data-clear-redemption-validation]');
    if (clearValidationButton) {
      clearValidationButton.addEventListener('click', clearValidation);
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
  loadData();
  loadDashboardData();
  window.setInterval(loadDashboardData, DASHBOARD_REFRESH_INTERVAL);
})();
