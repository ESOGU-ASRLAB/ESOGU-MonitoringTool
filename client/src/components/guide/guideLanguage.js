export const GUIDE_UI = {
  en: {
    guide: 'Digital Twin Assistant', autoTour: 'Guided tour', ask: 'Ask', explore: 'Explore', topics: 'Topics',
    close: 'Close assistant', closeTour: 'Close tour', tour: 'Guided tour', progress: 'Tour progress',
    previous: 'Previous topic', next: 'Next topic', pause: 'Pause', resume: 'Resume', replay: 'Replay',
    mute: 'Mute', unmute: 'Unmute', settings: 'Tour settings', moving: 'Moving to the next view…',
    movingPaused: 'Camera paused.', complete: 'Tour complete. Explore another topic or ask a question.',
    vrComplete: 'Tour complete. You can walk around the factory.',
    focusComplete: 'Want to explore another topic?', returnTour: 'Back to tour', paused: 'Tour paused.',
    camera: 'Camera view', auto: 'Auto', closeUp: 'Close-up', cell: 'Workcell', exhibit: 'Exhibit',
    speed: 'Speed', slow: 'Slow', normal: 'Normal', fast: 'Fast', faster: 'Faster',
    noSpeech: 'Audio is unavailable. The tour continues with captions.',
    noVoice: 'No English voice is installed. Captions remain available.',
    welcome: 'What would you like to explore?', welcomeText: 'Discover the robots, tools and bus inspection cells.',
    show: 'Show in 3D', details: 'More details', sources: 'Based on', more: 'Show more topics', less: 'Show fewer',
    placeholder: 'Ask about a robot or process…', search: 'Find a topic…', empty: 'No matching topics.',
    reference: 'Illustrative display model', projectMesh: 'Project model', tracking: 'Following the tool',
    suggestions: ['What happens in the four cells?', 'How is the bus body inspected?', 'Show the pick and place process'],
  },
  tr: {
    guide: 'Dijital İkiz Asistanı', autoTour: 'Rehberli tur', ask: 'Sor', explore: 'Keşfet', topics: 'Konular',
    close: 'Asistanı kapat', closeTour: 'Anlatımı kapat', tour: 'Sesli tanıtım turu', progress: 'Tur ilerlemesi',
    previous: 'Önceki konu', next: 'Sonraki konu', pause: 'Duraklat', resume: 'Devam et', replay: 'Yeniden anlat',
    mute: 'Sesi kapat', unmute: 'Sesi aç', settings: 'Anlatım ayarları', moving: 'Yeni görünüme geçiliyor…',
    movingPaused: 'Kamera duraklatıldı.', complete: 'Tur tamamlandı. Başka bir konu seçebilir veya soru sorabilirsiniz.',
    vrComplete: 'Tur tamamlandı. Fabrikada serbestçe gezebilirsiniz.',
    focusComplete: 'Başka bir konuyu keşfedelim mi?', returnTour: 'Tura dön', paused: 'Tur duraklatıldı.',
    camera: 'Kamera görünümü', auto: 'Otomatik', closeUp: 'Yakın plan', cell: 'Hücre', exhibit: 'Sergi',
    speed: 'Hız', slow: 'Yavaş', normal: 'Normal', fast: 'Hızlı', faster: 'Daha hızlı',
    noSpeech: 'Seslendirme kullanılamıyor. Tur altyazıyla devam ediyor.',
    noVoice: 'Cihazda Türkçe ses bulunamadı. Altyazıyla devam edebilirsiniz.',
    welcome: 'Neyi keşfetmek istersiniz?', welcomeText: 'Robotları, araçları ve otobüs kontrol hücresini tanıyın.',
    show: '3D sahnede göster', details: 'Daha fazla bilgi', sources: 'Bilgi kaynakları', more: 'Diğer konuları göster', less: 'Daha az göster',
    placeholder: 'Bir robot veya süreç hakkında sorun…', search: 'Konu ara…', empty: 'Eşleşen konu bulunamadı.',
    reference: 'Temsili tanıtım modeli', projectMesh: 'Proje modeli', tracking: 'Hareketli araç takibi',
    suggestions: ['Dört hücrede neler yapılıyor?', 'Otobüs gövdesi nasıl inceleniyor?', 'Parça taşıma sürecini göster'],
  },
};

const SHOT_LABELS = {
  overview: 'Factory overview', equipment: 'Equipment exhibit', ur10e: 'UR10e robot', rail: 'Linear axis',
  conveyor: 'Conveyor', kawasaki: 'Kawasaki and chassis', busInspection: 'Bus inspection cell', busInspectionRear: 'Bus inspection · opposite view',
  underbody: 'Underbody inspection', roof: 'Roof inspection', buses: 'Buses', training: 'Training area',
  pickPlace: 'Cell 1 · full view', pickPlaceRear: 'Cell 1 · opposite view',
  screwdriving: 'Cell 2 · full view', screwdrivingRear: 'Cell 2 · opposite view',
  inspection: 'Cell 3 · full view', inspectionRear: 'Cell 3 · opposite view',
  door: 'Cell 4 · full view', doorRear: 'Cell 4 · opposite view',
  gripper: 'Parallel gripper', vacuum: 'Vacuum gripper', quickChanger: 'Dual Quick Changer',
  visionary: 'SICK Visionary-T Mini', sensingcam: 'SICK sensingCam SEC100',
  robotGripper: 'Moving gripper', robotVisionary: 'Robot-mounted SICK camera', screwdriver: 'Screwdriving tool',
  assemblyTool: 'Assembly tool', inspectionTool: 'UR10e inspection camera', inspectionOtherTool: 'Kawasaki inspection camera',
  assemblyOtherTool: 'Kawasaki assembly inspection', doorPanel: 'Door assembly area', inspectionPanel: 'Door inspection area',
  underbodyHead: 'R1 · camera head', roofHead: 'R2 · camera head',
};
export function guideShotLabel(shot, language, fallback = '') {
  if (language === 'tr') return fallback;
  return SHOT_LABELS[shot] || (shot?.endsWith('Rear') && `${SHOT_LABELS[shot.slice(0, -4)]} · rear view`) || 'Workcell overview';
}
