-- 创建 tasks 表
CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  plate TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  date TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  business_type TEXT NOT NULL,
  combos TEXT[] NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

-- 创建 quotes 表
CREATE TABLE quotes (
  id SERIAL PRIMARY KEY,
  task_id TEXT REFERENCES tasks(task_id),
  channel TEXT NOT NULL,
  combo TEXT NOT NULL,
  premium INTEGER NOT NULL,
  third_limit TEXT,
  raw_text TEXT,
  created_at TIMESTAMP NOT NULL
);

-- 创建 channels 表
CREATE TABLE channels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  city TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  business_type TEXT NOT NULL
);