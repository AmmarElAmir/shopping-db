import "./globals.css";
import NavLinks from "../lib/NavLinks";

export const metadata = {
  title: "Dubai Shopping Database",
  description: "Personal product catalog with prices, stores, and Claude-written comparisons.",
  // Lets the site be added to the Home Screen as an app, which iPhone and
  // iPad need before they allow push notifications.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Shopping DB", statusBarStyle: "default" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="topbar-wrap">
          <header className="topbar">
            <a href="/" className="brand">Dubai Shopping DB</a>
            <NavLinks />
          </header>
        </div>
        <main>{children}</main>
      </body>
    </html>
  );
}
