import { UR10E_SPECS } from '../robotDetails.js';
import { GUIDE_TOPICS, TOUR_STOPS } from './guideContent.js';
import { getGuideTopic } from './guidePresentation.js';

export const normalize = (value) => String(value).toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\bur\s*10\s*e\b/g, 'ur10e').trim();

const STOP_WORDS = new Set(normalize('bu bir ve ile için mi mı ne nedir nasıl hangi bana hakkında anlat bilgi ver lütfen peki olarak daha detay detaylı var yapılıyor kullanılıyor yapar yapıyor nedir the what how is are tell me about').split(' '));
const tokens = (value) => normalize(value).split(' ').filter((word) => word.length > 2 && !STOP_WORDS.has(word));

const SCENE_TOPICS = {
  ur10e: 'pick-place', kawasaki: 'pick-place', gripper: 'pick-place', conveyor: 'pick-place',
  'linear-axis': 'pick-place', visionary: 'dual-inspection', 'door-panels': 'dual-inspection',
  underbody: 'busInspection', roof: 'busInspection',
};
const UR10E = Object.fromEntries(UR10E_SPECS);

function ur10eIntro(question, say) {
  if (/\b(payload|lift|kg|kilo)\b|how much.*carry|tasima kapasite|ne kadar tasir|kaldirabilir/.test(question)) {
    return say(`The UR10e has a rated payload of ${UR10E.Payload}. In the pick-and-place cell, it uses a two-finger gripper to move boxes.`,
      `UR10e’nin yük kapasitesi ${UR10E.Payload.replace('.', ',')}. Al ve yerleştir hücresinde kutuları iki parmaklı tutucuyla taşıyor.`);
  }
  if (/\b(reach|erisim|menzil)\b|ne kadar uzan/.test(question)) {
    return say(`The UR10e arm has a reach of ${UR10E.Reach}. Its linear rail extends the area it can work in.`,
      `UR10e kolunun erişim mesafesi ${UR10E.Reach}. Doğrusal ray, çalışabildiği alanı genişletiyor.`);
  }
  return say('The UR10e is a six-axis collaborative robot arm from Universal Robots. In this digital twin, it rides on a linear rail and uses a two-finger gripper to move boxes from the conveyor to the table.',
    'UR10e, Universal Robots’ın altı eksenli iş birlikçi robot koludur. Bu dijital ikizde doğrusal ray üzerinde ilerler ve iki parmaklı tutucuyla kutuları konveyörden masaya taşır.');
}

export function answerGuide(question, { previousTopic = null, liveStatus = 'offline', animate = true, language = 'en' } = {}) {
  const q = normalize(question).slice(0, 600).replace(/^(?:(?:merhaba|selam|hello|hi|hey)(?: |$))+/, '');
  const say = (en, tr) => language === 'tr' ? tr : en;
  const make = (intro, ids = [], extra = '') => {
    const items = [...new Set(ids)].map((id) => getGuideTopic(id, language)).filter(Boolean)
      .map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        intro: item.id === 'ur10e' ? ur10eIntro(q, say) : item.intro,
        sceneTopic: TOUR_STOPS.includes(item.id) ? item.id : SCENE_TOPICS[item.id],
      }));
    return { intro, items, extra, topicId: items[0]?.id ?? null };
  };
  if (!q || /^(tesekkur(?: ederim)?|sag ol|thanks|thank you)$/.test(q)) {
    return make(say('Ask me about a robot, tool, or factory process.', 'Robotlar, araçlar veya fabrika süreçleri hakkında soru sorabilirsin.'));
  }
  if (/(dort|four|4|tum|butun|all|fark|karsilastir|compare|difference)/.test(q) && /(hucre|cell|senaryo|use case|usecase|scenario)/.test(q)) {
    return make(say('Four cells demonstrate different robot tasks. A separate cell demonstrates bus-body inspection.', 'Dört hücre, robotların farklı görevlerini gösteriyor. Ayrı bir hücrede otobüs gövdesi inceleniyor.'),
      ['pick-place', 'screwdriving', 'dual-inspection', 'door-assembly']);
  }
  if (/\b(?:hangi kamera(?:lar)?|hangi sensor(?:ler)?|(?:what|which|all) cameras?|(?:what|which) sensors?)\b/.test(q)) {
    return make(say('These cameras inspect parts, watch the workcell or scan the bus.', 'Bu kameralar parçaları inceliyor, hücreyi izliyor veya otobüsü tarıyor.'),
      ['visionary', 'sensingcam', 'roof']);
  }
  if (/(hangi|tum|butun|neler|what|which|all|list)/.test(q) && /(ekipman|materyal|donanim|equipment|materials|tools|malzeme|araclar)/.test(q)) {
    return make(say('The main equipment includes two robot arms, grippers, cameras, and a conveyor.', 'Başlıca ekipmanlar iki robot kolu, tutucular, kameralar ve konveyördür.'),
      ['ur10e', 'kawasaki', 'gripper', 'visionary', 'sensingcam', 'conveyor']);
  }
  if (/(neler yapildi|neler gelistirildi|ne yapildi|proje.*(anlat|tani)|what.*(built|done))/.test(q)) {
    return make(say('The project combines robot monitoring, simulated production tasks, and VR training.', 'Proje robot izlemeyi, üretim simülasyonlarını ve VR eğitimini bir araya getiriyor.'), ['digital-twin', 'vr']);
  }
  if (/(canli|live|telemetri|telemetry|baglanti|gercek zaman)/.test(q)) {
    const state = liveStatus === 'live' ? say('Live data is connected.', 'Telemetri bağlantısı şu anda açık.')
      : liveStatus === 'connecting' ? say('Connecting to live data…', 'Telemetri bağlantısı kuruluyor.') : say('Live data is offline.', 'Telemetri bağlantısı şu anda çevrimdışı.');
    return make(state, [], animate
      ? say('Live data drives only the UR10e and Kawasaki at the monitoring station. The other cells run simulated tasks.', 'Canlı veri yalnızca izleme istasyonundaki UR10e ve Kawasaki’ye uygulanır. Diğer hücreler simülasyon görevlerini yürütür.')
      : say('Only the UR10e and Kawasaki at the monitoring station follow live data. The demos are paused.', 'Canlı veriyi yalnızca izleme istasyonundaki UR10e ve Kawasaki izler. Demolar duraklatıldı.'));
  }
  if (/(kamera.*fark|fark.*kamera|camera.*difference|difference.*camera|compare.*camera|visionary.*sec100|sec100.*visionary)/.test(q)) {
    return make(say('Visionary-T Mini measures depth on the robot. SEC100 watches the whole workcell.', 'Visionary-T Mini, robot üzerinde derinlik ölçüyor. SEC100 ise hücrenin tamamını izliyor.'));
  }
  if (/(otobus|bus)/.test(q) && /(incele|kontrol|tara|inspect)/.test(q) && !/(tavan|roof|alt govde|underbody|r1|r2)/.test(q)) {
    return make('', ['busInspection']);
  }

  const words = tokens(q);
  const phrase = ` ${q} `;
  const ranked = GUIDE_TOPICS.map((item) => {
    const aliases = [...item.aliases, getGuideTopic(item.id, 'en').title].map(normalize);
    const direct = aliases.reduce((score, alias) => phrase.includes(` ${alias} `)
      ? Math.max(score, 8 + Math.min(alias.length, 35) * 0.6) : score, 0);
    const title = normalize(`${item.title} ${getGuideTopic(item.id, 'en').title}`);
    const corpus = normalize([title, ...item.aliases, ...item.useCases].join(' '));
    const overlap = words.reduce((score, word) => score + (corpus.includes(word) ? (title.includes(word) ? 2 : 1) : 0), 0);
    return { item, direct, score: direct + overlap };
  }).sort((a, b) => b.score - a.score);
  // Explicit identifiers beat generic words such as "kamera" or "robot".
  const exact = ranked[0];
  if (exact?.score >= 5) {
    const selected = [exact.item.id];
    if (/( ve | ile | and |karsilastir|fark|compare|difference)/.test(q)) {
      ranked.slice(1).filter((entry) => entry.direct > 0 && entry.score >= exact.score * 0.6).slice(0, 2)
        .forEach((entry) => selected.push(entry.item.id));
    }
    return make('', selected);
  }
  if (previousTopic && /^(bunu|bunun|bu |peki|daha|detay|nasil|nerede|ne ise|ne kadar|kac|kullanim|devam|more|detail|continue|what about it|what does it|what is it|where is it|how is it|how does it|how does this|how much|how far)/.test(q)) {
    return make('', [previousTopic]);
  }
  return make(say('I don’t have that information for this factory. Try asking about a robot or a task shown here.', 'Bu fabrikayla ilgili bu bilgi bende yok. Buradaki bir robotu veya görevi sorabilirsin.'));
}
