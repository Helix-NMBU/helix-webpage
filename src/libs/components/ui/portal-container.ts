import { createContext, useContext } from "react";

// Scoped surfaces can keep overlays inside their visibility and interaction gate.
// Other applications retain Radix's default body portal.
export const PortalContainerContext = createContext<HTMLElement | undefined>(undefined);
export function usePortalContainer() { return useContext(PortalContainerContext); }
