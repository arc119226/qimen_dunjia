# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Qimen Dunjia (奇門遁甲) divination system** - a traditional Chinese metaphysical calculation tool. The system transforms temporal information (stems and branches) into a multi-layered spatial distribution chart for time-space decision analysis.

The codebase is written in **ES6 modules** (Node.js with `"type": "module"`) and uses the `lunar-javascript` library for lunar calendar conversions.

## Commands

### Testing
```bash
npm test
# or
node test.js
```

Runs the test suite (42 assertions, ~0.5s) covering:
- Five-layer golden values for Yang/Yin bureaus, different game numbers, and Jia hiding
- `generateChartByDatetime` API (datetime parsing, solar terms, Yuan periods)
- Full-year sweep: all 366 days of 2024 must chart successfully and cover all 24 solar terms
- Self-consistency: `值符落宮`/`值使落宮` must match the `九星`/`天門` arrays, and 八神's 值符 must share the palace with the 九星 值符 (required by both 統宗 and 發凡)
- Input validation (datetime format/calendar validity, four-pillar sexagenary validity)
- `generateChartNow` API and consistency between the two chart APIs

**Every test must assert.** The pre-2.2.0 suite only checked that no exception was thrown,
which is why a bug that made ~32 days a year uncharted shipped with "21 tests passing".

### Building Distribution Files
```bash
npm run build            # ES Module → dist/qimen.min.js (~13KB)
npm run build:standalone # IIFE → dist/qimen.standalone.min.js (~337KB)
```

### Running in Browser
Open `index.html` directly in a browser - loads lunar-javascript via CDN.

### Node.js Usage

**Quick Start (Recommended)** - Auto chart from datetime:
```bash
node
> import { generateChartByDatetime, chartToObject } from './index.js'
> const chart = generateChartByDatetime('2024011510')  // 2024-01-15 10:00
> const obj = chartToObject(chart)
> console.log(obj['節氣'], obj['三元'], obj['局數'])  // 小寒 中元 8
```

**Current Time** - Chart for right now:
```bash
node
> import { generateChartNow, chartToObject } from './index.js'
> const chart = generateChartNow()
> chartToObject(chart)
```

**Manual Input** - Full control over pillars and game number:
```bash
node
> import { generateQimenChart, chartToObject } from './index.js'
> const result = generateQimenChart({ 年柱: '甲辰', 月柱: '丙寅', 日柱: '戊午', 時柱: '庚申', 局數: 5, 陰陽: '陽' })
> const obj = chartToObject(result)
```

## Architecture

### Module Structure

The system follows a **layered architecture** with clear separation of concerns:

```
index.js (Unified API)
    ↓
├── qimen.js (Main Controller — builds the chart)
│      ↓
│   ├── constants.js (Lookup Tables)
│   ├── utils.js (Array Rotation & Queries)
│   └── calculations.js (Five-Layer Calculations)
│          ↓
│       lunar-javascript (npm package)
│
└── patterns.js (Pattern Judgment — reads a finished chart)
```

**patterns.js sits beside qimen.js, not under it.** Every detector is a pure
function of `chartToObject()` output and never touches the calculation modules,
so a chart produced by a different school (飛盤 instead of 轉盤, say) can be judged
by the same detectors as long as the output shape matches.

### Core Calculation Flow

The system calculates five layers that stack upon the Luoshu 9-palace grid:

1. **Di Pan (地盤)** - Earth Plate: Static distribution of San Qi Liu Yi (三奇六儀)
2. **Tian Pan (天盤)** - Heaven Plate: Dynamic rotation based on hour stem
3. **Ba Men (八門)** - Eight Doors: Gate distribution representing spatial attributes
4. **Jiu Xing (九星)** - Nine Stars: Star distribution representing celestial influence
5. **Ba Shen (八神)** - Eight Gods: Deity distribution representing supernatural forces

**Key Calculation Principle**: All layers use the **rotateMapping pattern** - taking a source sequence, finding a pivot element's position, and rotating the entire sequence so that pivot becomes the first element in the output sequence.

### Critical Concepts

**Xun Shou (旬首)**: The Jia-day that starts a 10-day cycle. There are 6 cycles in the 60 Jia-Zi system:
- 甲子旬 → Fu Shou: 戊 (Jia hides behind Wu)
- 甲戌旬 → Fu Shou: 己
- 甲申旬 → Fu Shou: 庚
- 甲午旬 → Fu Shou: 辛
- 甲辰旬 → Fu Shou: 壬
- 甲寅旬 → Fu Shou: 癸

**Jia Hiding (甲遁)**: Jia (甲) never appears directly on the plate - it's always represented by its corresponding Fu Shou (符首). This is handled by `resolveJiaHiding()` in qimen.js:162.

**Zhong Palace (中宮)**: Palace 5 (center) has no direction and no door, so anything landing there is substituted to 坤 palace 2 (`ZHONG_SUBSTITUTE`, `normalizeZhongPalace()`). This is not an edge case — **12 of the 18 bureaus place a 六儀 in the center**, so roughly 11% of all charts have 符首 there.

Verified against 《奇門遁甲統宗》〈以旬首取符使法〉: "甲辰在中宮，寄於坤二，天禽為符，死門為使". The project matches: 值符 keeps the name 天禽, 值使 becomes 死門 (坤's door).

**天禽 never moves** in the 九星 array — `rotateMapping` pins it at index 4. It is 寄坤 and travels with 天芮. Therefore `getZhiFuStarPosition()` looks up 天芮 when 值符 is 天禽; reading 天禽's literal array index would report 「中」 and contradict both classics, which require 八神's 值符 to share the palace with the 九星 值符 (統宗〈小值符加大值符法〉, 發凡〈小直符加大直符〉). `天禽寄宮` reports the same palace as an arrow.

**Two 定局法 schools, both shipped.** `generateChartByDatetime(datetime, {定局法})` takes
`'拆補'` (default) or `'符頭'`. They are not two names for one thing — **92.6% of 2024's
hours get a different bureau**. 《寶鑒御定》 records the fight verbatim: it calls the
拆補 school 「創為拆補以亂符頭」「殊違尊甲之旨」. The project picks neither.

符頭法 (`calculateJuByFuTou`): the 上元符頭 are only 甲子/己卯/甲午/己酉 (every 15 days);
元 = ⌊days since ÷ 5⌋; the governing 節氣 is the latest one **no later than 上元符頭 + 9 days**
(《寶鑒》「起超不可過九日」). 置閏 **emerges** from 15 ÷ 15.2184 = 0.9857 < 1 — the index
stalls every ~69 節氣, i.e. two cycles share one 節氣 = 「重用本氣三元」. No anchor needed.
Measured 1900–2100: offset range exactly [接氣6, 超神9], 91 leaps ≈ one per 2.2 years.

Known gaps, both pinned by numbers in test.js: (1) day granularity, so 《法竅》's hour-level
疊局 is not modelled; (2) the leap lands on the arithmetically-forced 節氣 rather than being
deferred to 芒種/大雪 as 《寶鑒》 prescribes — costing 21 skipped 節氣 per 200 years, all in
winter. Deferring would fix it and is the obvious next step.

**Chai Bu Method (拆補法)**: The default. It measures elapsed time from the transition instant. It measures elapsed time from the exact solar-term **transition instant** (via Julian day, fractional) and divides into three Yuan periods: 上元 = [0, 5) days, 中元 = [5, 10) days, 下元 = 10+ days. `節後天數` is 0-based (the solar-term day itself is `0`).

Note this is deliberately instant-based, not calendar-day-based: the Yuan boundary falls at the transition time of day, not at midnight. A calendar-day school would classify days 6 and 11 differently for the hours before that time.

**Solar term names**: lunar-javascript emits **simplified** names; `JIEQI_JUSHU` is keyed by **traditional**. `JIEQI_ALIAS` (constants.js) maps the 5 that differ (惊蛰/谷雨/小满/芒种/处暑). Always match on the **whole name** — substring replacement silently missed 小满 and 芒种 and made a month of the year uncharted.

### File Responsibilities

**index.js**: Exports all public APIs. Import everything from here.

**qimen.js**: Main orchestrator that:
- Validates input parameters
- Calculates Xun Shou and Fu Shou from time pillar
- Resolves Jia hiding logic
- Calls all five layer calculations in sequence
- Returns a Map with 26+ keys including pillars, game info, and all five layers
- Provides convenience APIs: `generateChartByDatetime()` and `generateChartNow()`

**constants.js**: Contains all lookup tables including:
- `JIEQI_JUSHU`: Solar term to game number mapping (24 solar terms × 3 Yuan)
- `DIPAN_YANG`/`DIPAN_YIN`: Pre-calculated earth plate for all 9 games × 2 modes
- `XUN_TO_HEAD`: Maps 60 stems-branches to their Xun Shou
- `FLY_PATH`: The Luoshu flying sequence [0,1,2,3,4,5,6,7,8]
- Eight Doors, Nine Stars, Eight Gods name arrays

**utils.js**: Core rotation utilities:
- `rotateArrayFromIndex()`: The fundamental rotation function used everywhere
- `rotateMapping()`: High-level function that finds element position then rotates
- `getXunHead()`, `getFuShou()`: Time pillar analysis
- `calculateFlyStep()`: Calculates how many steps to fly from Xun Shou to current hour

**calculations.js**: Layer-by-layer calculation functions:
- `getDiPan()`: Returns pre-calculated earth plate based on isYang and gameNumber
- `calculateTianPan()`: Rotates based on hour stem position
- `calculateEightDoors()`: Rotates based on Zhi Shi door position
- `calculateNineStars()`: Rotates based on Zhi Fu star position
- `calculateEightGods()`: Special logic for Yang/Yin modes with different deity sets
- `calculateJuByChaiBu()`: 拆補法 — elapsed time from the solar-term transition instant
- `calculateJuByFuTou()`: 符頭法 — 甲己 符頭 with 超神接氣置閏; see the 定局法 note above

**lunar-javascript** (npm package by 6tail): Used for:
- Solar to lunar calendar conversion
- Calculating four pillars (year/month/day/hour stems-branches)
- Finding current solar term and days since term

**patterns.js**: Pattern judgment (格局). Reads a finished chart, returns findings.
Four rules govern this module:
1. Pure functions over `chartToObject()` output — no dependency on how the chart was built.
2. **Every finding carries its source** (書 / 篇 / 原文). The classics disagree on
   conditions often enough that an unsourced rule is unresolvable later.
3. **Variant readings are emitted side by side**, tagged with `讀法`, never silently
   picked. 六儀擊刑 is the live example: 寬式 (any 六儀 in its 刑宮) fires ~4× more
   often than 嚴式 (only the 值符's 儀).
4. Derive what can be derived, then check the derivation against a table the classics
   list explicitly. 門迫 is derived from 五行 relations and asserted against
   《法竅》〈論八門迫制〉's 13 explicit pairs.

Findings come in two `類`: **格局** (named formations — 9 implemented: 伏吟、反吟、門迫、
五不遇時、三奇得使、三奇入墓、天地人三遁、六儀擊刑、截路空亡) and **十干克應**
(the 81-cell 天盤干 × 地盤干 table — 甲 hides in the 六儀 and never reaches the plate,
so it is 9×9, not 10×10; every chart yields exactly 9 of these, one per palace).

**The two 類 collide on names**: the 戊戊 cell of 十干克應 is itself called 伏吟 in the
classics, which is not the same thing as plate-level 伏吟 (天盤 identical to 地盤).
Always filter by `類` before matching on `格`.

The 十干克應 table was built from 《旨歸》卷五 and 《秘笈大全》〈十干剋應訣〉 (which agree
almost character for character); 《法竅》's separate naming lives in `異名`.
《統宗》〈奇門四十格〉 was **not** used to build it — its ten 十干克應 entries serve as an
independent check in test.js.

**旺相休囚 is not a finding.** It decides how *heavy* a judgment is, not whether it fires
(《法竅》: 「吉門有氣益吉，無氣減吉」), so it lives in `assessVigor(chart)` rather than
`detectPatterns`. Two schools are returned side by side because 《法竅》 and 《統宗》
**swap 旺 and 相** — both with complete worked examples, so neither is picked over the other:

| star vs month | 法竅 | 統宗 |
|---|---|---|
| 同類 | 旺 | 相 |
| 我生 | 相 | 旺 |
| 生我 | 廢 | 死 |
| 我克 | 休 | 廢 |
| 克我 | 囚 | 囚 |

八門旺相 needs 節氣, which only `generateChartByDatetime` supplies; a manually built chart
returns `八門: null` rather than guessing.

**test.js**: Assertion-driven test suite (42 tests). Every case compares against expected
values; the golden values in `chartTestCases` were hand-verified against traditional rules
and must not be regenerated from program output without re-checking them by hand.

## Data Flow Example

Input: `generateQimenChart({ 年柱: '甲辰', 月柱: '丙寅', 日柱: '戊午', 時柱: '庚申', 局數: 5, 陰陽: '陽' })`

The legacy positional form `generateQimenChart(id, [...])` still works — `normalizeChartInput()` accepts both. The `id` was never used in the computation.

1. Extract time pillar: '庚申'
2. Calculate Xun Shou: '庚申' is the 7th of the 甲寅 decade, so Xun Shou is '甲寅' (fly step 6)
3. Get Fu Shou: '甲寅' → '癸'
4. Extract time stem: '庚' (not Jia, so no hiding)
5. Get Di Pan: `DIPAN_YANG[5]` → `['乙','壬','丁','丙','戊','庚','辛','癸','己']`
6. Calculate Tian Pan: '庚' sits at index 5 (兌) — the placement start; '癸' (Fu Shou) sits at index 7 (坎) — the pickup start; rotate accordingly
7. Calculate Eight Doors: '癸' at 坎 → Zhi Shi door is 休門, then fly 6 palaces (Yang = clockwise through the nine palaces)
8. Calculate Nine Stars: '癸' at 坎 → Zhi Fu star is 天蓬; 落宮 is read back from the resulting 九星 array
9. Calculate Eight Gods: Start from time stem '庚' position, use Yang deity sequence
10. Return Map with 29 fields (32 via `generateChartByDatetime`, which adds 節氣/三元/節後天數)

## Important Implementation Notes

### When Adding Features

- All layer calculations are **independent** - they only depend on game number, Yang/Yin mode, and time stem
- The five layers share the same 9-palace coordinate system but calculate separately
- **Never modify constants.js tables** - they encode traditional formulas verified over centuries

### Common Gotchas

1. **Index Confusion**: Array indices [0-8] map to palaces [1-9] in display but calculations use 0-based indexing
2. **Middle Palace**: Palace 4 (index 4) is center - some elements substitute to palace 2 or 8
3. **Rotation Direction**: Yang mode flies clockwise (順飛), Yin mode flies counterclockwise (逆飛)
4. **Jia Character**: When time stem is '甲', must use Fu Shou instead in all calculations
5. **ES Module Syntax**: Use `import/export`, not `require()` - package.json has `"type": "module"`

### Testing Strategy

The test suite validates:
- Yang and Yin bureaus
- Different game numbers (1-9)
- Jia hiding logic (when time stem is 甲)
- All five layers produce correct output
- 旬空 (per-decade void directions) and 孤虛 (per-branch, 統宗 rule) — these are different concepts, see below

When modifying calculations, always run `npm test` to verify against known-good outputs.

## Browser vs Node.js

- **Browser**: `index.html` loads lunar-javascript via CDN
- **Node.js**: Requires `npm install lunar-javascript` - uses external package
- Both modes use identical calculation logic from the JS modules
- Web UI provides date/time input with auto four-pillar calculation

## Release Strategy

This project uses **bundled dist + GitHub auto source** release model.

### Release Assets
| Asset | Contents | Purpose |
|-------|----------|---------|
| `qimen-dunjia-v{version}.zip` | Bundled JS + demo + docs | Quick usage |
| `Source code (zip/tar.gz)` | Full source | Auto-generated by GitHub |

### Zip Contents
```
qimen-dunjia-v{version}.zip
├── qimen.min.js           # ES Module (~13KB, requires lunar-javascript)
├── qimen.standalone.min.js # IIFE (~337KB, includes lunar-javascript)
├── API.md                 # API documentation
└── index.html             # Web demo
```

### Usage Scenarios
| Need | Use |
|------|-----|
| Browser `<script>` tag | `qimen.standalone.min.js` |
| Node.js / Bundler | `qimen.min.js` + `npm install lunar-javascript` |
| Development / Learning | Download GitHub's auto-generated Source code |

### Creating a Release
```bash
npm run build && npm run build:standalone
# Create zip with: qimen.min.js, qimen.standalone.min.js, API.md, index.html
# Use gh CLI or GitHub web to create release with zip attachment
```
