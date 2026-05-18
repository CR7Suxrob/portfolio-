require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const RedisStore = require('connect-redis').default;
const { Queue, Worker } = require('bullmq');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const httpServer = createServer(app);

// ============ REDIS CONNECTION ============
const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null
});

const redisForSub = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379
});

redis.on('connect', () => console.log('✅ Redis ulandi!'));
redis.on('error', (err) => console.error('❌ Redis xato:', err.message));

// ============ MIDDLEWARE ============
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..')));

// ============ 1. SESSION STORAGE (Redis) ============
const redisStore = new RedisStore({ client: redis, prefix: 'workhub:sess:' });

app.use(session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || 'workhub-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ============ 2. SOCKET.IO + REDIS PUB/SUB ============
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Redis Pub/Sub for real-time notifications
redisForSub.subscribe('workhub:notifications', (err) => {
    if (err) console.error('Pub/Sub xato:', err);
    else console.log('📡 Redis Pub/Sub ulandi');
});

redisForSub.on('message', (channel, message) => {
    if (channel === 'workhub:notifications') {
        const data = JSON.parse(message);
        io.emit('notification', data);
        console.log('📢 Notification yuborildi:', data.title);
    }
});

io.on('connection', (socket) => {
    console.log(`🔌 Client ulandi: ${socket.id}`);

    socket.on('join', async (userId) => {
        socket.join(`user:${userId}`);
        // Send unread count
        const unread = await redis.get(`workhub:unread:${userId}`) || '0';
        socket.emit('unread_count', parseInt(unread));
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Client uzildi: ${socket.id}`);
    });
});

// ============ 3. BACKGROUND TASKS (BullMQ + Redis) ============
const BOT_TOKEN = process.env.BOT_TOKEN || '8469015792:AAHer6z93IlMyN_hF-1LPJdmMTcD3Zw77p4';
const CHAT_ID = process.env.CHAT_ID || '1198878759';

const telegramQueue = new Queue('telegram-messages', {
    connection: { host: process.env.REDIS_HOST || '127.0.0.1', port: process.env.REDIS_PORT || 6379 }
});

const reportQueue = new Queue('report-generation', {
    connection: { host: process.env.REDIS_HOST || '127.0.0.1', port: process.env.REDIS_PORT || 6379 }
});

// Telegram Worker - sends messages in background
const telegramWorker = new Worker('telegram-messages', async (job) => {
    const { text } = job.data;
    try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
        });
        const result = await res.json();
        console.log('✅ Telegram xabar yuborildi:', result.ok);
        return result;
    } catch (err) {
        console.error('❌ Telegram xato:', err.message);
        throw err;
    }
}, { connection: { host: process.env.REDIS_HOST || '127.0.0.1', port: process.env.REDIS_PORT || 6379 } });

// Report Worker - generates reports in background
const reportWorker = new Worker('report-generation', async (job) => {
    const { type, dateRange } = job.data;
    console.log(`📊 Hisobot generatsiya qilinmoqda: ${type}...`);

    // Simulate heavy computation
    await new Promise(resolve => setTimeout(resolve, 3000));

    const orders = JSON.parse(await redis.get('workhub:orders') || '[]');
    const report = {
        type,
        dateRange,
        totalOrders: orders.length,
        generatedAt: new Date().toISOString()
    };

    await redis.set(`workhub:report:${type}`, JSON.stringify(report), 'EX', 3600);

    // Notify via pub/sub
    redis.publish('workhub:notifications', JSON.stringify({
        type: 'system', icon: '📊',
        title: 'Hisobot tayyor!',
        text: `${type} hisoboti muvaffaqiyatli yaratildi.`,
        time: 'Hozir'
    }));

    return report;
}, { connection: { host: process.env.REDIS_HOST || '127.0.0.1', port: process.env.REDIS_PORT || 6379 } });

telegramWorker.on('completed', (job) => console.log(`📨 Job #${job.id} completed`));
telegramWorker.on('failed', (job, err) => console.error(`📨 Job #${job.id} failed:`, err.message));

// ============ 4. CACHE HELPERS ============
async function getCached(key, fetchFn, ttl = 300) {
    const cached = await redis.get(key);
    if (cached) {
        console.log(`⚡ Cache HIT: ${key}`);
        return JSON.parse(cached);
    }
    console.log(`🔍 Cache MISS: ${key}`);
    const data = await fetchFn();
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
    return data;
}

async function invalidateCache(pattern) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
}

// ============ API ROUTES ============

// --- Health Check ---
app.get('/api/health', async (req, res) => {
    const redisOk = redis.status === 'ready';
    res.json({
        status: 'ok',
        redis: redisOk ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// --- Redis Stats ---
app.get('/api/redis/stats', async (req, res) => {
    try {
        const info = await redis.info('memory');
        const dbSize = await redis.dbsize();
        const memLine = info.split('\n').find(l => l.startsWith('used_memory_human'));
        const mem = memLine ? memLine.split(':')[1].trim() : 'N/A';
        res.json({ memory: mem, keys: dbSize, status: 'connected' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
});

// --- Session/Auth ---
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    // Simple auth (production da hash+DB ishlatiladi)
    if (username === 'admin' && password === 'workhub2026') {
        req.session.user = { name: username, role: 'Administrator', loggedIn: true };
        await redis.set(`workhub:user:${username}:lastLogin`, new Date().toISOString());
        await redis.incr('workhub:stats:totalLogins');
        res.json({ success: true, user: req.session.user });
    } else {
        res.status(401).json({ success: false, message: 'Login yoki parol noto\'g\'ri' });
    }
});

app.get('/api/auth/session', (req, res) => {
    res.json({ loggedIn: !!req.session?.user, user: req.session?.user || null });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// --- Orders (with Redis Cache) ---
app.get('/api/orders', async (req, res) => {
    const orders = await getCached('workhub:orders', async () => [], 600);
    res.json(orders);
});

app.post('/api/orders', async (req, res) => {
    const { name, phone, service, message } = req.body;
    const order = {
        id: Date.now(),
        name, phone, service, message,
        status: 'pending',
        date: new Date().toISOString()
    };

    // Save to Redis
    const orders = JSON.parse(await redis.get('workhub:orders') || '[]');
    orders.push(order);
    await redis.set('workhub:orders', JSON.stringify(orders));
    await invalidateCache('workhub:orders');

    // Update stats
    await redis.incr('workhub:stats:totalOrders');
    await redis.incr(`workhub:stats:service:${service}`);

    // Background task: send Telegram notification
    const telegramMsg = `💼 *WORK HUB: YANGI BUYURTMA*\n\n👤 *Ism:* ${name}\n📞 *Tel:* ${phone}\n🛠️ *Xizmat:* ${service}\n💬 *Xabar:* ${message || 'Yo\'q'}\n\n_Via WorkHub Backend_`;
    await telegramQueue.add('send-order', { text: telegramMsg }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });

    // Real-time notification via Pub/Sub
    redis.publish('workhub:notifications', JSON.stringify({
        type: 'order', icon: '📦',
        title: 'Yangi buyurtma!',
        text: `${name} "${service}" xizmati uchun so'rov yubordi.`,
        time: 'Hozir'
    }));

    res.json({ success: true, order });
});

// --- Tasks (Kanban) with Redis ---
app.get('/api/tasks', async (req, res) => {
    const tasks = await getCached('workhub:tasks', async () => {
        return [
            { id: 1, title: 'TechBaza landing page', desc: 'Dizayn va dasturlash', status: 'inprogress', tags: ['web'] },
            { id: 2, title: 'Logo dizayn - GullarOlami', desc: 'Logotip va brandbook', status: 'todo', tags: ['design'] },
            { id: 3, title: 'Telegram bot - savdo', desc: 'CRM integratsiya bilan', status: 'todo', tags: ['bot'] },
            { id: 4, title: 'Edu-Platforma backend', desc: 'API va database yakunlash', status: 'done', tags: ['web'] },
            { id: 5, title: 'SEO audit', desc: 'Onpage SEO tahlil', status: 'inprogress', tags: ['web'] }
        ];
    }, 1800);
    res.json(tasks);
});

app.post('/api/tasks', async (req, res) => {
    const { title, desc, status, tags } = req.body;
    const tasks = JSON.parse(await redis.get('workhub:tasks') || '[]');
    const task = { id: Date.now(), title, desc: desc || 'Tavsif yo\'q', status: status || 'todo', tags: tags || ['web'] };
    tasks.push(task);
    await redis.set('workhub:tasks', JSON.stringify(tasks));

    redis.publish('workhub:notifications', JSON.stringify({
        type: 'system', icon: '📋', title: 'Yangi vazifa', text: `"${title}" qo'shildi.`, time: 'Hozir'
    }));

    res.json({ success: true, task });
});

app.put('/api/tasks/:id', async (req, res) => {
    const taskId = parseInt(req.params.id);
    const tasks = JSON.parse(await redis.get('workhub:tasks') || '[]');
    const task = tasks.find(t => t.id === taskId);
    if (!task) return res.status(404).json({ error: 'Task topilmadi' });

    Object.assign(task, req.body);
    await redis.set('workhub:tasks', JSON.stringify(tasks));
    res.json({ success: true, task });
});

app.delete('/api/tasks/:id', async (req, res) => {
    const taskId = parseInt(req.params.id);
    let tasks = JSON.parse(await redis.get('workhub:tasks') || '[]');
    tasks = tasks.filter(t => t.id !== taskId);
    await redis.set('workhub:tasks', JSON.stringify(tasks));
    res.json({ success: true });
});

// --- Notifications ---
app.get('/api/notifications', async (req, res) => {
    const notifs = JSON.parse(await redis.get('workhub:notifications') || '[]');
    res.json(notifs);
});

app.post('/api/notifications/clear', async (req, res) => {
    await redis.del('workhub:notifications');
    res.json({ success: true });
});

// --- Dashboard Stats (cached) ---
app.get('/api/stats', async (req, res) => {
    const stats = await getCached('workhub:dashboard:stats', async () => {
        const totalOrders = await redis.get('workhub:stats:totalOrders') || '0';
        const totalLogins = await redis.get('workhub:stats:totalLogins') || '0';
        const orders = JSON.parse(await redis.get('workhub:orders') || '[]');
        const tasks = JSON.parse(await redis.get('workhub:tasks') || '[]');
        const doneTasks = tasks.filter(t => t.status === 'done').length;

        return {
            totalOrders: parseInt(totalOrders),
            totalLogins: parseInt(totalLogins),
            activeOrders: orders.filter(o => o.status === 'pending').length,
            totalTasks: tasks.length,
            completedTasks: doneTasks,
            taskProgress: tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0
        };
    }, 60);
    res.json(stats);
});

// --- Reports (Background Job) ---
app.post('/api/reports/generate', async (req, res) => {
    const { type } = req.body;
    const job = await reportQueue.add('generate', {
        type: type || 'monthly',
        dateRange: { from: '2026-01-01', to: '2026-05-18' }
    });
    res.json({ success: true, jobId: job.id, message: 'Hisobot orqa fonda generatsiya qilinmoqda...' });
});

app.get('/api/reports/:type', async (req, res) => {
    const report = await redis.get(`workhub:report:${req.params.type}`);
    if (report) {
        res.json({ success: true, report: JSON.parse(report) });
    } else {
        res.json({ success: false, message: 'Hisobot topilmadi. Avval generatsiya qiling.' });
    }
});

// --- Chat (Background Telegram) ---
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    const chatMsg = `💬 *WORK HUB CHAT*\n\n${message}\n\n_Via Backend_`;
    await telegramQueue.add('send-chat', { text: chatMsg }, { attempts: 3 });

    // Save chat history in Redis (last 50 messages)
    await redis.lpush('workhub:chat:history', JSON.stringify({ text: message, time: new Date().toISOString(), from: 'user' }));
    await redis.ltrim('workhub:chat:history', 0, 49);

    res.json({ success: true });
});

// --- Queue Status ---
app.get('/api/queues/status', async (req, res) => {
    const telegramWaiting = await telegramQueue.getWaitingCount();
    const telegramActive = await telegramQueue.getActiveCount();
    const telegramCompleted = await telegramQueue.getCompletedCount();
    const telegramFailed = await telegramQueue.getFailedCount();

    res.json({
        telegram: { waiting: telegramWaiting, active: telegramActive, completed: telegramCompleted, failed: telegramFailed },
    });
});

// Fallback — serve index.html
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '..', 'index.html'));
    }
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`\n🚀 WorkHub Backend ishga tushdi: http://localhost:${PORT}`);
    console.log(`📡 Socket.IO: ws://localhost:${PORT}`);
    console.log(`🔴 Redis: ${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`);
    console.log(`\n📋 API Endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/redis/stats`);
    console.log(`   POST /api/auth/login`);
    console.log(`   GET  /api/orders`);
    console.log(`   POST /api/orders`);
    console.log(`   GET  /api/tasks`);
    console.log(`   POST /api/tasks`);
    console.log(`   GET  /api/stats`);
    console.log(`   POST /api/reports/generate`);
    console.log(`   GET  /api/queues/status\n`);
});
