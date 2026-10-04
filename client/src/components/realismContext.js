import { createContext, useContext } from 'react';

// Whether the realistic look (Realism.js) is on, for scene parts that dress
// differently under it. Provided inside the Canvas by DigitalTwin.
export const RealismContext = createContext(false);
export const useRealism = () => useContext(RealismContext);
