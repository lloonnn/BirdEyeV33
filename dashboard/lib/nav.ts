// The dashboard pages, in pill menu order (brief section 4). One list so the
// menu and page titles never disagree.
export const navItems = [
  { title: "Overview", url: "/" },
  { title: "Review", url: "/review" },
  { title: "Work orders", url: "/work-orders" },
  { title: "Coverage", url: "/coverage" },
  { title: "Devices", url: "/devices" },
] as const
