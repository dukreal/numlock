# 🔢 NumLock

**NumLock** is a minimalist, browser-based logic game where players must place randomly rolled numbers into fixed slots while maintaining a **strictly increasing order**. Once a number is placed, it is **locked forever** — one mistake ends the run.

> *Lock the order. Beat the roll.*

---

## 🎮 Gameplay

- You are given **10 empty slots**
- Each turn, you **roll a random number** (1–1000)
- Place the number into **one available slot**
- The sequence must always be **strictly increasing (left → right)**
- Placed numbers **cannot be moved**
- If a number cannot be placed anywhere, the game ends
- Fill all slots correctly to win

---

## 🧠 Rules

A placement is valid only if:
- All numbers to the **left** are smaller
- All numbers to the **right** are larger

Invalid placements immediately result in **Game Over**.

Some rolls may create an **impossible state**, requiring careful decision-making.

---

## ✨ Features

- 🎲 Animated number rolling
- 🧩 Smart slot validation (only valid slots are clickable)
- 🔥 Dynamic pressure visuals as slots fill
- 💀 End-state detection when no valid moves remain
- 🎉 Win animation
- 🎧 Minimalist sound effects
- 📱 Responsive layout (desktop & mobile)

---

## 🕹 Controls

| Action | Input |
|------|------|
| Roll number | Click **Roll Number** |
| Place number | Click a highlighted slot |
| Reset game | Click **Reset Game** |
| New game (end screen) | Click **New Game** |

---

## 🛠 Tech Stack

- **HTML5**
- **CSS3**
- **Vanilla JavaScript**
- **Canvas API** (visual effects)
- **Web Audio API** (sound)

No frameworks. No backend. Runs entirely in the browser.

---

## 📂 Project Structure

NumLock/
│── index.html
│── README.md


> The game is intentionally built as a **single HTML file** for simplicity and easy deployment.

---

## 🚀 Running the Game

1. Clone or download the repository
2. Open `index.html` in any modern browser
3. Play instantly — no setup required

---

## 🌐 Deployment

You can host this game for free using:
- GitHub Pages
- Netlify
- Vercel

Simply upload `index.html`.

---

## 📜 License

This project is open for educational and personal use.  
Feel free to fork, modify, and expand upon it.
