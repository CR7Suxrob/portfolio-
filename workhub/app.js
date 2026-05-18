document.addEventListener('DOMContentLoaded', () => {
    // --- INITIALIZATION ---
    window.addEventListener('load', () => {
        const loader = document.getElementById('page-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    });

    // Force UZ if no lang saved, or just override for now to fix user issue
    const savedLang = 'uz'; 
    localStorage.setItem('workhub_lang', 'uz');
    changeLanguage('uz');
    loadUserProfile();
    
    renderActivities();
    renderKanban();
    renderCalendar();
    renderNotifications();
    updateBadge();

    // --- SEARCH LOGIC ---
    const searchInput = document.querySelector('.search-bar input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            
            // Filter Service Cards
            document.querySelectorAll('.stat-card.s-item').forEach(card => {
                const title = card.querySelector('h3').textContent.toLowerCase();
                const desc = card.querySelector('p').textContent.toLowerCase();
                card.style.display = (title.includes(term) || desc.includes(term)) ? 'flex' : 'none';
            });

            // Filter Activities
            document.querySelectorAll('.item-row').forEach(row => {
                const title = row.querySelector('h4').textContent.toLowerCase();
                const sub = row.querySelector('p').textContent.toLowerCase();
                row.style.display = (title.includes(term) || sub.includes(term)) ? 'flex' : 'none';
            });
        });
    }

    // --- PWA INSTALL LOGIC ---
    let deferredPrompt;
    const installBtn = document.getElementById('btn-install-pwa');

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI notify the user they can add to home screen
        if (installBtn) installBtn.style.display = 'flex';
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            // Show the prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
            // Hide the button
            installBtn.style.display = 'none';
        });
    }

    window.addEventListener('appinstalled', (evt) => {
        console.log('WorkHub was installed.');
        if (installBtn) installBtn.style.display = 'none';
        addNotification({ type: 'system', icon: '📱', title: 'Ilova o\'rnatildi!', text: 'Work Hub endi asosiy ekraningizda.' });
    });

    // --- NAVIGATION LOGIC ---
    window.switchView = function(target) {
        if (!target) return;

        // Update active link - re-query every time
        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('data-target') === target) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Show/hide sections - re-query every time
        document.querySelectorAll('.view-section').forEach(sec => {
            sec.style.display = (sec.id === `view-${target}`) ? 'block' : 'none';
        });

        // Scroll to top
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.scrollTop = 0;
        window.scrollTo(0, 0);

        // Close sidebar only on mobile
        if (window.innerWidth <= 850) {
            const sidebar = document.querySelector('.dashboard-sidebar');
            if (sidebar) {
                sidebar.classList.remove('active');
            }
        }
    }

    // Attach click listeners to nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const target = this.getAttribute('data-target');
            if (target) switchView(target);
        });
    });

    // --- SIDEBAR TOGGLE (☰ button) ---
    window.toggleSidebar = function() {
        const sidebar = document.querySelector('.dashboard-sidebar');
        if (!sidebar) return;
        if (window.innerWidth <= 850) {
            sidebar.classList.toggle('active');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    }

    // Close sidebar on outside click (mobile only)
    document.addEventListener('click', function(e) {
        if (window.innerWidth > 850) return;
        const sidebar = document.querySelector('.dashboard-sidebar');
        const toggle = document.getElementById('menu-toggle');
        if (sidebar && !sidebar.contains(e.target) && toggle && !toggle.contains(e.target)) {
            sidebar.classList.remove('active');
        }
    });

    // --- BUTTON HANDLERS ---
    const newProjectBtns = document.querySelectorAll('#btn-new-project-sidebar, #btn-new-project-main');
    newProjectBtns.forEach(btn => {
        btn.onclick = () => switchView('contact');
    });

    // Handle Service Card clicks
    document.querySelectorAll('.s-item').forEach(card => {
        card.onclick = () => {
            const serviceName = card.getAttribute('data-service');
            const select = document.getElementById('service-select');
            if (select) select.value = serviceName;
            switchView('contact');
        };
    });

    // --- FORM HANDLING ---
    const contactForm = document.getElementById('lab-contact-form');
    const BOT_TOKEN = '8469015792:AAHer6z93IlMyN_hF-1LPJdmMTcD3Zw77p4';
    const CHAT_ID = '1198878759';

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = contactForm.querySelector('button');
            const originalBtnText = submitBtn.innerHTML;

            const name = document.getElementById('name').value;
            const phone = document.getElementById('phone').value;
            const service = document.getElementById('service-select').value;
            const msg = document.getElementById('message').value;

            submitBtn.innerHTML = 'YUBORILMOQDA...';
            submitBtn.disabled = true;

            try {
                // Try backend API first (Redis + Background Queue)
                if (window.WorkHubAPI) {
                    const result = await WorkHubAPI.createOrder({ name, phone, service, message: msg });
                    if (result && result.success) {
                        console.log('✅ Order saved via Redis backend');
                    }
                }

                // Also save to LocalStorage as fallback
                const orders = JSON.parse(localStorage.getItem('workhub_orders') || '[]');
                orders.push({ id: Date.now(), name, phone, service, message: msg, date: new Date().toISOString() });
                localStorage.setItem('workhub_orders', JSON.stringify(orders));

                alert('Muvaffaqiyatli! Tez orada bog\'lanamiz.');
                contactForm.reset();
                renderActivities();
                switchView('overview');
                
                addNotification({ 
                    type: 'order', 
                    icon: '📦', 
                    title: 'Yangi so\'rov yuborildi', 
                    text: `Sizning "${service}" bo'yicha so'rovingiz qabul qilindi.` 
                });
            } catch (err) {
                console.error(err);
                alert('Xatolik yuz berdi.');
            } finally {
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }

    // --- THEME TOGGLE ---
    const themeToggle = document.getElementById('theme-toggle');
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            if (document.body.classList.contains('light-mode')) {
                localStorage.setItem('theme', 'light');
            } else {
                localStorage.setItem('theme', 'dark');
            }
        });
    }

    // --- STATS ANIMATION ---
    const bars = document.querySelectorAll('.bar-box');
    setTimeout(() => {
        bars.forEach(bar => {
            const h = bar.getAttribute('style').match(/height:\s*([\d%]+)/)?.[1] || '50%';
            bar.style.height = '0';
            setTimeout(() => bar.style.height = h, 100);
        });
    }, 500);
});

// --- GLOBAL FUNCTIONS ---

// Render Activities in Dashboard
function renderActivities() {
    const list = document.getElementById('recent-activities');
    if (!list) return;

    let orders = [];
    try {
        orders = JSON.parse(localStorage.getItem('workhub_orders') || '[]');
        if (!Array.isArray(orders)) orders = [];
    } catch(e) {
        orders = [];
    }

    if (orders.length === 0) {
        list.innerHTML = `
            <div class="item-row">
                <div class="item-icon">📦</div>
                <div class="item-details">
                    <h4>Apple Store Online</h4>
                    <p>Hozircha amallar yo'q. Bu namuna.</p>
                </div>
                <div class="item-meta">
                    <span class="item-val">-24.5M</span>
                    <span class="item-status st-success">NAMUNA</span>
                </div>
            </div>
        `;
        return;
    }

    const icons = { 
        'Veb-sayt': '🌐', 
        'Telegram Bot': '🤖', 
        'Dizayn': '🎨', 
        'Video Montaj': '🎬',
        'Logotip dizayn': '✒️',
        'Banner xizmati': '🖼️',
        'Prezentatsiya': '📊',
        'Sun\'iy Intelekt': '🧠',
        'Boshqa': '📝' 
    };

    list.innerHTML = [...orders].reverse().slice(0, 5).map(o => `
        <div class="item-row">
            <div class="item-icon">${icons[o.service] || '📂'}</div>
            <div class="item-details">
                <h4>${o.name || 'Noma\'lum'}</h4>
                <p>${(o.service || 'BOSHQA').toUpperCase()} - ${new Date(o.date).toLocaleDateString()}</p>
            </div>
            <div class="item-meta">
                <span class="item-val plus">+BUYURTMA</span>
                <span class="item-status st-pending">JARAYONDA</span>
            </div>
        </div>
    `).join('');
}

const TRANSLATIONS = {
    uz: {
        dashboard: "📊 Dashboard",
        services: "📈 Xizmatlar",
        portfolio: "💼 Portfolio",
        contact: "💬 Aloqa",
        faq: "❓ Savollar",
        client_portal: "👤 Mijoz Kabineti",
        pricing: "💳 Tariflar",
        team: "👥 Jamoa",
        reviews: "⭐ Fikrlar",
        blog: "📰 Blog",
        kanban: "📋 Vazifalar",
        analytics: "📊 Hisobotlar",
        calendar: "📅 Kalendar",
        notifications: "🔔 Bildirishnomalar",
        admin: "🔒 Admin Panel",
        new_project: "+ Yangi Loyiha",
        logout: "🚪 Chiqish",
        welcome: "Xush kelibsiz,",
        overview_sub: "Mana sizning bugungi boshqaruv paneli ko'rinishi.",
        total_balance: "UMUMIY BALANS",
        tasks_stat: "VAZIFALAR",
        income_stat: "DAROMAD",
        weekly_progress: "Haftalik progress",
        recent_activity: "Oxirgi amallar",
        view_all: "Hammasini ko'rish",
        back_btn: "⬅️ Dashboard'ga qaytish",
        service_title: "Bizning <span>Xizmatlar</span>",
        service_sub: "Professional raqamli yechimlar va kreativ yondashuv.",
        portfolio_title: "Bizning <span>Portfolio</span>",
        portfolio_sub: "Muvaffaqiyatli yakunlangan loyihalarimiz tahlili.",
        contact_title: "Loyihani <span>Boshlash</span>",
        contact_sub: "Ma'lumotlaringizni qoldiring, biz siz bilan bog'lanamiz.",
        form_name: "ISM",
        form_phone: "TELEFON",
        form_service: "XIZMAT",
        form_message: "XABAR",
        form_submit: "YUBORISH",
        form_sending: "YUBORILMOQDA...",
        faq_title: "Ko'p beriladigan <span>Savollar</span>",
        faq_sub: "Sizni qiziqtirgan asosiy ma'lumotlar.",
        team_title: "Bizning <span>Jamoa</span>",
        team_sub: "Loyihangiz ustida ishlovchi tajribali mutaxassislar.",
        reviews_title: "Mijozlar <span>Fikri</span>",
        reviews_sub: "Biz bilan ishlagan mijozlarning taassurotlari.",
        files: "📁 Fayllar",
        settings: "⚙️ Sozlamalar",
        files_title: "Raqamli <span>Fayllar</span>",
        files_sub: "Loyihalaringizga tegishli hujjatlar va media fayllar.",
        settings_title: "Tizim <span>Sozlamalari</span>",
        settings_sub: "Profil, xavfsizlik va bildirishnomalarni boshqarish."
    },
    ru: {
        dashboard: "📊 Панель",
        services: "📈 Услуги",
        portfolio: "💼 Портфолио",
        contact: "💬 Контакты",
        faq: "❓ Вопросы",
        client_portal: "👤 Кабинет",
        pricing: "💳 Тарифы",
        team: "👥 Команда",
        reviews: "⭐ Отзывы",
        blog: "📰 Блог",
        kanban: "📋 Задачи",
        analytics: "📊 Отчеты",
        calendar: "📅 Календарь",
        notifications: "🔔 Уведомления",
        admin: "🔒 Админ Панель",
        new_project: "+ Новый Проект",
        logout: "🚪 Выход",
        welcome: "Добро пожаловать,",
        overview_sub: "Вот ваш обзор панели управления на сегодня.",
        total_balance: "ОБЩИЙ БАЛАНС",
        tasks_stat: "ЗАДАЧИ",
        income_stat: "ДОХОД",
        weekly_progress: "Недельный прогресс",
        recent_activity: "Последние действия",
        view_all: "Посмотреть все",
        back_btn: "⬅️ Вернуться на главную",
        service_title: "Наши <span>Услуги</span>",
        service_sub: "Профессиональные цифровые решения и креативный подход.",
        portfolio_title: "Наше <span>Портфолио</span>",
        portfolio_sub: "Анализ наших успешно завершенных проектов.",
        contact_title: "Начать <span>Проект</span>",
        contact_sub: "Оставьте свои данные, и мы свяжемся с вами.",
        form_name: "ИМЯ",
        form_phone: "ТЕЛЕФОН",
        form_service: "УСЛУГА",
        form_message: "СООБЩЕНИЕ",
        form_submit: "ОТПРАВИТЬ",
        form_sending: "ОТПРАВКА...",
        faq_title: "Частые <span>Вопросы</span>",
        faq_sub: "Основная информация, которая может вас заинтересовать.",
        team_title: "Наша <span>Команда</span>",
        team_sub: "Опытные специалисты, работающие над вашим проектом.",
        reviews_title: "Отзывы <span>Клиентов</span>",
        reviews_sub: "Впечатления клиентов, которые работали с нами.",
        files: "📁 Файлы",
        settings: "⚙️ Настройки",
        files_title: "Цифровые <span>Файлы</span>",
        files_sub: "Документы и медиафайлы, относящиеся к вашим проектам.",
        settings_title: "Системные <span>Настройки</span>",
        settings_sub: "Управление профилем, безопасностью и уведомлениями."
    },
    en: {
        dashboard: "📊 Dashboard",
        services: "📈 Services",
        portfolio: "💼 Portfolio",
        contact: "💬 Contact",
        faq: "❓ FAQ",
        client_portal: "👤 Client Portal",
        pricing: "💳 Pricing",
        team: "👥 Team",
        reviews: "⭐ Reviews",
        blog: "📰 Blog",
        kanban: "📋 Tasks",
        analytics: "📊 Analytics",
        calendar: "📅 Calendar",
        notifications: "🔔 Notifications",
        admin: "🔒 Admin Panel",
        new_project: "+ New Project",
        logout: "🚪 Logout",
        welcome: "Welcome back,",
        overview_sub: "Here is your dashboard overview for today.",
        total_balance: "TOTAL BALANCE",
        tasks_stat: "TASKS",
        income_stat: "INCOME",
        weekly_progress: "Weekly Progress",
        recent_activity: "Recent Activity",
        view_all: "View All",
        back_btn: "⬅️ Back to Dashboard",
        service_title: "Our <span>Services</span>",
        service_sub: "Professional digital solutions and creative approach.",
        portfolio_title: "Our <span>Portfolio</span>",
        portfolio_sub: "Analysis of our successfully completed projects.",
        contact_title: "Start <span>Project</span>",
        contact_sub: "Leave your details, and we will get in touch.",
        form_name: "NAME",
        form_phone: "PHONE",
        form_service: "SERVICE",
        form_message: "MESSAGE",
        form_submit: "SUBMIT",
        form_sending: "SENDING...",
        faq_title: "Frequently Asked <span>Questions</span>",
        faq_sub: "Key information you might be interested in.",
        team_title: "Our <span>Team</span>",
        team_sub: "Experienced specialists working on your project.",
        reviews_title: "Client <span>Reviews</span>",
        reviews_sub: "Impressions of clients who worked with us.",
        files: "📁 Files",
        settings: "⚙️ Settings",
        files_title: "Digital <span>Files</span>",
        files_sub: "Documents and media files related to your projects.",
        settings_title: "System <span>Settings</span>",
        settings_sub: "Manage profile, security and notifications."
    }
};

// Language Toggle
window.changeLanguage = function(lang) {
    document.querySelectorAll('.lang-item').forEach(el => el.classList.remove('active'));
    const activeLang = document.getElementById(`lang-${lang}`);
    if (activeLang) activeLang.classList.add('active');
    
    // Save preference
    localStorage.setItem('workhub_lang', lang);
    
    const t = TRANSLATIONS[lang];
    if (!t) return;

    // Update Sidebar
    const navs = document.querySelectorAll('.nav-link');
    const navKeys = ['overview', 'services', 'portfolio', 'contact', 'faq', 'client-portal', 'pricing', 'team', 'reviews', 'blog', 'kanban', 'analytics', 'calendar', 'notifications', 'files', 'settings'];
    navs.forEach(link => {
        const target = link.getAttribute('data-target');
        const key = target.replace('-', '_');
        if (t[key]) {
            const icon = link.querySelector('.icon').innerText;
            link.innerHTML = `<span class="icon">${icon}</span> ${t[key].split(' ').slice(1).join(' ')}`;
        }
    });

    // Update Headings & Texts
    const welcomeH2 = document.querySelector('.welcome-msg h2');
    if (welcomeH2) welcomeH2.innerHTML = `${t.welcome} <span style="color: var(--accent);">Suxrob!</span>`;
    
    const welcomeP = document.querySelector('.welcome-msg p');
    if (welcomeP) welcomeP.textContent = t.overview_sub;

    const sidebarNewBtn = document.getElementById('btn-new-project-sidebar');
    if (sidebarNewBtn) sidebarNewBtn.innerHTML = `<span>+</span> ${t.new_project.split(' ').slice(1).join(' ')}`;

    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) logoutBtn.innerHTML = `<span>🚪</span> ${t.logout.split(' ').slice(1).join(' ')}`;

    // Update Stats
    const stats = document.querySelectorAll('.stat-body small');
    if (stats[0]) stats[0].textContent = t.total_balance;
    if (stats[1]) stats[1].textContent = t.tasks_stat;
    if (stats[2]) stats[2].textContent = t.income_stat;

    // Update View Titles
    document.querySelectorAll('.view-section').forEach(view => {
        const title = view.querySelector('.welcome-msg h2');
        const sub = view.querySelector('.welcome-msg p');
        const back = view.querySelector('.back-btn');
        const id = view.id.replace('view-', '');
        
        if (title && t[`${id.replace('-', '_')}_title` || id]) {
            title.innerHTML = t[`${id.replace('-', '_')}_title` || id];
        }
        if (sub && t[`${id.replace('-', '_')}_sub` || id]) {
            sub.textContent = t[`${id.replace('-', '_')}_sub` || id];
        }
        if (back) back.textContent = t.back_btn;
    });

    // Update Form
    const labels = document.querySelectorAll('#lab-contact-form label');
    if (labels[0]) labels[0].textContent = t.form_name;
    if (labels[1]) labels[1].textContent = t.form_phone;
    if (labels[2]) labels[2].textContent = t.form_service;
    if (labels[3]) labels[3].textContent = t.form_message;
    
    const submitBtn = document.querySelector('#lab-contact-form button');
    if (submitBtn) submitBtn.textContent = t.form_submit;

    console.log("Language switched to: " + lang);
}

window.toggleSidebar = function() {
    const sidebar = document.querySelector('.dashboard-sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

window.toggleChat = function() {
    const chatWidget = document.getElementById('chat-widget');
    if (!chatWidget) return;
    chatWidget.style.display = chatWidget.style.display === 'flex' ? 'none' : 'flex';
}

window.sendChatMsg = function() {
    const input = document.getElementById('chat-input');
    const msg = input ? input.value.trim() : '';
    if (!msg) return;

    const chatBody = document.getElementById('chat-body');
    if (!chatBody) return;
    
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user';
    userDiv.innerText = msg;
    chatBody.appendChild(userDiv);
    
    input.value = '';
    chatBody.scrollTop = chatBody.scrollHeight;

    // Send via Backend API (Redis Queue)
    if (window.WorkHubAPI) {
        WorkHubAPI.sendChat(msg)
            .then(() => console.log('Chat sent via Redis queue'))
            .catch(err => console.error('Chat error:', err));
    } else {
        console.warn('Backend serverga ulanilmagan');
        alert("Server bilan aloqa yo'q! Xabarni jo'natib bo'lmaydi.");
    }

    setTimeout(() => {
        const botDiv = document.createElement('div');
        botDiv.className = 'chat-msg bot';
        botDiv.innerText = "Xabaringiz qabul qilindi. Tez orada operator javob beradi.";
        chatBody.appendChild(botDiv);
        chatBody.scrollTop = chatBody.scrollHeight;
    }, 1000);
}

// Kanban Logic
let kanbanTasks = JSON.parse(localStorage.getItem('kanban_tasks') || 'null') || [
    { id: 1, title: 'TechBaza landing page', desc: 'Dizayn va dasturlash', status: 'inprogress', tags: ['web'] },
    { id: 2, title: 'Logo dizayn - GullarOlami', desc: 'Logotip va brandbook', status: 'todo', tags: ['design'] },
    { id: 3, title: 'Telegram bot - savdo', desc: 'CRM integratsiya bilan', status: 'todo', tags: ['bot'] },
    { id: 4, title: 'Edu-Platforma backend', desc: 'API va database yakunlash', status: 'done', tags: ['web'] },
    { id: 5, title: 'SEO audit - Texnologiya.uz', desc: 'Onpage SEO tahlil', status: 'inprogress', tags: ['web'] },
];
let draggedTaskId = null;

function saveKanban() {
    localStorage.setItem('kanban_tasks', JSON.stringify(kanbanTasks));
}

function renderKanban() {
    const cols = { todo: [], inprogress: [], done: [] };
    kanbanTasks.forEach(t => cols[t.status] && cols[t.status].push(t));

    ['todo', 'inprogress', 'done'].forEach(col => {
        const container = document.getElementById(`cards-${col}`);
        const countEl = document.getElementById(`count-${col}`);
        if (!container) return;

        countEl.textContent = cols[col].length;
        container.innerHTML = cols[col].map(task => `
            <div class="kanban-card" draggable="true" id="task-${task.id}"
                ondragstart="dragStart(${task.id})" ondragend="dragEnd()">
                <h4>${task.title}</h4>
                <p>${task.desc}</p>
                <div class="card-tags">
                    ${task.tags.map(t => `<span class="kanban-tag tag-${t}">${t.toUpperCase()}</span>`).join('')}
                    <button onclick="deleteTask(${task.id})" style="margin-left:auto;background:rgba(255,77,77,0.15);border:none;color:#ff4d4d;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:0.7rem;">✕</button>
                </div>
            </div>
        `).join('') || `<div style="color:var(--text-dim);font-size:0.85rem;text-align:center;padding:2rem 0;">Bu yerga tashlang</div>`;
    });
}

window.openTaskModal = function() {
    let overlay = document.getElementById('task-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'task-modal-overlay';
        overlay.id = 'task-modal-overlay';
        overlay.innerHTML = `
            <div class="task-modal">
                <h3>➕ Yangi Vazifa Qo'shish</h3>
                <div style="margin-bottom:1.2rem;">
                    <label style="font-size:0.75rem;font-weight:800;color:var(--text-dim);display:block;margin-bottom:0.5rem;">VAZIFA NOMI</label>
                    <input type="text" id="task-title-input" class="form-input" placeholder="Vazifa nomini kiriting..." required>
                </div>
                <div style="margin-bottom:1.2rem;">
                    <label style="font-size:0.75rem;font-weight:800;color:var(--text-dim);display:block;margin-bottom:0.5rem;">TAVSIF</label>
                    <input type="text" id="task-desc-input" class="form-input" placeholder="Qisqacha tavsif...">
                </div>
                <div style="margin-bottom:1.2rem;">
                    <label style="font-size:0.75rem;font-weight:800;color:var(--text-dim);display:block;margin-bottom:0.5rem;">HOLAT</label>
                    <select id="task-status-input" class="form-input">
                        <option value="todo">⏳ Kutilmoqda</option>
                        <option value="inprogress">🔄 Jarayonda</option>
                        <option value="done">✅ Yakunlandi</option>
                    </select>
                </div>
                <div style="margin-bottom:1.2rem;">
                    <label style="font-size:0.75rem;font-weight:800;color:var(--text-dim);display:block;margin-bottom:0.5rem;">TAG</label>
                    <select id="task-tag-input" class="form-input">
                        <option value="web">WEB</option>
                        <option value="design">DESIGN</option>
                        <option value="bot">BOT</option>
                        <option value="urgent">URGENT</option>
                    </select>
                </div>
                <div class="task-modal-btns">
                    <button class="modal-cancel-btn" onclick="closeTaskModal()">Bekor qilish</button>
                    <button class="new-action-btn" style="flex:1" onclick="addTask()">Saqlash</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    requestAnimationFrame(() => overlay.classList.add('open'));
}

window.closeTaskModal = function() {
    const overlay = document.getElementById('task-modal-overlay');
    if (overlay) overlay.classList.remove('open');
}

window.addTask = function() {
    const title = document.getElementById('task-title-input').value.trim();
    const desc = document.getElementById('task-desc-input').value.trim();
    const status = document.getElementById('task-status-input').value;
    const tag = document.getElementById('task-tag-input').value;
    if (!title) { alert("Vazifa nomini kiriting!"); return; }

    const newTask = {
        id: Date.now(),
        title, desc: desc || 'Tavsif yo\'q',
        status, tags: [tag]
    };
    kanbanTasks.push(newTask);
    saveKanban();
    renderKanban();
    closeTaskModal();
    addNotification({ type: 'system', icon: '📋', title: 'Yangi vazifa qo\'shildi!', text: `"${title}" vazifasi yaratildi.` });
}

window.deleteTask = function(id) {
    kanbanTasks = kanbanTasks.filter(t => t.id !== id);
    saveKanban();
    renderKanban();
}

window.dragStart = function(id) {
    draggedTaskId = id;
    const el = document.getElementById(`task-${id}`);
    if (el) el.style.opacity = '0.5';
}

window.dragEnd = function() {
    if (draggedTaskId) {
        const el = document.getElementById(`task-${draggedTaskId}`);
        if (el) el.style.opacity = '1';
    }
}

window.dropTask = function(event, newStatus) {
    event.preventDefault();
    if (!draggedTaskId) return;
    const task = kanbanTasks.find(t => t.id === draggedTaskId);
    if (task) {
        task.status = newStatus;
        saveKanban();
        renderKanban();
        if (newStatus === 'done') {
            addNotification({ type: 'system', icon: '✅', title: 'Vazifa yakunlandi!', text: `"${task.title}" muvaffaqiyatli yakunlandi.` });
        }
    }
    draggedTaskId = null;
}

// Calendar Logic
let currentCalDate = new Date();
const eventDays = [8, 10, 12, 15, 20];

function renderCalendar() {
    const grid = document.getElementById('cal-grid');
    const titleEl = document.getElementById('cal-month-title');
    if (!grid || !titleEl) return;

    const months = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
    titleEl.textContent = `${months[currentCalDate.getMonth()]} ${currentCalDate.getFullYear()}`;

    const allChildren = Array.from(grid.children);
    allChildren.slice(7).forEach(c => c.remove());

    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const startOffset = (firstDay === 0) ? 6 : firstDay - 1;

    for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-day empty';
        grid.appendChild(empty);
    }

    for (let d = 1; d <= totalDays; d++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'cal-day';
        dayEl.textContent = d;

        const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        if (isToday) dayEl.classList.add('today');
        if (eventDays.includes(d) && !isToday) dayEl.classList.add('has-event');

        dayEl.onclick = () => {
            document.querySelectorAll('.cal-day').forEach(el => el.style.outline = '');
            dayEl.style.outline = '2px solid var(--accent)';
        };
        grid.appendChild(dayEl);
    }
}

window.changeMonth = function(dir) {
    currentCalDate.setMonth(currentCalDate.getMonth() + dir);
    renderCalendar();
}

// Notifications Logic
let notifications = JSON.parse(localStorage.getItem('workhub_notifs') || 'null') || [
    { id: 1, type: 'order', icon: '📦', title: 'Yangi buyurtma keldi!', text: 'Alisher "Veb-sayt" xizmati uchun so\'rov yubordi.', time: '5 daqiqa oldin', unread: true },
    { id: 2, type: 'payment', icon: '💰', title: 'To\'lov amalga oshirildi', text: 'Malika 2,500,000 UZS to\'lov qildi. Hisobingiz yangilandi.', time: '1 soat oldin', unread: true },
    { id: 3, type: 'system', icon: '🔔', title: 'Loyiha muddati yaqinlashmoqda', text: 'Edu-Platforma loyihasi 3 kundan keyin topshirilishi kerak.', time: '2 soat oldin', unread: true },
];

let currentFilter = 'all';

function saveNotifications() {
    localStorage.setItem('workhub_notifs', JSON.stringify(notifications));
    updateBadge();
}

function updateBadge() {
    const badge = document.getElementById('notif-badge');
    const unreadCount = notifications.filter(n => n.unread).length;
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }
}

function renderNotifications(filter = currentFilter) {
    const list = document.getElementById('notif-list');
    if (!list) return;

    const filtered = filter === 'all' ? notifications : notifications.filter(n => n.type === filter);

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:3rem;">🎉 Bildirishnomalar yo'q</div>`;
        return;
    }

    list.innerHTML = filtered.map(n => `
        <div class="notif-item ${n.unread ? 'unread' : ''}" id="notif-${n.id}">
            <div class="notif-icon ${n.type}">${n.icon}</div>
            <div class="notif-content">
                <h4>${n.title}</h4>
                <p>${n.text}</p>
                <div class="notif-time">${n.time}</div>
            </div>
            <button class="notif-dismiss" onclick="dismissNotif(${n.id})">✕</button>
        </div>
    `).join('');

    // Mark as read after viewing
    notifications.forEach(n => { if (filter === 'all' || n.type === filter) n.unread = false; });
    saveNotifications();
}

function addNotification(notif) {
    const newNotif = {
        id: Date.now(),
        type: notif.type || 'system',
        icon: notif.icon || '🔔',
        title: notif.title,
        text: notif.text,
        time: 'Hozir',
        unread: true
    };
    notifications.unshift(newNotif);
    saveNotifications();
    renderNotifications();
}

window.dismissNotif = function(id) {
    notifications = notifications.filter(n => n.id !== id);
    saveNotifications();
    renderNotifications(currentFilter);
}

window.clearAllNotifs = function() {
    if (!confirm('Barcha bildirishnomalarni o\'chirmoqchimisiz?')) return;
    notifications = [];
    saveNotifications();
    renderNotifications(currentFilter);
}

window.filterNotifs = function(btn, filter) {
    currentFilter = filter;
    document.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderNotifications(filter);
}

// Blog Modal Logic
const blogArticles = {
    'ai-trends': {
        title: "2026-yilda Sun'iy Intellekt Trendlari",
        content: `
            <p>2026-yilda Sun'iy Intellekt (AI) nafaqat texnologik sohada, balki kundalik biznes jarayonlarining ajralmas qismiga aylanadi.</p>
            <ul>
                <li><strong>Avtonom Agentlar:</strong> Endi AI nafaqat savollarga javob beradi, balki mustaqil vazifalarni bajaradi.</li>
                <li><strong>Shaxsiylashtirilgan Mijoz Tajribasi:</strong> Har bir mijoz uchun individual yondashuv.</li>
            </ul>
        `
    },
    'bot-vs-app': {
        title: "Telegram Bot vs Ilova",
        content: `<p>Ko'pchilik tadbirkorlar "Biznes uchun nima afzal: Mobil ilovami yoki Telegram bot?" degan savolga duch kelishadi...</p>`
    }
};

window.openBlogModal = function(id) {
    const article = blogArticles[id];
    if (!article) return;
    const overlay = document.getElementById('blog-modal-overlay');
    const content = document.getElementById('blog-content');
    if (!overlay || !content) return;
    content.innerHTML = `<h2>${article.title}</h2><div>${article.content}</div>`;
    overlay.classList.add('open');
}

window.closeBlogModal = function() {
    const overlay = document.getElementById('blog-modal-overlay');
    if (overlay) overlay.classList.remove('open');
}

// User Profile Logic
window.loadUserProfile = function() {
    const profile = JSON.parse(localStorage.getItem('workhub_profile') || '{"name":"Suxrob", "role":"Administrator", "avatar":"👤"}');
    document.getElementById('display-user-name').textContent = profile.name;
    document.getElementById('display-user-role').textContent = profile.role;
    document.getElementById('display-user-avatar').textContent = profile.avatar;
    
    // Update welcome message if present
    const welcomeH2 = document.querySelector('.welcome-msg h2');
    if (welcomeH2) {
        const lang = localStorage.getItem('workhub_lang') || 'uz';
        const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;
        welcomeH2.innerHTML = `${t.welcome} <span style="color: var(--accent);">${profile.name}!</span>`;
    }

    // Fill inputs in modal
    document.getElementById('user-name-input').value = profile.name;
    document.getElementById('user-role-input').value = profile.role;
    document.getElementById('user-modal-avatar').textContent = profile.avatar;
}

window.openUserModal = function() {
    const overlay = document.getElementById('user-modal-overlay');
    if (overlay) overlay.classList.add('open');
}

window.closeUserModal = function() {
    const overlay = document.getElementById('user-modal-overlay');
    if (overlay) overlay.classList.remove('open');
}

window.saveUserProfile = function() {
    const name = document.getElementById('user-name-input').value.trim();
    const role = document.getElementById('user-role-input').value.trim();
    const avatar = document.getElementById('user-modal-avatar').textContent;
    
    if (!name) return alert("Ism kiriting!");
    
    const profile = { name, role, avatar };
    localStorage.setItem('workhub_profile', JSON.stringify(profile));
    loadUserProfile();
    closeUserModal();
    addNotification({ type: 'system', icon: '👤', title: 'Profil yangilandi', text: 'Ma\'lumotlaringiz muvaffaqiyatli saqlandi.' });
}

// Quick Actions Logic
window.toggleQuickActions = function() {
    const menu = document.querySelector('.qa-menu');
    if (menu) menu.classList.toggle('open');
}

// Close QA menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('#quick-actions')) {
        const menu = document.querySelector('.qa-menu');
        if (menu) menu.classList.remove('open');
    }
});

// Avatar cycling (simple)
document.getElementById('user-modal-avatar').onclick = function() {
    const avatars = ['👤', '👨‍💻', '👨‍💼', '🚀', '🛠️', '💎'];
    const current = this.textContent;
    let idx = avatars.indexOf(current);
    idx = (idx + 1) % avatars.length;
    this.textContent = avatars[idx];
}
