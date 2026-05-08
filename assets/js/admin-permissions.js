(function () {
  const API_BASE_URL =
    window.REWARD_API_BASE_URL ||
    localStorage.getItem('rewardApiBaseUrl') ||
    'http://localhost:3000';

  const SESSION_KEY = 'rewardSession';
  const PERMISSIONS_CACHE_KEY = 'rewardAdminPermissions';
  const NO_ACCESS = 'ninguno';
  const DEFAULT_REDIRECT = '/dashboard.html';
  const MODULE_BY_PAGE = {
    'usuarios.html': 'usuarios',
    'reglas-acumulacion.html': 'acumulacion',
    'reglas-redencion.html': 'redencion',
    'historial.html': 'historial',
    'reportes.html': 'reportes',
    'roles.html': 'configuracion'
  };
  const NAV_ORDER = [
    ['dashboard.html', null],
    ['usuarios.html', 'usuarios'],
    ['reglas-acumulacion.html', 'acumulacion'],
    ['reglas-redencion.html', 'redencion'],
    ['historial.html', 'historial'],
    ['reportes.html', 'reportes'],
    ['roles.html', 'configuracion']
  ];

  let currentPermissions = null;

  function getSessionEntry() {
    const stores = [localStorage, sessionStorage];

    for (const storage of stores) {
      const rawSession = storage.getItem(SESSION_KEY);

      if (!rawSession) {
        continue;
      }

      try {
        return {
          storage,
          session: JSON.parse(rawSession)
        };
      } catch (error) {
        return null;
      }
    }

    return null;
  }

  function getCurrentUser() {
    const entry = getSessionEntry();
    return entry && entry.session && entry.session.usuario ? entry.session.usuario : null;
  }

  function savePermissionsInSession(permisos) {
    const entry = getSessionEntry();

    if (!entry || !entry.session || !entry.session.usuario) {
      return;
    }

    entry.session.usuario.permisos = permisos;
    entry.storage.setItem(SESSION_KEY, JSON.stringify(entry.session));
  }

  function savePermissionsCache(roleCode, permisos) {
    if (!roleCode || !permisos) {
      return;
    }

    localStorage.setItem(
      PERMISSIONS_CACHE_KEY,
      JSON.stringify({
        roleCode,
        permisos,
        updatedAt: new Date().toISOString()
      })
    );
  }

  function getCachedPermissions(roleCode) {
    const usuario = getCurrentUser();

    if (usuario && usuario.permisos) {
      return usuario.permisos;
    }

    try {
      const cached = JSON.parse(localStorage.getItem(PERMISSIONS_CACHE_KEY) || 'null');
      return cached && cached.roleCode === roleCode ? cached.permisos : null;
    } catch (error) {
      return null;
    }
  }

  function normalizeRoleCode(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getPageName(pathname) {
    const parts = String(pathname || '').split('/').filter(Boolean);
    return parts[parts.length - 1] || 'dashboard.html';
  }

  function getPageNameFromHref(href) {
    try {
      return getPageName(new URL(href, window.location.href).pathname);
    } catch (error) {
      return '';
    }
  }

  function canAccess(permisos, moduleKey) {
    if (!moduleKey) {
      return true;
    }

    return permisos && permisos[moduleKey] !== NO_ACCESS;
  }

  function getFallbackUrl(permisos) {
    const target = NAV_ORDER.find(([, moduleKey]) => canAccess(permisos, moduleKey));
    return target ? `/${target[0]}` : DEFAULT_REDIRECT;
  }

  function applyNavPermissions(permisos) {
    document.querySelectorAll('.side-nav .nav-item[href]').forEach((link) => {
      const pageName = getPageNameFromHref(link.getAttribute('href'));
      const moduleKey = MODULE_BY_PAGE[pageName];
      const hidden = !canAccess(permisos, moduleKey);

      link.hidden = hidden;
      link.style.display = hidden ? 'none' : '';
    });
  }

  function enforceCurrentPageAccess(permisos) {
    const moduleKey = MODULE_BY_PAGE[getPageName(window.location.pathname)];

    if (!moduleKey || canAccess(permisos, moduleKey)) {
      return;
    }

    window.location.replace(getFallbackUrl(permisos));
  }

  function applyPermissions(permisos, options = {}) {
    if (!permisos) {
      return null;
    }

    currentPermissions = permisos;
    applyNavPermissions(permisos);

    if (options.save !== false) {
      const usuario = getCurrentUser();
      const roleCode = normalizeRoleCode(usuario && usuario.rol);
      savePermissionsInSession(permisos);
      savePermissionsCache(roleCode, permisos);
    }

    window.dispatchEvent(new CustomEvent('adminpermissionschange', {
      detail: { permisos }
    }));

    if (options.enforcePageAccess !== false) {
      enforceCurrentPageAccess(permisos);
    }

    return permisos;
  }

  function findCurrentRole(roles) {
    const usuario = getCurrentUser();
    const roleCode = normalizeRoleCode(usuario && usuario.rol);

    return (Array.isArray(roles) ? roles : []).find((role) => (
      normalizeRoleCode(role.codigo || role.nombre) === roleCode
    ));
  }

  function applyRolesData(data, options = {}) {
    const roles = Array.isArray(data) ? data : data && data.roles;
    const role = findCurrentRole(roles);

    if (!role || !role.permisos) {
      return null;
    }

    return applyPermissions(role.permisos, options);
  }

  async function requestJson(path) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json'
      }
    });
    const body = await response.json();

    if (!response.ok || body.ok === false) {
      throw new Error(body.mensaje || 'No fue posible consultar permisos');
    }

    return body.data;
  }

  async function refresh(options = {}) {
    const data = await requestJson('/api/v1/roles');
    return applyRolesData(data, options);
  }

  window.AdminPermissions = {
    applyPermissions,
    applyRolesData,
    canAccess: (moduleKey) => canAccess(currentPermissions, moduleKey),
    getPermissions: () => currentPermissions,
    refresh
  };

  const usuario = getCurrentUser();
  const roleCode = normalizeRoleCode(usuario && usuario.rol);
  const cachedPermissions = getCachedPermissions(roleCode);

  if (cachedPermissions) {
    applyPermissions(cachedPermissions, {
      enforcePageAccess: false,
      save: false
    });
  }

  refresh().catch(() => {});
})();
