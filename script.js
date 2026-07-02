// --- MODE DEFINITIONS ---
// Single source of truth for each difficulty's real parameters. Difficulty
// is created by the actual math (slot count, number range, skips) rather
// than by a hidden win/lose flag, so every mode is honestly winnable at a
// rate that falls out of real play instead of being asserted.
const MODE_CONFIGS = {
    easy:    { totalSlots: 10, maxNumber: 1000, initialSkips: 3, isExtreme: false, label: "Mode: Easy" },
    medium:  { totalSlots: 10, maxNumber: 1000, initialSkips: 0, isExtreme: false, label: "Mode: Standard" },
    // Widened from 1-1000 to 1-2500 vs. the original: doubling slot count
    // (10 -> 20) while keeping the same number range made valid gaps
    // extremely cramped and produced frequent, un-strategic dead ends.
    // Widening the range keeps Hard genuinely hard (0 skips, 20 slots)
    // without making it arbitrarily unwinnable. Recommend playtesting /
    // simulating to confirm this lands where you want it.
    hard:    { totalSlots: 20, maxNumber: 2500, initialSkips: 0, isExtreme: false, label: "Mode: Hard" },
    extreme: { totalSlots: 10, maxNumber: 100,  initialSkips: 0, isExtreme: true,  label: "Mode: Extreme (1-100)" }
};

let config = { ...MODE_CONFIGS.medium };

// --- SEEDED RNG (Mulberry32) ---
// Used for non-extreme modes so a game's full roll sequence is determined
// by a single seed up front (kept for a possible future "provably fair,
// here's the seed" reveal) -- NOT to steer who wins, just to make the
// random source reproducible/inspectable.
function mulberry32(seed) {
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

let currentSeed = 0;
let rng = Math.random; // fallback

let slots = [];
let currentRoll = null;
let gameOver = false;
let _inputLog = ""; 
let audioCtx;
let currentScore = 0;
let remainingSkips = 0;
let confettiActive = false;
let forcedRolls = []; 
let isRolling = false;
let _dm = false;
let _skipAnim = false;
let currentMode = 'medium';

// --- VARIANCE SHAPING (banded rolls) ---
// Splits the active number range into bands and deals from a shuffled
// order of bands (like Tetris's "bag" of pieces) so a real random roll
// sequence doesn't clump into unlucky all-high/all-low streaks. Every
// roll is still genuinely random -- this only smooths the distribution.
let rollBands = { order: [] };

// --- TRANSPARENT PITY RULE ---
// If a player loses twice in a row on the same mode, their next game on
// that mode starts with one bonus skip. This is a stated, inspectable
// rule (shown in the mode label and dev indicator) -- not a hidden
// thumb on the scale of any individual game's outcome.
let lossStreak = { easy: 0, medium: 0, hard: 0, extreme: 0 };
let pityBonusActive = false;

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
const confettiCanvas = document.getElementById('confetti-canvas');

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

// Builds a fresh config for the given mode, applying the transparent pity
// bonus if the player has lost that mode 2+ times in a row. Called by both
// startGame and resetGame so the bonus is always computed from base values
// and never stacks across repeated resets.
function buildConfigForMode(mode) {
    const cfg = { ...MODE_CONFIGS[mode] };
    pityBonusActive = (lossStreak[mode] || 0) >= 2;
    if (pityBonusActive) cfg.initialSkips += 1;
    return cfg;
}

function applyRngForConfig() {
    if (!config.isExtreme) {
        currentSeed = generateSeedForMode();
        rng = mulberry32(currentSeed);
    } else {
        rng = Math.random; // Extreme uses true random, no seed needed
    }
}

function startGame(mode) {
    currentMode = mode;
    config = buildConfigForMode(mode);
    gameModeDisplay.textContent = config.label + (pityBonusActive ? " • +1 Bonus Skip" : "");

    applyRngForConfig();

    closeAllModals();
    mainMenu.style.display = 'none';
    gameInterface.style.display = 'block';
    topMenuLink.style.display = 'block';
    init();

    // Update dev indicator AFTER init
    updateDevIndicator();
}

function resetGame() {
    closeAllModals();
    config = buildConfigForMode(currentMode);
    gameModeDisplay.textContent = config.label + (pityBonusActive ? " • +1 Bonus Skip" : "");
    applyRngForConfig();
    init();
    updateDevIndicator();
}

function init() {
    isRolling = false;
    // _dm is intentionally kept across resets
    slotsGrid.innerHTML = '';
    const ctx = confettiCanvas.getContext('2d');
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiCanvas.style.opacity = 1;

    slots = Array(config.totalSlots).fill(null);
    currentRoll = null;
    gameOver = false;
    _inputLog = "";
    currentScore = 0;
    remainingSkips = config.initialSkips;
    forcedRolls = [];
    rollBands.order = []; // fresh shuffled bands for the new game

    document.body.className = '';
    if (!_dm) devIndicator.classList.remove('visible');
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
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (err) {
        // Some browsers/privacy modes block AudioContext creation entirely --
        // fail silently and let playTick() no-op via its !audioCtx guard.
        console.warn('Audio unavailable:', err);
        audioCtx = null;
    }
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

    // NOTE: no "board already full" early-return here -- gameOver is already
    // set by triggerWin()/triggerDeadState() by the time the board is full,
    // which is checked at the top of this function. A prior version had a
    // redundant guard here that returned after isRolling/rollBtn were
    // already set "busy," which could soft-lock the roll button if ever hit.

    let finalResult = null;

    // CHECK FOR CHEAT QUEUE FIRST (dev tools only)
    if (forcedRolls.length > 0) {
        finalResult = forcedRolls.shift();
    } else {
        // Honest RNG for every mode: banded so a real random sequence
        // doesn't clump into unlucky streaks, but never steered toward a
        // predetermined win or loss. See getBandedRoll().
        let safetyCounter = 0;
        while (true) {
            safetyCounter++;
            finalResult = getBandedRoll(config);

            if (slots.includes(finalResult)) {
                if (safetyCounter > 5000) break; // safety valve; should be unreachable in practice
                continue;
            }

            // SMART SAFETY ONLY IN DEV MODE (lets testers rapidly explore
            // placeable states without hunting for a valid roll manually)
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

    // Skip animation if skipanim devmode is on
    if (_skipAnim) {
        currentRoll = finalResult;
        rollDisplay.textContent = currentRoll;
        document.querySelector('.roll-card').classList.remove('rolling');
        isRolling = false;
        if (rollDisplay.classList.contains('crit-text')) {
            if (canPlaceAnywhere(currentRoll)) rollDisplay.classList.remove('crit-text');
        }
        if (remainingSkips > 0) skipBtn.disabled = false;
        if (!canPlaceAnywhere(currentRoll)) {
            if (remainingSkips > 0) {
                // keep skip available
            } else {
                triggerDeadState();
            }
        } else {
            enableValidSlots();
        }
        return;
    }

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

    // Pity rule bookkeeping: count this loss toward the current mode's streak
    lossStreak[currentMode] = (lossStreak[currentMode] || 0) + 1;
    updateDevIndicator();
}

function triggerWin() {
    gameOver = true;

    // A win resets the pity streak for this mode
    lossStreak[currentMode] = 0;
    updateDevIndicator();

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

// --- DEV TOOLS ---
// _dm (devmode) and _skipAnim are toggled via the hidden keyboard codes
// further down this file. They exist purely for testing/QA.

// Splits the active number range into BAND_COUNT equal bands and deals
// from a shuffled order of band indices, refilling/reshuffling once all
// bands in the current order have been used. This is the "gambling feel
// without rigging" variance shaper discussed in review: every individual
// roll is still fully random within its band, but a full game's rolls
// can't clump into a freak run of all-high or all-low numbers the way
// pure independent uniform random sometimes does. Applies to every mode,
// including Extreme, using whatever rng() is currently active (seeded
// mulberry32 for standard modes, Math.random for Extreme).
const BAND_COUNT = 5;

function getBandedRoll(cfg) {
    const bandSize = Math.max(1, Math.floor(cfg.maxNumber / BAND_COUNT));

    if (!rollBands.order.length) {
        rollBands.order = [...Array(BAND_COUNT).keys()];
        // Fisher-Yates shuffle using the active rng so seeded games stay reproducible
        for (let i = rollBands.order.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [rollBands.order[i], rollBands.order[j]] = [rollBands.order[j], rollBands.order[i]];
        }
    }

    const band = rollBands.order.shift();
    const lo = band * bandSize + 1;
    const hi = (band === BAND_COUNT - 1) ? cfg.maxNumber : lo + bandSize - 1;

    return lo + Math.floor(rng() * (hi - lo + 1));
}

// Generates a fresh seed for non-extreme modes. The seed determines the
// mulberry32 sequence that getBandedRoll() draws from -- it does NOT
// encode a predetermined win or loss. Kept simple/honest on purpose.
function generateSeedForMode() {
    return Math.floor(Math.random() * 999999999);
}

function updateDevIndicator() {
    const hasAny = _dm || _skipAnim;
    if (!hasAny) {
        devIndicator.classList.remove('visible');
        return;
    }

    let rows = `
        <div class="dev-indicator-row">
            <span class="dev-indicator-value" style="color:#ffffff">DEVMODE</span>
        </div>
        <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 2px 0;"></div>
    `;

    if (_dm) {
        // Seed is shown for transparency/debugging only -- it no longer
        // encodes a predetermined outcome, so there's nothing to color as
        // "Win" or "Lose" ahead of time.
        const seedRow = config.isExtreme
            ? `<div class="dev-indicator-row">
                    <span class="dev-indicator-label">Seed</span>
                    <span class="dev-indicator-value" style="color:#a1a1aa">Pure RNG</span>
               </div>`
            : `<div class="dev-indicator-row">
                    <span class="dev-indicator-label">Seed</span>
                    <span class="dev-indicator-value" style="color:#a1a1aa">#${currentSeed}</span>
               </div>`;

        const streak = lossStreak[currentMode] || 0;
        const streakRow = `<div class="dev-indicator-row">
                <span class="dev-indicator-label">Loss Streak</span>
                <span class="dev-indicator-value" style="color:${streak > 0 ? '#ef4444' : '#a1a1aa'}">
                    ${streak}${pityBonusActive ? ' (pity active)' : ''}
                </span>
            </div>`;

        rows += seedRow + streakRow;
    }

    if (_skipAnim) {
        rows += `<div class="dev-indicator-row">
            <span class="dev-indicator-label">Skip Animation</span>
        </div>`;
    }

    devIndicator.innerHTML = rows;
    devIndicator.classList.add('visible');
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
        if (_inputLog.endsWith('chancewin')) {
            _dm = !_dm;
            updateDevIndicator();
            _inputLog = "";
        }
        else if (_inputLog.endsWith('skipanim')) {
            _skipAnim = !_skipAnim;
            updateDevIndicator();
            _inputLog = "";
        }
        else if (_inputLog.endsWith(atob("d2luZ2FtZQ=="))) {
            _dm = true;
            if (mainMenu.style.display !== 'none') startGame('medium');
            slots.forEach((s, i) => { if(s === null) placeNumber(i, 999); });
            updateDevIndicator();
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
// Resize handler is registered once, here, rather than inside startConfetti()
// (previously a new listener was added on every single win and never
// removed, leaking one extra listener per win over a session).
window.addEventListener('resize', () => {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
});

function startConfetti() {
    confettiActive = true;
    const canvas = confettiCanvas;
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
}