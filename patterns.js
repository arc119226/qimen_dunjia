/**
 * 奇門遁甲格局判斷模組
 *
 * 本模組不參與排盤，只讀取排好的盤局並判斷格局。
 *
 * 設計原則
 * ========================================================================
 *
 * 1. 純函數，只吃盤面。所有判斷都是 chartToObject() 結果的函數，不依賴排盤
 *    是怎麼算出來的。轉盤排的盤與飛盤排的盤，只要格式相同就都能判。
 *
 * 2. 每條格局都帶出處。典籍對同一格局的條件常有出入，沒有出處就無從裁決。
 *    出處記到「書名 + 篇名 + 原文」的粒度。
 *
 * 3. 異說並列，不代為擇一。遇到各書條件不同者，逐一產出判定結果並以 `讀法`
 *    標明，由呼叫端依自己遵循的流派過濾。六儀擊刑即為一例：寬式（任一六儀
 *    落刑宮）與嚴式（僅值符之儀）出現率相差近四倍。
 *
 * 4. 能推導的就推導，並在測試中與典籍明列的表核對。如門迫由門與宮的五行相克
 *    推得，而《法竅》〈論八門迫制〉的逐條列舉則作為測試基準。
 */

import {
    LUOSHU_BAGUA,
    PALACE,
    ELEMENT_OVERCOMES,
    ELEMENT_GENERATES,
    ZHI_ELEMENTS,
    JIEQI_TO_GUA,
    PALACE_ELEMENTS,
    DOOR_ELEMENTS,
    STAR_ELEMENTS,
    GAN_ELEMENTS,
    QIMEN_STARS,
    EIGHT_DOORS_ORIGINAL,
    EIGHT_DOORS_SEQUENCE,
    ZHONG_SUBSTITUTE
} from './constants.js';

import { rotateArrayFromIndex } from './utils.js';

// ============================================================================
// 出處
// ============================================================================

const SOURCES = Object.freeze({
    法竅_迫制賦: Object.freeze({
        書: '奇門法竅',
        篇: '卷一（賦文）',
        文: '宮制其門不為迫，門制其宮門迫凶。吉門被迫吉減去，凶遇門迫凶更凶。' +
            '宮若生門則為義，最吉日合門主宮。'
    }),
    法竅_迫制註: Object.freeze({
        書: '奇門法竅',
        篇: '卷一（賦文之註）',
        文: '宮迫者，謂開驚兩門臨離宮，火克金也；休門臨坤艮二宮，土克水也；' +
            '生死兩門臨震巽二宮，木克土也；傷杜兩門臨乾兌二宮，金克木也；' +
            '景門臨坎宮，水克火也，此宮克門也。凡宮迫門者，為主克客也。' +
            '門迫者，開驚二門臨震巽二宮，金克木也；休門臨離宮，水克火也；' +
            '生死二門臨坎宮，土克水也；傷杜二門臨坤艮二宮，木克土也；' +
            '景門臨乾兌二宮，火克金也，此門克宮也。' +
            '蓋迫者，逼也，急切受制，或門受制於宮，或宮受制於門，彼此相抗，' +
            '扼抑不容，故吉門受制，吉則減吉，凶門受制，凶則愈凶矣。' +
            '凡門克宮者，為客克主也。'
    }),
    法竅_論八門迫制: Object.freeze({
        書: '奇門法竅',
        篇: '論八門迫制',
        文: '吉門迫制，吉事不成；凶門迫制，凶災尤甚。' +
            '凶門和義，其凶不凶；吉門和義，其吉益吉。'
    }),
    寶鑑_擊刑: Object.freeze({
        書: '奇門寶鑑御定',
        篇: '釋六儀擊刑',
        文: '甲子直符加三宮、子刑卯也。甲戌加二宮、戌刑未也。甲申加八宮、申刑寅也。'
            + '甲午加九宮、午刑午也。甲辰加四宮、辰刑辰也。甲寅加四宮、寅刑巳也。'
    }),
    法竅_擊刑: Object.freeze({
        書: '奇門法竅',
        篇: '論六儀擊刑',
        文: '甲子直符臨三宮，子刑卯也，為無理之刑…甲午直符臨九宮，午自刑也，為高大之刑。'
    }),
    統宗_得使: Object.freeze({
        書: '奇門遁甲統宗',
        篇: '奇門四十格',
        文: '三奇得使：乙奇加甲午甲戌，丙奇加甲子甲申，丁奇加甲寅甲辰。'
    }),
    釣叟_五不遇: Object.freeze({
        書: '煙波釣叟歌',
        篇: '（《遁甲演義》錄為黃帝陰符經）',
        文: '五不遇時龍不精，號為日月損光明，時干來克日干上，甲日須知時忌庚。'
    }),
    演義_五不遇: Object.freeze({
        書: '遁甲演義',
        篇: '（葛洪注）',
        文: '五不遇時者，謂剛柔日相克，而損其明。縱有奇門不可行百事，凶。' +
            '甲日庚午時，乙日辛巳時，丙日壬辰時，丁日癸卯時，戊日甲寅時，' +
            '己日乙丑時，庚日丙子時，辛日丁酉時，壬日戊申時，癸日己未時，' +
            '乃時干克日干，陽克陽干，陰克陰干，名為主本不和，極凶。'
    }),
    寶鑑_五不遇: Object.freeze({
        書: '奇門寶鑒御定',
        篇: '釋五不遇時',
        文: '五不遇時者，時干克日干也。凡值此時，諸事不利。' +
            '其法以庚加午逆行，越過戌亥，為時之定局。' +
            '次以日干甲從庚上逆數其下，即本日五不遇時也。' +
            '凡十干環列，順數七干，逆數五干，皆克第一干。' +
            '順數者，止論其干，故名七殺。逆數者，合論其干支，故曰五不遇時。'
    }),
    法竅_五不遇: Object.freeze({
        書: '奇門法竅',
        篇: '論五不遇時',
        文: '五不遇，陽克陽干，陰克陰干，即子平家七煞之義也。' +
            '選擇日時，此煞極凶，縱有奇門，不用。'
    }),
    旨歸_伏吟: Object.freeze({
        書: '奇門旨歸',
        篇: '卷五 十干克應',
        文: '六甲加六戊，謂天盤戊加地盤戊是為伏吟，凡事閉塞，靜守為吉。'
    }),
    釣叟_反吟: Object.freeze({
        書: '煙波釣叟歌',
        篇: '（《奇門旨歸》卷二錄本）',
        文: '就中伏吟為最凶，天蓬加著地天蓬，天蓬若到天英上，須知即是返吟宮。'
    }),
    統宗_四十格: Object.freeze({
        書: '奇門遁甲統宗',
        篇: '奇門四十格',
        文: '三奇入墓：乙奇坤宮、丙奇乾宮、丁奇艮宮。'
    }),
    旨歸_入墓: Object.freeze({
        書: '奇門旨歸',
        篇: '三奇入墓',
        文: '乙奇臨坤，丙奇臨乾，丁奇臨艮為三奇入墓，忌行軍，凡百事吉者不吉、凶者不凶，無功之象。'
    }),
    寶鑑_奇墓: Object.freeze({
        書: '奇門寶鑑御定',
        篇: '釋奇墓奇制與日時干墓同凶',
        文: '奇墓者，乙奇臨二宮，丙奇、丁奇臨六宮也。二宮藏未，六宮藏戌。'
            + '乙木墓於未，丙丁火墓於戌，故乙奇墓二、丙丁墓六也。墓則氣絕，不利舉動。'
    }),
    法竅_三遁: Object.freeze({
        書: '奇門法竅',
        篇: '（與《景祐符應經》〈釋天遁甲〉等三篇、煙波釣叟歌一致）',
        文: '天遁－生門、丙奇合地盤六丁。地遁－開門、乙奇合地盤六己。人遁－休門、丁奇合太陰。'
    }),
    /** @deprecated 改由 detectShiGanKeYing 逐格帶該格的斷語。保留以免破壞既有匯入 */
    旨歸_克應: Object.freeze({
        書: '奇門旨歸',
        篇: '卷五 十干克應',
        文: '戊加乙為青龍合靈，門吉事吉，門凶事凶。加丙為青龍返首，動作大利…（逐格詳列）'
    }),
    秘笈_克應: Object.freeze({
        書: '奇門遁甲秘笈大全',
        篇: '十干剋應訣',
        文: '戊加戊甲值符謂之伏吟，凡事閉塞，靜守為吉。加乙為青龍合靈…（本篇逐格詳列，' +
            '與《旨歸》卷五幾乎逐字相同；各格斷語見該格判定的第一則出處）'
    }),
    元靈經_截路: Object.freeze({
        書: '奇門遁甲元靈經',
        篇: '截路空亡',
        文: '此時忌出行：甲己申酉空，乙庚午未中，丙辛辰巳上，丁壬寅卯同，惟有戊癸日，子丑永無蹤。'
    })
});

// ============================================================================
// 判定用的小工具
// ============================================================================

/** 該宮索引的後天八卦名 */
const palaceName = index => LUOSHU_BAGUA[index];

/** a 是否克 b */
const overcomes = (a, b) => ELEMENT_OVERCOMES[a] === b;

/** 對宮：洛書數相加為十 */
const OPPOSITE_PALACE = Object.freeze({
    巽: '乾', 乾: '巽', 離: '坎', 坎: '離',
    坤: '艮', 艮: '坤', 震: '兌', 兌: '震'
});

/** 六儀所遁之甲 */
const YI_TO_JIA = Object.freeze({
    戊: '甲子', 己: '甲戌', 庚: '甲申', 辛: '甲午', 壬: '甲辰', 癸: '甲寅'
});

/**
 * 建立一則判定結果
 *
 * @param {string} 格 - 格局名稱
 * @param {string} 吉凶 - 吉／凶／中性
 * @param {string|null} 宮 - 落宮；全盤性者為 null
 * @param {string} 細節 - 該例的具體條件
 * @param {Object} 出處 - SOURCES 中的一項
 * @param {string} [讀法] - 有異說時標明所依讀法
 * @returns {Object} 判定結果，類為「格局」
 *
 * 註：判定結果分兩類。「格局」為各有專名的格，「十干克應」則是天盤干加地盤干的
 * 九宮逐格判定。兩類會撞名——十干克應的戊戊格典籍即名為伏吟，與盤面層級的
 * 伏吟（天盤地盤全同）不是一回事，故以「類」區分。
 */
function finding(格, 吉凶, 宮, 細節, 出處, 讀法) {
    const result = { 類: '格局', 格, 吉凶, 宮, 細節, 出處: [出處] };
    if (讀法) result.讀法 = 讀法;
    return result;
}

// ============================================================================
// 入口守衛
// ============================================================================

/**
 * 判斷層吃的是 `chartToObject()` 的結果，不是起盤函數回傳的 Map
 *
 * 漏了那一步不會得到任何提示，這是主 API 形狀上最容易踩的一階坑——
 * `generateChartByDatetime` 回傳 Map，判斷層要物件，兩者長得一樣可傳。
 *
 * 但真正非守不可的理由不是 DX，是**可信度**：缺欄位時 `detectFanYin`
 * 不會拋錯，而是憑空產出一則「反吟・凶」，細節寫著
 * 「值符undefined由本位undefined宮飛至對宮undefined宮」，且該假判斷帶著
 * 一條查證屬實的煙波釣叟歌引文。對一個以「每則判斷帶出處、不亂講」為賣點的
 * 專案，發出附真實出處的假凶格是可信度層級的缺陷。
 *
 * **不自動把 Map 轉成物件。** 那會把 Map 固化成第二種合法輸入形狀，
 * 稀釋「判定器是 `chartToObject()` 輸出的純函數」這條原則；而且轉換也修不到
 * 「形狀對但缺欄位」的情形。此處明確拋錯，作法比照 `qimen.js` 的
 * `normalizeChartInput`。
 */
function describeInput(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return '陣列';
    if (value instanceof Map) return 'Map';
    return typeof value;
}

/**
 * 檢查盤面物件具備該判定器所需的欄位
 *
 * 只檢查該判定器**實際會讀**的欄位，故以部分盤面做單元測試仍可行
 * （如 `detectMenPo({ 天門: [...] })`）。
 *
 * @param {Object} chart - 應為 chartToObject() 的結果
 * @param {Array<string>} fields - 該判定器所需的欄位
 * @param {string} caller - 判定器名稱，用於錯誤訊息
 */
function requireChartFields(chart, fields, caller) {
    if (chart instanceof Map) {
        throw new Error(
            `${caller}：判斷層需要 chartToObject(chart) 的結果，` +
            `而非起盤函數回傳的 Map。請先 const obj = chartToObject(chart) 再傳入。`
        );
    }
    if (!chart || typeof chart !== 'object' || Array.isArray(chart)) {
        throw new Error(
            `${caller}：判斷層需要一個盤面物件（chartToObject 的結果），實得 ${describeInput(chart)}。`
        );
    }
    const missing = fields.filter(field => chart[field] === undefined || chart[field] === null);
    if (missing.length > 0) {
        throw new Error(
            `${caller}：盤面缺少必要欄位「${missing.join('」「')}」。` +
            `判斷層需要 chartToObject(chart) 的完整結果。`
        );
    }
}

// ============================================================================
// 各條格局
// ============================================================================

/**
 * 伏吟：天盤與地盤全同
 *
 * 時干（甲遁後為符首）與符首同宮時，取值起點等於放置起點，天盤不動。
 * 每旬有二時如此：旬首之甲時（甲遁符首）與符首本身之時。
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectFuYin(chart) {
    requireChartFields(chart, ['天盤', '地盤'], 'detectFuYin');
    const same = chart['天盤'].every((gan, index) => gan === chart['地盤'][index]);
    if (!same) return [];
    return [finding('伏吟', '凶', null, '天盤與地盤全同，時干與符首同宮', SOURCES.旨歸_伏吟)];
}

/**
 * 反吟：值符星飛至本位之對宮
 *
 * 轉盤為剛性環轉，值符到對宮則八星俱到對宮。天禽居中不動，
 * 以其寄宮之星（天芮）定位。
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectFanYin(chart) {
    requireChartFields(chart, ['值符', '值符落宮'], 'detectFanYin');
    const zhongStar = QIMEN_STARS[PALACE.ZHONG];
    const star = chart['值符'] === zhongStar ? QIMEN_STARS[ZHONG_SUBSTITUTE] : chart['值符'];
    const home = palaceName(QIMEN_STARS.indexOf(star));
    const landed = chart['值符落宮'];
    if (OPPOSITE_PALACE[home] !== landed) return [];
    return [finding('反吟', '凶', landed,
        `值符${chart['值符']}由本位${home}宮飛至對宮${landed}宮`, SOURCES.釣叟_反吟)];
}

/**
 * 門與宮的五行關係
 *
 * 專案原先只輸出門克宮一種，並在此註解「宮克門者不列（原文明言不為迫）」，
 * 所據為《法竅》卷一賦文「宮制其門不為迫」。但**同一部書、同一段的下一行註**
 * 就給出了完整的兩張表並重新定義「迫」：
 *
 *   「宮迫者，謂開驚兩門臨離宮，火克金也…此宮克門也。凡宮迫門者，為主克客也。
 *     門迫者，開驚二門臨震巽二宮，金克木也…此門克宮也。
 *     蓋迫者，逼也，急切受制，或門受制於宮，或宮受制於門，彼此相抗，扼抑不容，
 *     故吉門受制，吉則減吉，凶門受制，凶則愈凶矣。凡門克宮者，為客克主也。」
 *
 * 賦文說「宮制其門不為迫」，它自己的註卻名之為「宮迫」——這是書內張力，
 * 依專案原則呈現而不代為裁決：兩個方向都輸出，各自標明關係與主客。
 *
 * 賦文同句另有「宮若生門則為義」，故宮生門一併輸出。
 * 〈論八門迫制〉（法竅卷八，非卷一賦文所在）稱之為「和義」，
 * 且該篇通篇用不分方向的「迫制」：「吉門迫制，吉事不成；凶門迫制，凶災尤甚。
 * 凶門和義，其凶不凶；吉門和義，其吉益吉。」
 *
 * 兩張表各十三對，由五行相克推導後與《法竅》明列者逐對核對（見 test.js）。
 */
const MEN_GONG_RELATIONS = Object.freeze([
    {
        判: (doorElement, palaceElement) => overcomes(doorElement, palaceElement),
        格: '門迫', 吉凶: '凶', 關係: '門克宮', 主客: '客克主',
        述: (door, doorElement, palace, palaceElement) =>
            `${door}（${doorElement}）克${palace}宮（${palaceElement}），門克宮，為客克主`
    },
    {
        判: (doorElement, palaceElement) => overcomes(palaceElement, doorElement),
        格: '宮迫', 吉凶: '凶', 關係: '宮克門', 主客: '主克客',
        述: (door, doorElement, palace, palaceElement) =>
            `${palace}宮（${palaceElement}）克${door}（${doorElement}），宮克門，為主克客`
    },
    {
        判: (doorElement, palaceElement) => ELEMENT_GENERATES[palaceElement] === doorElement,
        格: '和義', 吉凶: '吉', 關係: '宮生門', 主客: '主生客',
        述: (door, doorElement, palace, palaceElement) =>
            `${palace}宮（${palaceElement}）生${door}（${doorElement}），宮生門，為主生客`
    }
]);

/**
 * 門迫、宮迫與和義
 *
 * 三者互斥（五行關係只能居其一），故每宮至多產出一則。
 * 門生宮與比和不產出判定——《法竅》〈論門宮生克〉雖亦論門生宮（客生主），
 * 但未立格名，依專案慣例不代為命名。
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectMenPo(chart) {
    requireChartFields(chart, ['天門'], 'detectMenPo');
    const results = [];
    chart['天門'].forEach((door, index) => {
        if (!door) return;
        const doorElement = DOOR_ELEMENTS[door];
        const palaceElement = PALACE_ELEMENTS[index];
        const palace = palaceName(index);

        for (const rule of MEN_GONG_RELATIONS) {
            if (!rule.判(doorElement, palaceElement)) continue;
            const item = finding(rule.格, rule.吉凶, palace,
                rule.述(door, doorElement, palace, palaceElement),
                SOURCES.法竅_迫制註);
            item.關係 = rule.關係;
            item.主客 = rule.主客;
            if (rule.格 === '和義') item.異名 = [{ 名: '義', 書: '奇門法竅', 篇: '卷一（賦文）' }];
            results.push(item);
            break;
        }
    });
    return results;
}


/**
 * 五不遇時：時干克日干
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
/** 十天干中的陽干。陰干為其餘五者 */
const YANG_GAN = Object.freeze(['甲', '丙', '戊', '庚', '壬']);

const isYangGan = gan => YANG_GAN.includes(gan);

/**
 * 五不遇時的十組干支定式
 *
 * 煙波釣叟歌本身是**欠定**的——「時干來克日干上，甲日須知時忌庚」只給了甲日一例，
 * 未言同性與否。定式來自緊貼歌句下方的注疏，而兩部書以**完全不同的方法**得到同一組：
 *
 * 《遁甲演義》葛洪注直接列出十組（見 SOURCES.演義_五不遇）。
 * 《奇門寶鑒御定》〈釋五不遇時〉則給構造法：「其法以庚加午逆行，越過戌亥，
 * 為時之定局」——自庚午起逆行，越過戌亥兩支，恰得
 * 庚午、辛巳、壬辰、癸卯、甲寅、乙丑、丙子、丁酉、戊申、己未，與《演義》所列逐字相同。
 * 兩法所得相同，故此表有兩個獨立的書證。
 *
 * 語料訛字（照正字引用，此處記其原貌）：《演義》作「乙日辛**已**時」，
 * 《寶鑒》與《法竅》因簡繁過度轉換而作「時**幹**克日**乾**」「陽克陽**乾**」。
 */
const WU_BU_YU_PILLARS = Object.freeze({
    甲: '庚午', 乙: '辛巳', 丙: '壬辰', 丁: '癸卯', 戊: '甲寅',
    己: '乙丑', 庚: '丙子', 辛: '丁酉', 壬: '戊申', 癸: '己未'
});

/**
 * 五不遇時：時干克日干
 *
 * 兩種讀法並列，差別在**合不合論干支**——《寶鑒》把這件事講得最清楚：
 * 「凡十干環列，順數七干，逆數五干，皆克第一干。順數者，止論其干，故名七殺。
 * 逆數者，合論其干支，故曰五不遇時。」也就是說「五」正是合論干支才數得出來的。
 *
 * - **干支定式**（《演義》《寶鑒》）：十組固定的日干與時柱配對，120 格中命中 10 格
 * - **陽克陽陰克陰**（《法竅》，即七殺）：只論干不論支，多出己日乙亥、庚日丙戌
 *   兩格，命中 12 格
 *
 * 定式為同性讀法的子集，故十組定式必同時觸發兩則判定（比照六儀擊刑的寬嚴兩式）。
 *
 * **同性這個限制不可省。** 若只查五行相克而不論陰陽，會多出十二格
 * （甲日辛未、乙日庚辰、丙日癸巳、丁日壬寅、戊日乙卯、己日甲子、己日甲戌、
 * 庚日丁丑、庚日丁亥、辛日丙申、壬日己酉、癸日戊午），命中 24 格、
 * 每日觸發 2.43 次而非典籍所稱的一次，而**九部書無一列出其中任何一格**。
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectWuBuYu(chart) {
    requireChartFields(chart, ['日柱', '時干', '時柱'], 'detectWuBuYu');
    const dayGan = chart['日柱'][0];
    const hourGan = chart['時干'];
    const hourPillar = chart['時柱'];
    const results = [];

    if (WU_BU_YU_PILLARS[dayGan] === hourPillar) {
        results.push(finding('五不遇時', '凶', null,
            `${dayGan}日${hourPillar}時，時干${hourGan}克日干${dayGan}`,
            SOURCES.演義_五不遇, '干支定式（演義、寶鑒）'));
    }

    if (overcomes(GAN_ELEMENTS[hourGan], GAN_ELEMENTS[dayGan])
        && isYangGan(hourGan) === isYangGan(dayGan)) {
        const polarity = isYangGan(hourGan) ? '陽克陽' : '陰克陰';
        results.push(finding('五不遇時', '凶', null,
            `時干${hourGan}（${GAN_ELEMENTS[hourGan]}）克日干${dayGan}（${GAN_ELEMENTS[dayGan]}），${polarity}`,
            SOURCES.法竅_五不遇, '陽克陽陰克陰（法竅，即七殺）'));
    }

    return results;
}

/**
 * 三奇得使：天盤三奇加於地盤特定六儀之上
 *
 * 乙加甲午（辛）甲戌（己）、丙加甲子（戊）甲申（庚）、丁加甲寅（癸）甲辰（壬）。
 */
const DE_SHI = Object.freeze({
    乙: ['辛', '己'],
    丙: ['戊', '庚'],
    丁: ['癸', '壬']
});

/**
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectSanQiDeShi(chart) {
    requireChartFields(chart, ['天盤', '地盤'], 'detectSanQiDeShi');
    const results = [];
    for (const [qi, yis] of Object.entries(DE_SHI)) {
        const index = chart['天盤'].indexOf(qi);
        if (index === -1) continue;
        const di = chart['地盤'][index];
        if (!yis.includes(di)) continue;
        results.push(finding('三奇得使', '吉', palaceName(index),
            `天盤${qi}奇加地盤${di}（${YI_TO_JIA[di]}）於${palaceName(index)}宮`,
            SOURCES.統宗_得使));
    }
    return results;
}

/**
 * 六儀擊刑：六儀落於刑其地支之宮
 *
 * 戊（甲子）子刑卯故忌震三，己（甲戌）戌刑未故忌坤二，庚（甲申）申刑寅故忌艮八，
 * 辛（甲午）午自刑故忌離九，壬（甲辰）辰自刑、癸（甲寅）寅刑巳，二者俱忌巽四。
 *
 * 判定範圍有異說，兩種讀法皆產出並以「讀法」標明：
 * - 寬式：天盤任一六儀落刑宮
 * - 嚴式：僅值符所帶之儀（即本旬符首）落刑宮。《法竅》〈論六儀擊刑〉逐條皆云
 *   「甲子直符臨三宮」，字面即此讀法
 *
 * 兩者出現率相差近四倍，故不代為擇一。
 */
const JI_XING = Object.freeze({
    戊: '震', 己: '坤', 庚: '艮', 辛: '離', 壬: '巽', 癸: '巽'
});

const JI_XING_NOTE = Object.freeze({
    戊: '子刑卯，無理之刑',
    己: '戌刑未，恃勢之刑',
    庚: '申刑寅，無恩之刑',
    辛: '午自刑，高大之刑',
    壬: '辰自刑',
    癸: '寅刑巳'
});

/**
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectLiuYiJiXing(chart) {
    requireChartFields(chart, ['天盤', '符首'], 'detectLiuYiJiXing');
    const results = [];
    for (const [yi, palace] of Object.entries(JI_XING)) {
        const index = chart['天盤'].indexOf(yi);
        if (index === -1 || palaceName(index) !== palace) continue;
        const detail = `天盤${yi}（${YI_TO_JIA[yi]}）臨${palace}宮，${JI_XING_NOTE[yi]}`;
        results.push(finding('六儀擊刑', '凶', palace, detail,
            SOURCES.寶鑑_擊刑, '寬式（任一六儀）'));
        if (yi === chart['符首']) {
            results.push(finding('六儀擊刑', '凶', palace, detail,
                SOURCES.法竅_擊刑, '嚴式（值符之儀）'));
        }
    }
    return results;
}

/**
 * 三奇入墓：三奇臨於其墓宮
 *
 * 乙屬木、木墓於未，未在坤二；丙丁屬火、火墓於戌，戌在乾六。
 * 乙與丙兩奇各書一致，丁奇則有異說，兩種讀法皆產出：
 *
 * - 丁墓艮八：《統宗》〈奇門四十格〉「三奇入墓：乙奇坤宮、丙奇乾宮、丁奇艮宮」、
 *   《旨歸》〈三奇入墓〉「乙奇臨坤，丙奇臨乾，丁奇臨艮為三奇入墓」
 * - 丁墓乾六：《寶鑑》〈釋奇墓〉「乙奇臨二宮，丙奇、丁奇臨六宮也…
 *   乙木墓於未，丙丁火墓於戌」——以五行推之，丙丁同屬火故同墓
 *
 * 前者為兩書所載，後者有五行之理，故不代為擇一。
 */
const RU_MU = Object.freeze([
    { 奇: '乙', 宮: '坤', 說: '乙屬木，木墓於未，未在坤二', 出處: ['統宗_四十格', '旨歸_入墓', '寶鑑_奇墓'] },
    { 奇: '丙', 宮: '乾', 說: '丙屬火，火墓於戌，戌在乾六', 出處: ['統宗_四十格', '旨歸_入墓', '寶鑑_奇墓'] },
    { 奇: '丁', 宮: '艮', 說: '丁奇墓於艮八', 出處: ['統宗_四十格', '旨歸_入墓'], 讀法: '丁墓艮八（統宗、旨歸）' },
    { 奇: '丁', 宮: '乾', 說: '丁屬火，與丙同墓於戌', 出處: ['寶鑑_奇墓'], 讀法: '丁墓乾六（寶鑑，丙丁同屬火）' }
]);

/**
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectSanQiRuMu(chart) {
    requireChartFields(chart, ['天盤'], 'detectSanQiRuMu');
    const results = [];
    for (const rule of RU_MU) {
        const index = chart['天盤'].indexOf(rule.奇);
        if (index === -1 || palaceName(index) !== rule.宮) continue;
        const item = {
            類: '格局',
            格: '三奇入墓',
            吉凶: '凶',
            宮: rule.宮,
            細節: `天盤${rule.奇}奇臨${rule.宮}宮，${rule.說}`,
            出處: rule.出處.map(key => SOURCES[key])
        };
        if (rule.讀法) item.讀法 = rule.讀法;
        results.push(item);
    }
    return results;
}

/**
 * 天遁、地遁、人遁
 *
 * 三部文獻的條件一字不差：
 *   《景祐符應經》〈釋天遁甲〉「生門與六丙月奇合臨於六丁之上」
 *   《奇門法竅》「天遁－生門、丙奇合地盤六丁。地遁－開門、乙奇合地盤六己。
 *                人遁－休門、丁奇合太陰。」
 *   煙波釣叟歌「生門六丙合六丁，此為天遁自分明；開門六己合六乙，地遁如斯而已矣；
 *              休門六丁共太陰，欲求人遁無過此。」
 *
 * 注意天遁與地遁都要求「天盤之奇壓在特定地盤干之上」，不是只看門與奇同宮；
 * 《統宗》〈奇門四十格〉的記法較簡（「生門與丙奇臨」），條件較寬，此處從三書之詳者。
 */
const SAN_DUN = Object.freeze([
    { 名: '天遁', 門: '生門', 奇: '丙', 地盤: '丁', 神: null, 說: '得月精所蔽' },
    { 名: '地遁', 門: '開門', 奇: '乙', 地盤: '己', 神: null, 說: '得日精所蔽' },
    { 名: '人遁', 門: '休門', 奇: '丁', 地盤: null, 神: '太陰', 說: '得星精所蔽' }
]);

/**
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectSanDun(chart) {
    requireChartFields(chart, ['天盤', '地盤', '天門', '八神'], 'detectSanDun');
    const results = [];
    for (const rule of SAN_DUN) {
        for (let index = 0; index < 9; index++) {
            if (chart['天門'][index] !== rule.門) continue;
            if (chart['天盤'][index] !== rule.奇) continue;
            if (rule.地盤 && chart['地盤'][index] !== rule.地盤) continue;
            if (rule.神 && chart['八神'][index] !== rule.神) continue;
            const condition = rule.地盤
                ? `${rule.門}與${rule.奇}奇同臨${palaceName(index)}宮，下加地盤${rule.地盤}`
                : `${rule.門}、${rule.奇}奇與${rule.神}同臨${palaceName(index)}宮`;
            results.push(finding(rule.名, '吉', palaceName(index),
                `${condition}，${rule.說}`, SOURCES.法竅_三遁));
        }
    }
    return results;
}

/**
 * 截路空亡：該日的特定時辰
 *
 * 《奇門遁甲元靈經》：「截路空亡，此時忌出行——甲己申酉空，乙庚午未中，
 * 丙辛辰巳上，丁壬寅卯同，惟有戊癸日，子丑永無蹤。」
 *
 * 表中所列諸時，其時干皆為壬或癸（水阻其路，故曰截路），此性質已寫成測試。
 * 反之則不然：戊癸日的戌亥時因十干配十二支繞回，時干亦為壬癸，卻不在表中，
 * 故以典籍所列之表為準，不以「時干壬癸」代之。
 *
 * 另按《秘笈大全》〈起截路空亡訣〉作「甲己在坤，乙庚離，丙辛巽位卻相宜，
 * 丁壬震宮名截路，戊癸乾坎空亡時」，係以宮位立說，與相鄰的〈起喜神訣〉同格式，
 * 疑指方位而非時辰，所指未明，故不併入。
 */
const JIE_LU = Object.freeze({
    甲: ['申', '酉'], 己: ['申', '酉'],
    乙: ['午', '未'], 庚: ['午', '未'],
    丙: ['辰', '巳'], 辛: ['辰', '巳'],
    丁: ['寅', '卯'], 壬: ['寅', '卯'],
    戊: ['子', '丑'], 癸: ['子', '丑']
});

/**
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectJieLuKongWang(chart) {
    requireChartFields(chart, ['日柱', '時干', '時柱'], 'detectJieLuKongWang');
    const dayGan = chart['日柱'][0];
    const hourZhi = chart['時柱'][1];
    const blocked = JIE_LU[dayGan];
    if (!blocked || !blocked.includes(hourZhi)) return [];
    return [finding('截路空亡', '凶', null,
        `${dayGan}日逢${hourZhi}時（時干${chart['時干']}，水阻其路），忌出行`,
        SOURCES.元靈經_截路)];
}

/**
 * 十干克應：天盤干加於地盤干之上，共 9 × 9 = 81 格
 *
 * 甲不上盤（遁於六儀），故實為九干相加而非十干，81 格而非 100 格。
 *
 * 本表以《奇門旨歸》卷五〈十干克應〉與《奇門遁甲秘笈大全》〈十干剋應訣〉為底，
 * 兩者逐格幾乎一字不差（僅返首／反首、大吉／大利這類異體之別）；
 * 《奇門法竅》卷三另有一套命名，收於 KE_YING_ALT。
 *
 * 吉凶取自各格斷語。斷語為條件式者（如「門吉事吉，門凶事凶」）記為中性，
 * 不代為加權——加權屬斷事層，非判定層之事。
 *
 * 校驗：《奇門遁甲統宗》〈奇門四十格〉未參與建表，其中十則屬十干克應者
 * （龍回首、鳥跌穴、龍逃走、虎猖狂、雀投江、大格、刑格、小格、太白入熒、伏宮）
 * 與本表逐格相符，見 test.js。
 */
/**
 * 十干克應 81 格：[格名, 吉凶, 斷語]
 *
 * **斷語逐字抄自《奇門旨歸》卷五〈十干克應〉**，以《秘笈大全》〈十干剋應訣〉為校
 * （二書幾乎逐字相同）。斷語才是典籍真正說的話——格名只是標籤，
 * 使用者拿到「巽宮：青龍華蓋，中性」之後無從得知典籍到底斷了什麼。
 *
 * **吉凶不是典籍所標，是本專案據斷語所判。** 四部書皆無吉/凶標籤，
 * 故此欄是推導而非抄錄。可外部驗證者僅有《寶鑒御定》明列的四格
 * （「螣蛇夭矯、朱雀投江、青龍逃走、白虎猖狂已上四格俱主凶」），
 * test.js 以之為錨；其餘各格請以斷語為準。
 *
 * 語料原貌照錄不改：乙己作「土掩暗眛」（眛 U+771B，疑當作昧）、
 * 丁己作「奸私□冤」（旨歸原文缺字，秘笈作「讎」）、丁丙作「樂里生悲」。
 *
 * **六格的格名曾誤採《法竅》之名而掛《旨歸》《秘笈》的出處**，已更正：
 * 壬乙（奇神游海→小蛇）、壬丙（水蛇入火宮→水蛇入火）、壬丁（玉女合獄神→干合蛇刑）、
 * 癸乙（蓬星華蓋→華蓋蓬星）、癸丁（騰蛇妖蹻→螣蛇夭矯），法竅之名移入 KE_YING_ALT。
 * 庚壬 則是《旨歸》《秘笈》於此格**根本未立名**（原文「加壬遠行迷失道路」直接接斷語，
 * 同段他二十六條俱有名而此條獨缺），其「小格」之名另有出處，見 KE_YING_NAME_SOURCE。
 */
const SHI_GAN_KE_YING = Object.freeze({
    乙乙: ['日奇伏吟', '凶', '不宜謁貴求名，只可安分守身。'],
    乙丙: ['奇儀順生', '中性', '吉星遷官進職，凶星夫妻別離。'],
    乙丁: ['奇儀相佐', '吉', '文書事吉，百事可為。'],
    乙戊: ['利陰害陽', '凶', '門逢凶迫、財破人傷。'],
    乙己: ['日奇入霧', '凶', '土掩暗眛，門凶宅必凶，得三奇開門為地遁。'],
    乙庚: ['日奇被刑', '凶', '爭訟財產夫妻懷私。'],
    乙辛: ['青龍逃走', '凶', '奴僕拐帶六畜皆傷。'],
    乙壬: ['日奇入地', '凶', '尊卑悖亂，官訟是非。'],
    乙癸: ['華蓋青龍', '吉', '宜遁跡修道，隱匿藏形，躲災避難為吉。'],

    丙乙: ['日月並行', '吉', '公私謀為皆吉。'],
    丙丙: ['月奇孛師', '凶', '文書逼迫，破耗遺失。'],
    丙丁: ['星奇朱雀', '吉', '貴人文書吉利，常人平靜，得三吉門為天遁。'],
    丙戊: ['飛鳥跌穴', '吉', '謀為百事洞徹。'],
    丙己: ['火孛入刑', '凶', '囚人刑杖，文書不行，吉門得吉，凶門轉凶。'],
    丙庚: ['熒入太白', '凶', '門戶破壞，盜賊耗失。'],
    丙辛: ['謀事成就', '吉', '病人不凶。'],
    丙壬: ['火入天羅', '凶', '為客不利。是非頗多。'],
    丙癸: ['華蓋孛師', '凶', '陰人害事，災禍頻生。'],

    丁乙: ['人遁', '吉', '貴人加官進爵，常人婚姻財喜。'],
    丁丙: ['星隨月轉', '吉', '貴人越級高升，常人樂里生悲。'],
    丁丁: ['奇入太陰', '吉', '文書即至，喜事遂心。'],
    丁戊: ['青龍轉光', '吉', '官人升遷，常人咸昌。'],
    丁己: ['火入勾陳', '凶', '奸私□冤，事因女人。'],
    丁庚: ['年月日時格', '凶', '文書阻隔，行人必歸。'],
    丁辛: ['朱雀入獄', '凶', '罪人釋囚，官人失位。'],
    丁壬: ['五神互合', '吉', '貴人恩詔，訟獄公平。'],
    丁癸: ['朱雀投江', '凶', '文書口舌俱消，音信沉溺。'],

    戊乙: ['青龍合靈', '中性', '門吉事吉，門凶事凶。'],
    戊丙: ['青龍返首', '吉', '動作大利，若逢迫墓擊刑，吉事成凶。'],
    戊丁: ['青龍耀明', '吉', '謁貴求名吉利，若值墓迫招是招非。'],
    戊戊: ['伏吟', '中性', '凡事閉塞。靜守為吉。'],
    戊己: ['貴人入獄', '凶', '公私皆不利。'],
    戊庚: ['值符飛宮', '凶', '吉事不吉，凶事更凶。'],
    戊辛: ['青龍折足', '中性', '吉門生助尚可謀為，若逢凶門，主拐帶失財有足疾。'],
    戊壬: ['龍入天牢', '凶', '凡陰陽皆不利。'],
    戊癸: ['青龍華蓋', '吉', '吉格，門吉招福，門凶多乖。'],

    己乙: ['墓神不明', '中性', '地戶蓬星，宜遁跡隱形為利。'],
    己丙: ['火孛地戶', '凶', '陽人冤冤相害，陰人必致淫污。'],
    己丁: ['朱雀入墓', '中性', '文狀詞訟，先曲後直。'],
    己戊: ['犬遇青龍', '中性', '門吉謀為遂意，上人見喜，門凶枉勞心機。'],
    己己: ['地戶逢鬼', '凶', '病者死，百事不遂。'],
    己庚: ['刑格', '凶', '求名詞訟先動者不利，陰星有謀害之情。'],
    己辛: ['游魂入墓', '凶', '大人鬼魅，小人家先為崇凶。'],
    己壬: ['地網高張', '凶', '狡童佚女，奸情殺傷。'],
    己癸: ['地刑玄武', '凶', '男女疾病垂危，詞訟有囚獄之凶。'],

    庚乙: ['太白蓬星', '中性', '退吉進凶。'],
    庚丙: ['太白入熒', '凶', '占賊必來，為客利進，為主破財。'],
    庚丁: ['亭亭之格', '凶', '因私暱起官司，門吉有救。'],
    庚戊: ['太白天乙伏宮', '凶', '百事不可謀為凶。'],
    庚己: ['刑格', '凶', '官司被重刑。'],
    庚庚: ['太白同宮', '凶', '官災橫禍，兄弟雷攻。'],
    庚辛: ['白虎乾格', '凶', '遠行車折馬死。'],
    庚壬: ['小格', '凶', '遠行迷失道路，男女音信嗟呀。'],
    庚癸: ['大格', '凶', '行人至，官司止，生產母子俱傷大凶。'],

    辛乙: ['白虎猖狂', '凶', '人亡家敗，遠行多殃，尊長不喜，車船俱傷。'],
    辛丙: ['乾合孛師', '凶', '熒出現，占雨無，占晴旱，占事必因財致訟。'],
    辛丁: ['獄神得奇', '吉', '經商獲倍利，囚人逢赦宥。'],
    辛戊: ['困龍被傷', '凶', '官司破財，屈抑越分，妄動禍殃。'],
    辛己: ['入獄自刑', '凶', '奴僕背主，訟訴難伸。'],
    辛庚: ['白虎出力', '凶', '刀刃相接，主客相殘，宜退讓，強進血濺衣衫。'],
    辛辛: ['伏吟天庭', '凶', '公廢私就，訟獄自罹罪名。'],
    辛壬: ['凶蛇入獄', '凶', '兩男爭女，訟事不息，先動失理。'],
    辛癸: ['天牢華蓋', '凶', '日月失明，誤入天網，動止乖張。'],

    壬乙: ['小蛇', '凶', '女八柔順男子嗟呀，占孕生子祿馬光華。'],
    壬丙: ['水蛇入火', '凶', '官災刑禁，絡繹不絕。'],
    壬丁: ['干合蛇刑', '凶', '文書牽連，貴人匆匆，女吉男凶。'],
    壬戊: ['蛇化龍', '吉', '男人發達，女產嬰童。'],
    壬己: ['凶蛇入獄', '凶', '大禍將至，順守斯吉，詞訟主理曲。'],
    壬庚: ['太白擒蛇', '吉', '刑獄公平，剖邪正。'],
    壬辛: ['螣蛇相纏', '凶', '縱得吉門亦不能安，若有謀望被人欺瞞。'],
    壬壬: ['蛇入地羅', '凶', '外人纏繞，內事索索，星門俱吉，庶免蹉跎。'],
    壬癸: ['幼女奸淫', '中性', '家有醜聲，門星俱吉，轉為福亨吉。'],

    癸乙: ['華蓋蓬星', '吉', '貴人祿位加增，常人平安。'],
    癸丙: ['華蓋孛師', '吉', '貴賤逢之，上人見喜。'],
    癸丁: ['螣蛇夭矯', '凶', '文書官司，火焚莫逃。'],
    癸戊: ['天乙會合', '吉', '吉格財喜，婚姻吉人贊助成合。門凶迫制，反招官非。'],
    癸己: ['華蓋地戶', '凶', '男女占之音信皆阻，躲避災難為吉。'],
    癸庚: ['太白入網', '凶', '以暴爭訟立平。'],
    癸辛: ['網蓋天牢', '凶', '占訟、占病死罪莫逃。'],
    癸壬: ['複見螣蛇', '凶', '嫁娶重婚，不保年華。'],
    癸癸: ['天網四張', '凶', '行人失伴，病訟皆傷。'],
});

/**
 * 《奇門法竅》卷三另有一套格名，與旨歸秘笈系統不同者收錄於此
 *
 * 例如乙加戊，旨歸秘笈作「利陰害陽」，法竅作「奇入天門」；
 * 戊加己，旨歸秘笈作「貴人入獄」，法竅作「龍神相親」，吉凶取向甚至相反。
 * 判定時以旨歸秘笈之名為主，法竅之名列於 異名。
 */
/**
 * 格名不出自《旨歸》卷五／《秘笈》〈十干剋應訣〉者，其名的實際出處
 *
 * 目前僅庚壬一格：該二篇於此格未立名，只給斷語。「小格」之名見於
 * 《統宗》〈奇門四十格〉「小格　庚臨壬」、《旨歸》卷四〈凶格釋義〉與《法竅》。
 * 不註明而逕掛〈十干克應〉，等於憑空給那兩部書安上一個名。
 */
const KE_YING_NAME_SOURCE = Object.freeze({
    庚壬: Object.freeze({
        書: '奇門遁甲統宗',
        篇: '奇門四十格',
        文: '小格　庚臨壬'
    })
});

const KE_YING_ALT = Object.freeze({
    乙丙: [{ 名: '奇儀順遂', 書: '奇門遁甲秘笈大全' }, { 名: '奇順吉格', 書: '奇門法竅' }],
    壬乙: [{ 名: '奇神游海', 書: '奇門法竅' }],
    壬丙: [{ 名: '水蛇入火宮', 書: '奇門法竅' }, { 名: '天獄伏奇格', 書: '奇門法竅' }],
    壬丁: [{ 名: '玉女合獄神', 書: '奇門法竅' }, { 名: '乾合蛇刑', 書: '奇門寶鑒御定' }],
    癸乙: [{ 名: '蓬星華蓋', 書: '奇門法竅' }, { 名: '日沉九地', 書: '奇門法竅' }],
    癸丁: [{ 名: '螣蛇妖矯', 書: '奇門遁甲秘笈大全' }, { 名: '蛇妖矯', 書: '奇門遁甲統宗' },
           { 名: '騰蛇妖蹻', 書: '奇門法竅' }],
    庚壬: [{ 名: '上格', 書: '奇門法竅' }],
    辛乙: [{ 名: '白虎倡狂', 書: '奇門旨歸' }],
    己癸: [{ 名: '地刑元武', 書: '奇門旨歸' }],
    乙戊: [{ 名: '奇入天門', 書: '奇門法竅' }],
    乙庚: [{ 名: '太白奇合', 書: '奇門法竅' }],
    乙癸: [{ 名: '華蓋逢星', 書: '奇門遁甲秘笈大全' }, { 名: '奇臨華蓋', 書: '奇門法竅' }],
    丙丙: [{ 名: '悖格', 書: '奇門法竅' }],
    丙丁: [{ 名: '月奇朱雀', 書: '奇門遁甲秘笈大全' }, { 名: '星奇逢朱雀', 書: '奇門法竅' }],
    丙己: [{ 名: '太孛入刑', 書: '奇門遁甲秘笈大全' }, { 名: '丙悖入刑', 書: '奇門法竅' }],
    丙庚: [{ 名: '火入金鄉', 書: '奇門遁甲統宗' }],
    丙辛: [{ 名: '謀事就成', 書: '奇門遁甲秘笈大全' }, { 名: '奇神相合', 書: '奇門法竅' }],
    丙壬: [{ 名: '奇入天羅', 書: '奇門法竅' }],
    丙癸: [{ 名: '奇逢華蓋', 書: '奇門法竅' }],
    丁乙: [{ 名: '人遁格', 書: '奇門法竅' }],
    丁丁: [{ 名: '奇合重陰', 書: '奇門法竅' }],
    丁庚: [{ 名: '悖格', 書: '奇門法竅' }],
    丁壬: [{ 名: '奇儀相合', 書: '奇門法竅' }],
    戊己: [{ 名: '龍神相親', 書: '奇門法竅' }],
    戊庚: [{ 名: '直符飛宮', 書: '奇門法竅' }],
    戊壬: [{ 名: '青龍入天牢', 書: '奇門遁甲秘笈大全' }],
    戊癸: [{ 名: '青龍入華蓋', 書: '奇門法竅' }],
    己乙: [{ 名: '奇入地戶', 書: '奇門法竅' }],
    己丙: [{ 名: '火孛入地戶', 書: '奇門法竅' }],
    己丁: [{ 名: '星奇入墓', 書: '奇門法竅' }],
    己己: [{ 名: '玉堂臨地戶', 書: '奇門法竅' }],
    己庚: [{ 名: '玉堂逢太白', 書: '奇門法竅' }],
    己癸: [{ 名: '玉堂逢天網', 書: '奇門法竅' }],
    庚乙: [{ 名: '太白和合', 書: '奇門法竅' }],
    庚己: [{ 名: '刑格官司', 書: '奇門法竅' }],
    庚辛: [{ 名: '向虎乾格', 書: '奇門法竅' }],
    辛丙: [{ 名: '干合孛師', 書: '奇門遁甲秘笈大全' }, { 名: '合孛', 書: '奇門法竅' }],
    辛庚: [{ 名: '天獄自刑', 書: '奇門法竅' }],
    辛壬: [{ 名: '蛇入獄', 書: '奇門法竅' }],
    辛癸: [{ 名: '伏吟天庭', 書: '奇門法竅' }],
    壬己: [{ 名: '天獄入地戶', 書: '奇門法竅' }],
    壬庚: [{ 名: '太白犯格', 書: '奇門法竅' }],
    壬辛: [{ 名: '白虎犯格', 書: '奇門法竅' }],
    壬壬: [{ 名: '天獄自刑', 書: '奇門法竅' }],
    壬癸: [{ 名: '天獄逢天網', 書: '奇門法竅' }],
    癸己: [{ 名: '明堂入天藏', 書: '奇門法竅' }],
    癸庚: [{ 名: '大格', 書: '奇門法竅' }],
    癸壬: [{ 名: '天網逢天獄', 書: '奇門法竅' }],
    癸癸: [{ 名: '天網高張', 書: '奇門法竅' }]
});

/**
 * 判斷十干克應
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 九宮各有一格，中宮天地盤同干故亦計入
 */
export function detectShiGanKeYing(chart) {
    requireChartFields(chart, ['天盤', '地盤'], 'detectShiGanKeYing');
    const results = [];
    for (let index = 0; index < 9; index++) {
        const top = chart['天盤'][index];
        const bottom = chart['地盤'][index];
        if (!top || !bottom) continue;
        const entry = SHI_GAN_KE_YING[top + bottom];
        if (!entry) continue;
        const [name, jiXiong, judgement] = entry;
        // 出處帶該格自己的斷語，而非全表共用的節首摘要——
        // 「每則判斷帶出處原文」這條原則在數量最大的這一類上原本並未成立
        const sources = [
            Object.freeze({ 書: '奇門旨歸', 篇: '卷五 十干克應', 文: judgement }),
            SOURCES.秘笈_克應
        ];
        const nameSource = KE_YING_NAME_SOURCE[top + bottom];
        if (nameSource) sources.push(nameSource);
        const item = {
            類: '十干克應',
            格: name,
            吉凶: jiXiong,
            斷語: judgement,
            宮: palaceName(index),
            細節: `天盤${top}加地盤${bottom}於${palaceName(index)}宮`,
            出處: sources
        };
        const variants = KE_YING_ALT[top + bottom];
        if (variants) item.異名 = variants;
        results.push(item);
    }
    return results;
}

// ============================================================================
// 旺相休囚
// ============================================================================
/**
 * 旺相休囚不是「格」，是強弱。
 *
 * 《奇門法竅》：「吉門有氣益吉，無氣減吉；凶門有氣益凶，無氣減凶。」
 * 也就是說它不決定吉凶之有無，而決定吉凶之輕重，故不列為 detectPatterns 的判定，
 * 另以 assessVigor() 提供，由呼叫端與格局判定合看。
 *
 * 九星旺相依月令五行，語料中互不相容者至少七家，本專案收其中有完整算例的四家，
 * 詳見 VIGOR_READINGS。
 */

/** 星（或門）之五行對月令五行的關係 */
function elementRelation(own, month) {
    if (own === month) return '同類';
    if (ELEMENT_GENERATES[own] === month) return '我生';
    if (ELEMENT_GENERATES[month] === own) return '生我';
    if (ELEMENT_OVERCOMES[own] === month) return '我克';
    if (ELEMENT_OVERCOMES[month] === own) return '克我';
    return null;
}

/**
 * 九星旺相：語料中互不相容者至少七家，本專案收其中有完整算例的四家
 *
 * 五種關係（同類、我生、生我、我克、克我）各家所配的名目不同，且**旺與相
 * 在各家之間互換**，故絕不可只取一家。四家皆**自帶天蓬水星的五格算例**，
 * 可用其算例反驗其對照表（見 test.js），這是收錄的門檻。
 *
 * 鍵名不用書名。《遁甲演義》一書之內即並存三說、《統宗》並存二說、
 * 《秘笈大全》並存二說——「某書主某說」在這幾部書上都不成立，只能逐篇認定。
 *
 * **未收的三家**（記於 VIGOR_READINGS_NOT_ADOPTED，理由見該處）：
 * 《演義》引《三元經》、《秘笈大全》卷二十三〈論十方星將生剋〉皆無算例；
 * 《演義》〈五行旺相休囚〉為方位式而非月令式，且無「廢」格。
 *
 * **《統宗》卷三〈旺相休囚〉那條四季表不列為任何一家的書證。** 原文
 * 「春木相火旺水廢金囚土休」有兩讀——「春」是月令抑或木星？兩讀所得五格
 * 有四格相反，而原文全條無一「星」字（該條夾在〈天馬方〉與〈天目〉之間）。
 * 舊註解以「無算例、疑有錯簡」為由排除它，其中「無算例」不確（該表本身
 * 即二十格），「孤本」亦不確（《旨歸》卷三十六逐字相同）；真正的理由是
 * 它需要一個原文未言明的讀法，且未指明施用於九星。
 */
export const VIGOR_READINGS = Object.freeze([
    Object.freeze({
        讀法: '煙波釣叟歌通行本',
        對照: Object.freeze({ 同類: '相', 我生: '旺', 生我: '廢', 我克: '休', 克我: '囚' }),
        出處: Object.freeze({
            書: '奇門寶鑒御定',
            篇: '釋氣應',
            文: '九星蓬水、英火、衝輔木、任芮禽土、柱心金，皆以我生之月為旺，' +
                '我同之月為相，我克之月為休，克我之月為囚，生我之月為廢。' +
                '如水星旺於寅卯月、相於亥子月、休於四五月、囚於辰戌丑未月、' +
                '廢於申酉月是也。'
        }),
        別本: Object.freeze([
            '遁甲演義〈煙波釣叟賦〉',
            '奇門遁甲秘笈大全〈卷一．煙波釣叟歌〉',
            '奇門旨歸〈卷二．煙波釣叟歌〉',
            '奇門寶鑒御定〈注釋煙波釣叟歌〉'
        ])
    }),
    Object.freeze({
        讀法: '法竅注本（旺相互易）',
        對照: Object.freeze({ 同類: '旺', 我生: '相', 生我: '廢', 我克: '休', 克我: '囚' }),
        出處: Object.freeze({
            書: '奇門法竅',
            篇: '卷一．煙波釣叟賦注釋',
            文: '與我同行即為旺，我生之月誠為相，廢於父母休於財，囚於鬼兮真不妄。' +
                '……經云：「我生之月為相，同類之月為旺，生我之月為廢，' +
                '我克之月為休，克我之月為囚。」'
        }),
        別本: Object.freeze(['遁甲演義〈九星所屬〉五星月令表'])
    }),
    Object.freeze({
        讀法: '統宗卷一〈九星旺相〉',
        對照: Object.freeze({ 同類: '相', 我生: '旺', 生我: '死', 我克: '廢', 克我: '囚' }),
        出處: Object.freeze({
            書: '奇門遁甲統宗',
            篇: '卷之一．九星旺相',
            文: '九星旺于子月，相于本月，死于父母月，囚于鬼月，废于妻月。' +
                '如天蓬水星，正二月旺，十月十一月相，七月八月死，三六九十二月囚，四五月废。'
        }),
        別本: Object.freeze([])
    }),
    Object.freeze({
        讀法: '三元經（圖書集成本）',
        對照: Object.freeze({ 同類: '相', 我生: '旺', 生我: '死', 我克: '休', 克我: '囚' }),
        出處: Object.freeze({
            書: '欽定古今圖書集成博物彙編藝術典',
            篇: '釋九星休旺（引《三元經》）',
            文: '九星各旺於我生月，相於同類月，死於生我月，囚於官鬼月，休於財月。' +
                '……假如天蓬星是水星，旺於寅卯月，相於亥子月，死於申酉月，' +
                '囚於辰戌丑未月，休於巳午月是也。'
        }),
        別本: Object.freeze([])
    })
]);

/**
 * 語料中另有三家，因無法驗證而不列入輸出
 *
 * 收錄的門檻是「自帶算例，可用其算例反驗其對照表」。下列三家過不了這道門檻，
 * 但確實存在於語料中，故記於此而不靜默丟棄——日後若找到算例可再議。
 */
export const VIGOR_READINGS_NOT_ADOPTED = Object.freeze([
    Object.freeze({
        讀法: '三元經（演義本）',
        對照: Object.freeze({ 同類: '旺', 我生: '相', 生我: '休', 我克: '死', 克我: '囚' }),
        出處: Object.freeze({ 書: '遁甲演義', 篇: '九星所屬（引《三元經》）' }),
        未收之由: '全無算例，五格中「生我＝休」「我克＝死」二格無任何月份可驗。' +
                  '且與同節的五星月令表（法竅注本）在該二格上互相牴牾。'
    }),
    Object.freeze({
        讀法: '秘笈卷二十三〈論十方星將生剋〉',
        對照: Object.freeze({ 同類: '旺', 我生: '相', 生我: '死', 我克: '休', 克我: '囚' }),
        出處: Object.freeze({ 書: '奇門遁甲秘笈大全', 篇: '卷二十三．論十方星將生剋' }),
        未收之由: '全無算例。且「休是財官囚鬼將」為七言壓縮句，原文未標讀；' +
                  '作「休↔財、囚↔官鬼」是唯一不把克我派兩次的讀法，但那是斷句而非明文。'
    }),
    Object.freeze({
        讀法: '演義〈五行旺相休囚〉方位式',
        對照: null,
        出處: Object.freeze({ 書: '遁甲演義', 篇: '五行旺相休囚' }),
        未收之由: '不以月令而以方位立說（木旺東、相北、休南、囚西…），無「廢」格，' +
                  '土居四維不入四方，無法化約為單一的五行關係對照；' +
                  '原文亦未言明是否用於九星旺相。'
    })
]);

/**
 * 八門旺相：依八節輪轉
 *
 * 《奇門遁甲統宗》〈八節應八門旺相〉：「冬至：休門旺，生門絕，傷門胎，杜門沐，
 * 景門死，死門囚，驚門休，開門廢。立春生門旺，春分傷門旺，立夏杜門旺，
 * 夏至景門旺，立秋死門旺，秋分驚門旺，立冬開門旺，冬至周而復始。」
 *
 * 該節所屬之卦，其本位門為旺；其餘依八門固定次序（休生傷杜景死驚開）順推。
 * 旺門既隨八節輪轉，此表只需記狀態之序，旺門由 JIEQI_TO_GUA 與八門本位推得。
 */
const DOOR_VIGOR_CYCLE = Object.freeze(['旺', '絕', '胎', '沐', '死', '囚', '休', '廢']);

/**
 * 評估盤局中九星與八門的強弱
 *
 * @param {Object} chart - chartToObject() 的結果
 * @returns {Object} 月令、九星旺相（四家並列）、八門旺相（需有節氣，否則為 null）
 *
 * @example
 * const chart = chartToObject(generateChartByDatetime('2024011510'));
 * const vigor = assessVigor(chart);
 * vigor.九星[0];  // { 宮: '巽', 星: '天任', 五行: '土', 關係: '我克', 法竅: '休', 統宗: '廢' }
 */
export function assessVigor(chart) {
    requireChartFields(chart, ['九星'], 'assessVigor');
    const monthZhi = chart['月柱'] ? chart['月柱'][1] : null;
    const monthElement = monthZhi ? ZHI_ELEMENTS[monthZhi] : null;

    const stars = chart['九星'].map((star, index) => {
        const own = STAR_ELEMENTS[star];
        const relation = monthElement ? elementRelation(own, monthElement) : null;
        return {
            宮: palaceName(index),
            星: star,
            五行: own,
            關係: relation,
            // 諸家並列而不代為擇一。四家對五種關係所配的名目不同，
            // 且旺與相在各家之間互換，故取任一家為代表都會失真。
            諸家: relation
                ? VIGOR_READINGS.map(reading => ({
                    讀法: reading.讀法,
                    狀態: reading.對照[relation],
                    出處: reading.出處
                }))
                : []
        };
    });

    // 八門旺相需知節氣；手動起盤（generateQimenChart）無此欄位
    const gua = chart['節氣'] ? JIEQI_TO_GUA[chart['節氣']] : null;
    let doors = null;
    if (gua) {
        const prosperous = EIGHT_DOORS_ORIGINAL[LUOSHU_BAGUA.indexOf(gua)];
        const start = EIGHT_DOORS_SEQUENCE.indexOf(prosperous);
        const order = rotateArrayFromIndex(EIGHT_DOORS_SEQUENCE, start);
        const stateOf = {};
        order.forEach((door, i) => { stateOf[door] = DOOR_VIGOR_CYCLE[i]; });
        doors = chart['天門']
            .map((door, index) => (door ? { 宮: palaceName(index), 門: door, 狀態: stateOf[door] } : null))
            .filter(Boolean);
    }

    return {
        月令: monthElement ? { 支: monthZhi, 五行: monthElement } : null,
        八節: gua ? { 卦: gua, 旺門: EIGHT_DOORS_ORIGINAL[LUOSHU_BAGUA.indexOf(gua)] } : null,
        九星: stars,
        八門: doors
    };
}

// ============================================================================
// 總入口
// ============================================================================

/** 目前已實作的判定器 */
const DETECTORS = Object.freeze([
    detectFuYin,
    detectFanYin,
    detectMenPo,
    detectWuBuYu,
    detectSanQiDeShi,
    detectSanQiRuMu,
    detectSanDun,
    detectLiuYiJiXing,
    detectJieLuKongWang,
    detectShiGanKeYing
]);

/**
 * 判斷盤局中出現的格局
 *
 * @param {Object} chart - chartToObject() 的結果
 * @returns {Array<Object>} 判定結果陣列，每則含 格／吉凶／宮／細節／出處，
 *                          有異說者另含 讀法
 *
 * @example
 * const chart = chartToObject(generateChartByDatetime('2024011510'));
 * for (const item of detectPatterns(chart)) {
 *     console.log(item.格, item.宮 || '（全盤）', item.細節);
 * }
 */
/** 完整盤面判定所需的全部欄位——即各判定器所需欄位的聯集 */
const PATTERN_REQUIRED_FIELDS = Object.freeze([
    '天盤', '地盤', '天門', '八神', '值符', '值符落宮', '符首', '日柱', '時干', '時柱'
]);

export function detectPatterns(chart) {
    // 在總入口先擋一次，讓錯誤訊息一次列出所有缺欄位，
    // 而不是取決於哪個判定器先跑到
    requireChartFields(chart, PATTERN_REQUIRED_FIELDS, 'detectPatterns');
    return DETECTORS.flatMap(detect => detect(chart));
}

export default {
    detectPatterns,
    detectFuYin,
    detectFanYin,
    detectMenPo,
    detectWuBuYu,
    detectSanQiDeShi,
    detectSanQiRuMu,
    detectSanDun,
    detectLiuYiJiXing,
    detectJieLuKongWang,
    detectShiGanKeYing,
    assessVigor
};
