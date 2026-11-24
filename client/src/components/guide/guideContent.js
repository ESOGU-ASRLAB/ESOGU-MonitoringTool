// Curated from the supplied ASRLab infrastructure brief and the actual scene
// programs. Equipment in the brief is not automatically a separately modelled
// object. Keep that distinction visible in both answers and the tour.
const BRIEF = { label: 'ASRLab altyapı ve ekipman tanıtımı', kind: 'brief' };
const source = (label, file, href) => ({ label, file, href, kind: 'project' });
const topic = (id, title, group, shot, aliases, intro, detail, steps, useCases, sources, modelled = true) => ({
  id, title, group, shot, aliases, intro, detail, steps, useCases, sources, modelled,
});

export const GUIDE_TOPICS = [
  topic('welcome', 'ASRLab dijital ikizine hoş geldiniz', 'Genel bakış', 'pickPlace',
    ['genel', 'tanıtım', 'neler yapıldı', 'ne yapıyor', 'laboratuvar', 'asrlab', 'ifarlab', 'matisse', 'overview', 'laboratory'],
    'Merhaba, ben ASRLab dijital rehberiniz. Bu ortamda robotik üretimi, otomotiv kalite kontrolünü ve insan–robot iş birliğini aynı fabrikada keşfedebilirsiniz.',
    'Dört IFARLAB hücresi; parça taşıma, vidalama, çift robotla kapı kontrolü ve kapı üzerine montaj senaryolarını gösterir. Gövde kontrol alanında iki portal robot otobüs gövdesini inceler. Her hücrenin görev hareketleri ve görsel geri bildirimleri ayrı programlarla hazırlanmıştır.',
    ['Önce ekipmanları ve dört robot hücresini inceleyeceğiz.', 'Ardından otobüs gövdesine, alt gövde ve tavan taramalarına geçeceğiz.', 'Son olarak canlı veri ve VR eğitim olanaklarını tanıyacağız.'],
    ['Dijital fabrika tanıtımı', 'Robotik otomasyon', 'Eğitim ve gösterim'],
    [BRIEF, source('Dijital ikiz ve senaryo yerleşimi', 'pages/DigitalTwin.js')]),

  topic('pick-place', 'Hücre 1 · Al ve yerleştir', 'Üretim senaryoları', 'pickPlace',
    ['pick and place', 'pick place', 'pick & place', 'al yerleştir', 'parça taşıma', 'kutu', 'hücre 1', 'cell 1', 'taşıma senaryosu'],
    'İlk hücrede bir parçanın üretim hattından alınarak çalışma masasına taşınmasını izliyorsunuz. UR10e, konveyörden gelen kutuyu kavrar, kaldırır ve masanın üzerindeki bırakma noktasına götürür.',
    'Robotun doğrusal ekseni, kolu alma ve bırakma noktaları arasında taşır. Tutucunun açılıp kapanması ve kutunun robota bağlanıp ayrılması, görev aşamalarıyla birlikte canlandırılır. Aynı hücrede Kawasaki, şasinin dışını ve içini kontrol eden ayrı bir görev yürütür.',
    ['Kutu bant üzerindeki alma noktasına gelir.', 'UR10e yaklaşır, kavrar ve güvenli taşıma yüksekliğine çıkar.', 'Parçayı masaya bırakır; tutucuyu açarak yeni çevrime döner.'],
    ['Malzeme taşıma', 'Hat besleme', 'Tekrarlanabilir robot görevleri'],
    [source('Al ve yerleştir görev programı', 'components/IfarlabTasks.js', '/docs#ur10e')]),

  topic('ur10e', 'Universal Robots UR10e', 'Robotlar ve araçlar', 'ur10e',
    ['ur10e', 'universal robots', 'kobot', 'cobot', 'iş birlikçi robot', 'robot kol', 'altı eksen'],
    'UR10e, laboratuvarın altı eksenli iş birlikçi robot platformudur. Aynı kol; kavrama, montaj, robot destekli kontrol ve insan–robot iş birliği araştırmalarında farklı araçlarla kullanılabilir.',
    'Dijital ikizde gerçek robot açıklama paketinden alınan parçalar, eklem zinciri halinde birleştirilmiştir. Robot yalnızca tek parça bir görsel değildir; eklemleri, ray üzerindeki taşıyıcısı ve uç aracı ayrı hareket eder. Diğer hücrelerde aynı platforma vidalama veya kontrol aracı takılmıştır.',
    ['Gövde ve eklemler robotun duruşunu oluşturur.', 'Doğrusal taşıyıcı erişilebilen çalışma alanını genişletir.', 'Uç araç değiştiğinde aynı platform farklı araştırma görevlerine uyarlanır.'],
    ['Manipülasyon', 'İnsan–robot iş birliği', 'Montaj', 'Doğrulama ve geçerleme'],
    [BRIEF, source('UR10e kinematik modeli', 'components/UR10eRobot.js', '/docs#ur10e')]),

  topic('quick-changer', 'OnRobot Dual Quick Changer', 'Robotlar ve araçlar', 'quickChanger',
    ['dual quick changer', 'quick changer', 'takım değiştirici', 'uç değiştirici', 'çift araç', 'onrobot changer'],
    'OnRobot Dual Quick Changer, UR10e üzerinde iki uyumlu uç aracın birlikte kullanılmasını sağlayan takım değiştirme bileşenidir. Farklı işlem adımlarının aynı robot platformunda bir araya getirilmesini destekler.',
    'Paylaşılan altyapı bilgisine göre mekanik bağlantı ile güç ve veri bağlantıları hızlı araç değişimine uygun şekilde kurulur. Böylece taşıma ve montaj gibi işler için esnek bir deney düzeneği oluşturulabilir. Bu ekipman tanıtım kapsamındadır; sahnede ayrı bir takım değiştirme çevrimi çalıştırılmıyor.',
    ['İş parçasına ve göreve uygun iki uç araç seçilir.', 'Araç bağlantıları robot platformuna entegre edilir.', 'Çok araçlı taşıma ve montaj deneyleri planlanır.'],
    ['Çok araçlı robotik', 'Esnek otomasyon', 'Al ve yerleştir', 'Montaj'], [BRIEF], false),

  topic('gripper', 'OnRobot 2FG14 paralel tutucu', 'Robotlar ve araçlar', 'gripper',
    ['2fg14', 'paralel tutucu', 'iki parmak', 'iki çeneli', 'gripper', 'kavrama', 'onrobot tutucu'],
    'OnRobot 2FG14, programlanabilir kavrama ve malzeme taşıma deneylerinde kullanılan elektrikli, iki parmaklı paralel tutucudur. Farklı parçalar için kavrama kuvveti ayarlanabilir.',
    'Önce ekipman sergisindeki kaide üzerinde tutucuyu ve hareketli çenelerini yakından inceliyoruz. Ardından gövde ve bağlantı yüzünü diğer taraftan görüyoruz. Sergide projedeki tutucu geometrisi kullanılır; bu geometrinin üreticinin 2FG14 CAD dosyası olduğu doğrulanmış değildir. UR10e üzerinde de kutu alma ve bırakma sırasında iki parmaklı tutucunun çalışmasını görebilirsiniz.',
    ['Tutucu parçaya açık çenelerle yaklaşır.', 'Çeneler kapanır ve parça taşıma aşamasına geçer.', 'Hedefte çeneler açılır ve parça bırakılır.'],
    ['Robotik kavrama', 'Malzeme taşıma', 'Montaj', 'Takım taşıma'],
    [BRIEF, source('UR10e tutucu ve taşıma canlandırması', 'components/UR10eRobot.js', '/docs#ur10e')]),

  topic('vacuum', 'OnRobot VGC10 vakum tutucu', 'Robotlar ve araçlar', 'vacuum',
    ['vgc10', 'vakum', 'vacuum', 'vantuz', 'panel taşıma', 'vakumlu tutucu'],
    'OnRobot VGC10, elektrikli vakum sistemiyle farklı yüzey ve geometrilere sahip parçaları taşımaya yönelik bir uç araçtır. Vantuzların yerleşimi, uygulamanın gereksinimine göre düzenlenebilir.',
    'Sergide kendi kutu kaidesi üzerinde duran tanıtım modelinde gövdeyi, bağlantı bölgesini ve iki vantuzu yakından görüyoruz. Kamera diğer tarafa geçerek vantuzların yerleşimini ve bağlantıları da gösterir. Bu gösterim VGC10 çalışma prensibini anlatır; üretici CAD dosyası veya vakum basıncı simülasyonu değildir.',
    ['Parçanın yüzeyi ve vantuz yerleşimi değerlendirilir.', 'Vakumlu kavrama ile taşıma senaryosu tasarlanır.', 'Bırakma noktasında parçanın kontrollü ayrılması planlanır.'],
    ['Panel taşıma', 'Paketleme', 'Al ve yerleştir', 'Malzeme taşıma'], [BRIEF], false),

  topic('visionary', 'SICK Visionary-T Mini · 3B algılama', 'Algılama ve kontrol', 'visionary',
    ['visionary', 'visionary t mini', 'tof', 'time of flight', 'derinlik', '3d kamera', '3b kamera', 'sick kamera'],
    'SICK Visionary-T Mini, uçuş süresi prensibiyle derinlik verisi üreten üç boyutlu bir kameradır. Paylaşılan düzende özel bir flanş üzerinden UR10e üzerine bağlanır.',
    'Sergide ayrı kaide üzerinde, projede kullanılan SICK kamera geometrisini inceliyoruz. Önce gövdeyi, sonra arka ve bağlantı tarafını görüyoruz. Robot bu tür kameraları farklı bakış noktalarına taşıyarak nesne algılama ve kalite kontrol araştırmalarını destekler. Sahnedeki görüntü panelleri sanal kamera görüntüleridir; fiziksel derinlik ölçümü değildir.',
    ['Robot kontrol edilecek yüzeye uygun bir konuma gelir.', 'Farklı bakış noktalarından görüntü ve derinlik toplama planlanır.', 'Veriler nesne tespiti veya kalite kontrol yöntemlerinde değerlendirilir.'],
    ['3B makine görüşü', 'Robotik kontrol', 'Nesne algılama', 'Boyutsal ölçüm'],
    [BRIEF, source('Robot modeli ve sanal kamera görüntüleri', 'components/RobotCameraFeeds.js', '/docs#ur10e')]),

  topic('sensingcam', 'SICK sensingCam SEC100 · Hücreyi izleme', 'Algılama ve kontrol', 'sensingcam',
    ['sec100', 'sensingcam', 'geniş açı', 'uzaktan izleme', 'streaming kamera', 'kayıt kamerası'],
    'SICK sensingCam SEC100, deney hücresinin tamamını izleyen endüstriyel bir yayın kamerasıdır. Robot üzerindeki derinlik kamerasından farklı olarak, genel süreç izleme için kullanılır.',
    'Sergiye eklenen bağımsız tanıtım modeli üzerinde kamera gövdesini, lensi, montaj ayağını ve Ethernet bağlantı tarafını yakından görebilirsiniz. Bu model SEC100 için üretici CAD dosyası değildir. Altyapı açıklamasında tüm hücreyi izleme, deney kaydı ve tarayıcıdan erişim belirtilir; bu sitede fiziksel kamera yayınına bağlanılmaz.',
    ['Hücrenin tamamını gören bir izleme açısı seçilir.', 'Deney süreci uzaktan gözlemlenir veya kayıt altına alınır.', 'Kayıtlar hata analizi ve veri toplama çalışmalarında kullanılabilir.'],
    ['Uzaktan süreç izleme', 'Deney kaydı', 'Hata analizi', 'Yapay zekâ için veri toplama'], [BRIEF], false),

  topic('linear-axis', 'Festo tahrikli doğrusal yedinci eksen', 'Robotlar ve araçlar', 'rail',
    ['yedinci eksen', '7 eksen', '7. eksen', '7th axis', 'linear axis', 'doğrusal eksen', 'festo', 'modbus', 'ray'],
    'UR10e, doğrusal yedinci eksen üzerinde hareket ederek sabit bir robot tabanına göre daha geniş bir deney alanına ulaşır. Robot kolu ve taşıyıcı birlikte değerlendirilir.',
    'Paylaşılan fiziksel altyapı açıklamasında Festo sürücü ve motoru ile Modbus iletişimi belirtilir. Dijital ikizde taşıyıcı ray üzerinde hareket eder; ilk hücre için ray konumu canlı veri akışından veya elle kontrolden de alınabilir. Modbus bağlantısı tarayıcı tarafından doğrudan yönetilmez.',
    ['Taşıyıcı iş parçasının bulunduğu istasyona ilerler.', 'Kol, istasyon çevresindeki alma veya kontrol hareketini yapar.', 'Sonraki bölgeye geçerken ray ve kolun görev sırası korunur.'],
    ['Genişletilmiş çalışma alanı', 'Robot destekli tarama', 'Malzeme taşıma', 'Al ve yerleştir'],
    [BRIEF, source('Doğrusal taşıyıcı ve görev hareketleri', 'components/UR10eMount.js', '/docs#ur10e')]),

  topic('conveyor', 'Konveyör bant sistemi', 'Robotlar ve araçlar', 'conveyor',
    ['konveyör', 'conveyor', 'bant', 'üretim hattı', 'hat besleme', 'analog', 'dijital iletişim'],
    'Konveyör, hareket eden iş parçalarıyla robotun etkileşimini incelemek için kullanılan malzeme taşıma ortamıdır. UR10e ile birlikte endüstriyel hat besleme senaryosunu oluşturur.',
    'Altyapı açıklamasında analog ve dijital haberleşme üzerinden eşgüdüm belirtilir. Sahnedeki görev programlarında kutu veya montaj parçası banttan alma noktasına gelir ve robot onu işleme alanına taşır. Böylece besleme, kavrama, taşıma ve bırakma adımlarının ilişkisi görülebilir.',
    ['Parça bandın girişinden alma bölgesine taşınır.', 'Robotun alma hareketi parçanın konumuyla eşleştirilir.', 'Yeni parça geldiğinde işlem çevrimi tekrar eder.'],
    ['Otomatik malzeme besleme', 'Robot koordinasyonu', 'Algılama', 'İnsan–robot iş birliği'],
    [BRIEF, source('Konveyör ve hücre görevleri', 'components/IfarlabTasks.js')]),

  topic('kawasaki', 'Kawasaki RS005L ve OTA AGV', 'Robotlar ve araçlar', 'kawasaki',
    ['kawasaki', 'rs005l', 'ota', 'agv', 'mobil robot', 'şasi', 'chassis', 'schunk', 'egp50', 'egp 50'],
    'Kawasaki RS005L, OTA mobil tabanı üzerinde bulunan ikinci robot platformudur. Dijital ikizde taban, zemin rayı boyunca ilerleyerek kolu şasinin farklı kontrol bölgelerine taşır.',
    'İlk hücrenin programında robot önce şasinin dışına yaklaşır, dış yüzeyi tarar, üst açıklıktan içeri girer ve iç bölgeyi inceledikten sonra geri çekilir. Robot, taban ve tutucu geometrileri kaynak model parçalarından oluşturulmuştur. Diğer hücrelerde bu platform vidalama ve çift yüzey kontrolünü tamamlayan görevler üstlenir.',
    ['AGV üzerindeki kol kontrol istasyonuna yanaşır.', 'Dış yüzeyden başlayarak şasinin erişilebilir iç bölgesini tarar.', 'Kontrol tamamlandığında kol geri çekilir ve yeni bölgeye geçer.'],
    ['Mobil manipülasyon', 'Şasi kontrolü', 'İç hacim incelemesi', 'Çift robotlu üretim'],
    [source('Kawasaki ve şasi kontrol programı', 'components/IfarlabTasks.js', '/docs#kawasaki')]),

  topic('screwdriving', 'Hücre 2 · Robotik vidalama', 'Üretim senaryoları', 'screwdriving',
    ['vidalama', 'screwdriving', 'screwdriver', 'vida besleyici', 'elektrikli tornavida', 'hücre 2', 'cell 2', 'sıkma'],
    'İkinci hücre, elektrikli vidalama aracı, otomatik vida besleyici ve iş parçası ile tekrarlanabilir montajı anlatır. Parça konveyörden çalışma masasına alınır; robot bağlantı noktalarına sırayla vida uygular.',
    'Sahne programında besleyiciden vida alma, deliğe yaklaşma, vidalama ve tamamlanan parçayı kutuya bırakma aşamaları vardır. Operatörün destek verdiği anlar da canlandırılır. Bu gösterim, sıkma kalitesi araştırmasını tanıtır; ekrandaki hareketler ölçülmüş gerçek tork sonuçları değildir.',
    ['Parça banttan alınır ve masaya yerleştirilir.', 'Robot besleyiciden aldığı vidaları bağlantı noktalarına götürür.', 'Vidalama adımları tamamlanınca parça çıkış kutusuna taşınır.'],
    ['Otomatik montaj', 'Vida besleme', 'Görüş destekli konumlandırma', 'İnsan–robot iş birliği'],
    [BRIEF, source('Masa üzeri vidalama senaryosu', 'components/WindowUsecaseTasks.js')]),

  topic('dual-inspection', 'Hücre 3 · İki robotla kapı kontrolü', 'Üretim senaryoları', 'inspection',
    ['dual robot', 'çift robot', 'iki robot', 'çift yüzey', 'dual inspection', 'hücre 3', 'cell 3', 'boşluk', 'hizalama', 'gap', 'flush'],
    'Üçüncü hücrede UR10e ve Kawasaki, kapı düzeneğinin karşılıklı yüzlerini aynı istasyonlarda inceler. İki bakış noktası, dış ve iç yüzeylerin birlikte değerlendirilmesini görünür kılar.',
    'Kodda tarama yolu dört satır ve beş istasyon halinde düzenlenmiştir. Kameralar her noktada hareket eder, kısa süre yerleşir ve yakalama aşamasına geçer. Kapı birleşimindeki istasyon, boşluk ve yüzey hizası kontrolünün nasıl planlandığını anlatır; gerçek ölçüm sonucu ürettiği iddia edilmez.',
    ['İki robot aynı kontrol istasyonuna karşı yüzlerden yaklaşır.', 'Kameralar yerleşir ve yakalama aşaması canlandırılır.', 'Satır değiştirerek kapı boyunca tekrarlanabilir tarama tamamlanır.'],
    ['Çift yüzey kontrolü', 'Çok robot koordinasyonu', 'Boşluk ve yüzey hizası araştırması'],
    [source('Çift robotlu kapı tarama programı', 'components/DualDoorInspectionTasks.js')]),

  topic('door-assembly', 'Hücre 4 · Kapıya parça montajı', 'Üretim senaryoları', 'door',
    ['kapı montaj', 'assembly', 'montaj senaryosu', 'bağlantı parçası', 'kapıya parça', 'hücre 4', 'cell 4', 'fitting'],
    'Dördüncü hücrede bağlantı parçasının konveyörden alınması, araç kapısına konumlandırılması ve vidalanması gösterilir. Burada iş parçası masa üzerinde değil, kapı üzerindeki montaj bölgesindedir.',
    'UR10e montaj ve vidalama adımlarını yürütürken Kawasaki kontrol göreviyle süreci tamamlar. Operatörün destek hareketleri görev programıyla eşleştirilmiştir. Böylece aynı robot altyapısının bir taşıma hücresinden daha karmaşık montaj senaryosuna nasıl dönüştürüldüğü görülebilir.',
    ['Bağlantı parçası konveyörden alınır.', 'Kapı üzerindeki montaj noktasına taşınır ve yerleştirilir.', 'Vidalar uygulanır; robot kontrol ve geri çekilme aşamasına geçer.'],
    ['Otomotiv montajı', 'Robotik vidalama', 'Operatör destekli üretim', 'Süreç kontrolü'],
    [source('Kapı üzerinde montaj senaryosu', 'components/DoorFasteningTasks.js')]),

  topic('door-panels', 'Fiat Doblo kapı panelleri ve kusur araştırması', 'Algılama ve kontrol', 'inspection',
    ['fiat', 'doblo', 'sac', 'kapı paneli', 'yüzey kusuru', 'kusur tespiti', 'defect', 'veri seti', 'dataset'],
    'Paylaşılan laboratuvar tanıtımında gerçek Fiat Doblo sac kapı panelleri, otomotiv kalite kontrolü için deney parçaları olarak kullanılır. Bilinen yüzey kusurları, yöntemlerin gerçekçi örnekler üzerinde değerlendirilmesini sağlar.',
    'UR10e ve doğrusal eksen, kameranın kontrollü yörüngelerde taşınmasına; bu da görüntü veri seti toplama ve kusur tespiti deneylerine olanak verir. Sahnede kapı kontrolüne ait CAD düzeneği gösterilir. Buradaki modelin tanıtımdaki Fiat Doblo paneliyle aynı parça olduğu doğrulanmış değildir.',
    ['Bilinen kusurları olan deney parçaları hazırlanır.', 'Robot farklı bölgeleri planlı kamera yörüngeleriyle tarar.', 'Görüntüler algılama yöntemlerinin geliştirilmesi ve değerlendirilmesi için kullanılır.'],
    ['Otomotiv kalite kontrolü', 'Yüzey kusuru algılama', 'Görüntü veri seti toplama'],
    [BRIEF, source('Sahnedeki kapı CAD düzeneği', 'components/WindowPlatform.js')], false),

  topic('busInspection', 'Otobüs gövde kontrolü', 'Otobüs kontrolü', 'busInspection',
    ['otobüs gövde', 'bus body', 'portal', 'gantry', 'gövde kontrol'],
    'Bu hücrede otobüs gövdesi ve iki beş eksenli portal robot bulunur. Her robot kendi paralel rayı üzerinde çalışır; gövde iki rayın arasındadır.',
    'Her robotta üç doğrusal ve iki döner eksen, kamera başlığını hedef yüzeye taşır. Eksen hareketleri, kaynak hız ve ivme değerlerinden oluşturulan eşzamanlı hareket profilleriyle canlandırılır. Güncel programın aktif taramaları birinci robotta alt gövde, ikinci robotta tavan üzerindedir. Gövde kontrol hareketleri simülasyondur.',
    ['Ray ekseni robotu gövde boyunca taşır.', 'Kol ve döner bilek kamerayı kontrol yüzeyine yönlendirir.', 'İki portal, farklı bölgelerdeki tarama görevlerini yürütür.'],
    ['Otobüs gövde kontrolü', 'Çok eksenli hareket', 'Kamera yörüngesi incelemesi', 'Dijital devreye alma araştırması'],
    [source('Gövde kontrol hücresi', 'Inspection cell', '/docs#inspection-cell'), source('Gövde kontrol hareket profilleri', 'Inspection motion profiles')]),

  topic('underbody', 'R1 · Alt gövde taraması', 'Otobüs kontrolü', 'underbody',
    ['r1', 'alt gövde', 'alt takım', 'underbody', 'floor pan', 'robot 1', 'taban tarama'],
    'Birinci portal robot, otobüsün tabanının altına uzanarak alt gövde taramasını gösterir. Kol alçak konuma gelir ve kamera yukarı bakacak şekilde yönlendirilir.',
    'Robot gövde boyunca hareket ederken tarama ışınları, ilerleme ve örnek bulgu işaretleri görevi görünür kılar. Bunlar sunum için üretilen simülasyon geri bildirimleridir; gerçek araçta ölçülmüş hata veya üretim kabul sonucu olarak değerlendirilmez. Bu açı, kamera ile taban arasındaki ilişkiyi yandan görmenizi sağlar.',
    ['Kol tabanın altına kontrollü biçimde uzanır.', 'Kamera yukarı yönelir; ray üzerinde tarama hareketi başlar.', 'Görsel ilerleme ve bulgu işaretleri kontrol sürecini anlatır.'],
    ['Alt gövde erişimi', 'Robotik görsel kontrol', 'Yörünge değerlendirmesi'],
    [source('R1 tarama görevi', 'Inspection motion profiles', '/docs#inspection-cell'), source('Tarama geri bildirimleri', 'components/BodyInspection.js')]),

  topic('roof', 'R2 · Tavan taraması', 'Otobüs kontrolü', 'roof',
    ['r2', 'tavan', 'roof', 'robot 2', 'kabin', 'tavan tarama'],
    'İkinci portal robot pencere bandından kabin içine uzanır ve kamerayı iç tavan yüzeyine çevirir. Böylece dışarıdan erişimi zor bir bölge için robot destekli kontrol senaryosu gösterilir.',
    'Programda kamera yön değiştirme, yükselme ve tavan üzerinde halka biçimli tarama hareketleri bulunur. Kamera başlığında Basler ace, Intel RealSense D455 ve SICK DT35 bileşenleri proje tanıtımında listelenir. Ekrandaki tarama ve bulgu çizimleri bu bileşenlerden alınan gerçek ölçüm verileri değildir.',
    ['Robot kolu pencere bandındaki girişten içeri yönlenir.', 'Kamera başlığı yukarı dönerek tavanı hedefler.', 'Yükselme ve tarama hareketleriyle tavan kontrolü canlandırılır.'],
    ['İç tavan kontrolü', 'Dar alana robot erişimi', 'Çoklu sensörlü kontrol araştırması'],
    [source('R2 tavan tarama programı', 'Inspection motion profiles', '/docs#inspection-cell'), source('Kamera başlığı bileşenleri', 'components/robotDetails.js')]),

  topic('buses', 'Otobüsler ve fabrika lojistiği', 'Otobüs kontrolü', 'buses',
    ['otobüsler', 'otobüs', 'bus', 'buses', 'park', 'servis', 'lojistik', 'forklift', 'drone', 'temizlik', 'fabrika'],
    'Fabrikadaki tamamlanmış otobüs modelleri, gövde kontrol hücresindeki mühendislik CAD modelinden ayrı sunum araçlarıdır. İki otobüs park cepleri arasında hareket eden bir lojistik canlandırmasıyla ortamı tamamlar.',
    'Yaya yolları, güvenlik işaretleri, operatörler, forklift, temizlik aracı ve drone gibi öğeler fabrika bağlamını anlaşılır kılar. Bu hareketli dekorasyon gerçek filo takibi veya otonom sevkiyat kontrolü değildir. Görsel yükü azaltmak için VR görünümünde bazı çevre öğeleri gösterilmeyebilir.',
    ['Park cepleri ve araçların hareket güzergâhı izlenir.', 'Yaya alanları ile üretim alanlarının yerleşimi incelenir.', 'Sunum otobüsleri ile kontrol edilen çıplak gövdenin farklı amaçları karşılaştırılır.'],
    ['Fabrika tanıtımı', 'Lojistik akışın görselleştirilmesi', 'Mekânsal farkındalık'],
    [source('Otobüs rotaları ve fabrika ortamı', 'components/BusShuttle.js')]),

  topic('digital-twin', 'Dijital ikiz · Canlı veri ve simülasyon', 'Dijital ikiz ve XR', 'pickPlace',
    ['dijital ikiz', 'digital twin', 'telemetri', 'telemetry', 'canlı', 'live', 'mongo', 'sse', 'simülasyon', 'neler geliştirildi', 'nasıl yapıldı', 'yapay zeka', 'ai'],
    'Bu dijital ikiz; üç boyutlu modelleri, robot kinematiğini, görev programlarını ve canlı veri görünümünü aynı tarayıcı ortamında birleştirir. Fiziksel sistem ile sanal temsil arasındaki ilişkiyi incelemeyi amaçlar.',
    'İlk IFARLAB hücresindeki UR10e ve Kawasaki eklemleri, sunucu üzerinden MongoDB verisinden beslenebilir. Demo açıkken görev canlandırması önceliklidir; demo kapatılınca mevcut canlı eklem verileri uygulanır. Diğer hücrelerin görevleri ve gövde kontrol hareketleri programlı simülasyondur. Kusur işaretleri gerçek bir yapay zekâ modelinin ölçülmüş çıktıları olarak sunulmaz.',
    ['Kaynak CAD ve robot tanımları etkileşimli sahneye dönüştürülür.', 'Görevler, kontroller ve sanal kamera görüntüleri bir araya getirilir.', 'Canlı bağlantı durumu ile demo ve elle kontrol ayrımı ekrandan izlenir.'],
    ['Sistem davranışı inceleme', 'Tekrarlanabilir deney', 'Doğrulama ve geçerleme', 'Eğitim'],
    [BRIEF, source('Telemetri ve demo önceliği', 'pages/DigitalTwin.js', '/docs')]),

  topic('vr', 'VR · Uygulamalı robot ve güvenlik eğitimi', 'Dijital ikiz ve XR', 'training',
    ['vr', 'xr', 'sanal gerçeklik', 'extended reality', 'quest', 'eğitim', 'training', 'acil durdurma', 'baret', 'güvenlik'],
    'Uyumlu bir VR başlığıyla fabrikayı içeriden gezebilir ve uygulamalı eğitim istasyonlarına katılabilirsiniz. Masaüstündeki tanıtım turu, eğitim alanına genel bir bakış sunar; etkileşimli istasyonlar başlık oturumunda açılır.',
    'Mevcut eğitimler; robot kolunu parçalardan birleştirme, al ve yerleştir, acil durdurma, kişisel koruyucu ekipman kullanımı ve vidalama görevlerini kapsar. Bir eğitim sürerken diğerleri bekler. Başlıkta kamera hareketi kullanıcının baş ve yürüme hareketine bırakılır; otomatik masaüstü turu VR oturumunda durur.',
    ['Uyumlu cihazda VR oturumu başlatılır.', 'Bir eğitim istasyonu seçilir ve yönlendirmeler takip edilir.', 'Görev tamamlandıktan sonra diğer istasyona geçilebilir.'],
    ['Endüstriyel eğitim', 'İnsan–sistem etkileşimi', 'Güvenlik farkındalığı', 'Montaj pratiği'],
    [BRIEF, source('Uygulamalı VR eğitim istasyonları', 'components/training/TrainingStations.js', '/vr')]),
];

export const TOPIC_BY_ID = Object.fromEntries(GUIDE_TOPICS.map((item) => [item.id, item]));
// Additional shots follow the explanation instead of repeating one cell view.
export const TOPIC_SHOT_PLANS = {
  welcome: [{ sentence: 0, shot: 'equipment', label: 'Üretim hücresi' }, { sentence: 1, shot: 'equipment', label: 'Robot araçları ve kameralar' }, { sentence: 2, shot: 'busInspection', label: 'Otobüs kontrol alanı' }],
  'digital-twin': [{ sentence: 0, shot: 'monitoring', label: 'Canlı robot izleme alanı' }],
  'pick-place': [{ sentence: 0, shot: 'pickPlace', label: 'Al ve yerleştir hücresi' }, { sentence: 1, shot: 'robotGripper', label: 'Tutucu yakın plan' }, { sentence: 2, shot: 'pickWorkpiece', label: 'Parça taşıma' }],
  screwdriving: [{ sentence: 0, shot: 'screwdriving', label: 'Vidalama hücresi' }, { sentence: 1, shot: 'screwdriver', label: 'Vida ucu yakın plan' }],
  'door-assembly': [{ sentence: 0, shot: 'door', label: 'Kapı montajı' }, { sentence: 1, shot: 'assemblyTool', label: 'Montaj ucu' }, { sentence: 2, shot: 'doorPanel', label: 'Bağlantı noktası' }],
  'dual-inspection': [{ sentence: 0, shot: 'inspection', label: 'İki robotla kontrol' }, { sentence: 1, shot: 'inspectionTool', label: 'UR10e kamera' }, { sentence: 2, shot: 'inspectionOtherTool', label: 'Kawasaki kamera' }],
  busInspection: [{ sentence: 0, shot: 'busInspection', label: 'Otobüs ve robotlar' }, { sentence: 1, shot: 'underbodyHead', label: 'Alt gövde robotu' }, { sentence: 2, shot: 'roofHead', label: 'Tavan robotu' }],
  underbody: [{ sentence: 0, shot: 'underbody', label: 'Alt gövde taraması · genel' }, { sentence: 2, shot: 'underbodyHead', label: 'R1 kamera başlığı · yakın plan' }, { sentence: 3, shot: 'underbody', label: 'Tarama yolu ve gövde ilişkisi' }],
  roof: [{ sentence: 0, shot: 'roof', label: 'Tavan taraması · genel' }, { sentence: 2, shot: 'roofHead', label: 'R2 kamera başlığı · yakın plan' }, { sentence: 3, shot: 'busInspectionRear', label: 'Tavan ve portalın karşı görünümü' }],
};
for (const [id, shot] of [['gripper', 'gripper'], ['vacuum', 'vacuum'], ['quick-changer', 'quickChanger'], ['visionary', 'visionary'], ['sensingcam', 'sensingcam']]) {
  TOPIC_SHOT_PLANS[id] = [{ sentence: 0, shot, label: 'Ekipman sergisi · ön detay' }, { sentence: 2, shot: `${shot}Rear`, label: 'Arka yüz ve bağlantılar' }];
}
export const TOUR_STOPS = ['digital-twin', 'pick-place', 'screwdriving', 'dual-inspection', 'door-assembly', 'busInspection'];
export const GUIDE_SUGGESTIONS = [
  'Bu projede neler yapıldı?', 'Otobüs gövdesi nasıl inceleniyor?',
  'Dört hücrenin farkı ne?', 'Hangi kameralar kullanılıyor?',
];
export const narrationFor = (item) => [item.intro, item.detail, ...item.steps].join(' ');
