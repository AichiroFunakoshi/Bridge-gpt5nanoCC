

# Bridge (Ver.5-nano) — デバウンス最適化リアルタイム音声翻訳

[![GitHub](https://img.shields.io/badge/GitHub-Bridge--Ver.5--nano--debounce--optimized-blue?logo=github)](https://github.com/AichiroFunakoshi/Bridge-Ver.5-nano-debounce-optimized)

日本語⇄英語の **リアルタイム音声翻訳アプリ（PWA対応）** です。  
GPT-5-nano を翻訳エンジンに採用し、**デバウンス最適化 (Adaptive Debounce)** によるリアルタイム性向上と、洗練された白背景 UI を実現しました。

---

## ✨ 主な特徴
- **GPT-5-nano 対応**  
  OpenAI Responses API を利用し、`text.verbosity` や `reasoning.effort` を設定可能。
- **デバウンス最適化**  
  日本語 / 英語ごとに最適遅延を計測・適用（初期値: `ja=346ms`, `en=154ms`）。  
  モーダルから「デバウンス最適化」ボタンで即反映、「最適化リセット」で初期化。
- **リアルタイム音声認識**  
  Web Speech API によるブラウザ内音声入力（interim + final）。
- **UI/UX 改善（Ver.4.1 白背景準拠）**  
  - 原文／翻訳結果の2カラム表示  
  - 状態バッジ（🎙️聞き取り中 / ⚡翻訳中）  
  - 文字サイズ切替（A- / A / A+ / A++）  
- **PWA 対応**  
  スマホ / PC のホーム画面にインストール可能。`images/icons/*` は別途用意。

---

## 📂 プロジェクト構成
```
Bridge-Ver.5-nano-debounce-optimized/
├── app.js          # GPT-5-nano対応、Adaptive Debounce 実装
├── index.html      # UI構成（白背景、設定モーダル）
├── style.css       # UIスタイル（Ver.4.1基準）
├── manifest.json   # PWA設定
└── images/icons/   # アイコン類（※別途用意済み）
```

---

## 🚀 セットアップ
1. リポジトリをクローン
   ```bash
   git clone https://github.com/AichiroFunakoshi/Bridge-Ver.5-nano-debounce-optimized.git
   cd Bridge-Ver.5-nano-debounce-optimized
   ```

2. ローカルサーバで起動（例: Python）
   ```bash
   python -m http.server 8000
   ```
   → [http://localhost:8000](http://localhost:8000) を開く

3. 初回アクセス時に **OpenAI API Key** を入力  
   - ブラウザ `localStorage` に保存  
   - 「APIキーリセット」で削除可能  

---

## 📱 使い方
1. 日本語開始 / 英語開始 ボタンで録音開始  
2. 左に **原文**、右に **翻訳** が逐次表示  
3. フォントサイズ切替ボタンで文字を調整  
4. 設定 (⚙) → **デバウンス最適化**：学習値を即適用  
5. 設定 (⚙) → **最適化リセット**：初期値に戻す  

---

## 🛠 技術スタック
- **Frontend**: HTML5, CSS3, JavaScript
- **音声入力**: Web Speech API
- **翻訳モデル**: OpenAI GPT-5-nano (Responses API / Streaming)
- **PWA**: manifest.json

---

## 🔧 コード品質改善（2025年12月版）

以下の10箇所の最適化により、**リアルタイム性・翻訳品質・UX** を大幅に向上：

### 🔴 リアルタイム性・低遅延の改善
1. **メモリリーク対策**
   音声認識結果IDの上限設定（100件）により、長時間使用時のパフォーマンス低下を防止

2. **翻訳キャッシュの最適化**
   FINAL翻訳完了時に`lastSubmittedFast`をリセットし、次回FAST翻訳の遅延・欠落を防止

3. **インジケーター状態の正確性向上**
   翻訳中断時のインジケーター残留を防止し、UI状態を常に正確に反映

### 🟡 翻訳品質・正確性の改善
4. **ちらつき軽減**
   FAST→FINAL切り替え時、初回デルタ受信時にクリアすることで、スムーズな遷移を実現

5. **日本語フォーマット品質向上**
   重複した読点（、、→、）を自動削除し、自然な日本語出力を維持

6. **コード保守性向上**
   グローバル変数汚染を防止し、SYSTEM_PROMPTをローカル定数化

### 🟠 使いやすさ・UXの改善
7. **APIキー形式検証**
   `sk-`で始まるキーの形式チェックにより、早期エラー検出を実現

8. **必須入力の徹底**
   APIキー未設定時のモーダル強制閉じを防止し、使用不能状態を回避

9. **エラーハンドリング強化**
   音声認識エラー時の自動再開を防止し、パフォーマンスを改善

10. **デバッグ容易性向上**
    SSE残留データのログ記録により、翻訳結果の破損を防止

---

## 🔮 今後の拡張予定
- 多言語対応（韓国語・中国語など）
- 翻訳履歴保存・エクスポート
- 利用状況に基づく自動最適化の高度化

---

## 📄 ライセンス
MIT License  