(() => {
  'use strict';

  const frame = document.getElementById('lecture-frame');
  const shell = document.getElementById('lecture-shell');
  const toggle = document.getElementById('lecture-toggle');
  const menu = document.getElementById('lecture-menu');
  const closeButton = document.getElementById('lecture-close');
  const list = document.getElementById('lecture-list');
  const currentLabel = document.getElementById('current-lecture');
  const status = document.getElementById('lecture-status');
  const latestButton = document.getElementById('latest-lecture');
  const continueButton = document.getElementById('continue-lecture');
  const reloadButton = document.getElementById('reload-app');
  const backdrop = document.getElementById('menu-backdrop');

  const STORAGE = {
    lastVisited: 'pe:last-visited-lecture',
    lastSeenLatest: 'pe:last-seen-latest-lecture'
  };

  const FALLBACK = {
    latest: 'pm-mii-01',
    default: 'smart-latest',
    lectures: [
      {
        id: 'pm-mii-01',
        number: 1,
        title: 'Lecture 01 · Dirección de Proyectos',
        course: 'Project Management · M.Sc. Industrial Engineering · EHU',
        file: './lectures/01-direccion-de-proyectos.html'
      }
    ]
  };

  let config = FALLBACK;
  let lectures = [];
  let currentId = null;
  let latestId = null;
  let lastVisitedId = localStorage.getItem(STORAGE.lastVisited);

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    backdrop.hidden = !open;
    if (open) {
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }
  }

  function normalizeLecture(item, index) {
    if (!item || !item.file) return null;
    const number = Number.parseInt(item.number, 10);
    return {
      id: String(item.id || ('lecture-' + (Number.isFinite(number) ? number : index + 1))),
      number: Number.isFinite(number) ? number : index + 1,
      title: String(item.title || ('Lecture ' + String(index + 1).padStart(2, '0'))),
      course: String(item.course || ''),
      file: String(item.file)
    };
  }

  function setCurrent(lecture, remember = true) {
    if (!lecture) return;
    currentId = lecture.id;
    currentLabel.textContent = lecture.title;
    document.title = lecture.title + ' · Project Engineering';
    if (remember) {
      lastVisitedId = lecture.id;
      localStorage.setItem(STORAGE.lastVisited, lecture.id);
    }
    renderList();
  }

  function openLecture(lecture, options = {}) {
    if (!lecture) return;
    const remember = options.remember !== false;
    const close = options.close !== false;
    const target = new URL(lecture.file, window.location.href).href;
    const current = frame.src ? new URL(frame.src, window.location.href).href : '';
    if (current !== target) frame.src = lecture.file;
    setCurrent(lecture, remember);
    if (close) setMenu(false);
  }

  function renderList() {
    list.replaceChildren();

    for (const lecture of lectures) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lecture-option';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(lecture.id === currentId));

      const copy = document.createElement('span');
      copy.className = 'lecture-option-copy';

      const title = document.createElement('span');
      title.className = 'lecture-option-title';
      title.textContent = lecture.title;
      copy.append(title);

      if (lecture.course) {
        const meta = document.createElement('span');
        meta.className = 'lecture-option-meta';
        meta.textContent = lecture.course;
        copy.append(meta);
      }

      button.append(copy);

      if (lecture.id === latestId) {
        const badge = document.createElement('span');
        badge.className = 'lecture-option-badge';
        badge.textContent = 'Latest';
        button.append(badge);
      }

      button.addEventListener('click', () => openLecture(lecture));
      list.append(button);
    }

    latestButton.disabled = !latestId;
    continueButton.disabled = !lastVisitedId || !lectures.some(item => item.id === lastVisitedId);
  }

  function chooseInitialLecture() {
    if (!lectures.length) {
      currentLabel.textContent = 'No lectures configured';
      status.textContent = 'Add a lecture to data/lectures.json';
      return;
    }

    const configuredLatest = config.latest && lectures.find(item => item.id === String(config.latest));
    const latest = configuredLatest || lectures[lectures.length - 1];
    latestId = latest.id;

    const params = new URLSearchParams(window.location.search);
    const requested = (params.get('lecture') || '').trim().toLowerCase();
    const lastSeenLatest = localStorage.getItem(STORAGE.lastSeenLatest);

    let target = null;
    if (requested === 'latest') {
      target = latest;
    } else if (requested === 'continue') {
      target = lectures.find(item => item.id === lastVisitedId) || latest;
    } else if (requested) {
      target = lectures.find(item =>
        item.id.toLowerCase() === requested ||
        String(item.number) === requested ||
        item.title.toLowerCase().includes(requested)
      );
    }

    if (!target) {
      if (config.default === 'latest') target = latest;
      else if (lastSeenLatest !== latestId) target = latest;
      else target = lectures.find(item => item.id === lastVisitedId) || latest;
    }

    localStorage.setItem(STORAGE.lastSeenLatest, latestId);
    openLecture(target, { remember: true, close: false });
    status.textContent = lectures.length + ' lecture' + (lectures.length === 1 ? '' : 's') + ' available';
  }

  async function loadCatalog() {
    shell.classList.add('is-loading');
    status.textContent = 'Loading lecture catalog…';

    try {
      const response = await fetch('./data/lectures.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Catalog request failed');
      const loaded = await response.json();
      config = { ...FALLBACK, ...loaded };
    } catch (error) {
      console.warn('Using fallback lecture catalog.', error);
      config = FALLBACK;
    }

    lectures = (Array.isArray(config.lectures) ? config.lectures : [])
      .map(normalizeLecture)
      .filter(Boolean)
      .sort((a, b) => a.number - b.number);

    renderList();
    chooseInitialLecture();
    shell.classList.remove('is-loading');
  }

  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  closeButton.addEventListener('click', () => setMenu(false));
  backdrop.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMenu(false);
  });

  latestButton.addEventListener('click', () => {
    const lecture = lectures.find(item => item.id === latestId) || lectures[lectures.length - 1];
    openLecture(lecture);
  });

  continueButton.addEventListener('click', () => {
    const lecture = lectures.find(item => item.id === lastVisitedId);
    openLecture(lecture);
  });

  reloadButton.addEventListener('click', async () => {
    status.textContent = 'Checking for update…';
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    }
    window.location.reload();
  });

  frame.addEventListener('load', () => {
    if (currentId) status.textContent = lectures.length + ' lecture' + (lectures.length === 1 ? '' : 's') + ' available';
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');
        registration.update().catch(() => {});
      } catch (error) {
        console.warn('Service worker registration failed:', error);
      }
    });
  }

  loadCatalog().catch(error => {
    console.error(error);
    shell.classList.remove('is-loading');
    status.textContent = 'Lecture catalog unavailable';
  });
})();
