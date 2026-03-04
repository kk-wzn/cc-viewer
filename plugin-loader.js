import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOG_DIR } from './findcc.js';

export const PLUGINS_DIR = join(LOG_DIR, 'plugins');
const PREFS_FILE = join(LOG_DIR, 'preferences.json');

// Hook 类型定义
const HOOK_TYPES = {
  localUrl: 'waterfall',
  serverStarted: 'parallel',
  serverStopping: 'parallel',
};

let _plugins = [];

/**
 * 扫描 LOG_DIR/plugins/ 目录，动态 import 每个 .js/.mjs 文件
 */
export async function loadPlugins() {
  _plugins = [];

  if (!existsSync(PLUGINS_DIR)) return;

  // 读取 disabledPlugins 列表
  let disabledPlugins = [];
  try {
    if (existsSync(PREFS_FILE)) {
      const prefs = JSON.parse(readFileSync(PREFS_FILE, 'utf-8'));
      if (Array.isArray(prefs.disabledPlugins)) {
        disabledPlugins = prefs.disabledPlugins;
      }
    }
  } catch {}

  let files;
  try {
    files = readdirSync(PLUGINS_DIR)
      .filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
      .sort();
  } catch {
    return;
  }

  for (const file of files) {
    const filePath = join(PLUGINS_DIR, file);
    try {
      const mod = await import(`file://${filePath}`);
      const plugin = mod.default || mod;
      const name = plugin.name || file;

      if (disabledPlugins.includes(name)) {
        console.error(`[CC Viewer] Plugin "${name}" is disabled, skipping.`);
        continue;
      }

      if (plugin.hooks && typeof plugin.hooks === 'object') {
        _plugins.push({ name, hooks: plugin.hooks, file });
        console.error(`[CC Viewer] Plugin loaded: ${name} (${file})`);
      }
    } catch (err) {
      console.error(`[CC Viewer] Failed to load plugin "${file}":`, err.message);
    }
  }
}

/**
 * waterfall hook：串行管道执行，前一个的返回值传给下一个
 */
export async function runWaterfallHook(name, initialValue) {
  let value = initialValue;
  for (const plugin of _plugins) {
    const hookFn = plugin.hooks[name];
    if (typeof hookFn !== 'function') continue;
    try {
      const result = await hookFn(value);
      if (result != null && typeof result === 'object') {
        value = { ...value, ...result };
      }
    } catch (err) {
      console.error(`[CC Viewer] Plugin "${plugin.name}" hook "${name}" error:`, err.message);
    }
  }
  return value;
}

/**
 * parallel hook：并行通知执行，返回值忽略
 */
export async function runParallelHook(name, context = {}) {
  const tasks = [];
  for (const plugin of _plugins) {
    const hookFn = plugin.hooks[name];
    if (typeof hookFn !== 'function') continue;
    tasks.push(
      Promise.resolve()
        .then(() => hookFn(context))
        .catch(err => {
          console.error(`[CC Viewer] Plugin "${plugin.name}" hook "${name}" error:`, err.message);
        })
    );
  }
  await Promise.all(tasks);
}

/**
 * 返回所有插件文件信息（含已禁用的），供 /api/plugins 使用
 */
export function getPluginsInfo() {
  if (!existsSync(PLUGINS_DIR)) return [];

  let disabledPlugins = [];
  try {
    if (existsSync(PREFS_FILE)) {
      const prefs = JSON.parse(readFileSync(PREFS_FILE, 'utf-8'));
      if (Array.isArray(prefs.disabledPlugins)) {
        disabledPlugins = prefs.disabledPlugins;
      }
    }
  } catch {}

  let files;
  try {
    files = readdirSync(PLUGINS_DIR)
      .filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
      .sort();
  } catch {
    return [];
  }

  return files.map(file => {
    const loaded = _plugins.find(p => p.file === file);
    const name = loaded ? loaded.name : file;
    const hooks = loaded ? Object.keys(loaded.hooks) : [];
    const enabled = !disabledPlugins.includes(name);
    return { name, file, hooks, enabled };
  });
}
