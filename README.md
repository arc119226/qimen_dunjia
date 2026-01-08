# 奇門遁甲排盤系統 v2.0

本系統實現奇門遁甲的完整排盤運算，採用拆補法定局，將特定時刻的干支資訊轉化為多層次的空間分布圖，用於時空決策分析。

---

## 目錄

1. [理論背景](#理論背景)
2. [系統架構](#系統架構)
3. [快速開始](#快速開始)
4. [API 參考](#api-參考)
5. [網頁介面](#網頁介面)
6. [拆補法定局原理](#拆補法定局原理)
7. [節氣局數表](#節氣局數表)
8. [檔案結構](#檔案結構)

---

## 理論背景

### 河圖與洛書

河圖（先天八卦）代表宇宙形成前的理想秩序，強調陰陽對立配對，體現「天地定位、山澤通氣、雷風相薄、水火不相射」的對稱結構。

洛書（後天八卦）代表萬物形成後的實際運作，數字排列為「戴九履一、左三右七、二四為肩、六八為足、五居中央」，對應八方位與四季循環。

奇門遁甲以洛書九宮為空間載體，在其上疊加多層時間資訊，形成動態的時空分析模型。

### 盤局結構

奇門遁甲的盤局由五層組成，各層獨立運算後疊加於洛書九宮：

**第一層：地盤**

三奇六儀（乙丙丁戊己庚辛壬癸）的靜態分布，根據局數（1-9）與陰陽遁確定。陽遁順布，由一宮起始依洛書軌跡順飛；陰遁逆布，由九宮起始逆飛。甲為十干之首，象徵主帥，遁入六儀之下而不直接顯現，此即「遁甲」之意。

**第二層：天盤**

天干隨時辰的動態位移。以時干位置為放置起點、符首位置為取值起點，沿飛布軌跡旋轉映射。天盤與地盤的干支組合形成「奇門格局」，是斷事的核心依據。

**第三層：八門**

門戶飛布，代表地理空間的吉凶屬性。八門為休、生、傷、杜、景、死、驚、開，各有本位宮與飛布後的落宮。值使門隨時辰輪轉，主事態發展的通道。

**第四層：九星**

星曜飛布，代表天象對人事的影響。九星為天蓬、天芮、天沖、天輔、天禽、天心、天柱、天任、天英。值符星隨時辰輪轉，主事態的主導力量。天禽居中宮無定位，寄於二宮或八宮。

**第五層：八神**

神煞飛布，代表超自然力量的介入。陽局八神為值符、騰蛇、太陰、六合、勾陳、朱雀、九地、九天；陰局將勾陳、朱雀替換為白虎、玄武。八神以時干位置為起點飛布。

### 核心概念

**旬首**：六十甲子分為六旬，每旬以甲日起始。六旬首為甲子、甲戌、甲申、甲午、甲辰、甲寅。

**符首**：甲所遁藏的六儀。對應關係為：
- 甲子旬 → 戊（甲子遁戊）
- 甲戌旬 → 己（甲戌遁己）
- 甲申旬 → 庚（甲申遁庚）
- 甲午旬 → 辛（甲午遁辛）
- 甲辰旬 → 壬（甲辰遁壬）
- 甲寅旬 → 癸（甲寅遁癸）

**值符**：當前主事的九星，由符首在地盤上的位置決定。

**值使**：當前主事的八門，由符首在地盤上的位置決定。

**空亡**：每旬末兩個地支無天干配對，為空亡位，主虛無、延遲、變數。

---

## 系統架構

```
┌─────────────────────────────────────────────────────────┐
│                      index.js                           │
│                    （統一入口）                          │
├─────────────────────────────────────────────────────────┤
│                      qimen.js                           │
│                （主控函數：整合排盤）                     │
├──────────────┬──────────────┬───────────────────────────┤
│ constants.js │   utils.js   │     calculations.js       │
│  （常數表）   │ （工具函數）  │    （五層運算函數）        │
├──────────────┴──────────────┴───────────────────────────┤
│                      lunar.js                           │
│              （農曆轉換：lunar-javascript）              │
└─────────────────────────────────────────────────────────┘
```

---

## 快速開始

### 方式一：網頁介面（最簡單）

直接用瀏覽器開啟 `index.html`，輸入日期時間即可自動排盤。

### 方式二：Node.js 環境

#### 安裝依賴

```bash
npm install
```

#### 常用指令

| 指令 | 說明 |
|------|------|
| `npm test` | 執行單元測試（21 個測試案例） |
| `npm run build` | 打包為 ES Module（排除 lunar-javascript） |
| `npm run build:standalone` | 打包為獨立 IIFE（包含所有依賴） |

#### 單元測試

```bash
npm test
```

測試涵蓋：
- 陽遁/陰遁局數計算
- 甲遁邏輯處理
- `generateChartByDatetime` API（日期解析、節氣、三元）
- `generateChartNow` API
- 輸入驗證（格式、範圍檢查）
- API 一致性驗證

#### 打包

**ES Module 格式**（需外部引入 lunar-javascript）：
```bash
npm run build
# 輸出：dist/qimen.min.js
```

**獨立 IIFE 格式**（瀏覽器直接使用）：
```bash
npm run build:standalone
# 輸出：dist/qimen.standalone.min.js
# 使用：window.Qimen.generateChartByDatetime('2024011510')
```

首次打包前需安裝開發依賴：
```bash
npm install
```

#### 只有日期時間，自動起局（推薦）

這是最常見的使用場景。輸入西曆日期時間，系統自動完成：農曆轉換 → 四柱推算 → 節氣判定 → 拆補法定局 → 完整排盤。

```javascript
import { generateChartByDatetime, chartToObject } from './index.js';

// 2024年1月15日上午10時
const chart = generateChartByDatetime('2024011510');
const result = chartToObject(chart);

console.log('節氣：', result['節氣']);      // 小寒
console.log('三元：', result['三元']);      // 中元
console.log('陰陽遁：', result['陰陽']);    // 陽
console.log('局數：', result['局數']);      // 8
console.log('四柱：', result['年柱'], result['月柱'], result['日柱'], result['時柱']);
console.log('值符：', result['值符']);
console.log('值使：', result['值使']);
console.log('地盤：', result['地盤']);
console.log('天盤：', result['天盤']);
console.log('八門：', result['天門']);
console.log('九星：', result['九星']);
console.log('八神：', result['八神']);
```

#### 依據當前時間起盤

適用於即時占卜場景，一行代碼搞定：

```javascript
import { generateChartNow, chartToObject } from './index.js';

// 使用系統當前時間自動起盤
const chart = generateChartNow();
const result = chartToObject(chart);

console.log('當前時間盤局：');
console.log(`${result['年柱']}年 ${result['月柱']}月 ${result['日柱']}日 ${result['時柱']}時`);
console.log(`${result['節氣']} ${result['三元']} ${result['陰陽']}遁${result['局數']}局`);
```

#### 已知四柱與局數，手動起局

若已有四柱資訊與局數，可直接調用主函數：

```javascript
import { generateQimenChart, chartToObject, chartToJSON } from './index.js';

// 輸入參數：[年柱, 月柱, 日柱, 時柱, 局數, 陰陽]
const data = ['甲辰', '丙寅', '戊午', '庚申', 5, '陽'];

// 生成盤局（第一個參數為識別碼，可為任意字串）
const chart = generateQimenChart('my-chart-001', data);

// 轉換為物件格式
const obj = chartToObject(chart);

// 或轉換為 JSON 字串
const json = chartToJSON(chart);
```

#### 單獨調用各層運算

若需要更細緻的控制，可直接調用各層函數：

```javascript
import {
    // 基礎查詢
    getXunHead,           // 查詢旬首
    getFuShou,            // 查詢符首
    getKongWangDirection, // 查詢空亡方位
    
    // 五層運算
    getDiPan,             // 取得地盤
    calculateTianPan,     // 計算天盤
    calculateEightDoors,  // 計算八門
    calculateNineStars,   // 計算九星
    calculateEightGods,   // 計算八神
    
    // 定局
    calculateJuByChaiBu,  // 拆補法定局
    JIEQI_JUSHU,          // 節氣局數配置表
    YUAN_NAMES            // 三元名稱
} from './index.js';

// 範例：查詢「庚申」時辰的旬首與符首
const xunHead = getXunHead('庚申');  // 返回 '甲午'
const fuShou = getFuShou('甲午');    // 返回 '辛'

// 範例：取得陽遁五局的地盤
const diPan = getDiPan(true, 5);
// 返回：['辛', '壬', '癸', '庚', '戊', '乙', '己', '丙', '丁']
```

---

## API 參考

### 便捷起盤函數（推薦）

#### `generateChartByDatetime(datetime)`

從日期時間字串直接起盤。自動完成四柱計算、節氣判定、拆補法定局。

**參數：**
- `datetime` (string)：日期時間字串，格式 `yyyyMMddHH`（24小時制，HH 為 0-23）

**返回：** Map 物件，包含完整盤局資訊，額外包含：
- `節氣`：當前節氣名稱
- `三元`：上元/中元/下元
- `節後天數`：距離節氣交接的天數

**範例：**
```javascript
import { generateChartByDatetime, chartToObject } from './index.js';

const chart = generateChartByDatetime('2024011510');
const obj = chartToObject(chart);

console.log(obj['節氣']);  // 小寒
console.log(obj['三元']);  // 中元
console.log(obj['局數']);  // 8
```

**錯誤處理：**
- 格式不正確（非10位數字字串）會拋出錯誤
- 月份、日期、小時超出範圍會拋出錯誤

#### `generateChartNow()`

依據當前系統時間起盤。適用於即時占卜場景。

**返回：** Map 物件，包含完整盤局資訊（同 `generateChartByDatetime`）

**範例：**
```javascript
import { generateChartNow, chartToObject } from './index.js';

const chart = generateChartNow();
const obj = chartToObject(chart);

console.log(`${obj['節氣']} ${obj['三元']} ${obj['陰陽']}遁${obj['局數']}局`);
```

### 主函數

#### `generateQimenChart(id, data)`

生成完整的奇門遁甲盤局。需手動提供四柱和局數。

**參數：**
- `id` (string)：盤局識別碼
- `data` (array)：`[年柱, 月柱, 日柱, 時柱, 局數, 陰陽]`
  - 年柱、月柱、日柱、時柱：干支字串，如 `'甲子'`
  - 局數：1-9 的整數
  - 陰陽：`'陽'` 或 `'陰'`

**返回：** Map 物件，包含完整盤局資訊

#### `chartToObject(chart)`

將盤局 Map 轉換為普通物件。

#### `chartToJSON(chart)`

將盤局 Map 轉換為 JSON 字串。

### 拆補法定局

#### `calculateJuByChaiBu(solar, jieQiJuShu, yuanNames)`

根據拆補法計算定局。

**參數：**
- `solar`：lunar-javascript 的 Solar 物件
- `jieQiJuShu`：節氣局數配置表（使用 `JIEQI_JUSHU`）
- `yuanNames`：三元名稱陣列（使用 `YUAN_NAMES`）

**返回：**
```javascript
{
    jieQiName: '小寒',      // 當前節氣
    yuan: 1,               // 三元索引（0=上元, 1=中元, 2=下元）
    yuanName: '中元',       // 三元名稱
    isYang: true,          // 是否陽遁
    yinYang: '陽',          // '陽' 或 '陰'
    gameNumber: 8,         // 局數 1-9
    daysSinceJieQi: 7      // 距離節氣交接的天數
}
```

### 基礎查詢函數

#### `getXunHead(ganZhi)`

查詢干支所屬旬首。

```javascript
getXunHead('庚申')  // 返回 '甲午'
getXunHead('甲子')  // 返回 '甲子'
```

#### `getFuShou(xunHead)`

查詢旬首對應的符首（甲所遁藏的六儀）。

```javascript
getFuShou('甲子')  // 返回 '戊'
getFuShou('甲午')  // 返回 '辛'
```

#### `getKongWangDirection(xunHead)`

查詢旬首對應的空亡方位。

```javascript
getKongWangDirection('甲子')  // 返回 '西北'（戌亥空）
```

### 五層運算函數

#### `getDiPan(isYang, gameNumber)`

取得地盤配置。

**參數：**
- `isYang` (boolean)：是否陽遁
- `gameNumber` (number)：局數 1-9

**返回：** 九宮天干陣列

#### `calculateTianPan(isYang, diPan, hourGan, flyStep)`

計算天盤飛布。

#### `calculateEightDoors(isYang, diPan, zhiShiDoor, flyStep)`

計算八門飛布。

#### `calculateNineStars(isYang, zhiFuStar, flyStep)`

計算九星飛布。

#### `calculateEightGods(isYang, tianGan, diPan)`

計算八神飛布。

---

## 網頁介面

`index.html` 提供完整的圖形化排盤介面，特點如下：

### 雙輸入模式

**模式一：西曆輸入**

選擇日期與時辰，系統自動完成：
- 西曆 → 農曆轉換
- 四柱推算
- 節氣判定與三元計算
- 拆補法自動定局

**模式二：干支直接輸入**

若已知四柱，可切換至干支輸入模式，手動輸入年月日時柱與局數。

### 顯示資訊

- 曆法資訊：西曆、農曆、節氣、三元、節後天數、定局結果
- 四柱資訊：年柱、月柱、日柱、時柱
- 盤局核心：旬首、符首、值符、值使、空亡
- 五層盤面：地盤、天盤、八門、九星、八神
- 九宮總覽：整合顯示各宮位的完整資訊

### 使用方式

直接用瀏覽器開啟 `index.html`，無需安裝任何依賴。lunar.js 已內嵌於 HTML 檔案中。

---

## 拆補法定局原理

### 定局方法的選擇

奇門遁甲有兩種主要的定局方法：置閏法與拆補法。本系統採用拆補法，因其規則更為直接明確。

### 拆補法原理

拆補法以節氣交接時刻為嚴格分界點，從節氣交接開始計算天數來判定三元：

- **上元**：節後第 1-5 天
- **中元**：節後第 6-10 天  
- **下元**：節後第 11-15 天

「拆」指將跨節氣的旬拆開，節氣前用舊局、節氣後用新局。「補」指節氣後的天數直接補入新局計算。

### 與置閏法的區別

置閏法考慮符頭（甲子、己卯等）與節氣的配合，有「超神」、「接氣」、「置閏」等複雜處理。當符頭先於節氣到來稱為超神，節氣先於符頭到來稱為接氣，超過一定天數則需置閏。

拆補法則完全以節氣為準，不考慮符頭，規則更為簡明。

### 陽遁與陰遁

一年分為陽遁與陰遁兩個階段：

- **陽遁**：冬至到芒種（12個節氣），局數順飛，陽氣漸生
- **陰遁**：夏至到大雪（12個節氣），局數逆飛，陰氣漸生

---

## 節氣局數表

### 陽遁節氣（冬至至芒種）

| 節氣 | 上元 | 中元 | 下元 |
|------|------|------|------|
| 冬至 | 1 | 7 | 4 |
| 小寒 | 2 | 8 | 5 |
| 大寒 | 3 | 9 | 6 |
| 立春 | 8 | 5 | 2 |
| 雨水 | 9 | 6 | 3 |
| 驚蟄 | 1 | 7 | 4 |
| 春分 | 3 | 9 | 6 |
| 清明 | 4 | 1 | 7 |
| 穀雨 | 5 | 2 | 8 |
| 立夏 | 4 | 1 | 7 |
| 小滿 | 5 | 2 | 8 |
| 芒種 | 6 | 3 | 9 |

### 陰遁節氣（夏至至大雪）

| 節氣 | 上元 | 中元 | 下元 |
|------|------|------|------|
| 夏至 | 9 | 3 | 6 |
| 小暑 | 8 | 2 | 5 |
| 大暑 | 7 | 1 | 4 |
| 立秋 | 2 | 5 | 8 |
| 處暑 | 1 | 4 | 7 |
| 白露 | 9 | 3 | 6 |
| 秋分 | 7 | 1 | 4 |
| 寒露 | 6 | 9 | 3 |
| 霜降 | 5 | 8 | 2 |
| 立冬 | 6 | 9 | 3 |
| 小雪 | 5 | 8 | 2 |
| 大雪 | 4 | 7 | 1 |

---

## 檔案結構

```
qimen/
├── index.html      # 完整網頁介面（內嵌 lunar.js）
├── index.js        # 統一入口，匯出所有公開 API
├── constants.js    # 常數定義
│                   # - JIEQI_JUSHU：節氣局數配置表
│                   # - YUAN_NAMES：三元名稱
│                   # - PALACE：九宮索引
│                   # - FLY_PATH：飛布軌跡
│                   # - 天干地支、九星、八門、八神名稱
│                   # - 六甲旬首與符首對應
│                   # - 地盤配置（陰陽各九局）
├── utils.js        # 通用工具函數
│                   # - 陣列旋轉與飛布序列生成
│                   # - 旬首、符首查詢
│                   # - 空亡方位查詢
│                   # - 天干地支提取
├── calculations.js # 五層運算函數
│                   # - 河圖、洛書基礎
│                   # - 地盤、天盤計算
│                   # - 八門、九星、八神飛布
│                   # - 拆補法定局（calculateJuByChaiBu）
├── qimen.js        # 主控函數
│                   # - generateQimenChart：手動起盤
│                   # - generateChartByDatetime：日期時間起盤
│                   # - generateChartNow：當前時間起盤
│                   # - chartToObject / chartToJSON：格式轉換
├── lunar.js        # 農曆轉換庫（lunar-javascript）
├── test.js         # 測試模組（21 個測試案例）
├── package.json    # 專案配置（ES Module）
├── dist/           # 打包輸出目錄（npm run build 生成）
│   ├── qimen.min.js           # ES Module 格式
│   └── qimen.standalone.min.js # IIFE 格式（瀏覽器用）
└── README.md       # 本文件
```

---

## 版本歷史

### v2.1.0

- 新增 `generateChartByDatetime(datetime)` API：輸入 yyyyMMddHH 自動起盤
- 新增 `generateChartNow()` API：依據當前時間起盤
- 新增輸入驗證與錯誤處理
- 測試案例擴展至 21 個
- 新增打包腳本（esbuild）

### v2.0.0

- 完整模組化重構
- 實作拆補法定局（calculateJuByChaiBu）
- 內嵌 lunar.js 的獨立網頁介面
- 自動日期轉換與四柱推算
- 詳細的中文文檔與 API 參考

---

## 授權

本系統為學習與研究用途，核心演算法基於傳統奇門遁甲理論。lunar-javascript 庫由 6tail 開發維護。
