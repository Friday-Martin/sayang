const LETTER_URL = "letter.txt";
const MUSIC_URL = "we_are_one.mp3";
const AUTO_PLAY_INTERVAL = 4000;

let sentences = [];
let currentIndex = 0;
let isPlaying = false;
let playTimer = null;

const lyricStageEl = document.getElementById("lyric-stage");
const lyricsEl = document.getElementById("lyrics");

const birthdaySceneEl = document.getElementById("birthday-scene");
const cakeCanvas = document.getElementById("cake-canvas");
const birthdayTextEl = document.getElementById("birthday-text");
const wishDoneBtn = document.getElementById("wish-done");
const birthdayActionsEl = document.getElementById("birthday-actions");
const birthdayReplayBtn = document.getElementById("birthday-replay");
const birthdayOpenLetterBtn = document.getElementById("birthday-open-letter");
const progressText = document.getElementById("progress-text");
const progressBar = document.getElementById("progress-bar");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const playPauseBtn = document.getElementById("play-pause-btn");
const iconPlay = playPauseBtn.querySelector(".icon-play");
const iconPause = playPauseBtn.querySelector(".icon-pause");
const toggleViewBtn = document.getElementById("toggle-view-btn");
if (toggleViewBtn) toggleViewBtn.remove();
const fullLetterView = document.getElementById("full-letter-view");
const closeLetterBtn = document.getElementById("close-letter-btn");
const fullLetterContent = document.getElementById("full-letter-content");

const flowSpeedSlider = document.getElementById("flow-speed-slider");
const flowSpeedValue = document.getElementById("flow-speed-value");

const audioEl = document.getElementById("bg-audio");
const audioToggleBtn = document.getElementById("audio-toggle");

if (audioEl) {
  audioEl.loop = true;
  audioEl.preload = "auto";
  if (!audioEl.querySelector("source")) {
    audioEl.src = MUSIC_URL;
  }
}

function extractSentences(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const allSentences = [];

  for (const para of paragraphs) {
    let paraSentences = [];
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
      paraSentences = Array.from(segmenter.segment(para))
        .map((s) => String(s.segment).replace(/\s+/g, " ").trim())
        .filter(Boolean);
    } else {
      paraSentences = para
        .split(/(?<=[.!?])\s+(?=[A-Z"])/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    allSentences.push(...paraSentences);
  }

  return allSentences;
}

function updateProgress() {
  const total = sentences.length;
  const num = currentIndex + 1;
  progressText.textContent = `${num} / ${total}`;
  progressBar.style.width = `${(num / total) * 100}%`;
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex >= total - 1;
}

const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")
  ?.matches;

let flowSpeedFactor = 0.82;

let lyricLineEls = [];

let mode = "lyrics";

function setMode(nextMode) {
  mode = nextMode;
  document.body.dataset.mode = nextMode;

  if (birthdaySceneEl) {
    birthdaySceneEl.classList.toggle("hidden", nextMode !== "birthday");
  }
}

function tokenizeWords(sentence) {
  return sentence.split(/\s+/).filter(Boolean);
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function setFlowSpeedFactor(value) {
  const next = clampNumber(Number(value), 0.6, 1.4);
  flowSpeedFactor = next;
  if (flowSpeedSlider) flowSpeedSlider.value = String(next);
  if (flowSpeedValue) flowSpeedValue.textContent = `${next.toFixed(2)}x`;

  try {
    window.localStorage.setItem("letter:flow:speed", String(next));
  } catch {
    return;
  }
}

function renderLyrics(sentencesList) {
  if (!lyricsEl) return;
  lyricsEl.innerHTML = "";

  const fragment = document.createDocumentFragment();
  const els = [];

  sentencesList.forEach((line, i) => {
    const li = document.createElement("li");
    li.className = "lyric-line";
    li.textContent = line;
    li.dataset.index = String(i);
    fragment.appendChild(li);
    els.push(li);
  });

  lyricsEl.appendChild(fragment);
  lyricLineEls = els;

  if (lyricStageEl) {
    lyricStageEl.classList.remove("hidden");
  }
}

function setActiveLine(index, scroll = true, behavior = "smooth") {
  if (!lyricsEl) return;
  if (index < 0 || index >= lyricLineEls.length) return;

  lyricLineEls.forEach((el) => el.classList.remove("lyric-line--active"));
  const active = lyricLineEls[index];
  active.classList.add("lyric-line--active");

  if (scroll) {
    active.scrollIntoView({ block: "center", inline: "nearest", behavior });
  }
}

function showSentence(index, behavior = "smooth") {
  if (mode !== "lyrics") return;
  if (index < 0 || index >= sentences.length) return;
  currentIndex = index;
  setActiveLine(index, true, prefersReducedMotion ? "auto" : behavior);
  updateProgress();
  if (isPlaying) scheduleAutoAdvance();
}

function goNext() {
  if (mode !== "lyrics") return;

  if (currentIndex < sentences.length - 1) {
    showSentence(currentIndex + 1);
    return;
  }

  enterBirthdayScene({ keepAudio: true });
}


function autoDelayForSentence(sentence) {
  const factor = flowSpeedFactor;
  const words = tokenizeWords(sentence).length;
  const chars = sentence.length;

  const wpm = 95;
  const readMs = Math.round((words / wpm) * 60000);

  const baseBlankMs = 2200 + words * 180 + Math.round(chars * 10);
  const blankMs = Math.max(3500, Math.round(baseBlankMs));

  const total = Math.round((readMs + blankMs) * factor);

  return Math.min(60000, Math.max(6500, total));
}

function nowMs() {
  return performance?.now ? performance.now() : Date.now();
}

let birthdayState = null;

function stopBirthday() {
  if (!birthdayState) {
    setWishUI("hidden");
    return;
  }

  if (birthdayState.raf) cancelAnimationFrame(birthdayState.raf);
  if (birthdayState.resizeHandler) window.removeEventListener("resize", birthdayState.resizeHandler);

  birthdayState = null;
  setWishUI("hidden");

  if (birthdayTextEl) birthdayTextEl.textContent = "";
}

function enterBirthdayScene(options = {}) {
  if (mode === "birthday") return;

  const { keepAudio = false } = options;

  stopAutoPlay({ keepAudio });
  setMode("birthday");

  if (!cakeCanvas || !birthdayTextEl) return;

  setWishUI("hidden");
  birthdayTextEl.textContent = "";

  const state = {
    t0: nowMs(),
    raf: 0,
    phase: "wish",
    resolveStart: null,
    canvas: cakeCanvas,
    ctx: cakeCanvas.getContext("2d"),
    dpr: Math.max(1, window.devicePixelRatio || 1),
    resizeHandler: null,
  };

  function resize() {
    const rect = state.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    state.canvas.width = Math.round(cssW * state.dpr);
    state.canvas.height = Math.round(cssH * state.dpr);
  }

  state.resizeHandler = () => resize();
  window.addEventListener("resize", state.resizeHandler);
  resize();

  function drawPixelArt(ctx, t) {
    const w = state.canvas.width;
    const h = state.canvas.height;
    if (!w || !h) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h / 2;
    const scale = Math.min(w, h) * 0.28;
    const time = t * 0.001;

    const bg = ctx.createRadialGradient(centerX, centerY, scale * 0.2, centerX, centerY, scale * 1.4);
    bg.addColorStop(0, "rgba(120, 180, 255, 0.08)");
    bg.addColorStop(0.6, "rgba(80, 120, 200, 0.04)");
    bg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "rgba(120, 200, 255, 0.14)";
    ctx.lineWidth = 1;
    const grid = Math.max(28, Math.round(scale / 6));
    for (let x = centerX % grid; x < w; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = centerY % grid; y < h; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    const resolveProgress =
      state.phase === "resolve" || state.phase === "outro"
        ? clampNumber((t - (state.resolveStart || t)) / 1800, 0, 1)
        : 0;

    const a = 3 + 0.6 * Math.sin(time * 0.6);
    const b = 2 + 0.4 * Math.cos(time * 0.55);
    const delta = time * 0.7;

    function heartPoint(p) {
      const x = (16 * Math.pow(Math.sin(p), 3)) / 16;
      const y = -(13 * Math.cos(p) - 5 * Math.cos(2 * p) - 2 * Math.cos(3 * p) - Math.cos(4 * p)) / 17;
      return { x, y };
    }

    function lissajousPoint(p, phaseOffset) {
      const x = Math.sin(a * p + delta + phaseOffset);
      const y = Math.sin(b * p + phaseOffset * 0.5);
      return { x, y };
    }

    function plotCurve(color, width, scaleMul, phaseOffset) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      const steps = 720;
      for (let i = 0; i <= steps; i++) {
        const p = (i / steps) * Math.PI * 2;
        const l = lissajousPoint(p, phaseOffset);
        const h = heartPoint(p);
        const x = l.x * (1 - resolveProgress) + h.x * resolveProgress;
        const y = l.y * (1 - resolveProgress) + h.y * resolveProgress;
        const px = centerX + x * scale * scaleMul;
        const py = centerY + y * scale * scaleMul;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    plotCurve("rgba(120, 220, 255, 0.35)", 1.6, 1.0, 0);
    plotCurve("rgba(255, 180, 220, 0.28)", 1.1, 0.86, 1.2);
    plotCurve("rgba(200, 220, 255, 0.22)", 0.9, 1.12, -0.8);
    ctx.restore();

    function drawRoundedRect(x, y, wRect, hRect, r) {
      const radius = Math.min(r, wRect / 2, hRect / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + wRect - radius, y);
      ctx.quadraticCurveTo(x + wRect, y, x + wRect, y + radius);
      ctx.lineTo(x + wRect, y + hRect - radius);
      ctx.quadraticCurveTo(x + wRect, y + hRect, x + wRect - radius, y + hRect);
      ctx.lineTo(x + radius, y + hRect);
      ctx.quadraticCurveTo(x, y + hRect, x, y + hRect - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }

    const cakeAlpha = 1 - resolveProgress;
    if (cakeAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = cakeAlpha;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.strokeStyle = "rgba(120, 220, 255, 0.35)";
      ctx.lineWidth = 2;
      const plateY = centerY + scale * 0.55;
      ctx.beginPath();
      ctx.ellipse(centerX, plateY, scale * 1.1, scale * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 180, 220, 0.35)";
      ctx.lineWidth = 1.5;
      const tier1W = scale * 1.6;
      const tier1H = scale * 0.45;
      const tier1X = centerX - tier1W / 2;
      const tier1Y = plateY - tier1H;
      drawRoundedRect(tier1X, tier1Y, tier1W, tier1H, scale * 0.06);
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = cakeAlpha * 0.6;
      ctx.beginPath();
      ctx.moveTo(tier1X + tier1W * 0.1, tier1Y + tier1H * 0.5);
      ctx.lineTo(tier1X + tier1W * 0.9, tier1Y + tier1H * 0.5);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = "rgba(255, 180, 220, 0.35)";
      const tier2W = scale * 1.1;
      const tier2H = scale * 0.35;
      const tier2X = centerX - tier2W / 2;
      const tier2Y = tier1Y - tier2H + scale * 0.02;
      drawRoundedRect(tier2X, tier2Y, tier2W, tier2H, scale * 0.06);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const scallopCount = 7;
      const scallopSize = tier2W / scallopCount;
      ctx.moveTo(tier2X, tier2Y + tier2H * 0.25);
      for (let i = 0; i < scallopCount; i++) {
        const sx = tier2X + i * scallopSize;
        ctx.quadraticCurveTo(
          sx + scallopSize / 2, 
          tier2Y + tier2H * 0.25 + scale * 0.05, 
          sx + scallopSize, 
          tier2Y + tier2H * 0.25
        );
      }
      ctx.stroke();

      const candleCount = 5;
      const candleW = scale * 0.035;
      const candleH = scale * 0.15;
      const spacing = tier2W / (candleCount + 1);

      for (let i = 1; i <= candleCount; i++) {
        const cx = tier2X + spacing * i;
        const cy = tier2Y;

        ctx.strokeStyle = "rgba(120, 220, 255, 0.5)";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(cx - candleW / 2, cy - candleH, candleW, candleH);

        const fTime = time * 2 + i * 1.5;
        const flicker = Math.sin(fTime * 5) * (scale * 0.01);
        const flameH = scale * 0.08 + Math.cos(fTime * 3) * (scale * 0.015);
        const flameBaseY = cy - candleH - scale * 0.01;

        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + Math.sin(fTime * 4) * 0.2})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, flameBaseY);
        ctx.bezierCurveTo(
          cx - scale * 0.04, flameBaseY - flameH * 0.4,
          cx - scale * 0.01 + flicker, flameBaseY - flameH,
          cx, flameBaseY - flameH
        );
        ctx.bezierCurveTo(
          cx + scale * 0.01 + flicker, flameBaseY - flameH,
          cx + scale * 0.04, flameBaseY - flameH * 0.4,
          cx, flameBaseY
        );
        ctx.stroke();
      }

      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    for (let i = 0; i < 10; i++) {
      const p = time * 0.6 + i * 0.6;
      const l = lissajousPoint(p, i * 0.25);
      const h = heartPoint(p);
      const x = l.x * (1 - resolveProgress) + h.x * resolveProgress;
      const y = l.y * (1 - resolveProgress) + h.y * resolveProgress;
      const px = centerX + x * scale;
      const py = centerY + y * scale;
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function setPrompt(text, showButton) {
    birthdayTextEl.textContent = text;
    setWishUI(showButton ? "wish" : "hidden");
  }

  function startBlow() {
    if (state.phase !== "wish") return;
    state.phase = "resolve";
    state.resolveStart = nowMs();
    setWishUI("hidden");
    birthdayTextEl.textContent = "…";

    window.setTimeout(() => {
      if (!birthdayState) return;
      state.phase = "outro";
      setWishUI("outro");
      birthdayTextEl.textContent = "Wish sealed.\nHappy birthday, my love.";
    }, 2200);
  }

  if (wishDoneBtn) {
    wishDoneBtn.onclick = () => {
      startBlow();
    };
  }


  birthdayState = state;

  setPrompt("Today is your birthday. Make a wish.", true);

  state.phase = "wish";

  const loop = () => {
    if (!birthdayState) return;
    const t = nowMs();
    drawPixelArt(state.ctx, t);
    state.raf = requestAnimationFrame(loop);
  };

  state.raf = requestAnimationFrame(loop);
}

function scheduleAutoAdvance() {
  if (!isPlaying || mode !== "lyrics") return;
  if (playTimer) {
    window.clearTimeout(playTimer);
    playTimer = null;
  }

  const delay = autoDelayForSentence(sentences[currentIndex]);

  playTimer = window.setTimeout(() => {
    if (currentIndex >= sentences.length - 1) {
      stopAutoPlay({ keepAudio: true });
      enterBirthdayScene({ keepAudio: true });
      return;
    }

    showSentence(currentIndex + 1);
  }, delay);
}

function startAutoPlay() {
  if (isPlaying || mode !== "lyrics") return;
  isPlaying = true;
  iconPlay.classList.add("hidden");
  iconPause.classList.remove("hidden");
  playPauseBtn.setAttribute("aria-label", "Pause");

  tryPlayAudio().then((ok) => {
    if (!ok) {
      isPlaying = false;
      iconPlay.classList.remove("hidden");
      iconPause.classList.add("hidden");
      playPauseBtn.setAttribute("aria-label", "Play");
    }
  });

  scheduleAutoAdvance();
}

function stopAutoPlay(options = {}) {
  const { keepAudio = false } = options;
  if (!isPlaying) return;
  isPlaying = false;
  iconPlay.classList.remove("hidden");
  iconPause.classList.add("hidden");
  playPauseBtn.setAttribute("aria-label", "Play");
  if (!keepAudio) pauseAudio();
  if (playTimer) {
    window.clearTimeout(playTimer);
    playTimer = null;
  }
}

function toggleAutoPlay() {
  if (mode !== "lyrics") return;
  if (isPlaying) {
    stopAutoPlay({ keepAudio: false });
  } else {
    startAutoPlay();
  }
}

function splitParagraphs(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  return normalized
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function renderFullLetter(text) {
  if (!fullLetterContent) return;
  fullLetterContent.innerHTML = "";
  const paragraphs = splitParagraphs(text);

  for (const para of paragraphs) {
    const p = document.createElement("p");
    p.textContent = para;
    if (para.trim() === "I choose you.") p.className = "emphasis";
    fullLetterContent.appendChild(p);
  }
}

function openFullLetter() {
  stopAutoPlay();
  fullLetterView.classList.remove("hidden");
}

function resetLyricsView() {
  setMode("lyrics");
  renderLyrics(sentences);
  showSentence(currentIndex, "auto");
}

function closeFullLetter() {
  fullLetterView.classList.add("hidden");
  if (mode === "birthday") return;
  resetLyricsView();
}

function advanceOrReveal() {
  goNext();
}

function safeSetText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function setWishUI(state) {
  if (!wishDoneBtn || !birthdayActionsEl) return;

  if (state === "wish") {
    wishDoneBtn.classList.remove("hidden");
    birthdayActionsEl.classList.add("hidden");
    if (birthdayOpenLetterBtn) birthdayOpenLetterBtn.classList.add("hidden");
  } else if (state === "outro") {
    wishDoneBtn.classList.add("hidden");
    birthdayActionsEl.classList.remove("hidden");
    if (birthdayOpenLetterBtn) birthdayOpenLetterBtn.classList.remove("hidden");
  } else {
    wishDoneBtn.classList.add("hidden");
    birthdayActionsEl.classList.add("hidden");
    if (birthdayOpenLetterBtn) birthdayOpenLetterBtn.classList.add("hidden");
  }
}

function handleKeyboard(e) {
  if (!fullLetterView.classList.contains("hidden")) {
    if (e.key === "Escape") closeFullLetter();
    return;
  }

  if (mode === "birthday") {
    if (e.key === "Escape") {
      e.preventDefault();
      return;
    }

    if ((e.key === "Enter" || e.key === " ") && !wishDoneBtn?.classList.contains("hidden")) {
      e.preventDefault();
      wishDoneBtn?.click();
    }
    return;
  }

  if (e.key === "ArrowRight" || e.key === " ") {
    e.preventDefault();
    advanceOrReveal();
    if (isPlaying) scheduleAutoAdvance();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    showSentence(Math.max(0, currentIndex - 1));
    if (isPlaying) scheduleAutoAdvance();
  }
}


function setAudioState(state) {
  if (state) {
    document.body.dataset.audio = state;
  } else if (audioEl) {
    document.body.dataset.audio = audioEl.paused ? "paused" : "playing";
  }

  if (audioToggleBtn && audioEl) {
    audioToggleBtn.setAttribute("aria-pressed", audioEl.paused ? "false" : "true");
  }
}

function setDefaultVolume() {
  if (!audioEl) return;
  audioEl.volume = 0.35;
}

async function tryPlayAudio() {
  if (!audioEl) return false;

  try {
    await audioEl.play();
    setAudioState();
    return true;
  } catch {
    setAudioState("blocked");
    return false;
  }
}

function pauseAudio() {
  if (!audioEl) return;
  audioEl.pause();
  setAudioState();
}

async function toggleMusic() {
  if (!audioEl) return;

  if (audioEl.paused) {
    await tryPlayAudio();
  } else {
    pauseAudio();
  }
}

function armAutoplayUnlock() {
  const handler = async () => {
    document.removeEventListener("pointerdown", handler);
    document.removeEventListener("keydown", handler);
    await tryPlayAudio();
  };

  document.addEventListener("pointerdown", handler, { once: true });
  document.addEventListener("keydown", handler, { once: true });
}

function initFlowSpeedControls() {
  let storedValue = null;
  try {
    storedValue = window.localStorage.getItem("letter:flow:speed");
  } catch {
    storedValue = null;
  }

  if (storedValue) {
    const parsed = Number(storedValue);
    if (!Number.isNaN(parsed)) flowSpeedFactor = clampNumber(parsed, 0.6, 1.4);
  }

  setFlowSpeedFactor(flowSpeedFactor);
  if (isPlaying && sentences.length > 0) scheduleAutoAdvance();

  if (!flowSpeedSlider) return;

  flowSpeedSlider.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    setFlowSpeedFactor(target.value);
    if (isPlaying) scheduleAutoAdvance();
  });
}

function initAudioControls() {
  if (!audioEl) {
    setAudioState("paused");
    return;
  }

  setDefaultVolume();

  if (audioToggleBtn) {
    audioToggleBtn.addEventListener("click", () => {
      toggleMusic();
    });
  }

  audioEl.addEventListener("play", () => setAudioState());
  audioEl.addEventListener("pause", () => setAudioState());

  setAudioState("paused");

  tryPlayAudio().then((ok) => {
    if (!ok) armAutoplayUnlock();
  });
}

async function init() {
  try {
    const res = await fetch(LETTER_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load letter");
    const text = await res.text();

    sentences = extractSentences(text);
    if (sentences.length === 0) {
      safeSetText(birthdayTextEl, "No content found.");
      return;
    }

    renderFullLetter(text);
    renderLyrics(sentences);
    setMode("lyrics");
    showSentence(0, "auto");
    startAutoPlay();

    prevBtn.addEventListener("click", () => {
      showSentence(Math.max(0, currentIndex - 1));
    });
    nextBtn.addEventListener("click", () => {
      if (currentIndex >= sentences.length - 1) {
        enterBirthdayScene({ keepAudio: true });
        return;
      }
      advanceOrReveal();
      if (isPlaying) scheduleAutoAdvance();
    });
    playPauseBtn.addEventListener("click", toggleAutoPlay);

    lyricsEl?.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const li = target.closest(".lyric-line");
      if (!(li instanceof HTMLElement)) return;
      const idx = Number(li.dataset.index);
      if (Number.isNaN(idx)) return;
      showSentence(idx);
      if (isPlaying) scheduleAutoAdvance();
    });

    birthdayReplayBtn?.addEventListener("click", () => {
      stopBirthday();
      setMode("lyrics");
      currentIndex = 0;
      renderLyrics(sentences);
      showSentence(0, "auto");
      if (audioEl) audioEl.currentTime = 0;
      startAutoPlay();
    });

    birthdayOpenLetterBtn?.addEventListener("click", () => {
      openFullLetter();
    });


    closeLetterBtn.addEventListener("click", closeFullLetter);
    document.addEventListener("keydown", handleKeyboard);

    initFlowSpeedControls();
    initAudioControls();
  } catch {
    safeSetText(birthdayTextEl, "Could not load the letter. Please use a local server.");
  }
}

init();
