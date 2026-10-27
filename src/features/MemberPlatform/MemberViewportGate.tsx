import { useEffect, useState, type ReactNode } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { PortalContainerContext } from "@libs/components/ui/portal-container";

export const MIN_MEMBER_VIEWPORT_WIDTH = 768;

export function isPhoneDevice(
  device: Pick<Navigator, "userAgent"> & { userAgentData?: { mobile?: boolean } } = navigator,
): boolean {
  return (
    device.userAgentData?.mobile === true ||
    /iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|Opera Mini/i.test(device.userAgent)
  );
}

export function MemberViewportGate({ children }: { children: ReactNode }) {
  const [phone] = useState(isPhoneDevice);
  const [viewport, setViewport] = useState(() => ({
    narrow: window.innerWidth < MIN_MEMBER_VIEWPORT_WIDTH,
    opened: !phone && window.innerWidth >= MIN_MEMBER_VIEWPORT_WIDTH,
  }));
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const blocked = phone || viewport.narrow;
  useEffect(() => {
    function resize() {
      const narrow = window.innerWidth < MIN_MEMBER_VIEWPORT_WIDTH;
      setViewport((previous) =>
        previous.narrow === narrow
          ? previous
          : { narrow, opened: previous.opened || (!phone && !narrow) },
      );
    }
    window.addEventListener("resize", resize);
    resize();
    return () => window.removeEventListener("resize", resize);
  }, [phone]);

  return (
    <div className="member-platform portal-root min-h-svh">
      <div
        ref={setContainer}
        data-member-viewport-content
        hidden={blocked}
        inert={blocked}
        className="contents"
        style={blocked ? { display: "none" } : undefined}
      >
        {container && viewport.opened && (
          <PortalContainerContext.Provider value={container}>
            {children}
          </PortalContainerContext.Provider>
        )}
      </div>
      {blocked && (
        <main
          className="grid min-h-svh place-items-center p-6"
          aria-labelledby="member-screen-title"
          style={{ pointerEvents: "auto" }}
        >
          <Empty className="max-w-lg border border-solid bg-card p-8">
            <EmptyHeader>
              <EmptyTitle>
                <h1 id="member-screen-title">
                  {phone ? "Use a desktop computer" : "Increase your window size"}
                </h1>
              </EmptyTitle>
              <EmptyDescription>
                {phone
                  ? "Open the member platform on a desktop or laptop to continue."
                  : "Make this window wider to continue, or open the member platform on a desktop or laptop."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </main>
      )}
    </div>
  );
}
