(function () {
  const API_BASE_URL =
    window.REWARD_API_BASE_URL ||
    localStorage.getItem('rewardApiBaseUrl') ||
    'http://localhost:3000';

  const form = document.querySelector('[data-auth-form]');
  const message = document.querySelector('[data-form-message]');

  function setMessage(text, type) {
    if (!message) {
      return;
    }

    message.textContent = text;
    message.classList.toggle('is-success', type === 'success');
    message.classList.add('is-visible');
  }

  function clearMessage() {
    if (!message) {
      return;
    }

    message.textContent = '';
    message.classList.remove('is-visible', 'is-success');
  }

  function setLoading(submitButton, isLoading) {
    if (!submitButton) {
      return;
    }

    submitButton.disabled = isLoading;
    submitButton.dataset.originalText =
      submitButton.dataset.originalText || submitButton.querySelector('span').textContent;
    submitButton.querySelector('span').textContent = isLoading
      ? 'Procesando...'
      : submitButton.dataset.originalText;
  }

  function formToObject(targetForm) {
    return Object.fromEntries(new FormData(targetForm).entries());
  }

  async function postJson(path, payload) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let body = null;

    try {
      body = await response.json();
    } catch (error) {
      throw new Error('Respuesta invalida del servidor');
    }

    if (!response.ok || body.ok === false) {
      throw new Error(body.mensaje || 'No fue posible completar la solicitud');
    }

    return body;
  }

  function saveSession(data, persistent) {
    const storage = persistent ? localStorage : sessionStorage;
    const staleStorage = persistent ? sessionStorage : localStorage;
    staleStorage.removeItem('rewardSession');
    storage.setItem(
      'rewardSession',
      JSON.stringify({
        token: data.token,
        usuario: data.usuario,
        createdAt: new Date().toISOString()
      })
    );
  }

  async function handleLogin(event) {
    event.preventDefault();
    clearMessage();

    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const values = formToObject(event.currentTarget);
    const identifier = values.identifier.trim();
    const contrasena = values.contrasena;

    if (!identifier || !contrasena) {
      setMessage('Ingresa correo o documento y contrasena.', 'error');
      return;
    }

    const payload = identifier.includes('@')
      ? { correo: identifier, contrasena }
      : { numero_documento: identifier, contrasena };

    try {
      setLoading(submitButton, true);
      const body = await postJson('/api/v1/usuarios/login', payload);
      saveSession(body.data, values.recordar === 'on');
      setMessage(`Sesion iniciada correctamente. Hola, ${body.data.usuario.nombre}.`, 'success');

      if (String(body.data.usuario.rol || '').toLowerCase() === 'administrador') {
        window.setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 650);
      }
    } catch (error) {
      setMessage(error.message, 'error');
    } finally {
      setLoading(submitButton, false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    clearMessage();

    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const values = formToObject(event.currentTarget);

    if (event.currentTarget.querySelector('[name="terminos"]') && values.terminos !== 'on') {
      setMessage('Debes aceptar los terminos y condiciones para crear la cuenta.', 'error');
      return;
    }

    if (values.contrasena !== values.confirmar_contrasena) {
      setMessage('Las contrasenas no coinciden.', 'error');
      return;
    }

    const payload = {
      tipo_documento: values.tipo_documento,
      numero_documento: values.numero_documento.trim(),
      nombre: values.nombre.trim(),
      correo: values.correo.trim(),
      telefono: values.telefono.trim(),
      rol: values.rol || values.rol_visual || 'administrador',
      contrasena: values.contrasena
    };

    if (
      !payload.tipo_documento ||
      !payload.numero_documento ||
      !payload.nombre ||
      !payload.correo ||
      !payload.contrasena
    ) {
      setMessage('Completa los campos obligatorios.', 'error');
      return;
    }

    if (payload.contrasena.length < 6) {
      setMessage('La contrasena debe tener al menos 6 caracteres.', 'error');
      return;
    }

    try {
      setLoading(submitButton, true);
      const body = await postJson('/api/v1/usuarios/registro', payload);
      localStorage.setItem('rewardLastRegisteredEmail', body.data.correo || payload.correo);
      setMessage('Usuario registrado correctamente.', 'success');

      window.setTimeout(() => {
        window.location.href = `./index.html?registered=1&correo=${encodeURIComponent(
          body.data.correo || payload.correo
        )}`;
      }, 900);
    } catch (error) {
      setMessage(error.message, 'error');
    } finally {
      setLoading(submitButton, false);
    }
  }

  function hydrateLoginFromRegister() {
    const params = new URLSearchParams(window.location.search);
    const registered = params.get('registered');
    const correo = params.get('correo') || localStorage.getItem('rewardLastRegisteredEmail');
    const identifierInput = document.getElementById('identifier');

    if (registered === '1' && correo && identifierInput) {
      identifierInput.value = correo;
      setMessage('Usuario registrado correctamente. Ya puedes iniciar sesion.', 'success');
    }
  }

  function setupPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = button.parentElement.querySelector('input');

        if (!input) {
          return;
        }

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        button.setAttribute(
          'aria-label',
          isPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'
        );
        button.setAttribute('title', isPassword ? 'Ocultar contrasena' : 'Mostrar contrasena');
      });
    });
  }

  function setupRoleOptions() {
    const roleSelect = document.querySelector('[name="rol"]');
    const roleCards = Array.from(document.querySelectorAll('[name="rol_visual"]'));

    if (!roleSelect || roleCards.length === 0) {
      return;
    }

    function syncSelectedRole(value) {
      roleSelect.value = value;
      roleCards.forEach((radio) => {
        const card = radio.closest('.role-option');
        const isSelected = radio.value === value;
        radio.checked = isSelected;

        if (card) {
          card.classList.toggle('is-selected', isSelected);
        }
      });
    }

    roleCards.forEach((radio) => {
      radio.addEventListener('change', () => syncSelectedRole(radio.value));
    });

    roleSelect.addEventListener('change', () => syncSelectedRole(roleSelect.value));
    syncSelectedRole(roleSelect.value || roleCards[0].value);
  }

  setupPasswordToggles();
  setupRoleOptions();

  if (form && form.dataset.authForm === 'login') {
    hydrateLoginFromRegister();
    form.addEventListener('submit', handleLogin);
  }

  if (form && form.dataset.authForm === 'register') {
    form.addEventListener('submit', handleRegister);
  }
})();
