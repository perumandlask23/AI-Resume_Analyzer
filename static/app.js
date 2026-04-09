/* 
   ══════════════════════════════════════════════════════════
   RESUMEAI — "OBSIDIAN GLASS" CORE LOGIC
   ══════════════════════════════════════════════════════════
*/

// --- TOAST SYSTEM ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container') || (() => {
        const c = document.createElement('div');
        c.id = 'toast-container';
        document.body.appendChild(c);
        return c;
    })();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- SCORE RING ANIMATION ---
function animateRing(el, score) {
    const ring = el.querySelector('.ring-progress');
    const valueText = el.querySelector('.ring-number');
    if (!ring) return;
    
    const circumference = 2 * Math.PI * 36; // Based on r=36 in full detail prompt
    const offset = circumference * (1 - score / 100);
    
    ring.style.strokeDashoffset = offset;
    
    // Color logic
    let color = '#EF4444'; // Red
    if (score >= 40) color = '#F59E0B'; // Amber
    if (score >= 70) color = '#10B981'; // Green
    
    ring.style.stroke = color;
    if (valueText) valueText.style.color = color;
}

// --- COUNTER ANIMATION ---
function animateCounter(el, target) {
    let start = 0;
    const duration = 1000;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        
        const current = Math.floor(ease * target);
        el.textContent = current.toLocaleString();
        
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// --- API WRAPPER ---
async function apiCall(url, options = {}) {
    try {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        
        let data;
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await res.json();
        } else {
            const text = await res.text();
            data = { error: `Server error (${res.status}): ${text.substring(0, 50)}...` };
        }
        
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    } catch (err) {
        showToast(err.message, 'error');
        throw err;
    }
}

// --- AUTH LOGIC ---
async function initAuth(formId, endpoint) {
    const form = document.getElementById(formId);
    if (!form) return;
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="shimmer" style="padding: 4px 12px; border-radius: 4px;">Processing...</span>';
        
        const formData = new FormData(form);
        const body = Object.fromEntries(formData.entries());
        
        try {
            const data = await apiCall(endpoint, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            if (data.redirect) window.location.href = data.redirect;
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };
}

// --- DASHBOARD INIT ---
async function initDashboard() {
    const jobList = document.getElementById('job-list');
    if (!jobList) return;
    
    try {
        const jobs = await apiCall('/api/jobs');
        jobList.innerHTML = '';
        
        if (jobs.length === 0) {
            jobList.innerHTML = '<div class="glass-card" style="padding: 40px; text-align: center; grid-column: 1/-1;">No jobs yet. Click the button above to create one.</div>';
            return;
        }
        
        jobs.forEach((job, index) => {
            const card = document.createElement('div');
            card.className = 'glass-card slide-up';
            card.style.padding = '32px';
            card.style.animationDelay = `${index * 0.1}s`;
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
                    <div style="overflow: hidden;">
                        <h3 style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: var(--text-primary); margin-bottom: 8px;">${job.title}</h3>
                        <div style="display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            Posted ${new Date(job.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                    <div class="badge badge-blue" style="flex-shrink: 0;">${job.applicantCount} Applicants</div>
                </div>
                
                <div style="display: flex; gap: 12px; margin-top: auto;">
                    <a href="/hr/jobs/${job.id}" class="btn btn-primary" style="flex: 2; height: 44px; font-size: 13px; font-weight: 700; text-decoration: none; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.2;">
                        <span style="display: flex; align-items: center; gap: 8px;">
                            View Applicants
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </span>
                        <span style="font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.7); margin-top: 2px;">Check who applied</span>
                    </a>
                    <button class="btn btn-ghost delete-job" data-id="${job.id}" style="flex: 1; height: 44px; font-size: 13px; font-weight: 600; color: var(--accent-red-lt); display: flex; flex-direction: column; line-height: 1.2;">
                        Close Job
                        <span style="font-size: 9px; opacity: 0.6;">Hide posting</span>
                    </button>
                </div>
            `;
            jobList.appendChild(card);
        });
        
        // Delete listeners
        document.querySelectorAll('.delete-job').forEach(btn => {
            btn.onclick = async () => {
                if (confirm('Delete this job?')) {
                    await apiCall(`/api/jobs/${btn.dataset.id}`, { method: 'DELETE' });
                    initDashboard();
                }
            };
        });
    } catch (e) {}
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js')
            .then(() => console.log('ResumeAI Service Worker Registered'))
            .catch(err => console.error('SW Registration Failed:', err));
    }

    const path = window.location.pathname;
    if (path === '/hr/login') initAuth('login-form', '/api/hr/login');
    if (path === '/hr/register') initAuth('register-form', '/api/hr/register');
    if (path === '/hr/dashboard') {
        initDashboard();
        // Job creation modal logic
        const createBtn = document.getElementById('create-job-btn');
        if (createBtn) createBtn.onclick = () => document.getElementById('modal-overlay').classList.add('show');
    }
});
