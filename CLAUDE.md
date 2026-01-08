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

Runs the test suite with 21 test cases covering:
- Yang/Yin bureaus and different game numbers
- Jia hiding logic
- `generateChartByDatetime` API (datetime parsing, solar terms, Yuan periods)
- `generateChartNow` API
- Input validation
- Consistency between APIs

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
> const result = generateQimenChart('test', ['甲辰', '丙寅', '戊午', '庚申', 5, '陽'])
> const obj = chartToObject(result)
```

## Architecture

### Module Structure

The system follows a **layered architecture** with clear separation of concerns:

```
index.js (Unified API)
    ↓
qimen.js (Main Controller)
    ↓
├── constants.js (Lookup Tables)
├── utils.js (Array Rotation & Queries)
└── calculations.js (Five-Layer Calculations)
    ↓
lunar-javascript (npm package)
```

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

**Zhong Palace (中宮)**: Palace 5 (center) has special handling. When an element should go to center, it's often substituted to palace 2 or 8 depending on context. See `ZHONG_SUBSTITUTE` and `normalizeZhongPalace()`.

**Chai Bu Method (拆補法)**: The system uses the Chai Bu method (not Zhi Run method) for determining game numbers. This calculates days since solar term and divides into three Yuan periods (上元/中元/下元: days 1-5, 6-10, 11-15).

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
- `calculateJuByChaiBu()`: Implements Chai Bu method for auto game number determination

**lunar-javascript** (npm package by 6tail): Used for:
- Solar to lunar calendar conversion
- Calculating four pillars (year/month/day/hour stems-branches)
- Finding current solar term and days since term

**test.js**: Validation module with 21 test cases covering:
- Original `generateQimenChart` functionality
- `generateChartByDatetime` API with datetime parsing and solar term validation
- `generateChartNow` API
- Input validation (format, range checking)
- API consistency verification

## Data Flow Example

Input: `generateQimenChart('2024010112', ['甲辰', '丙寅', '戊午', '庚申', 5, '陽'])`

1. Extract time pillar: '庚申'
2. Calculate Xun Shou: '庚申' belongs to '甲午' cycle
3. Get Fu Shou: '甲午' → '辛'
4. Extract time stem: '庚' (not Jia, so no hiding)
5. Get Di Pan: `DIPAN_YANG[5]` (Yang bureau game 5)
6. Calculate Tian Pan: Find '庚' position in Di Pan, then find '辛' (Fu Shou) position, rotate accordingly
7. Calculate Eight Doors: Find Zhi Shi door from Fu Shou's position in Di Pan, then fly
8. Calculate Nine Stars: Find Zhi Fu star from Fu Shou's position in Di Pan, then fly
9. Calculate Eight Gods: Start from time stem '庚' position, use Yang deity sequence
10. Return Map with all 26 result fields

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
- Four pillars Kong Wang (空亡) calculations

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
