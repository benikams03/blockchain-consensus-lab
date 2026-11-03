declare const __ATELIER_BUILD__: string;
export const workerUrl = (file: 'worker.js' | 'advanced-worker.js') => `/${file}?v=${typeof __ATELIER_BUILD__ === 'string' ? __ATELIER_BUILD__ : 'dev'}`;
