import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => {
  return c.text('Hello! Server is running!');
});

const port = 3000;

console.log(`Server starting on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch
};