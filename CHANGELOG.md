# Changelog

所有重要變更都會記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

---

## [2.1.0] - 2026-01-08

### Added
- `generateChartByDatetime(datetime)` API：輸入 `yyyyMMddHH` 格式自動起盤
- `generateChartNow()` API：依據當前時間起盤
- 輸入驗證與錯誤處理
- esbuild 打包腳本（ES Module 與 IIFE 格式）
- `dist/API.md` 打包產物使用說明
- JSON 原始輸出面板

### Changed
- 重寫 `index.html` 為極簡風格（減少 90% 代碼）
- 模組化 JavaScript 架構：QimenCore + App
- 改用 CDN 載入 lunar-javascript
- 測試案例擴展至 21 個

### Removed
- 移除冗餘 `lunar.js` 檔案（改用 npm 依賴）

---

## [2.0.0] - 2024-12-01

### Added
- 完整模組化重構
- 拆補法定局實作（`calculateJuByChaiBu`）
- 獨立網頁介面
- 自動日期轉換與四柱推算
- 詳細的中文文檔與 API 參考

### Changed
- 採用 ES6 Module 架構
- 分離常數、工具函數、計算函數

---

## [1.0.0] - 初始版本

### Added
- 基礎奇門遁甲排盤功能
- 五層盤面計算（地盤、天盤、八門、九星、八神）
- 洛書九宮座標系統
