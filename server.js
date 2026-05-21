const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.FRONTEND_PORT || process.env.PORT || 5173);
const publicDir = __dirname;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function resolveFilePath(requestUrl) {
  const url = new URL(requestUrl, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const htmlRoutes = {
    '/': '/html/index.html',
    '/index.html': '/html/index.html',
    '/registro.html': '/html/registro.html',
    '/dashboard.html': '/html/dashboard.html',
    '/usuarios.html': '/html/usuarios.html',
    '/reglas-acumulacion.html': '/html/reglas-acumulacion.html',
    '/reglas-redencion.html': '/html/reglas-redencion.html',
    '/historial.html': '/html/historial.html',
    '/reportes.html': '/html/reportes.html',
    '/roles.html': '/html/roles.html'
  };
  const requestedPath = htmlRoutes[pathname] || pathname;
  const filePath = path.normalize(path.join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir)) {
    return null;
  }

  return filePath;
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Recurso no encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream'
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const filePath = resolveFilePath(request.url);

  if (!filePath) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Acceso denegado');
    return;
  }

  sendFile(response, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend ejecutandose en http://localhost:${PORT}`);
});
