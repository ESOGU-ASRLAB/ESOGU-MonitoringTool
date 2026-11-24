import React, { Suspense } from 'react';
import { SHOWCASE_ITEMS, SHOWCASE_ORIGIN, SHOWCASE_TOP } from './equipmentShowcase';
import { ProjectEquipmentModel, QuickChangerDisplayModel, SensingCamDisplayModel, VacuumDisplayModel } from './EquipmentModels';

// All five pieces remain in the hall. The exhibit never changes a robot's
// installed hardware, and equipment is not swapped in/out between chapters.
export default function GuideReferenceTools({ topicId, onSelect }) {
  return <group name="guide-equipment-gallery" position={SHOWCASE_ORIGIN}>
    <mesh position={[0, .025, 0]} receiveShadow><boxGeometry args={[6.25, .05, 1.05]} /><meshStandardMaterial color="#254555" metalness={.15} roughness={.6} /></mesh>
    {SHOWCASE_ITEMS.map((item) => <group key={item.topic} position={[item.x, 0, 0]} onClick={(event) => { if (event.delta > 4) return; event.stopPropagation(); onSelect?.(item.topic); }}>
      <mesh position={[0, .47, 0]} castShadow receiveShadow><boxGeometry args={[.86, .9, .78]} /><meshStandardMaterial color={topicId === item.topic ? '#247d83' : '#d3dfe3'} metalness={.15} roughness={.44} /></mesh>
      <mesh position={[0, SHOWCASE_TOP, 0]} receiveShadow><boxGeometry args={[.9, .04, .82]} /><meshStandardMaterial color="#233f50" metalness={.55} roughness={.35} /></mesh>
      <Suspense fallback={null}>
        <group name={item.anchor} position={[0, SHOWCASE_TOP + (item.topic === 'vacuum' ? .25 : item.topic === 'quick-changer' ? .115 : .025), 0]}>
          {item.topic === 'gripper' || item.topic === 'visionary' ? <ProjectEquipmentModel kind={item.topic} active={topicId === item.topic} />
            : item.topic === 'vacuum' ? <VacuumDisplayModel />
              : item.topic === 'quick-changer' ? <QuickChangerDisplayModel /> : <SensingCamDisplayModel />}
        </group>
      </Suspense>
    </group>)}
  </group>;
}
