# Internal startup and navigation performance delivery

Approved [specification](spec.md) revision 1. Repository is `Helix-NMBU/helix-webpage`. Parent [HELIX-71](https://linear.app/helixnmbu/issue/HELIX-71/reduce-internal-startup-and-navigation-load) is open in Linear.

GitHub's default branch is `main`. The captured base is `3cf4a25cb2a1a43199e3e54d4fa98d4626a56dd4`. Integration is on `codex/internal-startup-performance` in `/private/tmp/helix-internal-startup-performance`, starting from scope commit `05b5bc3`. The original checkout has unrelated local changes. A separate worktree holds this delivery.

| Ticket | State | Assignment |
| --- | --- | --- |
| HELIX-72 / ISP-01 | Running | `/root/sidebar`, `codex/internal-startup-isp-01`, `/private/tmp/helix-isp-01`, base `05b5bc3` |
| HELIX-73 / ISP-02 | Running | `/root/bundle`, `codex/internal-startup-isp-02`, `/private/tmp/helix-isp-02`, base `05b5bc3` |
| HELIX-74 / ISP-03 | Blocked | Depends on integrated and verified ISP-01 and ISP-02. Linear relations were read back after publication. |

Next, capture the clean baseline while both tickets run. Integrate and verify their commits serially, then verify the combined change. Review and PR are pending.
