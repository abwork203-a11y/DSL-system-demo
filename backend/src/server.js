require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { createApp } = require('./app');

// A weak or placeholder JWT secret makes every login token forgeable —
// refuse to start rather than run insecurely because someone forgot to edit
// .env after copying it from .env.example.
const PLACEHOLDER_SECRET = 'change_this_to_a_long_random_string';
function assertValidJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === PLACEHOLDER_SECRET || secret.length < 32) {
    // eslint-disable-next-line no-console
    console.error(
      '\n✗ Refusing to start: JWT_SECRET is missing, still the placeholder value, or too short (needs 32+ characters).\n' +
      '  Set a long random value for JWT_SECRET in backend/.env before running this server.\n'
    );
    process.exit(1);
  }
}
assertValidJwtSecret();

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*', credentials: true },
});

io.on('connection', (socket) => {
  // eslint-disable-next-line no-console
  console.log(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => {
    // eslint-disable-next-line no-console
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Make io reachable from controllers via req.app.get('io')
app.set('io', io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`DSL backend listening on http://localhost:${PORT}`);
});
