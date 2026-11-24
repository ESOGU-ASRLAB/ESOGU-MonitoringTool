import { useGLTF } from '@react-three/drei';

// drei shares one Draco loader. A useGLTF/preload call without a custom path
// otherwise changes it back to Google's CDN, even after Otokar supplied the
// local path. Run this module before any scene module starts its preloads.
useGLTF.setDecoderPath(`${process.env.PUBLIC_URL}/draco/`);
