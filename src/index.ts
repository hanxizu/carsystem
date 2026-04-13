import { Hono } from 'hono';
import webhook from './routes/webhook.js';  // 添加 .js 扩展名


const app = new Hono();

app.get('/', (c) => c.text('Car Insurance System Running'));
app.route('/api', webhook);

const port = process.env.PORT || 3000;
export default {
  port,
  fetch: app.fetch
};