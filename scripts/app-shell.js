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

  const lectureWord = '(?:lecture|lesson|class|session|topic|tema|lecci[oó]n|clase|sesi[oó]n|gaia|saioa|ikasgaia)';
  const explicitLecturePattern = new RegExp('\b' + lectureWord + '\s*(?:no\.?|n[ºo]\.?|#)?\s*(\d{1,3})\b', 'i');
  const idLecturePattern = new RegExp(lectureWord + '[-_\s]*(\d{1,3})', 'i');
  const leadingNumberPattern = /^s*(d{1,2})s*[.):-]s*(S.{2,})$/;

  let config = { source: './aula_interactiva.html', default: 'smart-latest', lectures: [] };
  let lectures = [];
  let currentKey = null;
  let latestKey = null;
  let lastVisitedKey = localStorage.getItem(STORAGE.lastVisited);
  let initialized = false;

  const normalizeText = value => (value || '').replace(/s+/g, ' ').trim();
  const numeric = value => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  };

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    backdrop.hidden = !open;
    if (open) {
      const selected = list.querySelector('[aria-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }

  function keyFor(number, label, index) {
    if (number !== null) return 'lecture-' + number;
    const slug = normalizeText(label).toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48);
    return slug ? 'lecture-' + slug : 'lecture-' + (index + 1);
  }

  function labelFor(element) {
    if (!element) return '';
    if (element.tagName === 'OPTION') return normalizeText(element.textContent);
    return normalizeText(
      element.getAttribute('aria-label') ||
      element.getAttribute('data-title') ||
      element.getAttribute('title') ||
      element.textContent
    );
  }

  function elementNumber(element, label) {
    const sources = [
      label,
      element?.id,
      element?.getAttribute?.('href'),
      element?.getAttribute?.('data-lecture'),
      element?.getAttribute?.('data-lesson'),
      element?.getAttribute?.('data-session'),
      element?.getAttribute?.('data-topic')
    ].filter(Boolean);
    for (const source of sources) {
      const text = String(source);
      const match = text.match(explicitLecturePattern) || text.match(idLecturePattern);
      if (match) return numeric(match[1]);
    }
    return null;
  }

  function actionFor(element) {
    if (!element) return null;
    const href = element.getAttribute?.('href');
    if (href && href.startsWith('#')) return { type: 'hash', value: href };
    if (element.id) return { type: 'scroll-id', value: element.id };
    return { type: 'element', element };
  }

  function explicitCandidates(doc) {
    const selector = [
      '[data-lecture]', '[data-lesson]', '[data-session]', '[data-topic]',
      '[id*="lecture" i]', '[id*="lesson" i]', '[id*="session" i]', '[id*="topic" i]',
      '[id*="tema" i]', '[id*="leccion" i]', '[id*="lección" i]', '[id*="clase" i]',
      'a[href*="lecture" i]', 'a[href*="lesson" i]', 'a[href*="session" i]', 'a[href*="topic" i]',
      'a[href*="tema" i]', 'a[href*="leccion" i]', 'a[href*="clase" i]',
      'nav a', 'nav button', 'aside a', 'aside button', '[role="tab"]',
      'h1', 'h2', 'h3', 'h4'
    ].join(',');

    const found = [];
    doc.querySelectorAll(selector).forEach((element, index) => {
      const label = labelFor(element);
      if (!label || label.length > 160) return;
      const number = elementNumber(element, label);
      if (number === null) return;
      found.push({
        key: keyFor(number, label, index),
        number,
        label,
        action: actionFor(element),
        order: index,
        element
      });
    });
    return found;
  }

  function numberedNavigationCandidates(doc) {
    const containers = [...doc.querySelectorAll('nav, aside, [class*="sidebar" i], [class*="menu" i], [class*="navigation" i], [class*="chapters" i], [class*="lectures" i]')];
    const candidates = [];
    containers.forEach((container, containerIndex) => {
      const local = [];
      container.querySelectorAll('a, button, [role="button"], [role="tab"], option').forEach((element, index) => {
        const label = labelFor(element);
        const match = label.match(leadingNumberPattern);
        if (!match || label.length > 140) return;
        const number = numeric(match[1]);
        if (number === null) return;
        local.push({
          key: keyFor(number, label, index),
          number,
          label,
          action: actionFor(element),
          order: index,
          element,
          containerIndex
        });
      });
      const uniqueNumbers = new Set(local.map(item => item.number));
      if (uniqueNumbers.size >= 2 && uniqueNumbers.size <= 40) candidates.push(...local);
    });
    return candidates;
  }

  function fromManualConfig(doc) {
    if (!Array.isArray(config.lectures) || config.lectures.length === 0) return [];
    return config.lectures.map((item, index) => {
      const number = numeric(item.number ?? item.id);
      let action = null;
      if (item.hash) action = { type: 'hash', value: item.hash.startsWith('#') ? item.hash : '#' + item.hash };
      if (item.selector) {
        const element = doc.querySelector(item.selector);
        if (element) action = { type: 'element', element };
      }
      if (item.id && !action) action = { type: 'scroll-id', value: String(item.id) };
      return {
        key: item.key || keyFor(number, item.title || item.label, index),
        number,
        label: normalizeText(item.title || item.label || 'Lecture ' + (number ?? index + 1)),
        action,
        order: index,
        element: action?.element || null
      };
    }).filter(item => item.action);
  }

  function dedupeAndSort(items) {
    const byNumber = new Map();
    const byKey = new Map();

    for (const item of items) {
      if (!item.action || !item.label) continue;
      if (item.number !== null) {
        const existing = byNumber.get(item.number);
        if (!existing || scoreCandidate(item) > scoreCandidate(existing)) byNumber.set(item.number, item);
      } else if (!byKey.has(item.key)) {
        byKey.set(item.key, item);
      }
    }

    const result = [...byNumber.values(), ...byKey.values()];
    result.sort((a, b) => {
      if (a.number !== null && b.number !== null) return a.number - b.number;
      if (a.number !== null) return -1;
      if (b.number !== null) return 1;
      return a.order - b.order;
    });
    return result;
  }

  function scoreCandidate(item) {
    let score = 0;
    const tag = item.element?.tagName || '';
    if (/^(A|BUTTON|OPTION)$/.test(tag)) score += 4;
    if (item.element?.closest?.('nav, aside, [role="navigation"]')) score += 3;
    if (item.action?.type === 'hash') score += 2;
    if (item.label.length < 80) score += 1;
    return score;
  }

  function discoverLectures(doc) {
    const manual = fromManualConfig(doc);
    if (manual.length) return dedupeAndSort(manual);

    const explicit = explicitCandidates(doc);
    const numbered = numberedNavigationCandidates(doc);
    const discovered = dedupeAndSort([...explicit, ...numbered]);

    if (discovered.length > 50) return discovered.filter(item => item.element?.closest?.('nav, aside, [role="navigation"]'));
    return discovered;
  }

  function navigateTo(lecture, { remember = true, close = true } = {}) {
    if (!lecture) return false;
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) return false;

    try {
      switch (lecture.action.type) {
        case 'hash':
          win.location.hash = lecture.action.value;
          break;
        case 'scroll-id': {
          const target = doc.getElementById(lecture.action.value);
          if (!target) return false;
          if (typeof target.click === 'function' && /^(A|BUTTON)$/.test(target.tagName)) target.click();
          else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
        case 'element': {
          const target = lecture.action.element;
          if (!target?.isConnected) return false;
          if (target.tagName === 'OPTION') {
            const select = target.closest('select');
            if (select) {
              select.value = target.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else if (typeof target.click === 'function') {
            target.click();
          } else {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          break;
        }
        default:
          return false;
      }
    } catch (error) {
      console.warn('Project Engineering lecture navigation failed:', error);
      return false;
    }

    setCurrent(lecture, remember);
    if (close) setMenu(false);
    return true;
  }

  function setCurrent(lecture, remember = true) {
    currentKey = lecture.key;
    currentLabel.textContent = lecture.label;
    if (remember) {
      lastVisitedKey = lecture.key;
      localStorage.setItem(STORAGE.lastVisited, lecture.key);
    }
    renderList();
  }

  function renderList() {
    list.replaceChildren();
    if (!lectures.length) {
      const empty = document.createElement('div');
      empty.className = 'lecture-empty';
      empty.textContent = 'The lecture file is open, but no numbered lecture navigator was detected. The app will keep working normally; explicit lecture mappings can be added in data/lectures.json.';
      list.append(empty);
      latestButton.disabled = true;
      continueButton.disabled = true;
      return;
    }

    for (const lecture of lectures) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lecture-option';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(lecture.key === currentKey));

      const title = document.createElement('span');
      title.className = 'lecture-option-title';
      title.textContent = lecture.label;
      button.append(title);

      if (lecture.key === latestKey) {
        const badge = document.createElement('span');
        badge.className = 'lecture-option-badge';
        badge.textContent = 'Latest';
        button.append(badge);
      }

      button.addEventListener('click', () => navigateTo(lecture));
      list.append(button);
    }

    latestButton.disabled = !latestKey;
    continueButton.disabled = !lastVisitedKey || !lectures.some(item => item.key === lastVisitedKey);
  }

  function chooseInitialLecture() {
    if (!lectures.length) {
      currentLabel.textContent = 'Lecture navigator';
      status.textContent = 'Lecture file ready';
      return;
    }

    const latest = lectures[lectures.length - 1];
    latestKey = latest.key;
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get('lecture') || '').trim().toLowerCase();
    const lastSeenLatest = localStorage.getItem(STORAGE.lastSeenLatest);

    let target = null;
    if (requested === 'latest') {
      target = latest;
    } else if (requested === 'continue') {
      target = lectures.find(item => item.key === lastVisitedKey) || latest;
    } else if (requested) {
      target = lectures.find(item =>
        item.key.toLowerCase() === requested ||
        String(item.number ?? '') === requested ||
        item.label.toLowerCase().includes(requested)
      );
    }

    if (!target) {
      if (lastSeenLatest !== latestKey) target = latest;
      else target = lectures.find(item => item.key === lastVisitedKey) || latest;
    }

    localStorage.setItem(STORAGE.lastSeenLatest, latestKey);
    navigateTo(target, { remember: true, close: false });
    status.textContent = lectures.length + ' lecture' + (lectures.length === 1 ? '' : 's') + ' available';
  }

  function observeInternalNavigation(doc) {
    const candidateElements = new Map();
    lectures.forEach(lecture => {
      if (lecture.element) candidateElements.set(lecture.element, lecture);
    });

    doc.addEventListener('click', event => {
      let node = event.target;
      while (node && node !== doc) {
        const lecture = candidateElements.get(node);
        if (lecture) {
          setCurrent(lecture, true);
          break;
        }
        node = node.parentElement;
      }
    }, true);

    frame.contentWindow?.addEventListener('hashchange', () => {
      const hash = frame.contentWindow.location.hash;
      const lecture = lectures.find(item => item.action.type === 'hash' && item.action.value === hash);
      if (lecture) setCurrent(lecture, true);
    });
  }

  async function initializeFrame() {
    shell.classList.add('is-loading');
    status.textContent = 'Discovering lectures…';
    await new Promise(resolve => setTimeout(resolve, 60));

    const doc = frame.contentDocument;
    if (!doc) {
      currentLabel.textContent = 'Lecture navigator unavailable';
      status.textContent = 'Could not access lecture document';
      shell.classList.remove('is-loading');
      return;
    }

    let found = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      found = discoverLectures(doc);
      if (found.length >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 180));
    }

    lectures = found;
    renderList();
    chooseInitialLecture();
    observeInternalNavigation(doc);
    shell.classList.remove('is-loading');
    initialized = true;
  }

  async function loadConfig() {
    try {
      const response = await fetch('./data/lectures.json', { cache: 'no-store' });
      if (response.ok) config = { ...config, ...(await response.json()) };
    } catch (error) {
      console.info('Using automatic lecture discovery.', error);
    }
    if (config.source) frame.src = config.source;
  }

  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  closeButton.addEventListener('click', () => setMenu(false));
  backdrop.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMenu(false);
  });

  latestButton.addEventListener('click', () => {
    const lecture = lectures.find(item => item.key === latestKey) || lectures[lectures.length - 1];
    if (lecture) navigateTo(lecture);
  });

  continueButton.addEventListener('click', () => {
    const lecture = lectures.find(item => item.key === lastVisitedKey);
    if (lecture) navigateTo(lecture);
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
    initializeFrame().catch(error => {
      console.error(error);
      status.textContent = 'Lecture navigator unavailable';
      shell.classList.remove('is-loading');
    });
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

  loadConfig().catch(() => {});
  if (frame.contentDocument?.readyState === 'complete' && !initialized) initializeFrame().catch(() => {});
})();
