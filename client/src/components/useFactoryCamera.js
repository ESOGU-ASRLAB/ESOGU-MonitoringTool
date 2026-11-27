import { useCallback, useEffect, useRef, useState } from 'react';

const angle = (shot, en, tr) => ({ shot, en, tr });
const front = (shot) => angle(shot, 'Workcell', 'Hücre geneli');
const reverse = (shot) => angle(shot, 'Opposite side', 'Karşı açı');

export const FACTORY_CAMERA_VIEWS = [
  { en: 'Factory', tr: 'Fabrika', angles: [
    angle('overview', 'Overview', 'Genel görünüm'),
    angle('tourEnd', 'Production floor', 'Üretim alanı'),
    angle('wallSigns', 'Wall signs', 'Duvar tabelaları'),
  ] },
  { en: 'Live monitoring', tr: 'Canlı izleme', angles: [
    front('monitoring'), reverse('monitoringRear'),
    angle('monitoringGripper', 'UR10e gripper', 'UR10e tutucu'),
    angle('monitoringKawasaki', 'Kawasaki', 'Kawasaki'),
  ] },
  { en: 'Pick & place', tr: 'Al ve yerleştir', angles: [
    front('pickPlace'), reverse('pickPlaceRear'),
    angle('robotGripper', 'Gripper', 'Tutucu'),
    angle('robotVisionary', 'Wrist camera', 'Bilek kamerası'),
  ] },
  { en: 'Screwdriving', tr: 'Vidalama', angles: [
    front('screwdriving'), reverse('screwdrivingRear'),
    angle('screwdriver', 'Driver close-up', 'Vidalama ucu'),
  ] },
  { en: 'Dual inspection', tr: 'Çift robotla kontrol', angles: [
    front('inspection'), reverse('inspectionRear'),
    angle('inspectionTool', 'UR10e camera', 'UR10e kamerası'),
    angle('inspectionOtherTool', 'Kawasaki tool', 'Kawasaki ekipmanı'),
  ] },
  { en: 'Door assembly', tr: 'Kapı montajı', angles: [
    front('door'), reverse('doorRear'),
    angle('assemblyTool', 'Assembly tool', 'Montaj ucu'),
    angle('assemblyOtherTool', 'Kawasaki tool', 'Kawasaki ekipmanı'),
  ] },
  { en: 'Bus inspection', tr: 'Otobüs kontrolü', angles: [
    front('busInspection'), reverse('busInspectionRear'),
    angle('underbodyHead', 'R1 · Underbody', 'R1 · Alt gövde'),
    angle('roofHead', 'R2 · Roof', 'R2 · Tavan'),
  ] },
];

const TOUR_SHOTS = [
  'overview', 'monitoring', 'pickPlace', 'robotGripper', 'screwdriving', 'screwdriver',
  'inspection', 'inspectionRear', 'door', 'assemblyTool', 'busInspection', 'busInspectionRear',
  'underbodyHead', 'roofHead', 'overview',
];
const HOLD_MS = 2300;

export default function useFactoryCamera() {
  const serial = useRef(0);
  const [selection, setSelection] = useState(null);
  const makeSelection = useCallback((shot, tourIndex = null) => ({
    request: { shot, serial: ++serial.current, workspace: true }, tourIndex, arrived: false,
  }), []);

  const select = useCallback((shot) => setSelection(makeSelection(shot)), [makeSelection]);
  const start = useCallback(() => setSelection(makeSelection(TOUR_SHOTS[0], 0)), [makeSelection]);
  const stop = useCallback(() => setSelection(null), []);
  const arrive = useCallback((arrivedSerial, shot) => {
    setSelection((current) => {
      if (current?.tourIndex == null || current.arrived ||
          current.request.serial !== arrivedSerial || current.request.shot !== shot) return current;
      return { ...current, arrived: true };
    });
  }, []);

  useEffect(() => {
    if (selection?.tourIndex == null || !selection.arrived) return;
    const nextIndex = selection.tourIndex + 1;
    const shot = TOUR_SHOTS[nextIndex];
    if (!shot) {
      setSelection((current) => current === selection ? { ...current, tourIndex: null } : current);
      return;
    }

    let timer;
    const schedule = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      timer = setTimeout(() => {
        const next = makeSelection(shot, nextIndex);
        setSelection((current) => current === selection ? next : current);
      }, HOLD_MS);
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [selection, makeSelection]);

  return {
    request: selection?.request ?? null, touring: selection?.tourIndex != null,
    select, start, stop, arrive,
  };
}
