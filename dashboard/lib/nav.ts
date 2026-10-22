// The dashboard pages, in pill menu order. One list so the menu and page
// titles never disagree. Coverage and Devices were cut on 14 Oct.
export const navItems = [
  { title: "Overview", url: "/" },
  { title: "Insights", url: "/insights" },
  { title: "Review", url: "/review" },
  { title: "Work orders", url: "/work-orders" },
] as const
