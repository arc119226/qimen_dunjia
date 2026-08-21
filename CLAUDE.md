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

Runs the test suite (94 tests, ~1.4s) covering:
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
npm run build            # ES Module → dist/qimen.min.js (~65KB)
npm run build:standalone # IIFE → dist/qimen.standalone.min.js (~391KB)

Both npm scripts run `build.mjs`. It uses esbuild's JS API rather than the CLI for one
reason: the standalone bundle embeds lunar-javascript, and MIT requires its notice to
travel with the copy — `--minify` strips comments and lunar.js has no banner, so the
build must add it. The notice's version is read from node_modules, so a dependency bump
changes the artifact and CI's dist-sync check catches an unrebuilt commit.
```

### Running in Browser
Open `index.html` directly in a browser — it loads `dist/qimen.standalone.min.js`
(self-contained, no CDN, works offline). Rebuild dist after changing any source file.

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

**夜子時 (the 23:00–24:00 hour) is an option, not a silent choice.**
`generateChartByDatetime(datetime, {夜子時})` takes `'次日'` (default, unchanged behaviour)
or `'當日'`. It decides whether that hour's 日柱 belongs to the current or the next day —
**1/12 of all hours**, and flipping the 日柱 cascades into 旬首/符首/值符/值使, i.e. the
whole chart. The 時柱 follows via 五鼠遁 from whichever 日干 results (己日子時=甲子 vs
戊日子時=壬子); lunar-javascript's `getTimeInGanZhi()` is bound to `getDayInGanZhiExact()`,
so the 當日 branch derives the 時干 itself. 定局 is **not** affected — both 拆補 and 符頭
key off the instant/calendar day, not the 日柱.

Classical grounding is **suggestive, not decisive**: 《統宗》 dates 康熙五十六年夏至 to
「五月十三日丙寅夜子初二刻」, attributing a 夜子 instant to the *current* day. But that is
almanac date notation (a civil day runs midnight to midnight), which does not necessarily
fix the 日柱 used for 起課. Recorded as a lead, not used to pick a side.

**Basis declarations (`TIME_BASIS`, `CALENDAR_BASIS`).** Every auto-generated chart carries
two fields that state what the chart is measured against. Both **only declare — they change no
palace value** — and both are externally falsifiable in test.js, deliberately:

- `曆法基準`: 節氣 times are **定氣** (apparent solar longitude, 時憲曆法, adopted 1645), applied
  to all years. Before 1645 China used **平氣** (mean, 授時曆法); the two differ by up to ~2 days
  while a 三元 bucket is only 5 days wide, so pre-Ming dates need not match the era's own almanac.
  This is not a defect — **the classics themselves split**: 《法竅》「如遵時憲書節氣為憑」 vs
  《演義》「以授時歷看」. Verified by gap dispersion: 定氣 gaps run 14.72–15.73 days, 平氣 would
  be a constant 15.2184.
- `時間基準`: input is treated as a **UTC+8 wall clock**. Verified against three astronomical
  solstice/equinox instants (2024 春分 = 11:06:25 = 03:06 UTC + 8h, to the minute).
  DST, true solar time, and longitude are **not** corrected.

`generateChartNow()` additionally emits `時鐘來源`, reporting the gap between the local clock and
the chart basis. **It reads the local wall clock while 節氣 are computed in UTC+8**, so on a
non-UTC+8 machine the 日柱 and 時柱 can be wrong. It declares rather than converts: converting to
UTC+8 would pick a school (most schools use local time for 時辰 abroad).

**The tests derive their expectations from the declaration, not from a literal.** Changing
`時區` to `'UTC+9'` or `節氣` to `'平氣'` turns them red, because the assertion re-derives the
expected value from whatever the declaration says and compares it against reality. A declaration
nothing checks is decoration.

**Two 定局法 schools, both shipped.** `generateChartByDatetime(datetime, {定局法})` takes
`'拆補'` (default) or `'符頭'`. They are not two names for one thing — **97.3% of 2024's
hours get a different bureau**. 《寶鑒御定》 records the fight verbatim: it calls the
拆補 school 「創為拆補以亂符頭」「殊違尊甲之旨」. The project picks neither.

符頭法 (`calculateJuByFuTou`): the 上元符頭 are only 甲子/己卯/甲午/己酉 (every 15 days);
元 = ⌊days since ÷ 5⌋; each cycle governs the next 節氣 in order — **except when it leaps**.

**置閏 is anchored to 芒種 and 大雪, not to a day count.** Three books agree:
《演義》「置閏定在芒種、大雪之後。設遇小滿、小雪二氣之交，**雖超九日、十日，不可置閏**」;
《寶鑒》「遇芒種大雪，重用本氣三元」. The day count is only the *window* that enables it
(《演義》「超越經旬或九朝，或過十一日無饒。**閏奇額在斯三日**」). 《統宗》's 康熙 57 example
shows the mechanism: the trigger is that the **candidate** 節氣 (夏至) sits too far from the
符頭 (「為期大遠」), and the leap lands on the **current** 節氣 (芒種).

**Counting convention**: the classics count inclusively. Their 「超九日」 is a calendar gap of
8 (五月十六 to 五月廿四). The `超接天數` field reports the plain calendar gap, so classical
figures run one higher.

**The chain is walked by rule from an arbitrary early start — no historical date is fed in.**
《統宗》's recorded 正授 (康熙五十八年立秋 = 1719-08-08, 「本日即是陰遁二局」) therefore
emerges on its own, and test.js asserts it. The anchor is a *check*, not an input — same
pattern as the basis declarations.

Measured 1800–2100: 105 leaps (one per 2.87 years vs theory 2.86), **all at 芒種 or 大雪**,
and **no 節氣 skipped** (統宗「俾三元之次序不紊」).

Known gaps: (1) hour-level 疊局 is not modelled — 1962-09-08 白露 crosses at 寅初三刻, so
《法竅》 says 「符先節後，法當用超」 where this project says 正授; test.js pins that divergence.
(2) 《秘笈大全》 records a second threshold (「有過十四日而值閏者」) with no rule and no worked
example, so it is recorded in `FU_TOU_LEAP_THRESHOLD_VARIANT` rather than implemented.

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
- Returns a Map with 35 keys including pillars, game info, and all five layers
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

**Entry guards.** Every detector and `detectPatterns` calls `requireChartFields()` first.
This is not DX polish — without it `detectFanYin({})` fabricates a 「反吟・凶」 finding
carrying a genuine 煙波釣叟歌 citation, i.e. a **false 凶格 with a real source attached**,
which is a credibility-level defect for a project whose selling point is sourced judgments.
A Map (what the chart APIs return) is **rejected, not auto-converted** — converting would
make Map a second legal input shape and dilute rule 1 below, and would not catch the
"right shape, missing fields" case. Guards check only the fields that detector actually
reads, so partial-chart unit tests still work.

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

**門迫 now emits both directions, plus 和義.** The project used to emit only 門克宮, citing
《法竅》's 賦文 「宮制其門不為迫」. **The very next line — that 賦文's own 註 — gives two
13-pair tables and redefines 迫**: 「宮迫者…此宮克門也。凡宮迫門者，為主克客也。門迫者…
此門克宮也。蓋迫者，逼也…**或門受制於宮，或宮受制於門**」. The 賦文 and its own 註
disagree; that tension is surfaced, not resolved. Three mutually exclusive outcomes, at most
one per palace: 門迫 (門克宮, 客克主, 凶, 13 pairs), 宮迫 (宮克門, 主克客, 凶, 13 pairs),
和義 (宮生門, 主生客, 吉, 12 pairs — from the same 賦文's 「宮若生門則為義」). Each finding
carries 關係 and 主客. 門生宮 and 比和 get no name because the classics give none.
The citation was also **misattributed**: 〈論八門迫制〉 is in 卷八 and is direction-neutral;
the 賦文 and 註 are in 卷一.

**五不遇時 ships two readings, and the split is about whether 支 counts.** The 煙波釣叟歌
is *underdetermined* — 「時干來克日干上，甲日須知時忌庚」 gives one example and never says
same-polarity. The ten-pair 定式 comes from the annotations, and two books reach it by
**different methods**: 《演義》 (葛洪注) lists them; 《寶鑒》〈釋五不遇時〉 gives a construction
(「以庚加午逆行，越過戌亥」) that test.js actually runs and checks against the list.
《寶鑒》 also states the distinction outright: 「順數者，止論其干，故名七殺。逆數者，
合論其干支，故曰五不遇時。」 So 干支定式 (10 of 120, 1.00/day) and 《法竅》's stem-only
陽克陽陰克陰 (12 of 120, 1.21/day) are both emitted, differing only at 己日乙亥 and 庚日丙戌.
Dropping the polarity check yields 24 of 120 and 2.43/day — **no classic lists any of the
extra twelve**.

The 十干克應 table was built from 《旨歸》卷五 and 《秘笈大全》〈十干剋應訣〉 (which agree
almost character for character); 《法竅》's separate naming lives in `異名`.
《統宗》〈奇門四十格〉 was **not** used to build it — its ten 十干克應 entries serve as an
independent check in test.js.

**九星旺相ships four readings out of at least seven in the corpus.** The admission bar is
**a worked example you can check the mapping against** — each of the four carries its own
天蓬水星 five-cell example, and test.js re-derives the mapping from the example. Keys are
**not book names**: 《遁甲演義》 alone contains three incompatible readings, 《統宗》 two,
《秘笈大全》 two, so "book X holds reading Y" is false for those books — attribution is
per-chapter only. 旺 and 相 swap between readings, so picking any one as representative
distorts. Three further readings are recorded in `VIGOR_READINGS_NOT_ADOPTED` with reasons
(two have no worked example; one is positional rather than month-based and lacks 廢).
《統宗》卷三's four-season table is **not** counted as evidence for any reading: 「春木相火旺…」
admits two readings (is 春 the month or the 木 star?) that disagree in four of five cells, and
the entry never says 星.

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
10. Return Map with 35 fields — 41 via `generateChartByDatetime` (adds 節氣/三元/定局法/
    節後天數/時間基準/曆法基準), 45 with `{定局法:'符頭'}` (adds 上元符頭/符頭/超接/超接天數/閏局)

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

- **Browser**: `index.html` loads `dist/qimen.standalone.min.js` (lunar-javascript inlined; no CDN)
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
├── qimen.min.js           # ES Module (~65KB, requires lunar-javascript)
├── qimen.standalone.min.js # IIFE (~391KB, includes lunar-javascript)
├── THIRD-PARTY-LICENSES.txt # notice for the embedded lunar-javascript
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
