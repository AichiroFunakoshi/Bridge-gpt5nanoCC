// Onboarding System for Bridge App
// バージョン管理とユーザーガイド機能

(function() {
  'use strict';

  // バージョン情報
  const APP_VERSION = '5.1';
  const ONBOARDING_VERSION = '1.0';

  // localStorage キー
  const STORAGE_KEYS = {
    ONBOARDING: 'onboarding_v1',
    APP_VERSION: 'app_version'
  };

  // DOM要素
  let modal, screens, progressDots;
  let btnNext, btnBack, btnSkip;
  let apiKeyInput, dontShowCheckbox;
  let currentScreen = 0;
  const totalScreens = 2; // 初回版は2画面

  // 初期化
  document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    initEventListeners();
    checkAndShowOnboarding();
    setupGuideButton();
  });

  // DOM要素の取得
  function initDOM() {
    modal = document.getElementById('onboardingModal');
    screens = document.querySelectorAll('.onboarding-screen');
    progressDots = document.querySelectorAll('.progress-dot');
    btnNext = document.getElementById('onboardingNext');
    btnBack = document.getElementById('onboardingBack');
    btnSkip = document.getElementById('onboardingSkip');
    apiKeyInput = document.getElementById('onboardingApiKey');
    dontShowCheckbox = document.getElementById('dontShowOnboarding');
  }

  // イベントリスナーの設定
  function initEventListeners() {
    if (btnNext) btnNext.addEventListener('click', handleNext);
    if (btnBack) btnBack.addEventListener('click', handleBack);
    if (btnSkip) btnSkip.addEventListener('click', handleSkip);
  }

  // オンボーディングを表示するか判定
  function checkAndShowOnboarding() {
    const data = loadOnboardingData();
    const versionData = loadVersionData();

    // 初回起動 または 「次回から表示しない」がfalseの場合
    if (!data.completed || !data.dontShowAgain) {
      // ただし、APIキーが既に設定されている場合はスキップ
      const existingApiKey = localStorage.getItem('translatorOpenaiKey');
      if (existingApiKey && existingApiKey.length > 0) {
        // APIキーあり → オンボーディング完了扱い
        saveOnboardingData({ completed: true });
        return;
      }

      // APIキーなし → オンボーディング表示
      showOnboarding();
    }

    // バージョンアップ時の新機能通知（将来の拡張用）
    checkVersionUpdate(versionData);
  }

  // オンボーディング表示
  function showOnboarding() {
    if (!modal) return;

    currentScreen = 0;
    updateScreen();
    modal.setAttribute('aria-hidden', 'false');
  }

  // オンボーディング非表示
  function hideOnboarding() {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
  }

  // 画面更新
  function updateScreen() {
    // 画面の表示/非表示
    screens.forEach((screen, index) => {
      if (index === currentScreen) {
        screen.style.display = 'block';
      } else {
        screen.style.display = 'none';
      }
    });

    // 進捗ドットの更新
    progressDots.forEach((dot, index) => {
      if (index === currentScreen) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    // ボタンの表示/非表示
    updateButtons();
  }

  // ボタンの表示/非表示とテキスト更新
  function updateButtons() {
    // 戻るボタン
    if (btnBack) {
      btnBack.style.display = currentScreen > 0 ? 'block' : 'none';
    }

    // 次へボタン
    if (btnNext) {
      if (currentScreen === totalScreens - 1) {
        // 最後の画面: 「保存して開始」
        btnNext.textContent = '保存して開始';
      } else {
        // それ以外: 「次へ →」
        btnNext.textContent = '次へ →';
      }
    }
  }

  // 次へボタン処理
  function handleNext() {
    if (currentScreen === totalScreens - 1) {
      // 最後の画面: 保存して完了
      handleComplete();
    } else {
      // 次の画面へ
      currentScreen++;
      updateScreen();
    }
  }

  // 戻るボタン処理
  function handleBack() {
    if (currentScreen > 0) {
      currentScreen--;
      updateScreen();
    }
  }

  // スキップボタン処理
  function handleSkip() {
    // スキップ回数をカウント（将来の分析用）
    const data = loadOnboardingData();
    data.skipCount = (data.skipCount || 0) + 1;
    saveOnboardingData(data);

    hideOnboarding();
  }

  // 完了処理
  function handleComplete() {
    // APIキーの保存
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

    if (apiKey) {
      // APIキー形式検証
      if (!apiKey.startsWith('sk-') || apiKey.length < 40) {
        alert('無効なOpenAI APIキー形式です。\nAPIキーは「sk-」で始まり、40文字以上である必要があります。');
        return;
      }

      // 保存
      localStorage.setItem('translatorOpenaiKey', apiKey);
    }

    // オンボーディングデータの保存
    const dontShow = dontShowCheckbox ? dontShowCheckbox.checked : false;
    saveOnboardingData({
      completed: true,
      dontShowAgain: dontShow
    });

    // モーダルを閉じる
    hideOnboarding();

    // APIキーが未設定の場合、設定モーダルを表示
    if (!apiKey) {
      // app.jsの設定モーダルを開く（遅延実行）
      setTimeout(() => {
        const apiModal = document.getElementById('apiModal');
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
        const apiModal = document.getElementById('apiModal');
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

  // グローバルに公開（設定画面から呼び出せるように）
  window.BridgeOnboarding = {
    show: showOnboarding,
    hide: hideOnboarding,
    reset: function() {
      localStorage.removeItem(STORAGE_KEYS.ONBOARDING);
      localStorage.removeItem(STORAGE_KEYS.APP_VERSION);
      console.log('オンボーディングデータをリセットしました');
    },
    getVersion: function() {
      return {
        app: APP_VERSION,
        onboarding: ONBOARDING_VERSION
      };
    }
  };

})();
