import { Hono } from 'hono';
import webhook from './routes/webhook';

const app = new Hono();

app.get('/', (c) => c.text('Car Insurance System Running'));
app.route('/api', webhook);

const port = process.env.PORT || 3000;
export default {
  port,
  fetch: app.fetch
};