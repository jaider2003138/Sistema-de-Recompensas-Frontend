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
      currency: 'MXN',
      minimumFractionDigits: 2
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

  function formatMonth(period) {
    const [year, month] = String(period).split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const label = new Intl.DateTimeFormat('es-CO', { month: 'short' })
      .format(date)
      .replace('.', '');

    return label.charAt(0).toUpperCase() + label.slice(1);
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

    chart.innerHTML = '';
    const values = Array.isArray(items) ? items : [];
    const max = Math.max(...values.map((item) => numberValue(item.puntos)), 0);

    if (max === 0) {
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
      const height = Math.max((value / max) * 100, value > 0 ? 8 : 0);

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
  const logoutButton = document.querySelector('[data-logout]');

  if (nameNode) {
    nameNode.textContent = name;
  }

  if (initialsNode) {
    initialsNode.textContent = getInitials(name);
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      clearSession();
      window.location.href = '/index.html';
    });
  }

  loadDashboard();
})();
