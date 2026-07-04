// --- Constants & Variables ---
const TIMER_MODES = {
    pomodoro: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60
};

let currentMode = 'pomodoro';
let timeLeft = TIMER_MODES[currentMode];
let timerInterval = null;
let isRunning = false;
let totalFocusTime = 0; // in seconds
let dailyHistory = {}; // stores focus time (in seconds) per date string
let strictModeEnabled = false;

let tasks = [];
let chartInstance = null; // for Chart.js
let tagChartInstance = null; // for Doughnut Chart
let activeTaskId = null; // for task estimation tracking

// Ambient Audio Globals
let ambientCtx = null;
let ambientNode = null;
let ambientPlaying = false;

// --- DOM Elements ---
// Navigation
const navLinks = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view-section');

// Settings Elements
const settingPomodoro = document.getElementById('setting-pomodoro');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const clearDataBtn = document.getElementById('clear-data-btn');
const statTotalTime = document.getElementById('stat-total-time');
const statTotalTasks = document.getElementById('stat-total-tasks');

// Timer Elements
const timeLeftEl = document.getElementById('time-left');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const modeBtns = document.querySelectorAll('.mode-btn');
const circle = document.querySelector('.progress-ring__circle');

// Task Elements
const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');

// Stats Elements
const statTasks = document.getElementById('stat-tasks');
const statTime = document.getElementById('stat-time');
const currentDateEl = document.getElementById('current-date');

// --- Initialization ---
function init() {
    loadData();
    updateDate();
    initCircle();
    updateTimerDisplay();
    renderTasks();
    updateStats();
    renderTree();
    renderJournals();
}

function renderTree() {
    const treeIcon = document.getElementById('focus-tree-icon');
    const treeStatus = document.getElementById('focus-tree-status');
    if (!treeIcon || !treeStatus) return;
    
    // Count successful pomodoros in current tasks
    let totalPoms = tasks.reduce((sum, t) => sum + (t.completedPoms || 0), 0);
    
    let emoji = '🌱';
    let status = 'Keep focusing to grow your tree!';
    
    if (totalPoms >= 50) { emoji = '🌲'; status = 'A magnificent ancient forest!'; }
    else if (totalPoms >= 20) { emoji = '🌳'; status = 'Your tree is strong and mighty!'; }
    else if (totalPoms >= 10) { emoji = '🌿'; status = 'A healthy young plant!'; }
    else if (totalPoms >= 5) { emoji = '🪴'; status = 'It has sprouted leaves!'; }
    else if (totalPoms >= 1) { emoji = '🌱'; status = 'A tiny sprout appears!'; }
    
    if (treeIcon.textContent !== emoji) {
        treeIcon.textContent = emoji;
        treeIcon.classList.remove('tree-grow-anim');
        void treeIcon.offsetWidth; // trigger reflow
        treeIcon.classList.add('tree-grow-anim');
    }
    treeStatus.textContent = status;
}

function renderJournals() {
    const container = document.getElementById('journal-history-container');
    if (!container) return;
    
    container.innerHTML = '';
    const today = new Date().toDateString();
    
    // dailyHistory structure change: previously it was just a number. 
    // Now it needs to handle an object if it has journals.
    // To remain backwards compatible, we will store journals in a separate `journals` array.
    
    // Retrieve journals from local storage or memory
    const saved = localStorage.getItem('protrack_data');
    let allJournals = [];
    if (saved) {
        try {
            const data = JSON.parse(saved);
            allJournals = data.journals || [];
        } catch(e) {}
    }
    
    if (allJournals.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">No reflections yet. Complete a Pomodoro to add one!</p>';
        return;
    }
    
    // Display last 5 journals
    allJournals.slice(-5).reverse().forEach(j => {
        const div = document.createElement('div');
        div.className = 'journal-entry';
        div.innerHTML = `<span class="time">${j.date}</span>${escapeHTML(j.text)}`;
        container.appendChild(div);
    });
}

// --- Date & Stats ---
function updateDate() {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    currentDateEl.textContent = new Date().toLocaleDateString('en-US', options);
}

function updateStats() {
    const completedTasks = tasks.filter(t => t.completed).length;
    statTasks.textContent = `${completedTasks}/${tasks.length}`;
    
    const hours = Math.floor(totalFocusTime / 3600);
    const minutes = Math.floor((totalFocusTime % 3600) / 60);
    statTime.textContent = `${hours}h ${minutes}m`;
    
    // Update chart and period stats if it exists
    renderChart();
}

function renderChart() {
    const ctx = document.getElementById('statsChart');
    if (!ctx || typeof Chart === 'undefined') return;

    const periodSelect = document.getElementById('stats-period');
    const days = periodSelect ? parseInt(periodSelect.value) : 7;

    const labels = [];
    const data = [];
    let periodFocusSeconds = 0;
    
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toDateString();
        
        let label = '';
        if (days <= 7) {
            label = d.toLocaleDateString('en-US', { weekday: 'short' });
        } else {
            label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        
        labels.push(label);
        
        const seconds = dailyHistory[dateStr] || 0;
        periodFocusSeconds += seconds;
        data.push(Math.round(seconds / 60));
    }
    
    // Update the Stat Cards for the Period
    const phours = Math.floor(periodFocusSeconds / 3600);
    const pminutes = Math.floor((periodFocusSeconds % 3600) / 60);
    if (statTotalTime) statTotalTime.textContent = `${phours}h ${pminutes}m`;
    
    // Calculate tasks completed in period
    let periodTasksCompleted = 0;
    const now = new Date();
    now.setHours(0,0,0,0);
    const cutoffTime = now.getTime() - ((days - 1) * 24 * 60 * 60 * 1000);
    
    tasks.forEach(t => {
        if (t.completed) {
            if (t.completedDate) {
                if (new Date(t.completedDate).getTime() >= cutoffTime) periodTasksCompleted++;
            } else {
                periodTasksCompleted++;
            }
        }
    });
    
    if (statTotalTasks) statTotalTasks.textContent = periodTasksCompleted;

    // --- Heatmap Generation ---
    const heatmapContainer = document.getElementById('heatmap-container');
    if (heatmapContainer) {
        heatmapContainer.innerHTML = '';
        const totalDays = 7 * 15; // 15 weeks
        
        for (let i = totalDays - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toDateString();
            
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.title = dateStr;
            
            const seconds = dailyHistory[dateStr] || 0;
            const poms = Math.round(seconds / (25 * 60)); // rough pomodoro equivalent
            
            if (poms >= 10) cell.dataset.level = "4";
            else if (poms >= 6) cell.dataset.level = "3";
            else if (poms >= 3) cell.dataset.level = "2";
            else if (poms >= 1) cell.dataset.level = "1";
            else cell.dataset.level = "0";
            
            if (seconds > 0) {
                cell.title += ` - ${Math.round(seconds / 60)} min focused`;
            }
            heatmapContainer.appendChild(cell);
        }
    }

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Focus Time (Minutes)',
                data: data,
                backgroundColor: (context) => {
                    const chartCtx = context.chart.ctx;
                    const gradient = chartCtx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.5)');
                    gradient.addColorStop(1, 'rgba(138, 43, 226, 0.05)');
                    return gradient;
                },
                borderColor: '#00f2fe',
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#00f2fe',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [5, 5] },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#00f2fe',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false
                }
            }
        }
    });
    
    // --- Render Tag Chart ---
    const tagCtx = document.getElementById('tagChart');
    if (!tagCtx) return;
    
    if (tagChartInstance) tagChartInstance.destroy();
    
    let tagPoms = {};
    tasks.forEach(t => {
        if (t.completedPoms && t.completedPoms > 0) {
            let cat = t.category || 'Uncategorized';
            tagPoms[cat] = (tagPoms[cat] || 0) + t.completedPoms;
        }
    });
    
    const tagLabels = Object.keys(tagPoms);
    const tagData = Object.values(tagPoms);
    const tagColors = tagLabels.map(getTagColor);
    
    if (tagLabels.length === 0) {
        tagLabels.push('No Data');
        tagData.push(1);
        tagColors.push('rgba(255,255,255,0.1)');
    }
    
    tagChartInstance = new Chart(tagCtx, {
        type: 'doughnut',
        data: {
            labels: tagLabels,
            datasets: [{
                data: tagData,
                backgroundColor: tagColors,
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 20, usePointStyle: true } },
                tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', titleColor: '#fff', padding: 10 }
            }
        }
    });
}

// --- Timer Logic ---
function initCircle() {
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
}

function setProgress(percent) {
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// --- Chime Sound ---
let audioCtx = null;
function playChime() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 1.5);
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.8, audioCtx.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 3);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    timeLeftEl.textContent = timeText;
    
    // Update progress ring
    const totalTime = TIMER_MODES[currentMode];
    const percent = ((totalTime - timeLeft) / totalTime) * 100;
    setProgress(percent);
    
    // Draw to PiP Canvas
    const pipCanvas = document.getElementById('pip-canvas');
    if (pipCanvas && isPipActive) {
        const ctx = pipCanvas.getContext('2d');
        ctx.fillStyle = '#0f172a'; // bg-color
        ctx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
        
        ctx.fillStyle = '#8a2be2'; // accent-color
        ctx.beginPath();
        ctx.arc(200, 200, 180, 0, 2 * Math.PI);
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(200, 200, 180, -0.5 * Math.PI, (-0.5 * Math.PI) + (2 * Math.PI * (1 - (percent/100))));
        ctx.strokeStyle = '#8a2be2';
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 80px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timeText, 200, 200);
        
        ctx.font = '30px Outfit, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(currentMode === 'pomodoro' ? 'Focus' : 'Break', 200, 280);
    }
}

function toggleTimer() {
    if (isRunning) {
        clearInterval(timerInterval);
        startBtn.innerHTML = '<i class="ph ph-play"></i> Start';
        startBtn.classList.remove('secondary');
        startBtn.classList.add('primary');
        if (ambientPlaying) stopAmbient();
    } else {
        startBtn.innerHTML = '<i class="ph ph-pause"></i> Pause';
        startBtn.classList.remove('primary');
        startBtn.classList.add('secondary');
        
        const ambientToggle = document.getElementById('ambient-toggle');
        if (ambientToggle && ambientToggle.checked) {
            playAmbient(document.getElementById('ambient-select').value);
        }
        
        timerInterval = setInterval(() => {
            timeLeft--;
            
            // Only add to focus time if in pomodoro mode
            if (currentMode === 'pomodoro') {
                totalFocusTime++;
                if (totalFocusTime % 60 === 0) {
                    saveData();
                    updateStats();
                }
            }

            updateTimerDisplay();

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                playNotification();
                timeLeft = 0;
                updateTimerDisplay();
                isRunning = false;
                startBtn.innerHTML = '<i class="ph ph-play"></i> Start';
                startBtn.classList.remove('secondary');
                startBtn.classList.add('primary');
                
                // Increment pomodoro for active task
                if (currentMode === 'pomodoro') {
                    if (window.confetti) {
                        confetti({
                            particleCount: 150,
                            spread: 70,
                            origin: { y: 0.6 }
                        });
                    }
                    updateXP(50);
                    if (activeTaskId) {
                        const activeTask = tasks.find(t => t.id === activeTaskId);
                        if (activeTask && !activeTask.completed) {
                            activeTask.completedPoms = (activeTask.completedPoms || 0) + 1;
                            saveData();
                            renderTasks();
                        }
                    }
                    renderTree();
                    setTimeout(openJournalModal, 1500); // Open journal after confetti
                }
                playChime();
            }
        }, 1000);
    }
    isRunning = !isRunning;
}

function resetTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    timeLeft = TIMER_MODES[currentMode];
    startBtn.innerHTML = '<i class="ph ph-play"></i> Start';
    startBtn.classList.remove('secondary');
    startBtn.classList.add('primary');
    updateTimerDisplay();
    if (ambientPlaying) stopAmbient();
}

function changeMode(mode) {
    currentMode = mode;
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    resetTimer();
}

// --- Ambient Sound Logic ---
function playAmbient(type) {
    if (!ambientCtx) ambientCtx = new (window.AudioContext || window.webkitAudioContext)();
    stopAmbient();
    if (ambientCtx.state === 'suspended') ambientCtx.resume();
    ambientPlaying = true;
    
    if (type === 'binaural') {
        ambientNode = {
            osc1: ambientCtx.createOscillator(),
            osc2: ambientCtx.createOscillator(),
            stop: function() { this.osc1.stop(); this.osc2.stop(); }
        };
        ambientNode.osc1.frequency.value = 200;
        ambientNode.osc2.frequency.value = 210;
        let merger = ambientCtx.createChannelMerger(2);
        ambientNode.osc1.connect(merger, 0, 0);
        ambientNode.osc2.connect(merger, 0, 1);
        let gain = ambientCtx.createGain();
        gain.gain.value = 0.1;
        merger.connect(gain);
        gain.connect(ambientCtx.destination);
        ambientNode.osc1.start();
        ambientNode.osc2.start();
        return;
    }

    let bufferSize = ambientCtx.sampleRate * 2;
    let noiseBuffer = ambientCtx.createBuffer(1, bufferSize, ambientCtx.sampleRate);
    let output = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        let white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
    }

    ambientNode = ambientCtx.createBufferSource();
    ambientNode.buffer = noiseBuffer;
    ambientNode.loop = true;
    let filter = ambientCtx.createBiquadFilter();
    filter.type = 'lowpass';
    
    if (type === 'brownNoise') {
        filter.frequency.value = 400;
    } else if (type === 'rain') {
        filter.frequency.value = 1000;
        let hp = ambientCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 500;
        ambientNode.connect(hp);
        hp.connect(filter);
    }
    
    let gainNode = ambientCtx.createGain();
    gainNode.gain.value = type === 'rain' ? 0.2 : 0.5;
    
    if (type !== 'rain') {
        ambientNode.connect(filter);
    }
    filter.connect(gainNode);
    gainNode.connect(ambientCtx.destination);
    ambientNode.start(0);
}

function stopAmbient() {
    if (ambientNode) {
        try { ambientNode.stop(); } catch(e){}
        ambientNode = null;
    }
    ambientPlaying = false;
}
// --- XP and Gamification ---
let xp = 0;
let level = 1;

function updateXP(amount) {
    xp += amount;
    level = Math.floor(xp / 250) + 1;
    saveData();
    renderXP();
}

function renderXP() {
    const xpDisplay = document.getElementById('xp-display');
    const levelDisplay = document.getElementById('level-display');
    const xpBar = document.getElementById('xp-bar');
    if (xpDisplay && levelDisplay && xpBar) {
        const nextLevelXP = level * 250;
        const currentLevelXP = (level - 1) * 250;
        const progress = xp - currentLevelXP;
        const required = 250;
        xpDisplay.textContent = `${progress} / ${required} XP`;
        
        let title = "Novice";
        if (level >= 2) title = "Apprentice";
        if (level >= 5) title = "Pro";
        if (level >= 10) title = "Master";
        if (level >= 20) title = "Grandmaster";
        levelDisplay.textContent = `Lv. ${level} ${title}`;
        
        xpBar.style.width = `${(progress / required) * 100}%`;
    }
}

// --- Tag Colors ---
function getTagColor(tagStr) {
    if (!tagStr) return '#8a2be2';
    let hash = 0;
    for (let i = 0; i < tagStr.length; i++) {
        hash = tagStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 80%, 40%)`;
}

// --- Subtask Logic ---
window.addSubtask = function(taskId, event) {
    if (event) event.stopPropagation();
    const title = prompt("Enter sub-task:");
    if (title && title.trim() !== "") {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            if (!task.subtasks) task.subtasks = [];
            task.subtasks.push({ title: title.trim(), completed: false });
            saveData();
            renderTasks();
        }
    }
}

window.toggleSubtask = function(taskId, subtaskIdx, event) {
    if (event) event.stopPropagation();
    const task = tasks.find(t => t.id === taskId);
    if (task && task.subtasks && task.subtasks[subtaskIdx]) {
        task.subtasks[subtaskIdx].completed = !task.subtasks[subtaskIdx].completed;
        saveData();
        renderTasks();
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    timeLeft = TIMER_MODES[currentMode];
    startBtn.innerHTML = '<i class="ph ph-play"></i> Start';
    startBtn.classList.remove('secondary');
    startBtn.classList.add('primary');
    updateTimerDisplay();
}

function changeMode(mode) {
    currentMode = mode;
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    resetTimer();
}

function playNotification() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.log("Audio not supported or interaction needed first.");
    }
}

// --- Task Logic ---
window.setActiveTask = function(id, event) {
    // Prevent activating when clicking checkbox
    if (event && event.target.closest('.checkbox')) return;
    
    if (activeTaskId === id) {
        activeTaskId = null; // deselect
    } else {
        activeTaskId = id;
    }
    renderTasks();
};

// --- Drag and Drop Logic ---
let draggedTaskId = null;

function handleDragStart(e) {
    draggedTaskId = this.dataset.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}
function handleDragEnter(e) {
    e.preventDefault();
    this.style.borderTop = '2px solid var(--accent-color)';
}
function handleDragLeave(e) {
    this.style.borderTop = '';
}
function handleDrop(e) {
    e.stopPropagation();
    this.style.borderTop = '';
    const dropTargetId = this.dataset.id;
    
    if (draggedTaskId && draggedTaskId !== dropTargetId) {
        const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
        const targetIndex = tasks.findIndex(t => t.id === dropTargetId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
            const draggedTask = tasks.splice(draggedIndex, 1)[0];
            tasks.splice(targetIndex, 0, draggedTask);
            saveData();
            renderTasks();
        }
    }
    return false;
}
document.addEventListener('dragend', (e) => {
    if (e.target && e.target.classList) {
        e.target.classList.remove('dragging');
    }
});

function renderTasks() {
    taskList.innerHTML = '';
    
    if (tasks.length === 0) {
        taskList.innerHTML = '<li style="text-align:center; color:var(--text-secondary); margin-top:2rem;">No tasks yet. Enjoy your day!</li>';
        return;
    }

    tasks.forEach(task => {
        const li = document.createElement('li');
        const isActive = activeTaskId === task.id ? 'active-task' : '';
        const isCompleted = task.completed ? 'completed' : '';
        li.className = `task-item ${isCompleted} ${isActive}`;
        li.setAttribute('draggable', 'true');
        li.dataset.id = task.id;
        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragenter', handleDragEnter);
        li.addEventListener('dragleave', handleDragLeave);
        
        const tagBadge = task.category ? `<span class="custom-tag" style="background-color: ${getTagColor(task.category)};">${escapeHTML(task.category)}</span>` : '';
        const poms = task.estimatedPoms ? `<div class="task-pomodoros" title="Completed / Estimated Pomodoros">🍅 ${task.completedPoms || 0}/${task.estimatedPoms}</div>` : '';
        
        let subtasksHTML = '';
        if (task.subtasks && task.subtasks.length > 0) {
            subtasksHTML = '<ul class="subtasks-list">';
            task.subtasks.forEach((st, idx) => {
                const stCompleted = st.completed ? 'completed' : '';
                const stChecked = st.completed ? 'checked' : '';
                subtasksHTML += `
                    <li class="subtask-item ${stCompleted}" onclick="event.stopPropagation()">
                        <input type="checkbox" ${stChecked} onchange="toggleSubtask('${task.id}', ${idx}, event)">
                        <span>${escapeHTML(st.title)}</span>
                    </li>
                `;
            });
            subtasksHTML += '</ul>';
        }
        
        li.innerHTML = `
            <div class="task-content" onclick="setActiveTask('${task.id}', event)" style="flex: 1; display: flex; align-items: flex-start; justify-content: space-between;">
                <div style="display: flex; flex-direction: column; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div class="checkbox" onclick="toggleTask('${task.id}')"></div>
                        <div>
                            ${tagBadge}
                            <span class="task-text">${escapeHTML(task.text)}</span>
                        </div>
                    </div>
                    ${subtasksHTML}
                    <button class="add-subtask-btn" onclick="addSubtask('${task.id}', event)"><i class="ph ph-plus"></i> Add Sub-task</button>
                </div>
                <div class="task-actions" style="margin-left: 1rem; align-items: center; display: flex;">${poms}</div>
            </div>
            <button class="delete-btn" onclick="deleteTask('${task.id}')" aria-label="Delete Task">
                <i class="ph ph-trash"></i>
            </button>
        `;
        
        taskList.appendChild(li);
    });
}

function addTask(e) {
    e.preventDefault();
    const text = taskInput.value.trim();
    const estInput = document.getElementById('task-est');
    const catInput = document.getElementById('task-category');
    if (!text) return;

    const newTask = {
        id: Date.now().toString(),
        text: text,
        completed: false,
        estimatedPoms: parseInt(estInput ? estInput.value : 1),
        completedPoms: 0,
        category: catInput ? catInput.value : 'Work',
        subtasks: []
    };

    tasks.push(newTask);
    taskInput.value = '';
    if (estInput) estInput.value = '1';
    
    saveData();
    renderTasks();
    updateStats();
}

window.toggleTask = function(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        if (task.completed) {
            task.completedDate = new Date().toDateString();
            if (activeTaskId === id) activeTaskId = null;
        } else {
            delete task.completedDate;
        }
        saveData();
        renderTasks();
        updateStats();
    }
};

window.deleteTask = function(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveData();
    renderTasks();
    updateStats();
};

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// --- Local Storage ---
function saveData() {
    // Update today's history before saving
    const today = new Date().toDateString();
    dailyHistory[today] = totalFocusTime;

    // Retrieve existing journals to save
    let allJournals = [];
    const existing = localStorage.getItem('protrack_data');
    if (existing) {
        try {
            const data = JSON.parse(existing);
            if (data.journals) allJournals = data.journals;
        } catch(e) {}
    }
    // Only update memory copy if we just added a journal

    const data = {
        tasks: tasks,
        totalFocusTime: totalFocusTime,
        dailyHistory: dailyHistory,
        strictModeEnabled: strictModeEnabled,
        lastSavedDate: today,
        xp: xp,
        level: level,
        journals: allJournals
    };
    localStorage.setItem('protrack_data', JSON.stringify(data));
}

function loadData() {
    const saved = localStorage.getItem('protrack_data');
    const today = new Date().toDateString();
    if (saved) {
        try {
            const data = JSON.parse(saved);
            dailyHistory = data.dailyHistory || {};
            strictModeEnabled = !!data.strictModeEnabled;
            const strictCheckbox = document.getElementById('setting-strict');
            if (strictCheckbox) strictCheckbox.checked = strictModeEnabled;
            
            // Check if it's a new day, if so, reset focus time but keep tasks
            if (data.lastSavedDate !== today) {
                totalFocusTime = 0;
                // Ensure today exists in history
                dailyHistory[today] = 0;
            } else {
                totalFocusTime = data.totalFocusTime || 0;
            }
            
            tasks = data.tasks || [];
            xp = data.xp || 0;
            level = data.level || 1;
        } catch (e) {
            console.error('Error loading data', e);
        }
    } else {
        dailyHistory[today] = 0;
    }
}

// --- Navigation Logic ---
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active class from all links
        navLinks.forEach(l => l.classList.remove('active'));
        // Add active class to clicked link
        link.classList.add('active');
        
        // Hide all views
        views.forEach(view => view.classList.add('hidden-view'));
        
        // Show target view
        const targetId = link.getAttribute('data-target');
        document.getElementById(targetId).classList.remove('hidden-view');
        
        if (targetId === 'view-statistics') {
            renderChart();
        }
    });
});

// --- Settings Logic ---
if (settingPomodoro) {
    settingPomodoro.addEventListener('change', () => {
        const newPomodoro = parseInt(settingPomodoro.value);
        if (newPomodoro > 0) {
            TIMER_MODES.pomodoro = newPomodoro * 60;
            if (currentMode === 'pomodoro' && !isRunning) {
                timeLeft = TIMER_MODES.pomodoro;
                updateTimerDisplay();
            }
            saveData();
        }
    });
}

const strictCheckbox = document.getElementById('setting-strict');
if (strictCheckbox) {
    strictCheckbox.addEventListener('change', () => {
        strictModeEnabled = strictCheckbox.checked;
        saveData();
    });
}

if (clearDataBtn) {
    clearDataBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete all tasks and stats?')) {
            localStorage.removeItem('protrack_data');
            tasks = [];
            totalFocusTime = 0;
            renderTasks();
            updateStats();
            alert('Data cleared!');
        }
    });
}

// --- Event Listeners ---
startBtn.addEventListener('click', toggleTimer);
resetBtn.addEventListener('click', resetTimer);
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => changeMode(btn.dataset.mode));
});
taskForm.addEventListener('submit', addTask);

// --- Command Palette Logic ---
const cmdOverlay = document.getElementById('command-palette-overlay');
const cmdInput = document.getElementById('cmd-input');
const cmdList = document.getElementById('cmd-list');

const commands = [
    { label: 'Start Pomodoro', action: () => { changeMode('pomodoro'); toggleTimer(); } },
    { label: 'Take Short Break', action: () => changeMode('shortBreak') },
    { label: 'Take Long Break', action: () => changeMode('longBreak') },
    { label: 'Go to Dashboard', action: () => navLinks[0].click() },
    { label: 'Go to Statistics', action: () => navLinks[1].click() },
    { label: 'Go to Settings', action: () => navLinks[2].click() },
    { label: 'Toggle Ambient Sound', action: () => { const t = document.getElementById('ambient-toggle'); if(t) { t.checked = !t.checked; if(t.checked) playAmbient(document.getElementById('ambient-select').value); else stopAmbient(); } } },
    { label: 'Add Task', action: () => { navLinks[0].click(); setTimeout(() => document.getElementById('task-input').focus(), 100); } }
];

let selectedCmdIndex = 0;

function renderCommands(query = '') {
    if (!cmdList) return;
    cmdList.innerHTML = '';
    const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));
    
    if (filtered.length === 0) {
        cmdList.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary); text-align: center;">No commands found</div>';
        return;
    }
    
    if (selectedCmdIndex >= filtered.length) selectedCmdIndex = 0;
    
    filtered.forEach((cmd, i) => {
        const div = document.createElement('div');
        div.className = `cmd-item ${i === selectedCmdIndex ? 'active' : ''}`;
        div.innerHTML = `<span>${cmd.label}</span> <kbd>Enter</kbd>`;
        div.addEventListener('click', () => {
            cmd.action();
            closeCommandPalette();
        });
        div.addEventListener('mouseenter', () => {
            selectedCmdIndex = i;
            renderCommands(query); // re-render to update active class
        });
        cmdList.appendChild(div);
    });
}

function openCommandPalette() {
    if (!cmdOverlay || !cmdInput) return;
    cmdOverlay.style.display = 'flex';
    cmdInput.value = '';
    selectedCmdIndex = 0;
    renderCommands();
    setTimeout(() => cmdInput.focus(), 50);
}

function closeCommandPalette() {
    if (cmdOverlay) cmdOverlay.style.display = 'none';
}

if (cmdOverlay && cmdInput) {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (cmdOverlay.style.display === 'flex') closeCommandPalette();
            else openCommandPalette();
        } else if (e.key === 'Escape' && cmdOverlay.style.display === 'flex') {
            closeCommandPalette();
        }
    });

    cmdInput.addEventListener('keydown', (e) => {
        const query = cmdInput.value;
        const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (selectedCmdIndex < filtered.length - 1) selectedCmdIndex++;
            renderCommands(query);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selectedCmdIndex > 0) selectedCmdIndex--;
            renderCommands(query);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[selectedCmdIndex]) {
                filtered[selectedCmdIndex].action();
                closeCommandPalette();
            }
        }
    });

    cmdInput.addEventListener('input', () => {
        selectedCmdIndex = 0;
        renderCommands(cmdInput.value);
    });

    cmdOverlay.addEventListener('click', (e) => {
        if (e.target === cmdOverlay) closeCommandPalette();
    });
}

// --- Journaling Logic ---
const journalOverlay = document.getElementById('journal-modal-overlay');
const journalInput = document.getElementById('journal-input');
const journalSaveBtn = document.getElementById('journal-save-btn');
const journalSkipBtn = document.getElementById('journal-skip-btn');
// --- Theme Logic ---
function applyTheme(theme) {
    document.body.className = '';
    if (theme !== 'default') {
        document.body.classList.add(`theme-${theme}`);
    }
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = theme;
    localStorage.setItem('protrack_theme', theme);
}

const themeSelect = document.getElementById('theme-select');
if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
        applyTheme(e.target.value);
    });
}
const savedTheme = localStorage.getItem('protrack_theme') || 'default';
applyTheme(savedTheme);

// --- Zen Mode Logic ---
const zenBtn = document.getElementById('zen-mode-btn');
let zenActive = false;
if (zenBtn) {
    zenBtn.addEventListener('click', () => {
        zenActive = !zenActive;
        if (zenActive) {
            document.body.classList.add('zen-active');
            zenBtn.innerHTML = '<i class="ph ph-corners-in"></i>';
        } else {
            document.body.classList.remove('zen-active');
            zenBtn.innerHTML = '<i class="ph ph-corners-out"></i>';
        }
    });
}
function openJournalModal() {
    if (!journalOverlay || !journalInput) return;
    journalOverlay.style.display = 'flex';
    journalInput.value = '';
    setTimeout(() => journalInput.focus(), 50);
}

function closeJournalModal() {
    if (journalOverlay) journalOverlay.style.display = 'none';
}

if (journalOverlay) {
    journalSaveBtn.addEventListener('click', () => {
        const text = journalInput.value.trim();
        if (text) {
            // Save to localStorage directly
            const saved = localStorage.getItem('protrack_data');
            let allJournals = [];
            let data = {};
            if (saved) {
                try {
                    data = JSON.parse(saved);
                    allJournals = data.journals || [];
                } catch(e) {}
            }
            
            const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            allJournals.push({ date: timeStr, text: text });
            data.journals = allJournals;
            localStorage.setItem('protrack_data', JSON.stringify(data));
            renderJournals();
        }
        closeJournalModal();
    });

    journalSkipBtn.addEventListener('click', closeJournalModal);
    
    journalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') journalSaveBtn.click();
        else if (e.key === 'Escape') closeJournalModal();
    });
}

// --- Picture-in-Picture Logic ---
const pipBtn = document.getElementById('pip-btn');
const pipCanvas = document.getElementById('pip-canvas');
const pipVideo = document.getElementById('pip-video');
let isPipActive = false;

if (pipBtn && pipCanvas && pipVideo) {
    pipBtn.addEventListener('click', async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                return;
            }
            isPipActive = true;
            updateTimerDisplay(); // Initial draw
            
            const stream = pipCanvas.captureStream(30);
            pipVideo.srcObject = stream;
            
            await pipVideo.play();
            await pipVideo.requestPictureInPicture();
        } catch (error) {
            console.error('PiP failed', error);
            alert('Picture-in-Picture is not supported or failed to start.');
            isPipActive = false;
        }
    });

    pipVideo.addEventListener('leavepictureinpicture', () => {
        isPipActive = false;
    });
}

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered', reg.scope))
            .catch(err => console.error('SW Registration Failed', err));
    });
}

const statsPeriodSelect = document.getElementById('stats-period');
if (statsPeriodSelect) {
    statsPeriodSelect.addEventListener('change', () => {
        if (chartInstance) {
            renderChart();
        }
    });
}

// Strict Mode Logic
document.addEventListener("visibilitychange", () => {
    if (document.hidden && isRunning && strictModeEnabled) {
        // Pause timer
        toggleTimer();
        alert("Strict Mode: Timer paused because you left the tab!");
    }
});

// --- Daily Quotes Logic ---
const quotes = [
    "Focus on being productive instead of busy.",
    "The secret of getting ahead is getting started.",
    "Don't stop when you're tired. Stop when you're done.",
    "Great things are not done by impulse, but by a series of small things brought together.",
    "Your future is created by what you do today, not tomorrow.",
    "It always seems impossible until it's done.",
    "Starve your distractions, feed your focus."
];

function displayRandomQuote() {
    const quoteEl = document.getElementById('daily-quote-text');
    if (quoteEl) {
        const randomIndex = Math.floor(Math.random() * quotes.length);
        quoteEl.textContent = `"${quotes[randomIndex]}"`;
    }
}



// --- Data Backup (Export/Import) ---
const exportBtn = document.getElementById('export-btn');
const importBtnProxy = document.getElementById('import-btn-proxy');
const importFile = document.getElementById('import-file');

if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        const saved = localStorage.getItem('protrack_data');
        if (!saved) {
            alert('No data to export.');
            return;
        }
        const blob = new Blob([saved], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `protrack_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

if (importBtnProxy && importFile) {
    importBtnProxy.addEventListener('click', () => {
        importFile.click();
    });
    importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data && typeof data === 'object') {
                    localStorage.setItem('protrack_data', JSON.stringify(data));
                    alert('Backup imported successfully! The app will reload to apply changes.');
                    window.location.reload();
                } else {
                    alert('Invalid backup file format.');
                }
            } catch (err) {
                alert('Failed to read the backup file.');
            }
        };
        reader.readAsText(file);
    });
}

// Start
displayRandomQuote();
loadData(); // Ensure loadData happens before renderXP
renderXP();
init();
