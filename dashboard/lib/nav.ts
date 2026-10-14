// The dashboard pages, in sidebar order. One list so the sidebar and page
// titles never disagree.
export const navItems = [
  { title: "Overview", url: "/" },
  { title: "Review", url: "/review" },
  { title: "Work orders", url: "/work-orders" },
  { title: "Devices", url: "/devices" },
  { title: "Coverage", url: "/coverage" },
] as const
