import * as THREE from 'three';
import { OrbitControls } from './lib/OrbitControls.js';

// Reference to the root app container
const app = document.getElementById('app');

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
  answers: []           // user answers
};

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
    state.questions = state.questionsByLang[lang];
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
    state.questionsByLang[lang] = data;
    state.questions = data;
  } catch (err) {
    console.error('Impossibile caricare le domande', err);
    state.questions = [];
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
      <h2 class="text-2xl font-bold mb-6">Seleziona la lingua</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <button class="lang-btn bg-indigo-600 text-white rounded-lg px-4 py-3" data-lang="it">Italiano</button>
        <button class="lang-btn bg-indigo-600 text-white rounded-lg px-4 py-3" data-lang="en">English</button>
        <button class="lang-btn bg-indigo-600 text-white rounded-lg px-4 py-3" data-lang="es">Español</button>
        <button class="lang-btn bg-indigo-600 text-white rounded-lg px-4 py-3" data-lang="fr">Français</button>
        <button class="lang-btn bg-indigo-600 text-white rounded-lg px-4 py-3" data-lang="de">Deutsch</button>
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
      applyScore(q.component, score);
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
 * Adds a score to the appropriate axis based on the component of the
 * current question.  The axes are mapped as follows:
 * - economia → x (economy)
 * - dirittocivilismo → y (civil rights/authoritarianism)
 * - establishment → z (fidelity to establishment)
 */
function applyScore(component, v) {
  if (component === 'economia') state.x += v;
  else if (component === 'dirittocivilismo') state.y += v;
  else if (component === 'establishment') state.z += v;
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
    applyScore(prevQ.component, -prevScore);
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
  const { x, y, z } = state;
  const r = Math.sqrt(x * x + y * y + z * z) || 0;
  const theta = r ? Math.acos(z / r) : 0; // 0..π
  let phi = Math.atan2(y, x);             // -π..π
  // Normalize phi to 0..2π
  if (phi < 0) phi += 2 * Math.PI;
  // Determine sectors for phi and theta
  const phiSector = Math.floor((phi / (2 * Math.PI)) * 4);   // 0..3
  const thetaSector = Math.floor((theta / Math.PI) * 4);      // 0..3
  const quadrant16 = phiSector * 4 + thetaSector + 1;         // 1..16
  return {
    r,
    theta,
    phi,
    thetaDeg: rad2deg(theta),
    phiDeg: rad2deg(phi),
    quadrant16,
    x, y, z
  };
}

/** Renders the minimal result view showing only the quadrant number and
 *  a placeholder description.  Provides buttons to view insights,
 *  restart the test, and leave a review.
 */
function viewResult() {
  state.step = 4;
  // Calcola il quadrante e prepara la descrizione
  const { quadrant16 } = computeResults();
  const description = `Quadrante ${quadrant16}: descrizione ${quadrant16}`;
  // Mostra anche i punteggi cartesiani nella pagina di riepilogo
  const { x, y, z } = state;
  app.innerHTML = navBar() + `
    <div class="card p-8 mx-auto max-w-3xl">
      <h3 class="text-2xl font-bold mb-4">Il tuo risultato</h3>
      <p class="text-xl font-semibold text-indigo-700">Quadrante ${quadrant16}</p>
      <p class="mt-2 text-gray-700">${description}</p>
      <div class="mt-4 space-y-1 text-gray-800 text-sm">
        <div><span class="font-semibold">x (economia):</span> ${x}</div>
        <div><span class="font-semibold">y (dirittocivilismo):</span> ${y}</div>
        <div><span class="font-semibold">z (fedeltà all'establishment):</span> ${z}</div>
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
  const { r, phiDeg, thetaDeg, quadrant16, x, y, z } = res;
  const denom = r || 1;
  const norm = { x: x / denom, y: y / denom, z: z / denom };
  app.innerHTML = navBar() + `
    <div class="card p-8 mx-auto max-w-5xl">
      <h3 class="text-2xl font-bold mb-4">Dettaglio del risultato</h3>
      <div class="grid md:grid-cols-2 gap-6">
        <div class="space-y-2">
          <div class="text-gray-800"><span class="font-semibold">r:</span> ${round(r)}</div>
          <div class="text-gray-800"><span class="font-semibold">φ:</span> ${round(phiDeg)}°</div>
          <div class="text-gray-800"><span class="font-semibold">θ:</span> ${round(thetaDeg)}°</div>
          <div class="text-gray-800"><span class="font-semibold">Quadrante:</span> ${quadrant16}</div>
        </div>
        <div>
          <div id="sphereMount" class="w-full"></div>
          <p class="text-xs text-gray-500 mt-2">Sfera blu (unitaria) con puntino rosso normalizzato.</p>
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
    state.answers = [];
    viewLanguage();
  };
  // Initialize the sphere visualization
  initSphere(document.getElementById('sphereMount'), norm);
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
 * red dot representing the user's normalized position.  The scene
 * includes subtle lighting and axes for orientation.  Called from
 * viewInsights() after the #sphereMount container exists.
 */
function initSphere(mount, point) {
  // Fallback message if Three.js fails
  if (!THREE || !OrbitControls) {
    mount.innerHTML = '<div class="p-4 text-sm text-red-600">Impossibile caricare Three.js.</div>';
    return;
  }
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
  // Blue sphere
  const sphereGeo = new THREE.SphereGeometry(1, 48, 48);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0x2d6cdf, metalness: 0.1, roughness: 0.6, opacity: 0.25, transparent: true });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(sphere);
  // Wireframe overlay
  const wire = new THREE.WireframeGeometry(sphereGeo);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x8fb2ff });
  const wireMesh = new THREE.LineSegments(wire, wireMat);
  scene.add(wireMesh);
  // Red dot
  const dotGeo = new THREE.SphereGeometry(0.05, 24, 24);
  const dotMat = new THREE.MeshStandardMaterial({ color: 0xff2d2d, emissive: 0x990000, metalness: 0.2, roughness: 0.4 });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.set(point.x, point.y, point.z);
  scene.add(dot);
  // Axes helper
  const axes = new THREE.AxesHelper(1.4);
  axes.material.depthTest = false;
  axes.renderOrder = 2;
  scene.add(axes);
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

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  viewLanguage();
});