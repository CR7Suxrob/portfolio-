// ============================================================
// WorkHub Redis Client — Frontend → Backend API + Socket.IO
// ============================================================

// TODO: O'zingizning Render.com backend havolangizni bu yerga yozing
const PRODUCTION_BACKEND_URL = "https://workhub-backend.onrender.com"; 

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://localhost:3000/api` 
    : `${PRODUCTION_BACKEND_URL}/api`;

const SOCKET_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : PRODUCTION_BACKEND_URL;

// ============ SOCKET.IO CONNECTION ============
let socket = null;

function initSocket() {
    if (typeof io === 'undefined') {
        console.warn('⚠️ Socket.IO kutubxonasi yuklanmagan');
        return;
    }
    
    socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    
    socket.on('connect', () => {
        console.log('🔌 Socket.IO ulandi:', socket.id);
        updateConnectionStatus(true);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket.IO uzildi');
        updateConnectionStatus(false);
    });

    // Real-time notifications
    socket.on('notification', (data) => {
        console.log('📢 Real-time bildirishnoma:', data);
        showToast(data.icon + ' ' + data.title, data.text);
        
        // Add to notification list if on that page
        if (typeof addNotification === 'function') {
            addNotification(data);
        }
        
        // Update badge
        const badge = document.getElementById('notif-badge');
        if (badge) {
            const current = parseInt(badge.textContent) || 0;
            badge.textContent = current + 1;
            badge.style.display = 'inline-block';
        }
    });

    socket.on('unread_count', (count) => {
        const badge = document.getElementById('notif-badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    });
}

// ============ API HELPERS ============
async function apiCall(endpoint, method = 'GET', body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, opts);
        return await res.json();
    } catch (err) {
        console.error(`API xato (${endpoint}):`, err);
        return null;
    }
}

// ============ ORDERS API ============
const WorkHubAPI = {
    // Orders
    async getOrders() {
        return await apiCall('/orders');
    },
    
    async createOrder(data) {
        return await apiCall('/orders', 'POST', data);
    },

    // Tasks
    async getTasks() {
        return await apiCall('/tasks');
    },
    
    async createTask(data) {
        return await apiCall('/tasks', 'POST', data);
    },
    
    async updateTask(id, data) {
        return await apiCall(`/tasks/${id}`, 'PUT', data);
    },
    
    async deleteTask(id) {
        return await apiCall(`/tasks/${id}`, 'DELETE');
    },

    // Auth
    async login(username, password) {
        return await apiCall('/auth/login', 'POST', { username, password });
    },
    
    async getSession() {
        return await apiCall('/auth/session');
    },
    
    async logout() {
        return await apiCall('/auth/logout', 'POST');
    },

    // Stats
    async getStats() {
        return await apiCall('/stats');
    },
    
    async getRedisStats() {
        return await apiCall('/redis/stats');
    },

    // Reports
    async generateReport(type) {
        return await apiCall('/reports/generate', 'POST', { type });
    },
    
    async getReport(type) {
        return await apiCall(`/reports/${type}`);
    },

    // Chat
    async sendChat(message) {
        return await apiCall('/chat', 'POST', { message });
    },

    // Health
    async healthCheck() {
        return await apiCall('/health');
    },

    // Queue Status
    async getQueueStatus() {
        return await apiCall('/queues/status');
    },

    // Notifications
    async getNotifications() {
        return await apiCall('/notifications');
    },
    
    async clearNotifications() {
        return await apiCall('/notifications/clear', 'POST');
    }
};

// ============ TOAST NOTIFICATION ============
function showToast(title, text, duration = 4000) {
    const container = document.getElementById('toast-container') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = 'redis-toast';
    toast.innerHTML = `
        <div class="toast-title">${title}</div>
        <div class="toast-text">${text}</div>
    `;
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// ============ CONNECTION STATUS INDICATOR ============
function updateConnectionStatus(connected) {
    let indicator = document.getElementById('redis-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'redis-status';
        document.body.appendChild(indicator);
    }
    indicator.className = connected ? 'redis-status connected' : 'redis-status disconnected';
    indicator.innerHTML = connected 
        ? '🟢 Redis Connected' 
        : '🔴 Redis Disconnected';
    
    indicator.style.opacity = '1';
    setTimeout(() => { indicator.style.opacity = '0'; }, 3000);
}

// ============ REDIS MONITOR PANEL ============
async function openRedisMonitor() {
    const health = await WorkHubAPI.healthCheck();
    const redisStats = await WorkHubAPI.getRedisStats();
    const queueStatus = await WorkHubAPI.getQueueStatus();

    let overlay = document.getElementById('redis-monitor-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'task-modal-overlay';
        overlay.id = 'redis-monitor-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="task-modal" style="width:700px;max-width:95%;">
            <h3>🗄️ Redis Monitor Panel</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1.5rem 0;">
                <div class="redis-stat-card">
                    <span class="redis-stat-icon">🟢</span>
                    <div>
                        <small>Status</small>
                        <h4>${health?.redis || 'N/A'}</h4>
                    </div>
                </div>
                <div class="redis-stat-card">
                    <span class="redis-stat-icon">💾</span>
                    <div>
                        <small>Memory</small>
                        <h4>${redisStats?.memory || 'N/A'}</h4>
                    </div>
                </div>
                <div class="redis-stat-card">
                    <span class="redis-stat-icon">🔑</span>
                    <div>
                        <small>Keys</small>
                        <h4>${redisStats?.keys ?? 'N/A'}</h4>
                    </div>
                </div>
                <div class="redis-stat-card">
                    <span class="redis-stat-icon">⏱️</span>
                    <div>
                        <small>Uptime</small>
                        <h4>${health?.uptime ? Math.round(health.uptime) + 's' : 'N/A'}</h4>
                    </div>
                </div>
            </div>
            <h4 style="margin:1rem 0 0.5rem;">📨 Queue Status</h4>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem;">
                <div class="redis-queue-stat"><small>Waiting</small><b>${queueStatus?.telegram?.waiting ?? 0}</b></div>
                <div class="redis-queue-stat"><small>Active</small><b>${queueStatus?.telegram?.active ?? 0}</b></div>
                <div class="redis-queue-stat"><small>Done</small><b style="color:#00b36e">${queueStatus?.telegram?.completed ?? 0}</b></div>
                <div class="redis-queue-stat"><small>Failed</small><b style="color:#ff4d4d">${queueStatus?.telegram?.failed ?? 0}</b></div>
            </div>
            <div class="task-modal-btns" style="margin-top:1.5rem;">
                <button class="modal-cancel-btn" onclick="document.getElementById('redis-monitor-overlay').classList.remove('open')">Yopish</button>
                <button class="new-action-btn" style="flex:1" onclick="openRedisMonitor()">🔄 Yangilash</button>
            </div>
        </div>
    `;
    requestAnimationFrame(() => overlay.classList.add('open'));
}

// ============ AUTO-INIT ============
document.addEventListener('DOMContentLoaded', () => {
    // Load Socket.IO from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
    script.onload = () => {
        console.log('📡 Socket.IO kutubxonasi yuklandi');
        initSocket();
    };
    document.head.appendChild(script);
});

// Make API available globally
window.WorkHubAPI = WorkHubAPI;
window.openRedisMonitor = openRedisMonitor;
window.showToast = showToast;
