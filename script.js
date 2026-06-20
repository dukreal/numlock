let config = {
    totalSlots: 10,
    maxNumber: 1000,
    initialSkips: 0
};

let slots = [];
let currentRoll = null;
let gameOver = false;
let _inputLog = ""; 
let audioCtx;
let currentScore = 0;
let remainingSkips = 0;
let totalSkippedDuplicates = 0;
let confettiActive = false;
let forcedRolls = []; 
let isRolling = false;
let _dm = false; 

const mainMenu = document.getElementById('main-menu');
const gameInterface = document.getElementById('game-interface');
const slotsGrid = document.getElementById('slots-grid');
const rollBtn = document.getElementById('roll-btn');
const rollDisplay = document.getElementById('current-roll-display');
const skipBtn = document.getElementById('skip-btn');
const skipCountSpan = document.getElementById('skip-count');
const gameModeDisplay = document.getElementById('game-mode-display');
const endModal = document.getElementById('game-end-modal');
const endTitle = document.getElementById('end-title');
const endMessage = document.getElementById('end-message');
const devIndicator = document.getElementById('dev-indicator');
const resetBtn = document.getElementById('reset-btn');
const topMenuLink = document.getElementById('top-menu-link');

function openModeSelect() {
    document.getElementById('mode-modal').classList.add('visible');
}

function openAbout() {
    document.getElementById('about-modal').classList.add('visible');
}

function closeAllModals() {
    document.querySelectorAll('.overlay').forEach(el => el.classList.remove('visible'));
}

function returnToMenu() {
    closeAllModals();
    init(); 
    gameInterface.style.display = 'none';
    topMenuLink.style.display = 'none';
    mainMenu.style.display = 'flex';
    document.body.className = ''; 
}

function startGame(mode) {
    switch(mode) {
        case 'easy':
            config = { totalSlots: 10, maxNumber: 1000, initialSkips: 3 };
            gameModeDisplay.textContent = "Mode: Easy";
            break;
        case 'medium':
            config = { totalSlots: 10, maxNumber: 1000, initialSkips: 0 };
            gameModeDisplay.textContent = "Mode: Standard";
            break;
        case 'hard':
            config = { totalSlots: 20, maxNumber: 1000, initialSkips: 0 };
            gameModeDisplay.textContent = "Mode: Hard";
            break;
        case 'extreme':
            config = { totalSlots: 10, maxNumber: 100, initialSkips: 0 };
            gameModeDisplay.textContent = "Mode: Extreme (1-100)";
            break;
    }
    closeAllModals();
    mainMenu.style.display = 'none';
    gameInterface.style.display = 'block';
    topMenuLink.style.display = 'block';
    init();
}

function resetGame() {
    closeAllModals();
    init();
}

function init() {
    isRolling = false;
    _dm = false; // Reset dev mode on fresh start
    slotsGrid.innerHTML = '';
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.opacity = 1;

    slots = Array(config.totalSlots).fill(null);
    currentRoll = null;
    gameOver = false;
    _inputLog = "";
    currentScore = 0;
    remainingSkips = config.initialSkips;
    forcedRolls = []; 

    document.body.className = '';
    devIndicator.classList.remove('visible');
    rollDisplay.className = 'number-display'; 
    document.querySelector('.roll-card').classList.remove('rolling'); 
    rollDisplay.textContent = "?";
    rollBtn.disabled = false;

    if (remainingSkips > 0) {
        skipBtn.style.display = 'inline-block';
        skipBtn.disabled = true;
        skipCountSpan.textContent = remainingSkips;
    } else {
        skipBtn.style.display = 'none';
    }

    slotsGrid.className = 'slots-grid';
    if (config.totalSlots > 10) slotsGrid.classList.add('large-grid');

    for (let i = 0; i < config.totalSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.classList.add('slot');
        slotDiv.dataset.index = i; 
        slotDiv.innerHTML = `<span class="slot-idx">${i + 1}</span><span class="slot-val"></span>`;
        slotDiv.addEventListener('click', () => handleSlotClick(i));
        slotsGrid.appendChild(slotDiv);
    }
}

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTick() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime + 0.01;
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.03);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.04);
}

function rollNumber() {
    if (gameOver || currentRoll !== null || isRolling) return;
    isRolling = true;
    initAudio();
    rollBtn.disabled = true;
    if (remainingSkips > 0) skipBtn.disabled = true;

    document.querySelector('.roll-card').classList.add('rolling');
    
    // --- DETERMINE CURRENT TURN STATE ---
    const filledCount = slots.filter(s => s !== null).length;
    const turnNumber = filledCount + 1; // 1 to 10

    // Apply Shake/Color IMMEDIATELY (Before Reveal)
    rollDisplay.className = 'number-display'; // Reset
    if (turnNumber === 8) {
        rollDisplay.classList.add('shake-lvl-1');
    } else if (turnNumber === 9) {
        rollDisplay.classList.add('shake-lvl-2');
    } else if (turnNumber >= 10) {
        rollDisplay.classList.add('shake-lvl-3');
        rollDisplay.classList.add('crit-text'); // RED COLOR
    }

    if (slots.every(s => s !== null)) return;

    let finalResult;
    
    // CHECK FOR CHEAT QUEUE FIRST
    if (forcedRolls.length > 0) {
        finalResult = forcedRolls.shift();
    } else {
        // NORMAL LOGIC
        let safetyCounter = 0;
        while (true) {
            safetyCounter++;
            const rawRand = Math.random() * config.maxNumber;
            finalResult = Math.floor(rawRand) + 1;
            
            if (slots.includes(finalResult)) {
                totalSkippedDuplicates++;
                if (safetyCounter > 5000) break;
                continue;
            }
            
            // SMART SAFETY ONLY IN DEV MODE
            if (_dm && !canPlaceAnywhere(finalResult) && safetyCounter < 50) {
                continue;
            }
            
            break;
        }
    }

    // DETECT IF THIS IS THE LAST TURN (1 SLOT LEFT)
    const isLastTurn = (filledCount === config.totalSlots - 1);

    let currentDelay = 50;
    let step = 0;
    const maxSteps = isLastTurn ? 30 : 12; // Longer spin for friction effect

    function animateRoll() {
        playTick();
        rollDisplay.textContent = Math.floor(Math.random() * config.maxNumber) + 1;
        step++;

        if (step < maxSteps) {
            // Friction Logic for Last Turn
            if (isLastTurn) {
                if (step > 15) {
                    currentDelay = Math.floor(currentDelay * 1.25);
                }
            }
            setTimeout(animateRoll, currentDelay);
        } else {
            // FINISH ROLL
            currentRoll = finalResult;
            rollDisplay.textContent = currentRoll;
            document.querySelector('.roll-card').classList.remove('rolling');
            isRolling = false;
            
            // -- Logic for Color Reset After Reveal (Last Turn) --
            // If it was the last turn (Red/Shake), handle visual result
            if (rollDisplay.classList.contains('crit-text')) {
                if (canPlaceAnywhere(currentRoll)) {
                    // SUCCESS: Turn WHITE (Remove Red)
                    rollDisplay.classList.remove('crit-text');
                } else {
                    // FAIL: Stay RED (crit-text remains)
                }
            }

            if (remainingSkips > 0) skipBtn.disabled = false;

            if (!canPlaceAnywhere(currentRoll)) {
                if (remainingSkips > 0) {
                    shakeUI(skipBtn);
                } else {
                    triggerDeadState();
                }
            } else {
                enableValidSlots(); 
            }
        }
    }

    // Start Animation Loop
    animateRoll();
}

function useSkip() {
    if (remainingSkips <= 0 || currentRoll === null) return;
    remainingSkips--;
    skipCountSpan.textContent = remainingSkips;
    currentRoll = null;
    disableSlots();
    rollNumber(); 
}

skipBtn.addEventListener('click', useSkip);

function canPlaceAnywhere(val) {
    for (let i = 0; i < config.totalSlots; i++) {
        if (slots[i] === null && isValidPlacement(i, val)) {
            return true;
        }
    }
    return false;
}

function handleSlotClick(index) {
    if (gameOver || isRolling) return;
    if (currentRoll === null) {
        shakeUI(rollBtn);
        return;
    }
    if (slots[index] !== null) return; 

    if (isValidPlacement(index, currentRoll)) {
        placeNumber(index, currentRoll);
        
        if (slots.every(s => s !== null)) {
            triggerWin();
        } else {
            currentRoll = null;
            rollDisplay.textContent = "?";
            rollDisplay.className = 'number-display'; // Reset shake
            rollBtn.disabled = false;
            if(remainingSkips > 0) skipBtn.disabled = true;
            disableSlots();
        }
    } else {
        shakeUI(slotsGrid.children[index]);
    }
}

function placeNumber(index, val) {
    slots[index] = val;
    const slotEl = slotsGrid.children[index];
    slotEl.querySelector('.slot-val').textContent = val;
    slotEl.classList.add('filled');
    slotEl.classList.remove('active-target');
    
    currentScore++;
    updatePressure(currentScore);
}

function updatePressure(score) {
    if (gameOver) return;

    document.body.className = '';
    const ratio = score / config.totalSlots;
    
    if (ratio > 0.4) document.body.classList.add('pressure-5');
    if (ratio > 0.6) document.body.classList.add('pressure-6');
    if (ratio > 0.7) document.body.classList.add('pressure-7');
    if (ratio > 0.8) document.body.classList.add('pressure-8');
    if (ratio > 0.9) document.body.classList.add('pressure-9');
}

function isValidPlacement(index, val) {
    for (let i = 0; i < index; i++) 
        if (slots[i] !== null && slots[i] >= val) return false;
    for (let i = index + 1; i < config.totalSlots; i++) 
        if (slots[i] !== null && slots[i] <= val) return false;
    return true;
}

function enableValidSlots() {
    if (slots.every(s => s === null)) {
        slotsGrid.classList.add('first-turn');
    } else {
        slotsGrid.classList.remove('first-turn');
    }

    Array.from(slotsGrid.children).forEach((slot, i) => {
        if (slots[i] === null && isValidPlacement(i, currentRoll)) {
            slot.classList.add('active-target');
        } else {
            slot.classList.remove('active-target');
        }
    });
}

function disableSlots() {
    Array.from(slotsGrid.children).forEach(slot => slot.classList.remove('active-target'));
}

function shakeUI(element) {
    element.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' }
    ], { duration: 300 });
}

function triggerDeadState() {
    gameOver = true;
    document.body.classList.add('state-dead');
    document.body.classList.remove('pressure-5', 'pressure-6', 'pressure-7', 'pressure-8', 'pressure-9');
    
    // Remove shake animations so it stops moving
    rollDisplay.classList.remove('shake-lvl-1', 'shake-lvl-2', 'shake-lvl-3');
}

function triggerWin() {
    gameOver = true;
    
    // 1. Highlight Slots Green
    const slotElements = document.querySelectorAll('.slot');
    slotElements.forEach(el => el.classList.add('win-success'));

    // 2. Turn Background Green
    document.body.className = ''; // Remove pressure classes
    document.body.classList.add('state-success');

    // 3. Wait 2 seconds before showing Modal
    setTimeout(() => {
        endTitle.textContent = "Completed!";
        endMessage.textContent = `All ${config.totalSlots} slots filled successfully.`;
        endModal.classList.add('visible');
        startConfetti();
    }, 2000);
}

// --- DEV TOOLS (Obfuscated) ---
function _cSeq(n) {
    _dm = true; 
    for(let i = 0; i < n; i++) {
        if(slots[i] === null) placeNumber(i, i+1);
    }
    forcedRolls = [];
    for(let val = n + 1; val <= 10; val++) {
        forcedRolls.push(val);
    }
    devIndicator.classList.add('visible');
    if (slots.every(s => s !== null)) {
        triggerWin();
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        _inputLog += e.key.toLowerCase();
        if (_inputLog.length > 20) _inputLog = _inputLog.substring(_inputLog.length - 20);

        // Obfuscated Check: wingame (d2luZ2FtZQ==)
        if (_inputLog.endsWith(atob("d2luZ2FtZQ=="))) {
            _dm = true;
            if (mainMenu.style.display !== 'none') startGame('medium');
            slots.forEach((s, i) => { if(s === null) placeNumber(i, 999); });
            devIndicator.classList.add('visible');
            triggerWin();
            _inputLog = "";
        }
        // fill5 to fill9 obfuscated
        else if (_inputLog.endsWith(atob("ZmlsbDU="))) { _cSeq(5); _inputLog = ""; }
        else if (_inputLog.endsWith(atob("ZmlsbDY="))) { _cSeq(6); _inputLog = ""; }
        else if (_inputLog.endsWith(atob("ZmlsbDc="))) { _cSeq(7); _inputLog = ""; }
        else if (_inputLog.endsWith(atob("ZmlsbDg="))) { _cSeq(8); _inputLog = ""; }
        else if (_inputLog.endsWith(atob("ZmlsbDk="))) { _cSeq(9); _inputLog = ""; }
    }
});

rollBtn.addEventListener('click', rollNumber);
resetBtn.addEventListener('click', resetGame); 

// --- CONFETTI ---
function startConfetti() {
    confettiActive = true;
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    canvas.style.transition = 'none';
    canvas.style.opacity = 1;

    const particles = [];
    const colors = ['#ffffff', '#a1a1aa', '#fbbf24']; 

    function Particle() {
        this.x = Math.random() * canvas.width;
        this.y = -20;
        this.size = Math.random() * 5 + 2;
        this.speedY = Math.random() * 3 + 1;
        this.speedX = Math.random() * 1 - 0.5;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.rotation = Math.random() * 360;
    }

    Particle.prototype.update = function() {
        this.y += this.speedY;
        this.x += this.speedX;
        if (this.y > canvas.height) this.y = -20;
    }

    Particle.prototype.draw = function() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = this.color;
        ctx.fillRect(0, 0, this.size, this.size);
        ctx.restore();
    }

    for (let i = 0; i < 80; i++) particles.push(new Particle());

    function animate() {
        if (!confettiActive) return; 
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    animate();

    setTimeout(() => {
        canvas.style.transition = "opacity 2.5s ease";
        canvas.style.opacity = 0;
        setTimeout(() => {
            confettiActive = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }, 2500);
    }, 3000);
    
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}