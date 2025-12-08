// Bridge - Real-time Translator (GPT-5-nano, low-latency) — full, runnable
// - Responses API
// - Sliding window input (FAST) + sentence-final correction (FINAL)
// - SSE lightweight parser (response.output_text.delta)
// - AbortController per request
document.addEventListener('DOMContentLoaded', () => {
  const DEFAULT_OPENAI_API_KEY = '';
  let OPENAI_API_KEY = '';

  // DOM - Screens
  const initialScreen = document.getElementById('initialScreen');
  const recordingScreen = document.getElementById('recordingScreen');

  // DOM - Buttons
  const startJapaneseBtn = document.getElementById('startJapaneseBtn');
  const startEnglishBtn = document.getElementById('startEnglishBtn');
  const stopBtn = document.getElementById('stopBtn');
  const stopBtnText = document.getElementById('stopBtnText');
  const resetBtn = document.getElementById('resetBtn');
  const resetBtnText = document.getElementById('resetBtnText');
  const settingsButton = document.getElementById('settingsButton');
  const saveApiKeysBtn = document.getElementById('saveApiKeys');
  const resetKeysBtn = document.getElementById('resetKeys');

  // DOM - Display Elements
  const statusEl = document.getElementById('status');
  const errEl = document.getElementById('errorMessage');
  const originalTextEl = document.getElementById('originalText');
  const translatedTextEl = document.getElementById('translatedText');
  const sourceLangEl = document.getElementById('sourceLanguage');
  const targetLangEl = document.getElementById('targetLanguage');
  const listeningIndicator = document.getElementById('listeningIndicator');
  const translatingIndicator = document.getElementById('translatingIndicator');
  const listeningText = document.getElementById('listeningText');
  const translatingText = document.getElementById('translatingText');
  const originalLabel = document.getElementById('originalLabel');
  const translatedLabel = document.getElementById('translatedLabel');

  // DOM - Modal
  const apiModal = document.getElementById('apiModal');
  const openaiKeyInput = document.getElementById('openaiKey');

  // DOM - Debounce Optimization
  const optimizeDebounceBtn = document.getElementById('optimizeDebounceBtn');
  const currentJaEl = document.getElementById('currentJa');
  const currentEnEl = document.getElementById('currentEn');
  const historyJaCountEl = document.getElementById('historyJaCount');
  const historyEnCountEl = document.getElementById('historyEnCount');
  const jaStatusEl = document.getElementById('jaStatus');
  const enStatusEl = document.getElementById('enStatus');
  const optimizationResultEl = document.getElementById('optimizationResult');

  // DOM - Font Controls
  const fontSizeSmallBtn = document.getElementById('fontSizeSmall');
  const fontSizeMediumBtn = document.getElementById('fontSizeMedium');
  const fontSizeLargeBtn = document.getElementById('fontSizeLarge');
  const fontSizeXLargeBtn = document.getElementById('fontSizeXLarge');

  // Speech
  let recognition = null;
  let isRecording = false;
  let recognitionError = false; // 音声認識エラーフラグ

  // Streaming
  let currentTranslationController = null;
  let translationInProgress = false;

  // State
  let selectedLanguage = ''; // 'ja' or 'en'
  let processedResultIds = new Set();
  let lastSubmittedFast = '';
  let translationDebounceTimer = null;

  // Debounce optimization configuration
  const DEBOUNCE_CONFIG = {
    MAX_HISTORY_SIZE: 100,        // 最大履歴件数
    MIN_REQUIRED_SAMPLES: 30,     // 最適化に必要な最低件数
    RECOMMENDED_SAMPLES: 50,      // 推奨件数
    PERCENTILE: 0.70,             // 70パーセンタイル使用
    CLEAR_AFTER_OPTIMIZATION: true // 最適化後にクリア
  };

  const STORAGE_KEYS = {
    HISTORY: 'debounceHistory_v1',
    OPTIMIZED: 'optimizedDebounce_v1',
    ONBOARDING: 'onboarding_v1',
    APP_VERSION: 'app_version'
  };

  let OPTIMAL_DEBOUNCE = { ja: 346, en: 154 }; // デフォルト値
  let debounceHistory = { ja: [], en: [] };     // 履歴データ
  let interimStartTime = null;                   // interim開始時刻

  const WINDOW_CHARS = { ja: 120, en: 90 };
  const SENTENCE_END_RE = /[。．\.！？!?]\s*$/;
  const MAX_PROCESSED_IDS = 100; // メモリリーク防止: 処理済みID上限

  const SYSTEM_PROMPT = `あなたは日本語と英語の専門的な同時通訳者です。
- 日本語↔英語の双方向翻訳を行う
- フィラーや冗長表現を除去
- 固有名詞・専門用語を正確に保持
- 逐次的に自然な短文で返す
- 出力は翻訳文のみ（前置き・説明・ラベル禁止）`;

  // Bilingual UI Text
  const UI_TEXT = {
    ja: {
      listening: '聞き取り中',
      translating: '翻訳中',
      original: '原文',
      translated: '翻訳結果',
      stop: '停止',
      reset: 'リセット',
      sourceLanguage: '日本語',
      targetLanguage: '英語'
    },
    en: {
      listening: 'Listening',
      translating: 'Translating',
      original: 'Original',
      translated: 'Translation',
      stop: 'Stop',
      reset: 'Reset',
      sourceLanguage: 'English',
      targetLanguage: 'Japanese'
    }
  };

  const japaneseFormatter = {
    addPeriod(t) { return (t && !/[。.?？！!]$/.test(t)) ? t + '。' : t; },
    addCommas(t) {
      const rules = [
        { s: /([^、。])そして/g, r: '$1、そして' },
        { s: /([^、。])しかし/g, r: '$1、しかし' },
        { s: /([^、。])ですが/g, r: '$1、ですが' },
        { s: /([^、。])また/g, r: '$1、また' },
        { s: /([^、。])けれども/g, r: '$1、けれども' },
        { s: /([^、。])だから/g, r: '$1、だから' },
        { s: /([^、。])ので/g, r: '$1、ので' },
        { s: /(.{10,})から(.{10,})/g, r: '$1から、$2' },
        { s: /(.{10,})ので(.{10,})/g, r: '$1ので、$2' },
        { s: /(.{10,})けど(.{10,})/g, r: '$1けど、$2' },
      ];
      let out = t;
      for (const p of rules) out = out.replace(p.s, p.r);
      // 重複した読点を削除（、、→、）
      out = out.replace(/、+/g, '、');
      return out;
    },
    format(t) { if (!t || !t.trim()) return t; return this.addPeriod(this.addCommas(t)); }
  };

  function setStatus(text, clsAdd=[], clsRemove=[]) {
    statusEl.textContent = text;
    ['idle','recording','processing','error'].forEach(c => statusEl.classList.remove(c));
    clsAdd.forEach(c => statusEl.classList.add(c));
    clsRemove.forEach(c => statusEl.classList.remove(c));
  }

  // Screen Management
  function showInitialScreen() {
    initialScreen?.classList.remove('screen-hidden');
    recordingScreen?.classList.add('screen-hidden');
  }

  function showRecordingScreen() {
    initialScreen?.classList.add('screen-hidden');
    recordingScreen?.classList.remove('screen-hidden');
  }

  // Update UI Text based on selected language
  function updateUIText(lang) {
    const text = UI_TEXT[lang];
    if (!text) return;

    listeningText.textContent = text.listening;
    translatingText.textContent = text.translating;
    originalLabel.textContent = text.original;
    translatedLabel.textContent = text.translated;
    stopBtnText.textContent = text.stop;
    resetBtnText.textContent = text.reset;
    sourceLangEl.textContent = text.sourceLanguage;
    targetLangEl.textContent = text.targetLanguage;
  }

  function loadApiKeys() {
    const stored = localStorage.getItem('translatorOpenaiKey');
    OPENAI_API_KEY = stored ? stored.trim() : '';
    if (!OPENAI_API_KEY) {
      openaiKeyInput.value = DEFAULT_OPENAI_API_KEY;
      apiModal?.setAttribute('aria-hidden', 'false');
    } else {
      initializeApp();
    }
  }

  // Debounce History Management
  function loadDebounceData() {
    // Load optimized debounce values
    const optimized = localStorage.getItem(STORAGE_KEYS.OPTIMIZED);
    if (optimized) {
      try {
        const data = JSON.parse(optimized);

        // 型チェックと範囲検証（日本語）
        if (typeof data.ja === 'number' && data.ja >= 200 && data.ja <= 600) {
          OPTIMAL_DEBOUNCE.ja = data.ja;
        } else {
          console.warn('日本語デバウンス値が無効:', data.ja);
        }

        // 型チェックと範囲検証（英語）
        if (typeof data.en === 'number' && data.en >= 100 && data.en <= 400) {
          OPTIMAL_DEBOUNCE.en = data.en;
        } else {
          console.warn('英語デバウンス値が無効:', data.en);
        }
      } catch (e) {
        console.warn('最適化データの読み込みに失敗', e);
      }
    }

    // Load history
    const history = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (history) {
      try {
        const parsed = JSON.parse(history);

        // 構造検証
        if (parsed && typeof parsed === 'object') {
          // 日本語履歴の検証
          if (Array.isArray(parsed.ja)) {
            debounceHistory.ja = parsed.ja.filter(item =>
              item && typeof item.f === 'number' && typeof item.t === 'number'
            );
          }

          // 英語履歴の検証
          if (Array.isArray(parsed.en)) {
            debounceHistory.en = parsed.en.filter(item =>
              item && typeof item.f === 'number' && typeof item.t === 'number'
            );
          }
        }
      } catch (e) {
        console.warn('履歴データの読み込みに失敗', e);
        debounceHistory = { ja: [], en: [] };
      }
    }
  }

  function saveDebounceHistory() {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(debounceHistory));
    } catch (e) {
      console.warn('履歴保存失敗（容量制限？）', e);
      // 古いデータを削除して再試行
      debounceHistory.ja = debounceHistory.ja.slice(-50);
      debounceHistory.en = debounceHistory.en.slice(-50);
      try {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(debounceHistory));
      } catch (e2) {
        console.error('履歴保存失敗', e2);
      }
    }
  }

  function recordDebounceHistory(lang, duration) {
    const history = debounceHistory[lang];

    // 新しいデータを追加（キー名を短縮してメモリ削減）
    history.push({
      f: duration,      // finalDelay
      t: Date.now()     // timestamp
    });

    // 最大件数を超えたら古いものを削除（FIFO）
    if (history.length > DEBOUNCE_CONFIG.MAX_HISTORY_SIZE) {
      history.shift();
    }

    // localStorage に保存
    saveDebounceHistory();

    // UI更新
    updateDebounceDisplay();
  }

  function clearDebounceHistory() {
    debounceHistory = { ja: [], en: [] };
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    console.log('✅ デバウンス履歴をクリアしました');
  }

  function calculateOptimalValue(history, lang) {
    if (history.length < DEBOUNCE_CONFIG.MIN_REQUIRED_SAMPLES) {
      return null;
    }

    // finalDelayのみを使用
    const delays = history.map(h => h.f).sort((a, b) => a - b);

    // 70パーセンタイル値を使用
    const index = Math.floor(delays.length * DEBOUNCE_CONFIG.PERCENTILE);
    const optimal = delays[index];

    // 範囲制限（極端な値を防ぐ）
    const MIN_DEBOUNCE = lang === 'ja' ? 200 : 100;
    const MAX_DEBOUNCE = lang === 'ja' ? 600 : 400;

    return Math.max(MIN_DEBOUNCE, Math.min(MAX_DEBOUNCE, Math.round(optimal)));
  }

  function optimizeDebounce() {
    const results = {
      ja: null,
      en: null,
      stats: {}
    };

    // 日本語の最適化
    if (debounceHistory.ja.length >= DEBOUNCE_CONFIG.MIN_REQUIRED_SAMPLES) {
      results.ja = calculateOptimalValue(debounceHistory.ja, 'ja');
      results.stats.ja = {
        samples: debounceHistory.ja.length,
        recommended: debounceHistory.ja.length >= DEBOUNCE_CONFIG.RECOMMENDED_SAMPLES
      };
    }

    // 英語の最適化
    if (debounceHistory.en.length >= DEBOUNCE_CONFIG.MIN_REQUIRED_SAMPLES) {
      results.en = calculateOptimalValue(debounceHistory.en, 'en');
      results.stats.en = {
        samples: debounceHistory.en.length,
        recommended: debounceHistory.en.length >= DEBOUNCE_CONFIG.RECOMMENDED_SAMPLES
      };
    }

    // 最適値を適用
    if (results.ja) OPTIMAL_DEBOUNCE.ja = results.ja;
    if (results.en) OPTIMAL_DEBOUNCE.en = results.en;

    // localStorageに保存
    localStorage.setItem(
      STORAGE_KEYS.OPTIMIZED,
      JSON.stringify({
        ja: OPTIMAL_DEBOUNCE.ja,
        en: OPTIMAL_DEBOUNCE.en,
        optimizedAt: Date.now()
      })
    );

    // 成功した言語のみ履歴をクリア（条件付き削除）
    if (DEBOUNCE_CONFIG.CLEAR_AFTER_OPTIMIZATION) {
      let cleared = false;

      if (results.ja) {
        debounceHistory.ja = [];
        cleared = true;
      }

      if (results.en) {
        debounceHistory.en = [];
        cleared = true;
      }

      if (cleared) {
        saveDebounceHistory();
        console.log('✅ 最適化成功した言語の履歴をクリアしました');
      }
    }

    return results;
  }

  // プレビュー機能（実行せずに結果を予測）
  function previewOptimization() {
    const preview = {
      ja: {
        canOptimize: false,
        currentValue: OPTIMAL_DEBOUNCE.ja,
        optimizedValue: null,
        samples: debounceHistory.ja.length,
        required: DEBOUNCE_CONFIG.MIN_REQUIRED_SAMPLES,
        recommended: DEBOUNCE_CONFIG.RECOMMENDED_SAMPLES,
        willDelete: 0
      },
      en: {
        canOptimize: false,
        currentValue: OPTIMAL_DEBOUNCE.en,
        optimizedValue: null,
        samples: debounceHistory.en.length,
        required: DEBOUNCE_CONFIG.MIN_REQUIRED_SAMPLES,
        recommended: DEBOUNCE_CONFIG.RECOMMENDED_SAMPLES,
        willDelete: 0
      }
    };

    // 日本語のプレビュー
    if (debounceHistory.ja.length >= DEBOUNCE_CONFIG.MIN_REQUIRED_SAMPLES) {
      preview.ja.canOptimize = true;
      preview.ja.optimizedValue = calculateOptimalValue(debounceHistory.ja, 'ja');
      preview.ja.willDelete = debounceHistory.ja.length;
    }

    // 英語のプレビュー
    if (debounceHistory.en.length >= DEBOUNCE_CONFIG.MIN_REQUIRED_SAMPLES) {
      preview.en.canOptimize = true;
      preview.en.optimizedValue = calculateOptimalValue(debounceHistory.en, 'en');
      preview.en.willDelete = debounceHistory.en.length;
    }

    return preview;
  }

  function displayOptimizationPreview(preview) {
    if (!optimizationResultEl) return;

    let html = '<div class="preview-results">';
    html += '<h5 class="preview-title">📊 最適化プレビュー</h5>';

    // 日本語のプレビュー
    html += '<div class="preview-section">';
    if (preview.ja.canOptimize) {
      const change = preview.ja.optimizedValue - preview.ja.currentValue;
      const changeText = change > 0 ? `+${change}ms` : `${change}ms`;
      const changeClass = change > 0 ? 'change-slower' : 'change-faster';

      html += `
        <div class="preview-item preview-success">
          <div class="preview-lang">✅ 日本語</div>
          <div class="preview-values">
            <span class="current-value">${preview.ja.currentValue}ms</span>
            <span class="arrow">→</span>
            <span class="optimized-value">${preview.ja.optimizedValue}ms</span>
            <span class="change ${changeClass}">(${changeText})</span>
          </div>
          <div class="preview-info">
            📈 ${preview.ja.samples}件のデータから算出
            ${preview.ja.samples >= preview.ja.recommended ? '✅ 推奨レベル' : '⚠️ 最低限'}
          </div>
          <div class="preview-delete">
            🗑️ 削除される履歴: ${preview.ja.willDelete}件
          </div>
        </div>
      `;
    } else {
      const needed = preview.ja.required - preview.ja.samples;
      html += `
        <div class="preview-item preview-warning">
          <div class="preview-lang">⚠️ 日本語</div>
          <div class="preview-values">
            <span class="current-value">${preview.ja.currentValue}ms</span>
            <span class="arrow">→</span>
            <span class="keep-value">${preview.ja.currentValue}ms</span>
            <span class="no-change">(変更なし)</span>
          </div>
          <div class="preview-info">
            ⏳ データ不足: あと${needed}件必要（現在${preview.ja.samples}件）
          </div>
          <div class="preview-keep">
            💾 保持される履歴: ${preview.ja.samples}件
          </div>
        </div>
      `;
    }
    html += '</div>';

    // 英語のプレビュー
    html += '<div class="preview-section">';
    if (preview.en.canOptimize) {
      const change = preview.en.optimizedValue - preview.en.currentValue;
      const changeText = change > 0 ? `+${change}ms` : `${change}ms`;
      const changeClass = change > 0 ? 'change-slower' : 'change-faster';

      html += `
        <div class="preview-item preview-success">
          <div class="preview-lang">✅ 英語</div>
          <div class="preview-values">
            <span class="current-value">${preview.en.currentValue}ms</span>
            <span class="arrow">→</span>
            <span class="optimized-value">${preview.en.optimizedValue}ms</span>
            <span class="change ${changeClass}">(${changeText})</span>
          </div>
          <div class="preview-info">
            📈 ${preview.en.samples}件のデータから算出
            ${preview.en.samples >= preview.en.recommended ? '✅ 推奨レベル' : '⚠️ 最低限'}
          </div>
          <div class="preview-delete">
            🗑️ 削除される履歴: ${preview.en.willDelete}件
          </div>
        </div>
      `;
    } else {
      const needed = preview.en.required - preview.en.samples;
      html += `
        <div class="preview-item preview-warning">
          <div class="preview-lang">⚠️ 英語</div>
          <div class="preview-values">
            <span class="current-value">${preview.en.currentValue}ms</span>
            <span class="arrow">→</span>
            <span class="keep-value">${preview.en.currentValue}ms</span>
            <span class="no-change">(変更なし)</span>
          </div>
          <div class="preview-info">
            ⏳ データ不足: あと${needed}件必要（現在${preview.en.samples}件）
          </div>
          <div class="preview-keep">
            💾 保持される履歴: ${preview.en.samples}件
          </div>
        </div>
      `;
    }
    html += '</div>';

    // 実行ボタン
    if (preview.ja.canOptimize || preview.en.canOptimize) {
      html += '<button id="executeOptimizationBtn" class="btn-execute">最適化を実行</button>';
    } else {
      html += '<div class="preview-note">⚠️ 両言語ともデータ不足のため、最適化できません</div>';
    }

    html += '</div>';

    optimizationResultEl.innerHTML = html;
    optimizationResultEl.style.display = 'block';

    // 実行ボタンのイベントリスナー
    const executeBtn = document.getElementById('executeOptimizationBtn');
    if (executeBtn) {
      executeBtn.addEventListener('click', () => {
        const results = optimizeDebounce();
        showOptimizationComplete(results);
        updateDebounceDisplay();
      });
    }
  }

  function showOptimizationComplete(results) {
    let message = '✅ 最適化が完了しました\n\n';

    if (results.ja) {
      message += `日本語: ${OPTIMAL_DEBOUNCE.ja}ms に最適化\n`;
      message += `(${results.stats.ja.samples}件のデータから算出)\n\n`;
    }

    if (results.en) {
      message += `英語: ${OPTIMAL_DEBOUNCE.en}ms に最適化\n`;
      message += `(${results.stats.en.samples}件のデータから算出)\n\n`;
    }

    message += '📦 履歴データをクリアしました\n';
    message += '新しい設定が適用されました';

    alert(message);

    // プレビュー表示をクリア
    if (optimizationResultEl) {
      optimizationResultEl.innerHTML = '<div class="optimization-complete">✅ 最適化完了！新しい設定が適用されました。</div>';
    }
  }

  function updateDebounceDisplay() {
    if (!currentJaEl || !currentEnEl) return;

    currentJaEl.textContent = `${OPTIMAL_DEBOUNCE.ja}ms`;
    currentEnEl.textContent = `${OPTIMAL_DEBOUNCE.en}ms`;

    if (historyJaCountEl) historyJaCountEl.textContent = debounceHistory.ja.length;
    if (historyEnCountEl) historyEnCountEl.textContent = debounceHistory.en.length;

    // 推奨表示
    if (jaStatusEl) {
      const jaNeeded = DEBOUNCE_CONFIG.RECOMMENDED_SAMPLES - debounceHistory.ja.length;
      jaStatusEl.textContent = debounceHistory.ja.length >= DEBOUNCE_CONFIG.RECOMMENDED_SAMPLES
        ? '✅ 推奨'
        : `⏳ あと${jaNeeded}件`;
    }

    if (enStatusEl) {
      const enNeeded = DEBOUNCE_CONFIG.RECOMMENDED_SAMPLES - debounceHistory.en.length;
      enStatusEl.textContent = debounceHistory.en.length >= DEBOUNCE_CONFIG.RECOMMENDED_SAMPLES
        ? '✅ 推奨'
        : `⏳ あと${enNeeded}件`;
    }
  }

  saveApiKeysBtn?.addEventListener('click', () => {
    const k = (openaiKeyInput.value || '').trim();
    if (!k) { alert('OpenAI APIキーを入力してください。'); return; }
    // APIキー形式検証（sk-proj- などの新形式にも対応）
    if (!k.startsWith('sk-')) {
      alert('無効なOpenAI APIキー形式です。\nAPIキーは「sk-」で始まる必要があります。');
      return;
    }
    localStorage.setItem('translatorOpenaiKey', k);
    OPENAI_API_KEY = k;
    apiModal?.setAttribute('aria-hidden', 'true');
    initializeApp();
  });

  settingsButton?.addEventListener('click', () => {
    openaiKeyInput.value = OPENAI_API_KEY;
    updateDebounceDisplay(); // デバウンス表示を更新
    apiModal?.setAttribute('aria-hidden', 'false');
  });

  resetKeysBtn?.addEventListener('click', () => {
    if (confirm('APIキーをリセットしますか？')) {
      localStorage.removeItem('translatorOpenaiKey');
      location.reload();
    }
  });

  apiModal?.addEventListener('click', (e) => {
    // APIキー未設定時はモーダル外クリックでも閉じない
    if (e.target === apiModal && OPENAI_API_KEY) {
      apiModal?.setAttribute('aria-hidden', 'true');
    }
  });

  function changeFontSize(size) {
    // Update text size
    ['size-small','size-medium','size-large','size-xlarge'].forEach(c => {
      originalTextEl.classList.remove(c);
      translatedTextEl.classList.remove(c);
    });
    originalTextEl.classList.add(`size-${size}`);
    translatedTextEl.classList.add(`size-${size}`);

    // Update button active states
    [fontSizeSmallBtn, fontSizeMediumBtn, fontSizeLargeBtn, fontSizeXLargeBtn].forEach(btn => {
      btn?.classList.remove('font-btn-active');
    });
    if (size === 'small') fontSizeSmallBtn?.classList.add('font-btn-active');
    else if (size === 'medium') fontSizeMediumBtn?.classList.add('font-btn-active');
    else if (size === 'large') fontSizeLargeBtn?.classList.add('font-btn-active');
    else if (size === 'xlarge') fontSizeXLargeBtn?.classList.add('font-btn-active');

    localStorage.setItem('translatorFontSize', size);
  }

  // Event listeners - Register only once
  startJapaneseBtn?.addEventListener('click', () => {
    if (!OPENAI_API_KEY) {
      alert('OpenAI APIキーが設定されていません。');
      apiModal?.setAttribute('aria-hidden', 'false');
      return;
    }
    startRecording('ja');
  });

  startEnglishBtn?.addEventListener('click', () => {
    if (!OPENAI_API_KEY) {
      alert('OpenAI APIキーが設定されていません。');
      apiModal?.setAttribute('aria-hidden', 'false');
      return;
    }
    startRecording('en');
  });

  stopBtn?.addEventListener('click', stopRecording);
  resetBtn?.addEventListener('click', resetContent);
  fontSizeSmallBtn?.addEventListener('click', () => changeFontSize('small'));
  fontSizeMediumBtn?.addEventListener('click', () => changeFontSize('medium'));
  fontSizeLargeBtn?.addEventListener('click', () => changeFontSize('large'));
  fontSizeXLargeBtn?.addEventListener('click', () => changeFontSize('xlarge'));

  // Debounce optimization preview button
  optimizeDebounceBtn?.addEventListener('click', () => {
    const preview = previewOptimization();
    displayOptimizationPreview(preview);
  });

  function initializeApp() {
    errEl.textContent = '';
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setStatus('このブラウザは音声認識に対応していません。', ['error']);
      errEl.textContent = 'Chrome、Safari、またはEdgeをご利用ください。';
      return;
    }

    // Setup speech recognition only once
    if (!recognition) {
      setupSpeechRecognition();
    }

    // Load debounce data
    loadDebounceData();

    changeFontSize(localStorage.getItem('translatorFontSize') || 'medium');

    setStatus('待機中', ['idle']);
  }

  function clearDebounce() {
    if (translationDebounceTimer) { clearTimeout(translationDebounceTimer); translationDebounceTimer = null; }
  }

  function resetContent() {
    // Stop recording if active
    if (isRecording) {
      isRecording = false;
      document.body.classList.remove('recording');
      try { recognition?.stop(); } catch (e) { console.error('音声認識停止エラー', e); }
    }

    // Clear all content and state
    processedResultIds.clear();
    lastSubmittedFast = '';
    originalTextEl.textContent = '';
    translatedTextEl.textContent = '';
    errEl.textContent = '';
    clearDebounce();

    // Cancel any ongoing translation
    if (currentTranslationController) {
      try { currentTranslationController.abort(); } catch{}
      currentTranslationController = null;
    }

    // Hide indicators
    translationInProgress = false;
    listeningIndicator?.classList.remove('visible');
    translatingIndicator?.classList.remove('visible');

    // Return to initial screen
    showInitialScreen();
    setStatus('待機中', ['idle']);
  }

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('このブラウザは音声認識に対応していません。', ['error']);
      errEl.textContent = 'Chrome、Safari、またはEdgeをご利用ください。';
      return;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listeningIndicator?.classList.add('visible');
      recognitionError = false; // 開始時にエラーフラグをリセット
    };
    recognition.onend = () => {
      listeningIndicator?.classList.remove('visible');
      // エラー状態でない場合のみ自動再開
      if (isRecording && !recognitionError) {
        try { recognition.start(); } catch (e) { console.error('音声認識の再開に失敗', e); }
      }
    };

    recognition.onresult = (event) => {
      let interimText = '', finalText = '';
      let hasNewContent = false, hasFinal = false;

      for (let i=0; i<event.results.length; i++) {
        const result = event.results[i];
        const transcript = (result[0]?.transcript || '').trim();
        const resultId = `${i}-${transcript}`;

        if (result.isFinal) {
          hasFinal = true;
          if (!processedResultIds.has(resultId)) {
            processedResultIds.add(resultId);
            // メモリリーク防止: 上限を超えたら古いIDを削除
            if (processedResultIds.size > MAX_PROCESSED_IDS) {
              const firstId = processedResultIds.values().next().value;
              processedResultIds.delete(firstId);
            }
            hasNewContent = true;
            finalText += (selectedLanguage === 'ja') ? (japaneseFormatter.format(transcript) + ' ') : (transcript + ' ');

            // デバウンス履歴を記録（interim開始からfinalまでの時間）
            if (interimStartTime) {
              const duration = Date.now() - interimStartTime;
              recordDebounceHistory(selectedLanguage, duration);
              interimStartTime = null;
            }
          } else {
            finalText += transcript + ' ';
          }
        } else {
          interimText += transcript + ' '; hasNewContent = true;
          // interim結果の開始時刻を記録
          if (!interimStartTime) {
            interimStartTime = Date.now();
          }
        }
      }

      const displayText = (finalText + interimText).trim();
      originalTextEl.textContent = displayText;

      if (!hasNewContent) return;

      clearDebounce();
      const delay = OPTIMAL_DEBOUNCE[selectedLanguage] || 300;
      translationDebounceTimer = setTimeout(() => {
        const sendFinal = hasFinal && SENTENCE_END_RE.test(displayText);
        const payloadText = sliceForLatency(displayText, sendFinal);
        if (!payloadText) return;
        translateText(payloadText, sendFinal ? 'final' : 'fast');
      }, delay);
    };

    recognition.onerror = (event) => {
      console.error('音声認識エラー', event?.error);
      // 重大なエラーの場合、自動再開を防止
      if (event?.error === 'audio-capture' || event?.error === 'not-allowed') {
        recognitionError = true;
      }
      if (event?.error === 'audio-capture') {
        setStatus('マイクが検出されません', ['error']);
        errEl.textContent = 'デバイス設定を確認してください。';
        stopRecording();
      } else if (event?.error === 'not-allowed') {
        setStatus('マイク権限が拒否されています', ['error']);
        errEl.textContent = 'ブラウザ設定でマイク権限を許可してください。';
        stopRecording();
      }
    };
  }

  async function startRecording(lang) {
    // Prevent starting if already recording
    if (isRecording) {
      console.warn('Already recording, ignoring start request');
      return;
    }

    errEl.textContent = '';
    selectedLanguage = lang;
    processedResultIds.clear();
    lastSubmittedFast = '';
    interimStartTime = null; // リセット
    originalTextEl.textContent = '';
    translatedTextEl.textContent = '';

    // Switch to recording screen and update UI text
    showRecordingScreen();
    updateUIText(lang);

    isRecording = true;
    document.body.classList.add('recording');
    setStatus('録音中', ['recording'], ['idle','error']);

    try {
      recognition.lang = (lang === 'ja') ? 'ja-JP' : 'en-US';
      recognition.start();
    } catch (e) {
      console.error('音声認識開始エラー', e);
      errEl.textContent = '音声認識の開始に失敗しました: ' + (e?.message || e);
      isRecording = false;
      showInitialScreen();
      setStatus('エラー', ['error']);
    }
  }

  function stopRecording() {
    isRecording = false;
    document.body.classList.remove('recording');
    setStatus('処理中', ['processing'], ['recording']);

    try { recognition.stop(); } catch (e) { console.error('音声認識停止エラー', e); }
    setTimeout(() => { setStatus('待機中', ['idle'], ['processing']); }, 800);
    clearDebounce();

    if (currentTranslationController) {
      try { currentTranslationController.abort(); } catch{}
      currentTranslationController = null;
      // 翻訳中断時のインジケーターをクリア
      translationInProgress = false;
      translatingIndicator?.classList.remove('visible');
    }
  }

  function sliceForLatency(text, isFinal) {
    if (!text || !text.trim()) return '';
    if (isFinal) {
      const parts = text.split(/(?<=[。．\.！？!?])\s*/).filter(s => s.trim().length > 0);
      return parts.length ? parts[parts.length - 1].trim() : text.trim();
    } else {
      const n = WINDOW_CHARS[selectedLanguage] || 100;
      const t = text.length > n ? text.slice(-n) : text;
      if (t === lastSubmittedFast) return '';
      lastSubmittedFast = t;
      return t.trim();
    }
  }

  function buildResponsesPayload(inputText) {
    const src = (selectedLanguage === 'ja') ? '日本語' : '英語';
    const dst = (selectedLanguage === 'ja') ? '英語' : '日本語';
    return {
      model: 'gpt-5-nano',
      instructions: `${SYSTEM_PROMPT}\n\n【タスク】次の${src}を${dst}に翻訳せよ。翻訳文のみを即時・逐次出力する。`,
      input: inputText,
      stream: true,
      text: { verbosity: 'low' },
      reasoning: { effort: 'minimal' }
    };
  }

  async function translateText(inputText, mode /* 'fast' | 'final' */) {
    if (!inputText) return;

    // Cancel previous
    if (translationInProgress && currentTranslationController) {
      try { currentTranslationController.abort(); } catch {}
      currentTranslationController = null;
      // 前回の翻訳状態をクリア
      translationInProgress = false;
      translatingIndicator?.classList.remove('visible');
    }

    translationInProgress = true;
    translatingIndicator?.classList.add('visible');
    errEl.textContent = '';

    try {
      const payload = buildResponsesPayload(inputText);
      currentTranslationController = new AbortController();
      const signal = currentTranslationController.signal;

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + OPENAI_API_KEY.trim()
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!response.ok) {
        let err;
        try { err = await response.json(); } catch { err = { error: { message: `HTTP ${response.status}` } }; }
        throw new Error(err?.error?.message || `OpenAI APIがステータスを返しました: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let carry = '', out = '';
      let firstChunk = true; // FINALモード時の初回チャンクフラグ

      const flushChunk = (delta) => {
        if (!delta) return;
        // FINALモード時、最初のデルタでクリア（ちらつき軽減）
        if (mode === 'final' && firstChunk) {
          translatedTextEl.textContent = '';
          out = '';
          firstChunk = false;
        }
        out += delta;
        translatedTextEl.textContent = out;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        carry += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = carry.indexOf('\n\n')) !== -1) {
          const block = carry.slice(0, idx);
          carry = carry.slice(idx + 2);

          let eventType = null, dataStr = null;
          const lines = block.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr = line.slice(6);
          }

          if (!eventType) continue;

          if (eventType === 'response.output_text.delta') {
            if (dataStr) {
              try {
                const obj = JSON.parse(dataStr);
                if (typeof obj?.delta === 'string') flushChunk(obj.delta);
              } catch {}
            }
          } else if (eventType === 'response.completed') {
            carry = '';
          }
        }
      }

      // ストリーミング完了後、残留データをクリア
      if (carry.trim()) {
        console.warn('SSE残留データ（不完全なイベント）:', carry);
        carry = '';
      }

      if (!translatedTextEl.textContent && out) translatedTextEl.textContent = out;

      // FINALモード完了時、FASTモードのキャッシュをリセット
      if (mode === 'final') {
        lastSubmittedFast = '';
      }

    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('翻訳エラー:', e);
        errEl.textContent = e?.message || '翻訳中にエラーが発生しました。';
        if (!translatedTextEl.textContent) translatedTextEl.textContent = '(翻訳エラー - 再度お試しください)';
      }
    } finally {
      translationInProgress = false;
      translatingIndicator?.classList.remove('visible');
      currentTranslationController = null;
    }
  }

  // ============================================================================
  // ONBOARDING SYSTEM (オンボーディングシステム)
  // ============================================================================
  // 【更新時の注意】
  // このセクションは初回ユーザー向けのガイダンスを管理します。
  // 新機能追加時やUI変更時には、以下を更新してください：
  // - APP_VERSION: アプリバージョン番号
  // - ONBOARDING_VERSION: ガイダンス内容のバージョン
  // - index.htmlの#onboardingModal内のHTML（スクリーン内容）
  // ============================================================================

  const APP_VERSION = '5.1';
  const ONBOARDING_VERSION = '1.0';

  // DOM要素（オンボーディング）
  let onboardingModal, onboardingScreens, onboardingProgressDots;
  let onboardingBtnNext, onboardingBtnBack, onboardingBtnSkip;
  let onboardingApiKeyInput, onboardingDontShowCheckbox;
  let currentOnboardingScreen = 0;
  let totalOnboardingScreens = 0; // DOM読み込み後に動的に設定

  // オンボーディングDOM要素の取得
  function initOnboardingDOM() {
    onboardingModal = document.getElementById('onboardingModal');
    onboardingScreens = document.querySelectorAll('.onboarding-screen');
    onboardingProgressDots = document.querySelectorAll('.progress-dot');
    onboardingBtnNext = document.getElementById('onboardingNext');
    onboardingBtnBack = document.getElementById('onboardingBack');
    onboardingBtnSkip = document.getElementById('onboardingSkip');
    onboardingApiKeyInput = document.getElementById('onboardingApiKey');
    onboardingDontShowCheckbox = document.getElementById('dontShowOnboarding');

    // 必須要素の存在確認
    if (!onboardingModal || onboardingScreens.length === 0 || onboardingProgressDots.length === 0) {
      console.warn('オンボーディング要素が見つかりません。オンボーディング機能は無効化されます。');
      return false;
    }

    // 画面数を動的に取得
    totalOnboardingScreens = onboardingScreens.length;

    return true;
  }

  // オンボーディングイベントリスナーの設定
  function initOnboardingEventListeners() {
    if (onboardingBtnNext) onboardingBtnNext.addEventListener('click', handleOnboardingNext);
    if (onboardingBtnBack) onboardingBtnBack.addEventListener('click', handleOnboardingBack);
    if (onboardingBtnSkip) onboardingBtnSkip.addEventListener('click', handleOnboardingSkip);
  }

  // オンボーディングを表示するか判定
  function checkAndShowOnboarding() {
    // DOM要素の初期化
    if (!initOnboardingDOM()) {
      // オンボーディングが無効な場合、通常のフローへ
      loadApiKeys();
      return;
    }

    // イベントリスナーを設定
    initOnboardingEventListeners();

    const data = loadOnboardingData();
    const versionData = loadVersionData();

    // 初回起動 または 「次回から表示しない」がfalseの場合
    if (!data.completed || !data.dontShowAgain) {
      // ただし、APIキーが既に設定されている場合はスキップ
      const existingApiKey = localStorage.getItem('translatorOpenaiKey');
      if (existingApiKey?.trim().length > 0) {
        // APIキーあり → オンボーディング完了扱い
        saveOnboardingData({ completed: true });
        loadApiKeys(); // 通常のフローへ
        return;
      }

      // APIキーなし → オンボーディング表示
      showOnboarding();
    } else {
      // オンボーディング不要 → 通常のフローへ
      loadApiKeys();
    }

    // バージョンアップ時の新機能通知（将来の拡張用）
    checkVersionUpdate(versionData);
  }

  // オンボーディング表示
  function showOnboarding() {
    if (!onboardingModal) return;

    currentOnboardingScreen = 0;
    updateOnboardingScreen();
    onboardingModal.setAttribute('aria-hidden', 'false');
  }

  // オンボーディング非表示
  function hideOnboarding() {
    if (!onboardingModal) return;
    onboardingModal.setAttribute('aria-hidden', 'true');
  }

  // オンボーディング画面更新
  function updateOnboardingScreen() {
    // 画面の表示/非表示（CSSクラスのみで制御）
    onboardingScreens.forEach((screen, index) => {
      if (index === currentOnboardingScreen) {
        screen.classList.add('active');
      } else {
        screen.classList.remove('active');
      }
    });

    // 進捗ドットの更新
    onboardingProgressDots.forEach((dot, index) => {
      if (index === currentOnboardingScreen) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    // ボタンの表示/非表示とテキスト更新
    updateOnboardingButtons();
  }

  // オンボーディングボタンの表示/非表示とテキスト更新
  function updateOnboardingButtons() {
    // 戻るボタン
    if (onboardingBtnBack) {
      onboardingBtnBack.style.display = currentOnboardingScreen > 0 ? 'block' : 'none';
    }

    // 次へボタン
    if (onboardingBtnNext) {
      if (currentOnboardingScreen === totalOnboardingScreens - 1) {
        // 最後の画面: 「保存して開始」
        onboardingBtnNext.textContent = '保存して開始';
      } else {
        // それ以外: 「次へ →」
        onboardingBtnNext.textContent = '次へ →';
      }
    }
  }

  // 次へボタン処理
  function handleOnboardingNext() {
    if (currentOnboardingScreen === totalOnboardingScreens - 1) {
      // 最後の画面: 保存して完了
      handleOnboardingComplete();
    } else {
      // 次の画面へ
      currentOnboardingScreen++;
      updateOnboardingScreen();
    }
  }

  // 戻るボタン処理
  function handleOnboardingBack() {
    if (currentOnboardingScreen > 0) {
      currentOnboardingScreen--;
      updateOnboardingScreen();
    }
  }

  // スキップボタン処理
  function handleOnboardingSkip() {
    // スキップ回数をカウント（将来の分析用）
    const data = loadOnboardingData();
    data.skipCount = (data.skipCount || 0) + 1;
    saveOnboardingData(data);

    hideOnboarding();
    // オンボーディングをスキップした場合も通常のフローへ
    loadApiKeys();
  }

  // 完了処理
  function handleOnboardingComplete() {
    // APIキーの保存
    const apiKey = onboardingApiKeyInput ? onboardingApiKeyInput.value.trim() : '';

    if (apiKey) {
      // APIキー形式検証（sk-proj- などの新形式にも対応）
      if (!apiKey.startsWith('sk-')) {
        alert('無効なOpenAI APIキー形式です。\nAPIキーは「sk-」で始まる必要があります。');
        return;
      }

      // 保存
      localStorage.setItem('translatorOpenaiKey', apiKey);
      OPENAI_API_KEY = apiKey; // グローバル変数を更新
    }

    // オンボーディングデータの保存
    const dontShow = onboardingDontShowCheckbox ? onboardingDontShowCheckbox.checked : false;
    saveOnboardingData({
      completed: true,
      dontShowAgain: dontShow
    });

    // モーダルを閉じる
    hideOnboarding();

    // APIキーが設定された場合、アプリを初期化
    if (apiKey) {
      initializeApp();
    } else {
      // APIキーが未設定の場合、設定モーダルを表示
      setTimeout(() => {
        if (apiModal) {
          apiModal.setAttribute('aria-hidden', 'false');
        }
      }, 300);
    }
  }

  // オンボーディングデータの読み込み
  function loadOnboardingData() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ONBOARDING);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('オンボーディングデータの読み込みに失敗', e);
    }

    return {
      completed: false,
      version: ONBOARDING_VERSION,
      lastShown: null,
      dontShowAgain: false,
      skipCount: 0,
      detailedGuideViewed: false
    };
  }

  // オンボーディングデータの保存
  function saveOnboardingData(updates) {
    try {
      const data = loadOnboardingData();
      const newData = {
        ...data,
        ...updates,
        version: ONBOARDING_VERSION,
        lastShown: Date.now()
      };
      localStorage.setItem(STORAGE_KEYS.ONBOARDING, JSON.stringify(newData));
    } catch (e) {
      console.error('オンボーディングデータの保存に失敗', e);
    }
  }

  // バージョンデータの読み込み
  function loadVersionData() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.APP_VERSION);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('バージョンデータの読み込みに失敗', e);
    }

    return {
      current: APP_VERSION,
      lastSeenVersion: null,
      whatsNewShown: {}
    };
  }

  // バージョンデータの保存
  function saveVersionData(updates) {
    try {
      const data = loadVersionData();
      const newData = { ...data, ...updates };
      localStorage.setItem(STORAGE_KEYS.APP_VERSION, JSON.stringify(newData));
    } catch (e) {
      console.error('バージョンデータの保存に失敗', e);
    }
  }

  // バージョン更新のチェック（新機能通知用）
  function checkVersionUpdate(versionData) {
    if (!versionData.lastSeenVersion) {
      // 初回インストール
      saveVersionData({
        current: APP_VERSION,
        lastSeenVersion: APP_VERSION,
        whatsNewShown: { [APP_VERSION]: true }
      });
      return;
    }

    // バージョンが上がっている場合（将来の拡張用）
    if (versionData.lastSeenVersion !== APP_VERSION) {
      const whatsNewShown = versionData.whatsNewShown || {};

      if (!whatsNewShown[APP_VERSION]) {
        // 新機能通知を表示（将来実装）
        // showWhatsNew(APP_VERSION);

        // 表示済みフラグ
        whatsNewShown[APP_VERSION] = true;
        saveVersionData({
          current: APP_VERSION,
          lastSeenVersion: APP_VERSION,
          whatsNewShown: whatsNewShown
        });
      }
    }
  }

  // 設定画面の「使い方ガイド」ボタンの設定
  function setupGuideButton() {
    const guideBtn = document.getElementById('showGuideBtn');
    if (guideBtn) {
      guideBtn.addEventListener('click', () => {
        // 設定モーダルを閉じる
        if (apiModal) {
          apiModal.setAttribute('aria-hidden', 'true');
        }

        // オンボーディングを表示
        setTimeout(() => {
          showOnboarding();
        }, 300);
      });
    }
  }

  // ============================================================================
  // END OF ONBOARDING SYSTEM
  // ============================================================================

  // init
  checkAndShowOnboarding(); // オンボーディングチェックから開始
  setupGuideButton(); // 使い方ガイドボタンの設定
});
