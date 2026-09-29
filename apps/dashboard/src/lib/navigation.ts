/** The rail's sections, shared by server pages and the client sidebar. */
export const NAV = [
  { id: "overview", label: "Overview", href: "/" },
  { id: "orders", label: "Orders", href: "/orders" },
  { id: "products", label: "Products", href: "/products" },
  { id: "production", label: "Production", href: "/production" },
  { id: "materials", label: "Materials", href: "/materials" },
  { id: "printers", label: "Printers", href: "/printers" },
  { id: "customers", label: "Customers", href: "/customers" },
  { id: "newsletter", label: "Newsletter", href: "/newsletter" },
  { id: "operations", label: "Operations", href: "/operations" },
  { id: "settings", label: "Settings", href: "/settings" },
  { id: "connections", label: "Connections", href: "/connections" },
] as const;

export type NavId = (typeof NAV)[number]["id"];
