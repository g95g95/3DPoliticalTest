import * as THREE from 'three';
import { OrbitControls } from './lib/OrbitControls.js';

// Reference to the root app container
const app = document.getElementById('app');

const MAGIC_WORD = 'mellon';
const MAX_ACCESS_ATTEMPTS = 3;

// Supported languages and metadata used in the language selector
const LANGUAGES = [
  { code: 'it', name: 'Italiano', flag: { src: 'assets/flags/it.svg', alt: 'Bandiera italiana' } },
  { code: 'en', name: 'English', flag: { src: 'assets/flags/gb.svg', alt: 'Union Jack' } },
  { code: 'es', name: 'Español', flag: { src: 'assets/flags/es.svg', alt: 'Bandera de España' } },
  { code: 'fr', name: 'Français', flag: { src: 'assets/flags/fr.svg', alt: 'Drapeau français' } },
  { code: 'de', name: 'Deutsch', flag: { src: 'assets/flags/de.svg', alt: 'Flagge Deutschlands' } }
];

const PHI_DESCRIPTORS = [
  'Mercato aperto · Diritti civili',
  'Mercato aperto · Ordine sociale',
  'Intervento statale · Ordine sociale',
  'Intervento statale · Diritti civili'
];

const THETA_DESCRIPTORS = [
  'Allineamento forte con l\'establishment',
  'Moderatamente filo-establishment',
  'Equilibrato ma critico',
  'Marcatamente anti-establishment'
];

const QUADRANT_COLORS = [
  0x174076, 0x1f5ea8, 0x2789c5, 0x2fb8d3,
  0x315a8c, 0x3f74b0, 0x5199c9, 0x63c2d8,
  0x4a4a82, 0x5d60a6, 0x767ec2, 0x8ea5d3,
  0x5f3b7b, 0x7a4ea2, 0x9a6fbe, 0xb695d3
];

function descriptorFromSectors(phiSector, thetaSector) {
  const phiLabel = PHI_DESCRIPTORS[Math.min(phiSector, PHI_DESCRIPTORS.length - 1)] || '';
  const thetaLabel = THETA_DESCRIPTORS[Math.min(thetaSector, THETA_DESCRIPTORS.length - 1)] || '';
  return `${phiLabel} · ${thetaLabel}`;
}

function colorFromIndex(index) {
  const hex = QUADRANT_COLORS[Math.min(index, QUADRANT_COLORS.length - 1)] || 0x2d6cdf;
  return {
    hex,
    css: `#${hex.toString(16).padStart(6, '0')}`
  };
}

function quadrantFromVector(x, y, z) {
  const r = Math.sqrt(x * x + y * y + z * z) || 0;
  const theta = r ? Math.acos(z / r) : 0;
  let phi = Math.atan2(y, x);
  if (phi < 0) phi += 2 * Math.PI;
  let phiSector = Math.floor((phi / (2 * Math.PI)) * 4);
  let thetaSector = Math.floor((theta / Math.PI) * 4);
  if (phiSector > 3) phiSector = 3;
  if (thetaSector > 3) thetaSector = 3;
  const index = phiSector * 4 + thetaSector;
  return {
    index,
    phiSector,
    thetaSector,
    descriptor: descriptorFromSectors(phiSector, thetaSector),
    color: colorFromIndex(index)
  };
}

const BASE_QUADRANT_LEGEND = Array.from({ length: 16 }, (_, idx) => {
  const phiSector = Math.floor(idx / 4);
  const thetaSector = idx % 4;
  return {
    number: idx + 1,
    descriptor: descriptorFromSectors(phiSector, thetaSector),
    color: colorFromIndex(idx).css
  };
});

// Global state to track current view and user data
const state = {
  step: 0,               // 0: language, 1: name, 2: profile, 3: quiz, 4: result, 5: insights, 6: reviews
  language: 'it',        // selected language code (it, en, es, fr, de)
  name: '',             // user name
  profession: '',       // user profession
  education: '',        // user education (titolo di studio)
  dob: '',              // date of birth
  idx: 0,               // current question index
  x: 0, y: 0, z: 0,     // Cartesian scores for economy, rights and establishment fidelity
  questions: [],        // currently loaded questions
  questionsByLang: {},  // cache of loaded questions by language
  weightTotals: { economia: 0, dirittocivilismo: 0, establishment: 0 },
  answers: []           // user answers
};

const AXES = ['economia', 'dirittocivilismo', 'establishment'];
const MAX_RESPONSE_VALUE = 2;

let QUADRANT_DATA = [];

function componentToAxis(component) {
  if (!component) return null;
  if (component === 'autoritarismo') return 'dirittocivilismo';
  return AXES.includes(component) ? component : null;
}

function normalizeQuestionEntry(question) {
  const normalizedWeights = { economia: 0, dirittocivilismo: 0, establishment: 0 };
  if (!question || typeof question !== 'object') {
    return { title: '', weights: normalizedWeights };
  }
  const providedWeights = question.weights && typeof question.weights === 'object' ? question.weights : null;
  AXES.forEach((axis) => {
    let value = 0;
    if (providedWeights && providedWeights[axis] !== undefined) {
      value = Number(providedWeights[axis]) || 0;
    } else {
      const mapped = componentToAxis(question.component);
      if (mapped === axis) value = 1;
    }
    normalizedWeights[axis] = value;
  });
  return { ...question, weights: normalizedWeights };
}

function computeWeightTotals(questions) {
  return questions.reduce((acc, question) => {
    AXES.forEach((axis) => {
      const weight = question.weights && typeof question.weights === 'object' ? Number(question.weights[axis]) || 0 : 0;
      acc[axis] += weight;
    });
    return acc;
  }, { economia: 0, dirittocivilismo: 0, establishment: 0 });
}

function getNormalizedScores() {
  const totals = state.weightTotals || {};
  const normalize = (score, axis) => {
    const denom = (Number(totals[axis]) || 0) * MAX_RESPONSE_VALUE;
    if (!denom) return 0;
    const value = score / denom;
    return Math.max(-1, Math.min(1, value));
  };
  return {
    x: normalize(state.x, 'economia'),
    y: normalize(state.y, 'dirittocivilismo'),
    z: normalize(state.z, 'establishment')
  };
}

function getQuadrantDetails(index) {
  if (!Array.isArray(QUADRANT_DATA) || !QUADRANT_DATA.length) return null;
  return QUADRANT_DATA.find((q) => q && Number(q.id) === index + 1) || null;
}

function getQuadrantLegend() {
  if (!Array.isArray(QUADRANT_DATA) || QUADRANT_DATA.length !== 16) {
    return BASE_QUADRANT_LEGEND;
  }
  return QUADRANT_DATA.map((entry, idx) => ({
    number: entry.id,
    name: entry.name,
    descriptor: entry.content,
    bounds: entry.bounds,
    affiliation: entry.affiliazionepolitica,
    color: colorFromIndex(idx).css
  }));
}

async function loadQuadrants() {
  try {
    const res = await fetch('quadrants.json?cb=' + Date.now());
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    if (Array.isArray(data)) {
      QUADRANT_DATA = data;
    }
  } catch (err) {
    console.warn('Impossibile caricare i dati dei quadranti', err);
    QUADRANT_DATA = [];
  }
}

function setupAccessGate(onSuccess) {
  const overlay = document.getElementById('accessOverlay');
  const form = document.getElementById('accessForm');
  const errorView = document.getElementById('accessError');
  const input = document.getElementById('magicWord');
  const button = document.getElementById('accessSubmit');
  const message = document.getElementById('accessMessage');

  if (!overlay || !form || !input || !button) {
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (app) {
      app.removeAttribute('aria-hidden');
    }
    if (typeof onSuccess === 'function') {
      onSuccess();
    }
    return;
  }

  let attempts = 0;
  let unlocked = false;

  const showMessage = (text, tone = 'error') => {
    if (!message) return;
    message.textContent = text;
    if (tone === 'success') {
      message.style.color = '#16a34a';
    } else if (tone === 'neutral') {
      message.style.color = '#4b5563';
    } else {
      message.style.color = '#ef4444';
    }
  };

  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';
    if (app) {
      app.removeAttribute('aria-hidden');
    }
    if (typeof onSuccess === 'function') {
      onSuccess();
    }
  };

  const lockOut = () => {
    form.classList.add('hidden');
    if (errorView) {
      errorView.classList.remove('hidden');
    }
    button.disabled = true;
    input.disabled = true;
  };

  const verify = () => {
    if (unlocked) return;
    const value = (input.value || '').trim().toLowerCase();
    if (!value) {
      showMessage('Serve la parola magica per entrare.', 'neutral');
      return;
    }
    if (value === MAGIC_WORD) {
      showMessage('Benvenuto, amico.', 'success');
      unlock();
      return;
    }
    attempts += 1;
    input.value = '';
    showMessage('Questa non è la parola giusta.', 'error');
    if (attempts >= MAX_ACCESS_ATTEMPTS) {
      lockOut();
    } else {
      input.focus();
    }
  };

  button.addEventListener('click', verify);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      verify();
    }
  });

  showMessage('', 'neutral');
  overlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    input.focus();
  }, 100);
}

/* --------------------------------------------------------------------------
 *  Utility helpers
 *
 * escapeHtml  : escapes HTML entities in user-provided strings
 * rad2deg     : converts radians to degrees
 * round       : rounds a number to two decimal places
 */
const escapeHtml = (s) => s.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const rad2deg = (r) => r * 180 / Math.PI;
const round   = (n) => Math.round(n * 100) / 100;

/**
 * Generates a simple navigation bar with a button to view reviews.  Each
 * view should call navBar() when constructing its HTML.  The caller is
 * responsible for attaching the click handler to #navReviews after
 * insertion into the DOM.
 */
function navBar() {
  return `
    <div class="flex justify-between items-center mb-4">
      <div></div>
      <button id="navReviews" class="text-indigo-600 hover:underline">Recensioni</button>
    </div>
  `;
}

/**
 * Loads the question set for the currently selected language.  Caches
 * previously loaded language sets in state.questionsByLang to avoid
 * re-fetching.  For Italian (it) it loads questions_it.json; for other
 * languages it loads questions_<lang>.json.  Appends a cache buster to
 * ensure fresh fetch.
 */
async function loadQuestions() {
  const lang = state.language || 'it';
  if (state.questionsByLang[lang]) {
    const cached = state.questionsByLang[lang];
    state.questions = cached.questions;
    state.weightTotals = { ...cached.totals };
    return;
  }
  let filename;
  if (lang === 'it') {
    filename = 'questions_it.json';
  } else {
    filename = `questions_${lang}.json`;
  }
  try {
    const res = await fetch(filename + `?cb=${Date.now()}`);
    const data = await res.json();
    const normalized = Array.isArray(data) ? data.map(normalizeQuestionEntry) : [];
    const totals = computeWeightTotals(normalized);
    state.questionsByLang[lang] = { questions: normalized, totals };
    state.questions = normalized;
    state.weightTotals = { ...totals };
  } catch (err) {
    console.error('Impossibile caricare le domande', err);
    state.questions = [];
    state.weightTotals = { economia: 0, dirittocivilismo: 0, establishment: 0 };
  }
}

/**
 * Attempts to fetch the user's public IP address via api.ipify.org.
 * Returns null if the request fails.
 */
async function getUserIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip;
  } catch (err) {
    return null;
  }
}

/**
 * Determines whether an IP address is private/reserved.  Private
 * addresses (e.g. 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x)
 * suggest a VPN or local network.  If an IP is private, we treat it
 * as invalid for submitting reviews.
 */
function isPrivateIP(ip) {
  if (!ip) return true;
  const parts = ip.split('.').map((x) => parseInt(x, 10));
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

/**
 * Loads the array of saved reviews from localStorage.  If no reviews
 * exist, returns an empty array.
 */
function loadReviews() {
  const raw = localStorage.getItem('reviews');
  return raw ? JSON.parse(raw) : [];
}

/**
 * Saves a new review to localStorage.  Reviews are stored as an
 * array of objects with name, ip, message and date.
 */
function saveReview(review) {
  const reviews = loadReviews();
  reviews.push(review);
  localStorage.setItem('reviews', JSON.stringify(reviews));
}

/* --------------------------------------------------------------------------
 *  View renderers
 */

/**
 * Renders the language selection view.  Presents buttons for each
 * supported language and transitions to the name view when one is
 * selected.
 */
function viewLanguage() {
  state.step = 0;
  app.innerHTML = navBar() + `
    <div class="card p-8 mx-auto max-w-xl">
      <label class="text-lg font-semibold text-gray-700 block mb-2" for="language">Choose language</label>
      <div id="language" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        ${LANGUAGES.map(({ code, name, flag }) => `
          <button class="lang-btn bg-white border border-indigo-200 hover:border-indigo-400 hover:shadow rounded-lg px-4 py-3 flex items-center justify-center gap-2 text-indigo-700 font-semibold transition" data-lang="${code}" aria-label="${name}">
            <img src="${flag.src}" alt="${flag.alt}" class="w-7 h-7 rounded-full shadow-sm" loading="lazy" />
            <span class="text-base">${name}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  // Attach nav event
  const nav = document.getElementById('navReviews');
  if (nav) nav.onclick = () => { state.step = 6; viewReviews(); };
  // Attach language selection events
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.onclick = () => {
      const lang = btn.dataset.lang;
      state.language = lang;
      // Reset scores and answers
      state.name = '';
      state.profession = '';
      state.education = '';
      state.dob = '';
      state.idx = 0;
      state.x = 0;
      state.y = 0;
      state.z = 0;
      state.weightTotals = { economia: 0, dirittocivilismo: 0, establishment: 0 };
      state.answers = [];
      state.step = 1;
      viewWelcome();
    };
  });
}

/**
 * Renders the welcome view where the user enters their name.  Provides a
 * text input and a confirmation button.  Transitions to the profile view
 * when a valid name is entered.
 */
function viewWelcome() {
  state.step = 1;
  app.innerHTML = navBar() + `
    <div class="card p-8 mx-auto max-w-xl">
      <h1 class="text-3xl font-extrabold text-gray-900 text-center leading-tight">
        Benvenuto al test politico<br/><span class="text-indigo-700">3D</span>
      </h1>
      <p class="text-gray-600 text-center mt-4">
        Inserisci il tuo nome per iniziare. Le tue risposte definiranno la tua posizione nella sfera politica.
      </p>
      <div class="mt-6 space-y-3">
        <input id="name" class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Il tuo nome" />
        <button id="goName" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg px-4 py-3 transition">
          Conferma
        </button>
      </div>
    </div>
  `;
  // Attach nav event
  const nav = document.getElementById('navReviews');
  if (nav) nav.onclick = () => { state.step = 6; viewReviews(); };
  // Handle name confirm
  document.getElementById('goName').onclick = () => {
    const v = document.getElementById('name').value.trim();
    if (!v) return;
    state.name = v;
    state.step = 2;
    viewProfile();
  };
}

/**
 * Renders the profile view where the user provides profession, education
 * and date of birth.  Includes back and confirm buttons.  On confirm,
 * loads questions and transitions to the quiz view.
 */
function viewProfile() {
  state.step = 2;
  app.innerHTML = navBar() + `
    <div class="card p-8 mx-auto max-w-xl">
      <h2 class="text-2xl font-bold text-gray-900 mb-1">Ciao, ${escapeHtml(state.name)} 👋</h2>
      <p class="text-gray-600 mb-6">Ora completa questi dati.</p>
      <div class="grid gap-4">
        <input id="profession" class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Professione" />
        <input id="education" class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Titolo di studio" />
        <input id="dob" type="date" class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>
      <div class="mt-6 flex gap-3">
        <button id="backProfile" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg px-4 py-3">Indietro</button>
        <button id="goProfile" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg px-4 py-3">Conferma</button>
      </div>
    </div>
  `;
  // Attach nav event
  const nav = document.getElementById('navReviews');
  if (nav) nav.onclick = () => { state.step = 6; viewReviews(); };
  // Back to name view
  document.getElementById('backProfile').onclick = () => {
    state.step = 1;
    viewWelcome();
  };
  // Confirm and proceed to quiz
  document.getElementById('goProfile').onclick = () => {
    state.profession = document.getElementById('profession').value.trim();
    state.education = document.getElementById('education').value.trim();
    state.dob = document.getElementById('dob').value;
    state.idx = 0;
    state.x = 0; state.y = 0; state.z = 0;
    state.weightTotals = { economia: 0, dirittocivilismo: 0, establishment: 0 };
    state.answers = [];
    loadQuestions().then(() => viewQuiz());
  };
}

/**
 * Renders the quiz view.  Displays the current question and answer
 * options, a progress indicator, and navigation controls.  When the
 * user answers or skips ahead, the appropriate state updates occur.
 */
function viewQuiz() {
  state.step = 3;
  // If we've answered all questions, finish
  if (state.idx >= state.questions.length) {
    finish();
    return;
  }
  const q = state.questions[state.idx];
  const total = state.questions.length;
  const half = Math.floor(total / 2);
  const progress = Math.round((state.idx / total) * 100);
  app.innerHTML = navBar() + `
    <div class="card p-8 mx-auto max-w-3xl">
      <div class="flex items-center justify-between mb-4">
        <div class="text-sm text-gray-500">Domanda ${state.idx + 1} di ${total}</div>
        <div class="w-44 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div class="bg-indigo-600 h-2" style="width:${progress}%"></div>
        </div>
      </div>
      <h3 class="text-xl font-semibold text-gray-900 mb-6">${escapeHtml(q.title)}</h3>
      <div class="grid md:grid-cols-5 gap-3">
        ${['Sì molto','Sì','Non so','No','Molto no'].map((lbl, i) => {
          const value = [2, 1, 0, -1, -2][i];
          return `<button data-v="${value}" class="ans bg-white border border-gray-300 hover:border-indigo-500 hover:shadow-sm rounded-lg px-3 py-3 text-sm font-medium">${lbl}</button>`;
        }).join('')}
      </div>
      <div class="mt-6 flex justify-between">
        <button id="backQuiz" class="bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg px-4 py-2">Indietro</button>
        ${state.idx + 1 >= half ? `<button id="skipQuiz" class="bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg px-4 py-2">Vai alla fine</button>` : `<span></span>`}
        <button id="nextQuiz" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg px-4 py-2">Avanti</button>
      </div>
    </div>
  `;
  // Attach nav event
  const nav = document.getElementById('navReviews');
  if (nav) nav.onclick = () => { state.step = 6; viewReviews(); };
  // Handle answer selection
  document.querySelectorAll('.ans').forEach((btn) => {
    btn.onclick = () => {
      const score = parseInt(btn.dataset.v, 10);
      applyScore(q, score);
      state.answers[state.idx] = score;
      stepForward();
    };
  });
  // Back button: go back one question or to profile
  document.getElementById('backQuiz').onclick = () => {
    stepBack();
  };
  // Next button: skip answering (counts as neutral 0)
  document.getElementById('nextQuiz').onclick = () => {
    stepForward();
  };
  // Skip to end button
  const skipBtn = document.getElementById('skipQuiz');
  if (skipBtn) skipBtn.onclick = () => {
    finish();
  };
}

/**
 * Adds a weighted score to the axes based on the provided question
 * configuration.  Each question carries an explicit weight for all
 * three components so that future adjustments can rebalance their
 * influence without touching the code.
 */
function applyScore(question, value) {
  if (!question || !question.weights) return;
  const weights = question.weights;
  state.x += (Number(weights.economia) || 0) * value;
  state.y += (Number(weights.dirittocivilismo) || 0) * value;
  state.z += (Number(weights.establishment) || 0) * value;
}

/** Advances to the next question or finishes if at the end */
function stepForward() {
  if (state.idx < state.questions.length - 1) {
    state.idx++;
    viewQuiz();
  } else {
    finish();
  }
}

/** Goes back to the previous question or to the profile view */
function stepBack() {
  if (state.idx === 0) {
    state.step = 2;
    viewProfile();
    return;
  }
  // Roll back the previous answer's score
  const prevQ = state.questions[state.idx];
  const prevScore = state.answers[state.idx];
  if (prevScore !== undefined) {
    applyScore(prevQ, -prevScore);
    state.answers[state.idx] = undefined;
  }
  state.idx--;
  viewQuiz();
}

/** Finalizes the quiz and transitions to the result view */
function finish() {
  state.step = 4;
  viewResult();
}

/** Computes spherical coordinates and quadrant for the current scores.  The
 *  sphere is divided into 4 sectors around the azimuth (phi) and 4
 *  sectors for the polar angle (theta), yielding 16 quadrants.
 */
function computeResults() {
  const normalized = getNormalizedScores();
  const { x, y, z } = normalized;
  const r = Math.sqrt(x * x + y * y + z * z) || 0;
  const theta = r ? Math.acos(z / (r || 1)) : 0; // 0..π
  let phi = Math.atan2(y, x);             // -π..π
  // Normalize phi to 0..2π
  if (phi < 0) phi += 2 * Math.PI;
  // Determine sectors for phi and theta
  const phiSector = Math.floor((phi / (2 * Math.PI)) * 4);   // 0..3
  const thetaSector = Math.floor((theta / Math.PI) * 4);      // 0..3
  const quadrant16 = Math.min(phiSector * 4 + thetaSector + 1, 16);         // 1..16
  const quadrantMeta = quadrantFromVector(x, y, z);
  const extra = getQuadrantDetails(quadrantMeta.index);
  return {
    r,
    theta,
    phi,
    thetaDeg: rad2deg(theta),
    phiDeg: rad2deg(phi),
    quadrant16,
    descriptor: extra?.content || quadrantMeta.descriptor,
    color: quadrantMeta.color,
    phiSector: quadrantMeta.phiSector,
    thetaSector: quadrantMeta.thetaSector,
    x,
    y,
    z,
    normalized,
    raw: { x: state.x, y: state.y, z: state.z },
    quadrantInfo: extra
  };
}

/** Renders the minimal result view showing only the quadrant number and
 *  a placeholder description.  Provides buttons to view insights,
 *  restart the test, and leave a review.
 */
function viewResult() {
  state.step = 4;
  // Calcola il quadrante e prepara la descrizione
  const result = computeResults();
  const { quadrant16, descriptor, color, normalized } = result;
  const description = descriptor || `Quadrante ${quadrant16}`;
  // Mostra anche i punteggi cartesiani nella pagina di riepilogo
  const { x, y, z } = normalized;
  app.innerHTML = navBar() + `
    <div class="card p-8 mx-auto max-w-3xl">
      <h3 class="text-2xl font-bold mb-4">Il tuo risultato</h3>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center justify-center w-10 h-10 rounded-full border border-gray-200" style="background:${color.css};"></span>
        <div>
          <p class="text-xl font-semibold text-indigo-700">Quadrante ${quadrant16}</p>
          <p class="mt-1 text-gray-700 text-sm sm:text-base">${description}</p>
        </div>
      </div>
      <div class="mt-4 space-y-1 text-gray-800 text-sm">
        <div><span class="font-semibold">x (economia normalizzata):</span> ${round(x)}</div>
        <div><span class="font-semibold">y (dirittocivilismo normalizzato):</span> ${round(y)}</div>
        <div><span class="font-semibold">z (fedeltà all'establishment normalizzata):</span> ${round(z)}</div>
        <p class="text-xs text-gray-500">Valori normalizzati in base al peso complessivo delle domande (range [-1, 1]).</p>
      </div>
      <div class="mt-6 flex gap-3">
        <button id="showInsights" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg px-4 py-3">Visualizza insights</button>
        <button id="restartTest" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg px-4 py-3">Ricomincia</button>
      </div>
      <div class="mt-8">
        <h4 class="text-lg font-semibold mb-2">Lascia una recensione</h4>
        <textarea id="reviewInput" class="w-full rounded-lg border border-gray-300 p-3 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="La tua recensione..."></textarea>
        <button id="submitReview" class="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg px-4 py-2">Invia recensione</button>
        <p id="reviewMsg" class="text-sm mt-2"></p>
      </div>
    </div>
  `;
  // Attach nav event
  const nav = document.getElementById('navReviews');
  if (nav) nav.onclick = () => { state.step = 6; viewReviews(); };
  // Insights button
  document.getElementById('showInsights').onclick = () => {
    viewInsights();
  };
  // Restart button
  document.getElementById('restartTest').onclick = () => {
    // Reset state and go back to language selection
    state.language = 'it';
    state.name = '';
    state.profession = '';
    state.education = '';
    state.dob = '';
    state.idx = 0;
    state.x = 0; state.y = 0; state.z = 0;
    state.weightTotals = { economia: 0, dirittocivilismo: 0, establishment: 0 };
    state.answers = [];
    viewLanguage();
  };
  // Submit review button
  document.getElementById('submitReview').onclick = () => {
    submitReview();
  };
}

/**
 * Renders the detailed insights view showing raw scores, spherical
 * coordinates, quadrant, and a Three.js visualization.  Provides
 * buttons to go back to the minimal result and to restart the test.
 */
function viewInsights() {
  state.step = 5;
  const res = computeResults();
  const { r, phiDeg, thetaDeg, quadrant16, descriptor, color, normalized, raw, quadrantInfo } = res;
  const totals = state.weightTotals || { economia: 0, dirittocivilismo: 0, establishment: 0 };
  const legend = getQuadrantLegend();
  const stats = [
    { key: 'economia', label: 'Economia', value: normalized.x, raw: raw.x, total: totals.economia },
    { key: 'dirittocivilismo', label: 'Diritti civili', value: normalized.y, raw: raw.y, total: totals.dirittocivilismo },
    { key: 'establishment', label: 'Establishment', value: normalized.z, raw: raw.z, total: totals.establishment }
  ];
  const formatBounds = (bounds) => {
    if (!bounds) return '';
    const phi = Array.isArray(bounds.phi) ? `φ ${round(bounds.phi[0])}° – ${round(bounds.phi[1])}°` : '';
    const theta = Array.isArray(bounds.theta) ? `θ ${round(bounds.theta[0])}° – ${round(bounds.theta[1])}°` : '';
    return [phi, theta].filter(Boolean).join(' · ');
  };
  const affiliations = quadrantInfo?.affiliazionepolitica;
  const affiliationList = Array.isArray(affiliations) ? affiliations : (affiliations ? [affiliations] : []);
  app.innerHTML = navBar() + `
    <div class="card p-8 mx-auto max-w-5xl">
      <h3 class="text-2xl font-bold mb-4">Dettaglio del risultato</h3>
      <div class="flex items-start gap-3 mb-6">
        <span class="inline-flex items-center justify-center w-12 h-12 rounded-full border border-gray-200" style="background:${color.css};"></span>
        <div>
          <p class="text-lg font-semibold text-indigo-700">Quadrante ${quadrant16}</p>
          <p class="text-gray-700 text-sm sm:text-base">${escapeHtml(descriptor)}</p>
          ${quadrantInfo && quadrantInfo.name ? `<p class="text-xs text-gray-500 mt-1">${escapeHtml(quadrantInfo.name)} · ${escapeHtml(formatBounds(quadrantInfo.bounds))}</p>` : ''}
          ${affiliationList.length ? `<p class="text-xs text-gray-500 mt-1">Esempi: ${affiliationList.map(escapeHtml).join(', ')}</p>` : ''}
        </div>
      </div>
      <div class="grid md:grid-cols-2 gap-6">
        <div class="space-y-3 text-sm sm:text-base text-gray-800">
          <div><span class="font-semibold">r:</span> ${round(r)}</div>
          <div><span class="font-semibold">φ:</span> ${round(phiDeg)}°</div>
          <div><span class="font-semibold">θ:</span> ${round(thetaDeg)}°</div>
          <div class="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-indigo-900 text-sm space-y-2">
            ${stats.map((stat) => `
              <div>
                <p class="font-semibold">${stat.label}</p>
                <p>Valore normalizzato: ${round(stat.value)}</p>
                <p class="text-xs">Valore grezzo: ${round(stat.raw)} · Peso totale: ${round(stat.total)}</p>
              </div>
            `).join('')}
            <p class="text-xs text-indigo-700">Le coordinate sono normalizzate in base al peso complessivo delle domande per ciascun asse (range [-1, 1]).</p>
          </div>
        </div>
        <div>
          <div class="border-b border-gray-200 flex items-center gap-2">
            <button class="tab-btn px-4 py-2 text-sm font-semibold text-indigo-700 border-b-2 border-indigo-600" data-tab-target="sphere">Sfera politica</button>
            <button class="tab-btn px-4 py-2 text-sm font-semibold text-gray-500 hover:text-indigo-600" data-tab-target="cartesian">Coordinate cartesiane</button>
          </div>
          <div id="tabSphere" class="pt-4">
            <div id="sphereMount" class="w-full"></div>
            <p class="text-xs text-gray-500 mt-2">Ruota la sfera per esplorare i quadranti politici colorati.</p>
          </div>
          <div id="tabCartesian" class="pt-4 hidden">
            <div id="cartesianMount" class="w-full h-64 rounded-lg border border-indigo-100 bg-white"></div>
            <div class="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-sm text-indigo-900 space-y-1 mt-4">
              <p class="text-xs text-indigo-700">Grafico cartesiano 3D con assi normalizzati (range [-1, 1]).</p>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-6">
        <h4 class="text-base font-semibold text-gray-700 mb-3">Legenda dei quadranti</h4>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-gray-600">
          ${legend.map(({ number, name, descriptor: desc, bounds, affiliation, color }) => `
            <div class="flex flex-col gap-2 bg-gray-50 rounded-md p-3 border border-gray-100">
              <div class="flex items-center gap-2">
                <span class="inline-flex w-3 h-3 rounded-full" style="background:${color};"></span>
                <p class="font-semibold text-gray-800">Quadrante ${number}${name ? ` · ${escapeHtml(name)}` : ''}</p>
              </div>
              <p>${escapeHtml(desc)}</p>
              ${bounds ? `<p class="text-[10px] uppercase tracking-wide text-gray-400">${escapeHtml(formatBounds(bounds))}</p>` : ''}
              ${affiliation ? `<p class="text-[11px] text-gray-500">Esempi: ${Array.isArray(affiliation) ? affiliation.map(escapeHtml).join(', ') : escapeHtml(affiliation)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="mt-6 flex gap-3">
        <button id="backResult" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg px-4 py-2">Indietro</button>
        <button id="restartFromInsights" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg px-4 py-2">Ricomincia</button>
      </div>
    </div>
  `;
  // Attach nav event
  const nav = document.getElementById('navReviews');
  if (nav) nav.onclick = () => { state.step = 6; viewReviews(); };
  // Back to minimal result
  document.getElementById('backResult').onclick = () => {
    viewResult();
  };
  // Restart
  document.getElementById('restartFromInsights').onclick = () => {
    state.language = 'it';
    state.name = '';
    state.profession = '';
    state.education = '';
    state.dob = '';
    state.idx = 0;
    state.x = 0; state.y = 0; state.z = 0;
    state.weightTotals = { economia: 0, dirittocivilismo: 0, establishment: 0 };
    state.answers = [];
    viewLanguage();
  };
  const sphereMount = document.getElementById('sphereMount');
  const cartesianMount = document.getElementById('cartesianMount');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const sphereTab = document.getElementById('tabSphere');
  const cartesianTab = document.getElementById('tabCartesian');
  let sphereInitialized = false;
  let cartesianInitialized = false;

  function ensureSphere() {
    if (!sphereInitialized && sphereMount) {
      initSphere(sphereMount, normalized, { color: color.css });
      sphereInitialized = true;
    }
  }

  function ensureCartesian() {
    if (!cartesianInitialized && cartesianMount) {
      initCartesianPlot(cartesianMount, normalized, { color: color.css });
      cartesianInitialized = true;
    }
  }

  function activateTab(name) {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tabTarget === name;
      btn.classList.toggle('text-indigo-700', isActive);
      btn.classList.toggle('border-indigo-600', isActive);
      btn.classList.toggle('border-b-2', isActive);
      if (!isActive) {
        btn.classList.add('text-gray-500');
        btn.classList.remove('text-indigo-700');
      } else {
        btn.classList.remove('text-gray-500');
      }
    });
    sphereTab.classList.toggle('hidden', name !== 'sphere');
    cartesianTab.classList.toggle('hidden', name !== 'cartesian');
    if (name === 'sphere') {
      ensureSphere();
    } else if (name === 'cartesian') {
      ensureCartesian();
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tabTarget));
  });

  activateTab('sphere');
}

/**
 * Handles submission of a review from the minimal result view.  Checks for
 * empty text, detects VPN/private IPs, enforces single review per name
 * and IP, and saves valid reviews to localStorage.
 */
async function submitReview() {
  const textarea = document.getElementById('reviewInput');
  const msgElem = document.getElementById('reviewMsg');
  const text = textarea.value.trim();
  msgElem.className = 'text-sm mt-2 text-red-600';
  if (!text) {
    msgElem.textContent = 'Inserisci la tua recensione.';
    return;
  }
  const ip = await getUserIP();
  if (!ip || isPrivateIP(ip)) {
    msgElem.textContent = 'Non puoi lasciare una recensione con VPN o IP non rilevabile.';
    return;
  }
  const reviews = loadReviews();
  if (reviews.some(r => r.ip === ip || r.name.toLowerCase() === state.name.toLowerCase())) {
    msgElem.textContent = 'Hai già lasciato una recensione.';
    return;
  }
  const review = {
    name: state.name,
    ip: ip,
    message: text,
    date: new Date().toISOString()
  };
  saveReview(review);
  // Success message
  msgElem.className = 'text-sm mt-2 text-green-600';
  msgElem.textContent = 'Recensione inviata! Grazie.';
  textarea.disabled = true;
  document.getElementById('submitReview').disabled = true;
}

/**
 * Renders the reviews page, listing all saved reviews.  Provides an
 * option to return to the welcome page.  Each review shows the
 * author's name, date and message.
 */
function viewReviews() {
  state.step = 6;
  const reviews = loadReviews();
  let listHTML = '';
  if (!reviews.length) {
    listHTML = '<p class="text-gray-600">Nessuna recensione disponibile.</p>';
  } else {
    listHTML = reviews.map(r => {
      const dateStr = new Date(r.date).toLocaleString();
      return `<div class="p-4 border-b">
        <div class="font-semibold">${escapeHtml(r.name)}</div>
        <div class="text-xs text-gray-500">${escapeHtml(dateStr)}</div>
        <p class="mt-1 text-gray-800">${escapeHtml(r.message)}</p>
      </div>`;
    }).join('');
  }
  app.innerHTML = navBar() + `
    <div class="card p-8 mx-auto max-w-4xl">
      <h3 class="text-2xl font-bold mb-4">Recensioni degli utenti</h3>
      <div class="divide-y">${listHTML}</div>
      <div class="mt-6">
        <button id="backFromReviews" class="bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg px-4 py-2">Indietro</button>
      </div>
    </div>
  `;
  // Attach nav event (stay on reviews)
  const nav = document.getElementById('navReviews');
  if (nav) nav.onclick = () => { /* already here */ };
  // Back button returns to welcome view
  document.getElementById('backFromReviews').onclick = () => {
    state.step = 1;
    viewWelcome();
  };
}

/**
 * Initializes a Three.js scene to render a unit sphere with a small
 * dot representing the user's normalized position.  The sphere is
 * coloured by quadrants and can be orbited by the user.  Called from
 * viewInsights() after the #sphereMount container exists.
 */
function initSphere(mount, point, options = {}) {
  // Fallback message if Three.js fails
  if (!THREE || !OrbitControls) {
    mount.innerHTML = '<div class="p-4 text-sm text-red-600">Impossibile caricare Three.js.</div>';
    return;
  }
  const highlight = new THREE.Color(options.color || '#ff2d2d');
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 100);
  camera.position.set(2.2, 1.6, 2.2);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  mount.innerHTML = '';
  mount.appendChild(renderer.domElement);
  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(3, 3, 4);
  scene.add(dir);
  // Colourful sphere
  const sphereGeo = new THREE.SphereGeometry(1, 48, 48);
  const position = sphereGeo.attributes.position;
  const colorArray = [];
  const tempColor = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const quadrant = quadrantFromVector(x, y, z);
    tempColor.setHex(QUADRANT_COLORS[quadrant.index]);
    colorArray.push(tempColor.r, tempColor.g, tempColor.b);
  }
  sphereGeo.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
  const sphereMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.45, opacity: 0.85, transparent: true });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(sphere);
  // Wireframe overlay
  const wire = new THREE.WireframeGeometry(sphereGeo);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x8fb2ff });
  const wireMesh = new THREE.LineSegments(wire, wireMat);
  scene.add(wireMesh);
  // Red dot
  const dotGeo = new THREE.SphereGeometry(0.05, 24, 24);
  const dotMat = new THREE.MeshStandardMaterial({ color: highlight, emissive: highlight.clone().multiplyScalar(0.4), metalness: 0.2, roughness: 0.35 });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.set(point.x, point.y, point.z);
  scene.add(dot);
  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  // Responsive resize
  const ro = new ResizeObserver(() => {
    const w = mount.clientWidth || 400;
    const h = mount.clientHeight || 300;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(mount);
  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

function initCartesianPlot(mount, point, options = {}) {
  if (!THREE || !OrbitControls) {
    mount.innerHTML = '<div class="p-4 text-sm text-red-600">Impossibile caricare Three.js.</div>';
    return;
  }
  const highlight = new THREE.Color(options.color || '#ff2d2d');
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 100);
  camera.position.set(1.6, 1.6, 1.6);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  mount.innerHTML = '';
  mount.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const directional = new THREE.DirectionalLight(0xffffff, 0.5);
  directional.position.set(3, 4, 5);
  scene.add(directional);

  const grid = new THREE.GridHelper(2, 8, 0xdbeafe, 0xe0f2fe);
  grid.position.y = 0;
  scene.add(grid);

  const axisLength = 1.2;
  const axes = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xf97316 },
    { dir: new THREE.Vector3(0, 1, 0), color: 0x22c55e },
    { dir: new THREE.Vector3(0, 0, 1), color: 0x3b82f6 }
  ];
  axes.forEach(({ dir, color }) => {
    const arrow = new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(0, 0, 0), axisLength, color, 0.08, 0.04);
    scene.add(arrow);
    const negative = new THREE.ArrowHelper(dir.clone().normalize().multiplyScalar(-1), new THREE.Vector3(0, 0, 0), axisLength, color, 0.08, 0.04);
    scene.add(negative);
  });

  const clamp = (n) => Math.max(-1, Math.min(1, Number.isFinite(n) ? n : 0));
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 32, 32),
    new THREE.MeshStandardMaterial({ color: highlight })
  );
  sphere.position.set(clamp(point.x), clamp(point.y), clamp(point.z));
  scene.add(sphere);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.update();

  function onResize() {
    const { clientWidth, clientHeight } = mount;
    if (!clientWidth || !clientHeight) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
  }

  window.addEventListener('resize', onResize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupAccessGate(() => {
    loadQuadrants();
    viewLanguage();
  });
});
