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
    旨歸_克應: Object.freeze({
        書: '奇門旨歸',
        篇: '卷五 十干克應',
        文: '戊加乙為青龍合靈，門吉事吉，門凶事凶。加丙為青龍返首，動作大利…（逐格詳列）'
    }),
    秘笈_克應: Object.freeze({
        書: '奇門遁甲秘笈大全',
        篇: '十干剋應訣',
        文: '戊加戊甲值符謂之伏吟，凡事閉塞，靜守為吉。加乙為青龍合靈…（逐格詳列）'
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
const SHI_GAN_KE_YING = Object.freeze({
    乙乙: ['日奇伏吟', '凶'],
    乙丙: ['奇儀順生', '中性'],
    乙丁: ['奇儀相佐', '吉'],
    乙戊: ['利陰害陽', '凶'],
    乙己: ['日奇入霧', '凶'],
    乙庚: ['日奇被刑', '凶'],
    乙辛: ['青龍逃走', '凶'],
    乙壬: ['日奇入地', '凶'],
    乙癸: ['華蓋青龍', '凶'],

    丙乙: ['日月並行', '吉'],
    丙丙: ['月奇孛師', '凶'],
    丙丁: ['星奇朱雀', '吉'],
    丙戊: ['飛鳥跌穴', '吉'],
    丙己: ['火孛入刑', '中性'],
    丙庚: ['熒入太白', '凶'],
    丙辛: ['謀事成就', '中性'],
    丙壬: ['火入天羅', '凶'],
    丙癸: ['華蓋孛師', '凶'],

    丁乙: ['人遁', '吉'],
    丁丙: ['星隨月轉', '吉'],
    丁丁: ['奇入太陰', '吉'],
    丁戊: ['青龍轉光', '吉'],
    丁己: ['火入勾陳', '凶'],
    丁庚: ['年月日時格', '凶'],
    丁辛: ['朱雀入獄', '凶'],
    丁壬: ['五神互合', '凶'],
    丁癸: ['朱雀投江', '凶'],

    戊乙: ['青龍合靈', '中性'],
    戊丙: ['青龍返首', '中性'],
    戊丁: ['青龍耀明', '吉'],
    戊戊: ['伏吟', '中性'],
    戊己: ['貴人入獄', '凶'],
    戊庚: ['值符飛宮', '凶'],
    戊辛: ['青龍折足', '中性'],
    戊壬: ['龍入天牢', '凶'],
    戊癸: ['青龍華蓋', '中性'],

    己乙: ['墓神不明', '中性'],
    己丙: ['火孛地戶', '凶'],
    己丁: ['朱雀入墓', '凶'],
    己戊: ['犬遇青龍', '中性'],
    己己: ['地戶逢鬼', '凶'],
    己庚: ['刑格', '凶'],
    己辛: ['游魂入墓', '凶'],
    己壬: ['地網高張', '凶'],
    己癸: ['地刑玄武', '凶'],

    庚乙: ['太白蓬星', '凶'],
    庚丙: ['太白入熒', '凶'],
    庚丁: ['亭亭之格', '凶'],
    庚戊: ['太白天乙伏宮', '凶'],
    庚己: ['刑格', '凶'],
    庚庚: ['太白同宮', '凶'],
    庚辛: ['白虎乾格', '凶'],
    庚壬: ['小格', '凶'],
    庚癸: ['大格', '凶'],

    辛乙: ['白虎猖狂', '中性'],
    辛丙: ['乾合孛師', '凶'],
    辛丁: ['獄神得奇', '吉'],
    辛戊: ['困龍被傷', '凶'],
    辛己: ['入獄自刑', '凶'],
    辛庚: ['白虎出力', '凶'],
    辛辛: ['伏吟天庭', '凶'],
    辛壬: ['凶蛇入獄', '凶'],
    辛癸: ['天牢華蓋', '凶'],

    壬乙: ['奇神游海', '凶'],
    壬丙: ['水蛇入火宮', '凶'],
    壬丁: ['玉女合獄神', '凶'],
    壬戊: ['蛇化龍', '吉'],
    壬己: ['凶蛇入獄', '凶'],
    壬庚: ['太白擒蛇', '凶'],
    壬辛: ['螣蛇相纏', '凶'],
    壬壬: ['蛇入地羅', '凶'],
    壬癸: ['幼女奸淫', '中性'],

    癸乙: ['蓬星華蓋', '吉'],
    癸丙: ['華蓋孛師', '中性'],
    癸丁: ['騰蛇妖蹻', '凶'],
    癸戊: ['天乙會合', '中性'],
    癸己: ['華蓋地戶', '凶'],
    癸庚: ['太白入網', '凶'],
    癸辛: ['網蓋天牢', '凶'],
    癸壬: ['複見螣蛇', '凶'],
    癸癸: ['天網四張', '凶']
});

/**
 * 《奇門法竅》卷三另有一套格名，與旨歸秘笈系統不同者收錄於此
 *
 * 例如乙加戊，旨歸秘笈作「利陰害陽」，法竅作「奇入天門」；
 * 戊加己，旨歸秘笈作「貴人入獄」，法竅作「龍神相親」，吉凶取向甚至相反。
 * 判定時以旨歸秘笈之名為主，法竅之名列於 異名。
 */
const KE_YING_ALT = Object.freeze({
    乙丙: [{ 名: '奇儀順遂', 書: '奇門遁甲秘笈大全' }, { 名: '奇順吉格', 書: '奇門法竅' }],
    乙戊: [{ 名: '奇入天門', 書: '奇門法竅' }],
    乙庚: [{ 名: '太白奇合', 書: '奇門法竅' }],
    乙癸: [{ 名: '華蓋逢星', 書: '奇門遁甲秘笈大全' }, { 名: '奇臨華蓋', 書: '奇門法竅' }],
    丙丙: [{ 名: '悖格', 書: '奇門法竅' }],
    丙丁: [{ 名: '月奇朱雀', 書: '奇門遁甲秘笈大全' }, { 名: '星奇逢朱雀', 書: '奇門法竅' }],
    丙己: [{ 名: '太孛入刑', 書: '奇門遁甲秘笈大全' }, { 名: '丙悖入刑', 書: '奇門法竅' }],
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
    const results = [];
    for (let index = 0; index < 9; index++) {
        const top = chart['天盤'][index];
        const bottom = chart['地盤'][index];
        if (!top || !bottom) continue;
        const entry = SHI_GAN_KE_YING[top + bottom];
        if (!entry) continue;
        const [name, jiXiong] = entry;
        const item = {
            類: '十干克應',
            格: name,
            吉凶: jiXiong,
            宮: palaceName(index),
            細節: `天盤${top}加地盤${bottom}於${palaceName(index)}宮`,
            出處: [SOURCES.旨歸_克應, SOURCES.秘笈_克應]
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
 * 九星旺相依月令五行，兩部典籍**恰好把旺與相對調**，各有完整算例，皆並列：
 *
 *   《奇門法竅》〈論九星旺相〉：「與我同行即為旺，我生之月誠為相，
 *     廢於父母休於財，囚於鬼兮真不妄。」
 *     算例：天蓬水星，旺於亥子（同類）、相於寅卯（水生木）、廢於申酉（金生水）、
 *          休於巳午（水克火）、囚於辰戌丑未（土克水）。
 *
 *   《奇門遁甲統宗》〈九星旺相〉：「九星旺于子月，相于本月，死于父母月，
 *     囚于鬼月，废于妻月。」（子＝我生，本＝同類）
 *     算例：天蓬水星，正二月（木．我生）旺、十月十一月（水．同類）相、
 *          七月八月（金．生我）死、三六九十二月（土．克我）囚、四五月（火．我克）廢。
 *
 * 兩者對五種關係的排序一致，只是旺與相的名目互換，弱勢三態的名目亦異。
 *
 * 統宗另有〈旺相休囚〉一條作「春木相火旺水廢金囚土休」云云，與其〈九星旺相〉
 * 自相矛盾且無算例，疑有錯簡，故不採。
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

/** 兩家對五種關係的名目 */
const VIGOR_BY_SCHOOL = Object.freeze({
    法竅: Object.freeze({ 同類: '旺', 我生: '相', 生我: '廢', 我克: '休', 克我: '囚' }),
    統宗: Object.freeze({ 同類: '相', 我生: '旺', 生我: '死', 我克: '廢', 克我: '囚' })
});

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
 * @returns {Object} 月令、九星旺相（兩家並列）、八門旺相（需有節氣，否則為 null）
 *
 * @example
 * const chart = chartToObject(generateChartByDatetime('2024011510'));
 * const vigor = assessVigor(chart);
 * vigor.九星[0];  // { 宮: '巽', 星: '天任', 五行: '土', 關係: '我克', 法竅: '休', 統宗: '廢' }
 */
export function assessVigor(chart) {
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
            法竅: relation ? VIGOR_BY_SCHOOL.法竅[relation] : null,
            統宗: relation ? VIGOR_BY_SCHOOL.統宗[relation] : null
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
export function detectPatterns(chart) {
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
