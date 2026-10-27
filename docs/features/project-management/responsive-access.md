# Member platform screen requirements

The member platform requires a window at least 768 CSS pixels wide. Smaller windows show “Increase your window size” with instructions to widen the window or use a desktop/laptop. Phone user agents and the browser's mobile-device signal show “Use a desktop computer” even when the viewport is wide, including landscape. Tablets without a phone signal can use the platform at supported widths. The gate covers every member route, including sign-in and direct task/project URLs. Public, partner and sponsor applications retain their own interfaces.

An initially blocked visit does not mount sign-in or member data views. A desktop window that becomes too narrow hides and makes the existing workspace inert, then restores it when widened. Already-open forms retain their input. Dialogs, sheets, popovers, selects, dropdown menus and tooltips share a scoped portal container inside the gate, so overlays cannot remain available above the blocking message. Other applications keep the default body portal.

Named assignment/Lead badges and selected-assignee picker badges show only avatars below 1280 CSS pixels. Full identities remain available through avatar labels, hover titles and picker summaries; member-search options and primary member-directory identities keep their names. Unassigned/No leads text remains available when there is no avatar to identify.

This is a frontend compatibility gate. Existing authentication and server authorization continue to govern access. No device-based server access grant or authentication bypass is added.

Validation includes initial blocked routes without authentication/data loading, the 768px boundary, phone landscape/wide windows, mobile signals, preserved draft state, and containment of open dialog/popover portals. Browser checks compared badges at 1366px and 1024px, blocked a 390px window while a project modal and department picker were open, and confirmed the draft and controls returned when widened. The viewport override was reset afterwards.
