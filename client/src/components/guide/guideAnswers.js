import { GUIDE_TOPICS, TOPIC_BY_ID, TOUR_STOPS } from './guideContent.js';
import { getGuideTopic } from './guidePresentation.js';

export const normalize = (value) => String(value).toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const STOP_WORDS = new Set(normalize('bu bir ve ile için mi mı ne nedir nasıl hangi bana hakkında anlat bilgi ver lütfen peki olarak daha detay detaylı var yapılıyor kullanılıyor yapar yapıyor nedir the what how is are tell me about').split(' '));
const tokens = (value) => normalize(value).split(' ').filter((word) => word.length > 2 && !STOP_WORDS.has(word));

function matches(question, ids) {
  return ids.map((id) => TOPIC_BY_ID[id]).filter(Boolean);
}

export function answerGuide(question, { previousTopic = null, liveStatus = 'offline', animate = true, language = 'en' } = {}) {
  const q = normalize(question).slice(0, 600);
  const say = (en, tr) => language === 'tr' ? tr : en;
  const routed = (items) => [...new Set(items.map((item) => TOUR_STOPS.includes(item.id) ? item.id : ['visionary', 'sensingcam', 'door-panels'].includes(item.id) ? 'dual-inspection' : ['roof', 'underbody', 'buses'].includes(item.id) ? 'busInspection' : 'pick-place'))].map((id) => getGuideTopic(id, language));
  const make = (intro, items, extra = '') => ({
    intro, items: routed(items), extra,
    sources: [...new Map(items.flatMap((item) => item.sources).map((s) => [s.label, s])).values()],
    focusId: routed(items)[0]?.id ?? null,
  });
  if (/^(merhaba|selam|hello|hi|tesekkur|sag ol)( |$)/.test(q)) {
    return make(say('Hello! Ask about a robot, tool or bus inspection, or start the guided tour.', 'Merhaba! Bir robot, araç veya otobüs kontrolü hakkında sorabilir ya da tura başlayabilirsiniz.'), []);
  }
  if (/(dort|four|4|tum|butun|all|fark|karsilastir|compare|difference)/.test(q) && /(hucre|cell|senaryo|use case|usecase|scenario)/.test(q)) {
    return make(say('Four cells demonstrate different robot tasks. A separate cell demonstrates bus-body inspection.', 'Dört hücre, robotların farklı görevlerini gösteriyor. Ayrı bir hücrede otobüs gövdesi inceleniyor.'),
      matches(q, ['pick-place', 'screwdriving', 'dual-inspection', 'door-assembly', 'busInspection']));
  }
  if (/(hangi|tum|butun|neler|what|which)/.test(q) && /(kamera|sensor|camera)/.test(q)) {
    return make(say('These cameras inspect parts, watch the workcell or scan the bus.', 'Bu kameralar parçaları inceliyor, hücreyi izliyor veya otobüsü tarıyor.'),
      matches(q, ['visionary', 'sensingcam', 'roof']));
  }
  if (/(hangi|tum|butun|neler|what|which|all|list)/.test(q) && /(ekipman|materyal|donanim|equipment|materials|tools|malzeme|araclar)/.test(q)) {
    return make(say('Here are the main robots and tools. Choose one to see it in 3D.', 'Başlıca robotlar ve araçlar burada. Birini seçip 3D sahnede görebilirsiniz.'),
      matches(q, ['ur10e', 'kawasaki', 'quick-changer', 'gripper', 'vacuum', 'visionary', 'sensingcam', 'linear-axis', 'conveyor', 'screwdriving', 'door-panels', 'busInspection']));
  }
  if (/(neler yapildi|neler gelistirildi|ne yapildi|proje.*(anlat|tani)|what.*(built|done))/.test(q)) {
    return make(say('Explore the factory, its digital twin and VR training.', 'Fabrikayı, dijital ikizi ve VR eğitimini keşfedebilirsiniz.'), matches(q, ['welcome', 'digital-twin', 'vr']));
  }
  if (/(canli|live|telemetri|telemetry|baglanti|gercek zaman)/.test(q)) {
    const state = liveStatus === 'live' ? say('Live data is connected.', 'Telemetri bağlantısı şu anda açık.')
      : liveStatus === 'connecting' ? say('Connecting to live data…', 'Telemetri bağlantısı kuruluyor.') : say('Live data is offline.', 'Telemetri bağlantısı şu anda çevrimdışı.');
    return make(state, matches(q, ['digital-twin']), animate
      ? say('Live data drives only the UR10e and Kawasaki at the monitoring station. The other cells run simulated tasks.', 'Canlı veri yalnızca izleme istasyonundaki UR10e ve Kawasaki’ye uygulanır. Diğer hücreler simülasyon görevlerini yürütür.')
      : say('Only the UR10e and Kawasaki at the monitoring station follow live data. The demos are paused.', 'Canlı veriyi yalnızca izleme istasyonundaki UR10e ve Kawasaki izler. Demolar duraklatıldı.'));
  }
  if (/(kamera.*fark|fark.*kamera|camera.*difference|difference.*camera|compare.*camera|visionary.*sec100|sec100.*visionary)/.test(q)) {
    return make(say('Visionary-T Mini measures depth on the robot. SEC100 watches the whole workcell.', 'Visionary-T Mini, robot üzerinde derinlik ölçüyor. SEC100 ise hücrenin tamamını izliyor.'), matches(q, ['visionary', 'sensingcam']));
  }
  if (/(otobus|bus)/.test(q) && /(incele|kontrol|tara|inspect)/.test(q) && !/(tavan|roof|alt govde|underbody|r1|r2)/.test(q)) {
    return make(say('Two robots inspect the bus: one scans underneath, the other checks the roof from inside.', 'Otobüsü iki robot inceliyor: biri altını tarıyor, diğeri tavanı içeriden kontrol ediyor.'), matches(q, ['busInspection', 'underbody', 'roof']));
  }

  const words = tokens(q);
  const ranked = GUIDE_TOPICS.map((item) => {
    const aliases = [...item.aliases, getGuideTopic(item.id, 'en').title].map(normalize);
    const direct = aliases.reduce((score, alias) => (alias.length <= 3 ? q.split(' ').includes(alias) : q.includes(alias))
      ? Math.max(score, 8 + Math.min(alias.length, 35) * 0.6) : score, 0);
    const title = normalize(`${item.title} ${getGuideTopic(item.id, 'en').title}`);
    const corpus = normalize([title, ...item.aliases, ...item.useCases].join(' '));
    const overlap = words.reduce((score, word) => score + (corpus.includes(word) ? (title.includes(word) ? 2 : 1) : 0), 0);
    return { item, score: direct + overlap };
  }).sort((a, b) => b.score - a.score);
  // Explicit identifiers beat generic words such as "kamera" or "robot".
  const exact = ranked[0];
  if (exact?.score >= 5) {
    const selected = [exact.item];
    if (/( ve | ile | and |karsilastir|fark|compare|difference)/.test(q)) {
      ranked.slice(1).filter((entry) => entry.score >= 12 && entry.score >= exact.score * 0.65).slice(0, 2)
        .forEach((entry) => selected.push(entry.item));
    }
    return make('', selected.some((item) => TOUR_STOPS.includes(item.id)) ? selected : matches(q, ['pick-place', 'screwdriving', 'dual-inspection', 'door-assembly', 'busInspection']));
  }
  if (previousTopic && /^(bunu|bunun|bu |peki|daha|detay|nasil|nerede|ne ise|kullanim|devam|more|detail|continue|what about it|what does it|what is it|where is it|how is it|how does it|how does this)/.test(q)) {
    return make(say('Here is a little more about that topic.', 'Bu konuya biraz daha bakalım.'), matches(q, [previousTopic]));
  }
  return make(say('I couldn’t find that in the project material. Try a robot, gripper, camera or bus inspection topic.', 'Proje materyalinde bunun yanıtını bulamadım. Bir robot, tutucu, kamera veya otobüs kontrolü konusu deneyebilirsiniz.'), []);
}
