import { TOPIC_BY_ID, TOUR_STOPS } from './guideContent.js';

// Short visitor-facing copy for tour narration and assistant answers.
const entry = (title, lines, extra = '') => ({ title, lines, extra });
export const PRESENTATIONS = {
  welcome: {
    en: entry('Welcome to ASRLab', ['Welcome to our digital factory.', 'Here you can explore robot tasks, inspection equipment and bus-body inspection.', 'Let’s see what each area does and why it matters.']),
    tr: entry('ASRLab’a hoş geldiniz', ['Dijital fabrikamıza hoş geldiniz.', 'Burada robot görevlerini, kontrol ekipmanlarını ve otobüs gövde kontrolünü keşfedebilirsiniz.', 'Her alanda ne yapıldığına birlikte bakalım.']),
  },
  'pick-place': {
    en: entry('Cell 1 · Pick and place', ['This cell moves boxes from the conveyor to the table.', 'From the opposite side, you can see the pickup and placement stations.', 'Up close, watch the fingers close around the box.', 'Now follow the actual box as the robot carries it toward the table.', 'The fingers open to release it at the destination before the next cycle.']),
    tr: entry('Hücre 1 · Al ve yerleştir', ['Bu hücrede kutular konveyörden masaya taşınıyor.', 'Karşı taraftan alma ve bırakma istasyonlarını birlikte görebilirsiniz.', 'Şimdi kutunun etrafında kapanan tutucu parmaklarına yakından bakalım.', 'Robot masaya doğru ilerlerken taşınan kutuyu takip ediyoruz.', 'Tutucu hedefte açılarak kutuyu bırakıyor ve sonraki çevrime hazırlanıyor.']),
  },
  ur10e: {
    en: entry('UR10e robot', ['The UR10e is the lab’s versatile robot arm.', 'It can move parts, help with assembly or carry a camera for inspection.', 'Its moving base lets it reach different places along the workcell.', 'Changing the tool lets the same arm take on a new task.']),
    tr: entry('UR10e robotu', ['UR10e, laboratuvarın farklı görevlerde kullanılan robot kolu.', 'Parça taşıyabiliyor, montaj yapabiliyor veya kontrol için kamera taşıyabiliyor.', 'Hareketli tabanı sayesinde hücre boyunca farklı noktalara ulaşıyor.', 'Uç aracı değişince aynı kol yeni bir görev üstlenebiliyor.']),
  },
  'quick-changer': {
    en: entry('Dual Quick Changer', ['This adapter lets a robot carry two compatible tools.', 'It helps the robot switch between jobs without a long setup.', 'The rear view shows the tool connection points.', 'The display model illustrates the idea of flexible automation.']),
    tr: entry('Dual Quick Changer', ['Bu bağlantı parçası, robotun iki uyumlu araç taşımasını sağlıyor.', 'Böylece işler arasında uzun hazırlık yapmadan geçiş yapılabiliyor.', 'Arka görünümde araçların bağlantı noktalarını görebilirsiniz.', 'Sergi modeli, esnek otomasyon fikrini gösteriyor.']),
  },
  gripper: {
    en: entry('2FG14 parallel gripper', ['A parallel gripper holds a part between two fingers.', 'Watch the fingers open and close on the display.', 'From the back, you can see the body and mounting side.', 'This type of tool is useful for moving parts and supporting assembly.'], 'The exhibit reuses the project’s gripper geometry. It is not verified manufacturer CAD for the 2FG14.'),
    tr: entry('2FG14 paralel tutucu', ['Paralel tutucu, parçayı iki parmağın arasında kavrıyor.', 'Sergide parmakların açılıp kapanmasını izleyebilirsiniz.', 'Arka taraftan gövdeyi ve bağlantı yüzünü görüyoruz.', 'Bu tür tutucular parça taşıma ve montaj işlerinde kullanılıyor.']),
  },
  vacuum: {
    en: entry('VGC10 vacuum gripper', ['The VGC10 uses suction cups to lift parts.', 'Here you can see the cups and compact body up close.', 'The other side shows how the tool connects to a robot.', 'It is useful for handling panels, packages and other suitable surfaces.'], 'This is an illustrative display model, not manufacturer CAD or a vacuum-pressure simulation.'),
    tr: entry('VGC10 vakum tutucu', ['VGC10, parçaları vantuzlarla kaldırıyor.', 'Burada vantuzları ve küçük gövdeyi yakından görebilirsiniz.', 'Diğer tarafta robot bağlantısının nasıl yapıldığını görüyoruz.', 'Panel, paket ve uygun yüzeyli parçaların taşınmasında kullanılıyor.']),
  },
  visionary: {
    en: entry('SICK Visionary-T Mini', ['This camera helps a robot understand the shape of a part.', 'It provides depth information for inspection and positioning.', 'The rear view shows the housing and mounting area.', 'Moving the camera with the robot gives a choice of viewpoints.'], 'The exhibit uses the project’s existing SICK camera geometry. Scene camera feeds are virtual views, not a live physical depth stream.'),
    tr: entry('SICK Visionary-T Mini', ['Bu kamera, robotun parçanın şeklini anlamasına yardımcı oluyor.', 'Kontrol ve konumlandırma için derinlik bilgisi sağlıyor.', 'Arka görünümde gövdeyi ve montaj bölgesini görebilirsiniz.', 'Kamerayı robotla taşımak, farklı açılardan bakmayı sağlıyor.']),
  },
  sensingcam: {
    en: entry('SICK sensingCam SEC100', ['This camera watches the whole workcell.', 'It helps people follow an experiment and review what happened.', 'The rear view shows the mounting and connection side.', 'The display illustrates the equipment; no physical camera stream is connected.'], 'The housing, lens and connections are an illustrative model. The supplied lab brief describes remote monitoring and experiment recording.'),
    tr: entry('SICK sensingCam SEC100', ['Bu kamera, hücrenin tamamını izlemek için kullanılıyor.', 'Deneyi takip etmeye ve sonradan incelemeye yardımcı oluyor.', 'Arka görünümde montaj ve bağlantı tarafını görebilirsiniz.', 'Sergi ekipmanı tanıtıyor; fiziksel kameranın yayınına bağlı değil.']),
  },
  'linear-axis': {
    en: entry('The robot’s linear axis', ['The rail moves the robot along the workcell.', 'That gives the arm access to more than one working position.', 'It is useful for carrying parts and scanning larger surfaces.', 'The robot arm and rail work together as part of the same task.'], 'The lab brief describes a Festo drive and Modbus connection. The browser shows rail movement; it does not operate that drive directly.'),
    tr: entry('Robotun doğrusal ekseni', ['Ray, robotu hücre boyunca taşıyor.', 'Böylece kol birden fazla çalışma noktasına ulaşabiliyor.', 'Parça taşımada ve büyük yüzeyleri taramada işe yarıyor.', 'Robot kolu ve ray aynı görevin parçaları olarak birlikte çalışıyor.']),
  },
  conveyor: {
    en: entry('Conveyor', ['The conveyor brings parts to the robot.', 'The robot picks up a part when it reaches the right position.', 'This connects material supply with the next production step.', 'You can follow the part from the belt to the work area.']),
    tr: entry('Konveyör', ['Konveyör, parçaları robota getiriyor.', 'Parça uygun noktaya geldiğinde robot onu alıyor.', 'Böylece malzeme besleme ile sonraki üretim adımı birleşiyor.', 'Parçanın banttan çalışma alanına gidişini izleyebilirsiniz.']),
  },
  kawasaki: {
    en: entry('Kawasaki and mobile base', ['The Kawasaki robot works on a mobile base beside the UR10e.', 'It moves to different positions along the chassis.', 'The arm checks the outside, reaches inside and then pulls back.', 'This shows how a moving robot can inspect hard-to-reach areas.']),
    tr: entry('Kawasaki ve mobil taban', ['Kawasaki robotu, UR10e’nin yanında mobil bir taban üzerinde çalışıyor.', 'Şasi boyunca farklı kontrol noktalarına ilerliyor.', 'Kol dış yüzeyi kontrol ediyor, içeri uzanıyor ve geri çekiliyor.', 'Böylece ulaşılması zor alanların robotla incelenmesini görüyoruz.']),
  },
  screwdriving: {
    en: entry('Cell 2 · Screwdriving', ['This cell prepares a part and fastens its screws.', 'The opposite view shows the robots and the working table together.', 'Let’s follow the tool as it takes a screw and approaches the part.', 'The feeder and robot repeat the process at each fastening point.', 'The finished part is moved out, ready for the next cycle.']),
    tr: entry('Hücre 2 · Vidalama', ['Bu hücrede parça hazırlanıyor ve vidaları takılıyor.', 'Karşı görünümde robotları ve çalışma masasını birlikte görüyoruz.', 'Şimdi vida alan ve parçaya yaklaşan aracı takip edelim.', 'Besleyici ve robot, her bağlantı noktasında işlemi tekrarlıyor.', 'Tamamlanan parça çıkarılıyor ve yeni çevrime geçiliyor.']),
  },
  'dual-inspection': {
    en: entry('Cell 3 · Two-sided inspection', ['Two robots inspect opposite sides of the door.', 'From the other side, you can see both working positions.', 'The UR10e camera follows a planned route over the surface.', 'The Kawasaki camera checks the matching area on the opposite face.', 'Together, they show how two-sided inspection can be organised.']),
    tr: entry('Hücre 3 · İki taraflı kontrol', ['İki robot kapının karşılıklı yüzlerini inceliyor.', 'Diğer taraftan her iki çalışma konumunu görebilirsiniz.', 'UR10e kamerası yüzey üzerinde planlı bir yol izliyor.', 'Kawasaki kamerası karşı yüzdeki aynı bölgeyi kontrol ediyor.', 'Böylece iki taraflı kontrolün nasıl düzenlendiğini görüyoruz.']),
  },
  'door-assembly': {
    en: entry('Cell 4 · Door assembly', ['This cell places a fitting onto the door and fastens it.', 'The reverse view shows the door’s position between the robots.', 'The UR10e carries out the assembly and screwdriving steps.', 'The Kawasaki supports the inspection of the result.', 'Here is the area where the fitting is attached.']),
    tr: entry('Hücre 4 · Kapı montajı', ['Bu hücrede kapıya bir bağlantı parçası yerleştirilip sabitleniyor.', 'Karşı görünüm, kapının robotlar arasındaki konumunu gösteriyor.', 'UR10e montaj ve vidalama adımlarını yürütüyor.', 'Kawasaki, sonucun kontrolüne destek veriyor.', 'Parçanın kapıya bağlandığı alanı burada görebilirsiniz.']),
  },
  'door-panels': {
    en: entry('Door panel inspection', ['Real door panels provide useful test pieces for automotive inspection.', 'A robot scans different areas from repeatable viewpoints.', 'The images help researchers study surface defects.', 'This scene illustrates how the inspection is organised.'], 'The lab brief describes Fiat Doblo panels. The door CAD shown in the scene has not been verified as the same vehicle part.'),
    tr: entry('Kapı paneli kontrolü', ['Gerçek kapı panelleri, otomotiv kontrolü için yararlı deney parçaları.', 'Robot, farklı bölgeleri tekrarlanabilir açılardan tarıyor.', 'Görüntüler, yüzey kusurlarını araştırmaya yardımcı oluyor.', 'Sahne, bu kontrolün nasıl düzenlendiğini gösteriyor.']),
  },
  busInspection: {
    en: entry('Bus body inspection', ['This area demonstrates inspection of a bus body.', 'The other view shows the two robots on their separate rails.', 'The first robot scans beneath the bus.', 'The second reaches inside to inspect the roof.', 'The scene lets you follow both inspection routes.']),
    tr: entry('Otobüs gövde kontrolü', ['Bu alanda otobüs gövdesinin kontrolü gösteriliyor.', 'Diğer görünümde, ayrı raylarda çalışan iki robotu görüyoruz.', 'İlk robot otobüsün altını tarıyor.', 'İkinci robot içeri uzanarak tavanı inceliyor.', 'Sahnede iki kontrol yolunu da takip edebilirsiniz.']),
  },
  underbody: {
    en: entry('R1 · Underbody', ['R1 inspects the underside of the bus body.', 'Its arm reaches below the floor and points the camera upward.', 'Let’s follow the camera head along the inspection route.', 'The beams and markers illustrate the scanning process.']),
    tr: entry('R1 · Alt gövde', ['R1, otobüs gövdesinin alt tarafını inceliyor.', 'Kol tabanın altına uzanıyor ve kamera yukarı bakıyor.', 'Şimdi kamera başlığını kontrol yolu boyunca takip edelim.', 'Işınlar ve işaretler, tarama sürecini gösteriyor.']),
  },
  roof: {
    en: entry('R2 · Roof', ['R2 inspects the roof from inside the bus body.', 'The arm reaches through the window opening.', 'Up close, you can see the camera head looking toward the roof.', 'The wider view shows how the robot and bus fit together.']),
    tr: entry('R2 · Tavan', ['R2, tavanı otobüs gövdesinin içinden inceliyor.', 'Kol, pencere açıklığından içeri uzanıyor.', 'Yakından, tavana yönelen kamera başlığını görebilirsiniz.', 'Genel görünüm, robot ile gövdenin ilişkisini gösteriyor.']),
  },
  buses: {
    en: entry('Buses and factory movement', ['The finished buses bring the factory setting to life.', 'They move between parking areas while people and vehicles work nearby.', 'These buses are presentation models, separate from the inspection body.', 'The marked routes help explain the factory layout.']),
    tr: entry('Otobüsler ve fabrika hareketi', ['Tamamlanmış otobüsler, fabrika ortamını canlandırıyor.', 'Çevrede insanlar ve araçlar çalışırken otobüsler park alanları arasında ilerliyor.', 'Bunlar, kontrol hücresindeki gövdeden ayrı sunum modelleri.', 'İşaretli yollar, fabrika düzenini anlamayı kolaylaştırıyor.']),
  },
  'digital-twin': {
    en: entry('How the digital twin works', ['This scene combines 3D models, robot movement and process data.', 'Live joint data can drive the robots in the first workcell.', 'During this tour, the robots run a programmed demonstration.', 'You can explore the process and compare different ways of working.']),
    tr: entry('Dijital ikiz nasıl çalışıyor?', ['Bu sahne, üç boyutlu modelleri, robot hareketlerini ve süreç verilerini birleştiriyor.', 'İlk hücrede robotlar canlı eklem verileriyle hareket edebiliyor.', 'Bu tur sırasında ise programlanmış bir gösterim çalışıyor.', 'Süreci keşfedebilir ve farklı çalışma biçimlerini karşılaştırabilirsiniz.']),
  },
  vr: {
    en: entry('VR training', ['With a compatible headset, you can explore the factory from inside.', 'Training activities cover picking, assembly, screwdriving and safety.', 'You follow the instructions and practise one activity at a time.', 'This offers a hands-on way to learn the workcell.']),
    tr: entry('VR eğitimi', ['Uyumlu bir başlıkla fabrikanın içinde gezebilirsiniz.', 'Eğitimler parça taşıma, montaj, vidalama ve güvenlik konularını kapsıyor.', 'Yönlendirmeleri takip ederek etkinlikleri sırayla deneyebilirsiniz.', 'Böylece hücreyi uygulama yaparak tanıyabilirsiniz.']),
  },
};

const SHORT = {
  'digital-twin': {
    en: ['This station monitors the real UR10e and Kawasaki beside the bus inspection area.', 'When the physical robots run, joint angles received through the API from MongoDB drive these digital robots in real time.'],
    tr: ['Bu alan, otobüs kontrol alanı yanındaki gerçek UR10e ve Kawasaki robotlarını izler.', 'Fiziksel robotlar çalıştığında MongoDB veritabanından API ile gelen eklem açıları bu dijital robotlara gerçek zamanlı uygulanır.'],
  },
  'pick-place': {
    en: ['In the first use case, UR10e moves boxes from the conveyor to the table.', 'The UR10e closes its gripper around a box.', 'It carries the box to the table while Kawasaki checks the chassis beside it.'],
    tr: ['İlk kullanım senaryosunda UR10e kutuları konveyörden masaya taşıyor.', 'UR10e, tutucusunu kutunun etrafında kapatıyor.', 'Kutuyu masaya taşırken Kawasaki yanındaki şasiyi kontrol ediyor.'],
  },
  screwdriving: {
    en: ['This cell fastens screws into a prepared part.', 'Up close, the tool collects a screw and approaches its fastening point.', 'The robot repeats the operation to finish the part.'],
    tr: ['Bu hücrede hazırlanmış parçaya vidalar takılıyor.', 'Yakından, aracın vidayı alıp bağlantı noktasına yaklaşmasını görüyoruz.', 'Robot işlemi tekrarlayarak parçayı tamamlıyor.'],
  },
  'dual-inspection': {
    en: ['Two robots inspect opposite sides of the aluminium chassis.', 'The UR10e camera scans one side with clearance from the frame.', 'The Kawasaki camera checks the other face.'],
    tr: ['İki robot alüminyum şasinin karşılıklı yüzlerini inceliyor.', 'UR10e kamerası şasiye mesafe bırakarak bir yüzü tarıyor.', 'Kawasaki kamerası diğer yüzü kontrol ediyor.'],
  },
  'door-assembly': {
    en: ['This cell attaches a fitting to the door.', 'The UR10e positions and fastens it.', 'Here is the attachment point that the robots assemble and check.'],
    tr: ['Bu hücrede kapıya bir bağlantı parçası takılıyor.', 'UR10e parçayı konumlandırıp sabitliyor.', 'Robotların montaj ve kontrol yaptığı bağlantı noktası burada.'],
  },
  busInspection: {
    en: ['Two rail-mounted robots inspect the bus body.', 'R1 reaches under the floor and scans upward.', 'R2 reaches inside the bus to inspect the roof.'],
    tr: ['Raylı iki robot otobüs gövdesini inceliyor.', 'R1 tabanın altına uzanıp yukarı doğru tarıyor.', 'R2 otobüsün içine uzanarak tavanı kontrol ediyor.'],
  },
};
for (const [id, languages] of Object.entries(SHORT)) {
  for (const language of ['en', 'tr']) PRESENTATIONS[id][language].lines = languages[language];
}

PRESENTATIONS['digital-twin'].en.title = 'Live robot monitoring';
PRESENTATIONS['digital-twin'].tr.title = 'Canlı robot izleme';
const GROUPS = {
  'Genel bakış': { en: 'Overview', tr: 'Genel bakış' },
  'Üretim senaryoları': { en: 'Workcells', tr: 'Hücreler' },
  'Robotlar ve araçlar': { en: 'Robots and tools', tr: 'Robotlar ve araçlar' },
  'Algılama ve kontrol': { en: 'Cameras and inspection', tr: 'Kameralar ve kontrol' },
  'Otobüs kontrolü': { en: 'Bus inspection', tr: 'Otobüs kontrolü' },
  'Dijital ikiz ve XR': { en: 'Digital twin and VR', tr: 'Dijital ikiz ve VR' },
};
const cache = new Map();
export function getGuideTopic(id, language = 'en') {
  const lang = language === 'tr' ? 'tr' : 'en';
  const key = `${lang}:${id}`;
  if (!cache.has(key)) {
    const original = TOPIC_BY_ID[id]; const copy = PRESENTATIONS[id]?.[lang];
    if (!original || !copy) return null;
    cache.set(key, { ...original, ...copy, language: lang, group: GROUPS[original.group]?.[lang] || original.group,
      intro: copy.lines.slice(0, 2).join(' '), detail: ['digital-twin', 'dual-inspection'].includes(id) ? copy.lines.slice(-1)[0] : lang === 'tr' ? original.detail : copy.extra || copy.lines.slice(2).join(' '),
      summary: copy.lines[0], narration: copy.lines.join(' '),
    });
  }
  return cache.get(key);
}
export const getGuideTopics = (language = 'en') => TOUR_STOPS.map((id) => getGuideTopic(id, language));
