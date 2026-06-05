(() => {
  const POPUP_ID = "japanese-drag-translate-popup";
  const NAVER_BASE = "https://ja.dict.naver.com/#/search?query=";
  const ADS_URL = chrome.runtime.getURL("ads.json");
  const KUROMOJI_SCRIPT_URL = chrome.runtime.getURL("vendor/kuromoji/kuromoji.js");
  const KUROMOJI_DICT_URL = chrome.runtime.getURL("vendor/kuromoji/dict/");
  const YOMIKATA_DEBUG = false;
  let adsCache = null;
  let tokenizerPromise = null;
  let timer = null;
  let lastText = "";

  function looksJapanese(text) {
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(text);
  }

  function cleanSelection(text) {
    return text.replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function debugYomikata(message, data) {
    if (!YOMIKATA_DEBUG) return;
    console.info(`[일본어 드래그 번역] ${message}`, data || "");
  }

  function warnYomikata(message, error) {
    console.warn(`[일본어 드래그 번역] ${message}`, error);
  }

  function katakanaToHiragana(text) {
    return text.replace(/[\u30a1-\u30f6]/g, char =>
      String.fromCharCode(char.charCodeAt(0) - 0x60)
    );
  }

  function removePopup() {
    const old = document.getElementById(POPUP_ID);
    if (old) old.remove();
  }

  function getRandomAd(ads) {
    return ads[Math.floor(Math.random() * ads.length)];
  }

  function hideAd(popup) {
    const adLink = popup.querySelector(".jdt-ad");
    if (adLink) adLink.hidden = true;
  }

  function isValidAd(ad) {
    return ad && ad.title && ad.description && ad.url;
  }

  function getTokenizer() {
    if (tokenizerPromise) return tokenizerPromise;

    tokenizerPromise = (async () => {
      const start = performance.now();
      debugYomikata("kuromoji tokenizer 초기화 시작", {
        scriptUrl: KUROMOJI_SCRIPT_URL,
        dictUrl: KUROMOJI_DICT_URL
      });

      if (!window.kuromoji) {
        await import(KUROMOJI_SCRIPT_URL);
      }

      const kuromojiLib = window.kuromoji;
      if (!kuromojiLib) {
        throw new Error("kuromoji.js is not loaded");
      }

      return new Promise((resolve, reject) => {
        kuromojiLib.builder({ dicPath: KUROMOJI_DICT_URL }).build((err, tokenizer) => {
          const durationMs = Math.round(performance.now() - start);
          if (err) {
            reject(err);
            return;
          }

          debugYomikata("kuromoji tokenizer 초기화 완료", {
            durationMs
          });
          resolve(tokenizer);
        });
      });
    })().catch(err => {
      tokenizerPromise = null;
      throw err;
    });

    return tokenizerPromise;
  }

  function getTokenReading(token) {
    const reading = token.reading && token.reading !== "*" ? token.reading : "";
    if (reading) return katakanaToHiragana(reading);

    const surface = token.surface_form || "";
    return looksJapanese(surface) ? surface : "";
  }

  async function getYomikata(text) {
    const start = performance.now();
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);
    const yomikata = tokens.map(getTokenReading).join("").trim();
    const durationMs = Math.round(performance.now() - start);

    debugYomikata("요미카타 분석 완료", {
      durationMs,
      selectedText: text,
      yomikata
    });

    return yomikata;
  }

  async function setupYomikata(popup, text) {
    const yomikataText = popup.querySelector(".jdt-yomikata-text");
    const yomikataSpinner = popup.querySelector(".jdt-yomikata-spinner");
    if (!yomikataText || !yomikataSpinner) return;

    yomikataText.textContent = "";
    yomikataText.hidden = true;
    yomikataSpinner.hidden = false;

    try {
      const result = await getYomikata(text);
      if (!document.body.contains(popup)) return;

      yomikataSpinner.hidden = true;
      if (!result) return;

      yomikataText.textContent = result;
      yomikataText.hidden = false;
    } catch (err) {
      warnYomikata("요미카타 분석 실패", {
        selectedText: text,
        error: err.message || String(err)
      });
      yomikataText.textContent = "";
      yomikataText.hidden = true;
      yomikataSpinner.hidden = true;
    }
  }

  async function loadAds() {
    if (adsCache) return adsCache;

    const response = await fetch(ADS_URL);
    if (!response.ok) {
      throw new Error(`Failed to load ads.json: ${response.status}`);
    }

    const ads = await response.json();
    if (!Array.isArray(ads)) {
      throw new Error("ads.json must contain an array");
    }

    adsCache = ads.filter(isValidAd);
    if (adsCache.length === 0) {
      throw new Error("ads.json does not contain usable ads");
    }

    return adsCache;
  }

  async function setupAd(popup) {
    try {
      const ads = await loadAds();
      const ad = getRandomAd(ads);
      const adLink = popup.querySelector(".jdt-ad");
      const adTitle = popup.querySelector(".jdt-ad-title");
      const adDescription = popup.querySelector(".jdt-ad-description");

      if (!ad || !adLink || !adTitle || !adDescription) {
        throw new Error("Ad area is unavailable");
      }

      adLink.href = ad.url;
      adTitle.textContent = ad.title;
      adDescription.textContent = ad.description;
      adLink.hidden = false;
    } catch (err) {
      console.warn("[일본어 드래그 번역] 광고 영역을 표시하지 못했습니다.", err);
      hideAd(popup);
    }
  }

  function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return rect;
  }

  function positionPopup(popup, rect) {
    const margin = 8;
    const popupWidth = 320;
    const left = Math.min(
      window.scrollX + rect.left,
      window.scrollX + window.innerWidth - popupWidth - margin
    );
    const top = window.scrollY + rect.bottom + margin;
    popup.style.left = `${Math.max(window.scrollX + margin, left)}px`;
    popup.style.top = `${top}px`;
  }

  function createPopup(text, rect) {
    removePopup();

    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    popup.innerHTML = `
      <div class="jdt-header">
        <div class="jdt-title">
          <div class="jdt-word"></div>
          <div class="jdt-yomikata" aria-live="polite">
            <span class="jdt-yomikata-spinner" aria-label="요미카타 로딩 중" hidden></span>
            <span class="jdt-yomikata-text" hidden></span>
          </div>
        </div>
        <button class="jdt-close" title="닫기">×</button>
      </div>
      <div class="jdt-result">한국어 번역 중...</div>
      <div class="jdt-actions">
        <a class="jdt-naver" target="_blank" rel="noopener noreferrer">네이버 사전</a>
        <button class="jdt-copy">복사</button>
      </div>
      <a class="jdt-ad" target="_blank" rel="noopener" aria-label="광고" hidden>
        <span class="jdt-ad-label">광고</span>
        <span class="jdt-ad-body">
          <span class="jdt-ad-title"></span>
          <span class="jdt-ad-description"></span>
        </span>
      </a>
      <div class="jdt-version">일본어 드래그 번역 v0.4</div>
    `;

    popup.querySelector(".jdt-word").textContent = text;
    popup.querySelector(".jdt-naver").href = NAVER_BASE + encodeURIComponent(text);
    popup.querySelector(".jdt-close").addEventListener("click", removePopup);
    popup.querySelector(".jdt-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        popup.querySelector(".jdt-copy").textContent = "복사됨";
        setTimeout(() => {
          const btn = popup.querySelector(".jdt-copy");
          if (btn) btn.textContent = "복사";
        }, 900);
      } catch (_) {}
    });

    document.body.appendChild(popup);
    positionPopup(popup, rect);
    return popup;
  }

  function requestTranslation(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "JP_STUDY_TRANSLATE", text },
        response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error(response?.error || "translation failed"));
            return;
          }
          resolve(response.translated);
        }
      );
    });
  }

  async function showForSelection() {
    const sel = window.getSelection();
    const text = cleanSelection(sel ? sel.toString() : "");
    if (!text || text === lastText || !looksJapanese(text)) return;

    const rect = getSelectionRect();
    if (!rect) return;
    lastText = text;

    const popup = createPopup(text, rect);
    const result = popup.querySelector(".jdt-result");
    const translation = requestTranslation(text);

    setupAd(popup);

    try {
      const translated = await translation;
      if (!document.body.contains(popup)) return;
      result.textContent = translated;
      setTimeout(() => setupYomikata(popup, text), 0);
    } catch (err) {
      console.warn("[일본어 드래그 번역] 번역 요청 실패", err);
      result.innerHTML = "자동 번역을 불러오지 못했어요.<br>아래 버튼으로 네이버 사전에서 확인해 주세요.";
      result.title = err.message || String(err);
    }
  }

  document.addEventListener("mouseup", () => {
    clearTimeout(timer);
    timer = setTimeout(showForSelection, 350);
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") removePopup();
    clearTimeout(timer);
    timer = setTimeout(showForSelection, 350);
  });

  document.addEventListener("mousedown", (event) => {
    const popup = document.getElementById(POPUP_ID);
    if (popup && !popup.contains(event.target)) {
      removePopup();
      lastText = "";
    }
  });
})();
