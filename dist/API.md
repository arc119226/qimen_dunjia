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
- 樞紐：`旬首`、`符首`、`值符`、`值使`、`值符落宮`、`值使落宮`
- 五層：`地盤`、`天盤`、`天門`、`九星`、`八神`（皆為9元素陣列）
  - 八門飛布後的結果鍵名為 `天門`；`地門` 則是八門本位（未飛布）
- 孤虛：`年孤虛`、`月孤虛`、`日孤虛`、`時孤虛`

#### `generateChartNow()`

依據當前系統時間起盤。

**返回：** 同 `generateChartByDatetime`

### 手動起盤

#### `generateQimenChart(id, data)`

手動提供四柱與局數起盤。

**參數：**
- `id` (string)：識別碼
- `data` (array)：`[年柱, 月柱, 日柱, 時柱, 局數, 陰陽]`

**範例：**
```javascript
const chart = Qimen.generateQimenChart('test', ['甲辰', '丙寅', '戊午', '庚申', 5, '陽']);
```

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
  "年孤虛": ["東南東", "南南東"],
  "月柱": "乙丑",
  "月孤虛": ["西北西", "北北西"],
  "日柱": "戊寅",
  "日孤虛": ["西南西", "西"],
  "時柱": "丁巳",
  "時孤虛": ["北", "北北東"],
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
  "值使": "杜門",
  "值使落宮": "兌",
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
