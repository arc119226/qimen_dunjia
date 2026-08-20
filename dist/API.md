# 奇門遁甲 API v2.2.0

本文件說明打包產物的使用方式。

---

## 檔案說明

| 檔案 | 格式 | 大小 | 用途 |
|------|------|------|------|
| `qimen.min.js` | ES Module | ~13KB | Node.js / Bundler（需外部 lunar-javascript） |
| `qimen.standalone.min.js` | IIFE | ~337KB | 瀏覽器直接使用（已包含 lunar-javascript） |

---

## 使用方式

### 方式一：ES Module（Node.js / Vite / Webpack）

需要先安裝 lunar-javascript：

```bash
npm install lunar-javascript
```

使用：

```javascript
import { generateChartByDatetime, generateChartNow, chartToObject } from './qimen.min.js';

// 指定時間起盤
const chart1 = generateChartByDatetime('2024011510');  // 2024-01-15 10:00
const result1 = chartToObject(chart1);
console.log(result1['節氣'], result1['三元'], result1['局數']);

// 當前時間起盤
const chart2 = generateChartNow();
const result2 = chartToObject(chart2);
console.log(result2);
```

### 方式二：IIFE（瀏覽器 `<script>` 標籤）

```html
<script src="qimen.standalone.min.js"></script>
<script>
  // 全域變數 Qimen 包含所有 API
  const chart = Qimen.generateChartByDatetime('2024011510');
  const result = Qimen.chartToObject(chart);
  console.log(result);

  // 當前時間起盤
  const now = Qimen.generateChartNow();
  console.log(Qimen.chartToObject(now));
</script>
```

---

## API 參考

### 便捷起盤函數（推薦）

#### `generateChartByDatetime(datetime)`

從日期時間字串直接起盤。

**參數：**
- `datetime` (string)：格式 `yyyyMMddHH`（24小時制）
  - 範例：`'2024011510'` 表示 2024年1月15日10時

**返回：** Map 物件，包含：
- 四柱：`年柱`、`月柱`、`日柱`、`時柱`
- 定局：`陰陽`、`局數`、`節氣`、`三元`、`節後天數`
  - `節後天數` 自節氣交接「時刻」起算，節氣當日為 `0`
- 樞紐：`旬首`、`符首`、`值符`、`值使`、`值符落宮`、`值使落宮`、`飛步`
  - `值符入中`／`值使入中`（boolean）：落宮一律寄坤回報，此二旗標補足「在五宮」這個狀態
- 五層：`地盤`、`天盤`、`天門`、`九星`、`八神`（皆為9元素陣列）
  - 八門飛布後的結果鍵名為 `天門`；`地門` 則是八門本位（未飛布）
- 旬空：`年旬空`、`月旬空`、`日旬空`、`時旬空`
  - 該柱所屬旬的兩個空亡地支之方位（`孤`）及其對沖方（`虛`），統宗稱「旬孤」
- 孤虛：`年孤虛`、`月孤虛`、`日孤虛`、`時孤虛`
  - 依《奇門遁甲統宗》「年月日時俱以前一位空亡為孤，孤沖為虛」逐支推算，與旬無關

#### `generateChartNow()`

依據當前系統時間起盤。

**返回：** 同 `generateChartByDatetime`

### 手動起盤

#### `generateQimenChart(pillars)`

手動提供四柱與局數起盤。

**參數：** `pillars` (object) —— `年柱`、`月柱`、`日柱`、`時柱`、`局數`、`陰陽`

**範例：**
```javascript
const chart = Qimen.generateQimenChart({
    年柱: '甲辰', 月柱: '丙寅', 日柱: '戊午', 時柱: '庚申',
    局數: 5, 陰陽: '陽'
});
```

舊式簽名 `generateQimenChart(id, [...])` 仍可使用，但 `id` 從未參與運算，不建議。

### 格局判斷

#### `detectPatterns(chart)`

判斷盤局中出現的格局。參數為 `chartToObject()` 的結果。

```javascript
const chart = Qimen.chartToObject(Qimen.generateChartByDatetime('2024011510'));
Qimen.detectPatterns(chart);
// [ { 格: '門迫', 吉凶: '凶', 宮: '坤',
//     細節: '傷門（木）臨坤宮（土），門克宮',
//     出處: [ { 書: '奇門法竅', 篇: '論八門迫制', 文: '宮制其門不為迫…' } ] }, … ]
```

每則判定含 `格`、`吉凶`、`宮`（全盤性者為 `null`）、`細節`、`出處`；
典籍有異說者另含 `讀法`，兩種讀法並列而不代為擇一。

已實作：伏吟、反吟、門迫、五不遇時、三奇得使、六儀擊刑。
個別判定器亦可單獨呼叫（`detectMenPo`、`detectLiuYiJiXing` 等）。

### 格式轉換

#### `chartToObject(chart)`

將 Map 轉換為普通物件。

#### `chartToJSON(chart)`

將 Map 轉換為 JSON 字串。

---

## 輸出範例

```javascript
const chart = generateChartByDatetime('2024011510');
const obj = chartToObject(chart);
```

```json
{
  "年柱": "癸卯",
  "年旬空": {
    "孤": ["東南東", "南南東"],
    "虛": ["西北西", "北北西"]
  },
  "年孤虛": {
    "孤": "東北東",
    "虛": "西南西"
  },
  "月柱": "乙丑",
  "月旬空": {
    "孤": ["西北西", "北北西"],
    "虛": ["東南東", "南南東"]
  },
  "月孤虛": {
    "孤": "北",
    "虛": "南"
  },
  "日柱": "戊寅",
  "日旬空": {
    "孤": ["西南西", "西"],
    "虛": ["東北東", "東"]
  },
  "日孤虛": {
    "孤": "北北東",
    "虛": "南南西"
  },
  "時柱": "丁巳",
  "時旬空": {
    "孤": ["北", "北北東"],
    "虛": ["南", "南南西"]
  },
  "時孤虛": {
    "孤": "東南東",
    "虛": "西北西"
  },
  "時干": "丁",
  "陰陽": "陽",
  "局數": 8,
  "節氣": "小寒",
  "三元": "中元",
  "節後天數": 9,
  "旬首": "甲寅",
  "符首": "癸",
  "值符": "天輔",
  "值符落宮": "坤",
  "值符入中": true,
  "值使": "杜門",
  "值使落宮": "兌",
  "值使入中": false,
  "飛步": 3,
  "地盤": ["癸", "己", "辛", "壬", "丁", "乙", "戊", "庚", "丙"],
  "天盤": ["戊", "壬", "癸", "庚", "丁", "己", "丙", "乙", "辛"],
  "天門": ["休門", "生門", "傷門", "開門", "", "杜門", "驚門", "死門", "景門"],
  "九星": ["天任", "天沖", "天輔", "天蓬", "天禽", "天英", "天心", "天柱", "天芮"],
  "八神": ["九地", "九天", "值符", "朱雀", "", "騰蛇", "勾陳", "六合", "太陰"],
  "天禽寄宮": "↖"
}
```

---

## 九宮索引對照

陣列索引 0-8 對應洛書九宮：

```
┌─────┬─────┬─────┐
│ [0] │ [1] │ [2] │
│ 巽4 │ 離9 │ 坤2 │
│ 東南 │  南 │ 西南 │
├─────┼─────┼─────┤
│ [3] │ [4] │ [5] │
│ 震3 │ 中5 │ 兌7 │
│  東 │  中 │  西 │
├─────┼─────┼─────┤
│ [6] │ [7] │ [8] │
│ 艮8 │ 坎1 │ 乾6 │
│ 東北 │  北 │ 西北 │
└─────┴─────┴─────┘
```

---

## 錯誤處理

API 會在輸入無效時拋出錯誤：

```javascript
try {
  generateChartByDatetime('invalid');
} catch (e) {
  console.error(e.message);
  // "日期時間格式錯誤：必須為 yyyyMMddHH 格式（10 位數字）"
}
```

常見錯誤：
- 格式錯誤（非10位數字）
- 月份無效（不在 1-12）
- 日期無效（不在 1-31）
- 小時無效（不在 0-23）

---

## 授權

MIT License

核心演算法基於傳統奇門遁甲理論。lunar-javascript 庫由 6tail 開發維護。
