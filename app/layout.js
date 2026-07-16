import "./globals.css";

export const metadata = {
  title: "Dubai Shopping Database",
  description: "Personal product catalog with prices, stores, and Claude-written comparisons.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/" className="brand">Dubai Shopping DB</a>
          <nav>
            <a href="/">Products</a>
            <a href="/add">Add product</a>
            <a href="/comparisons">Comparisons</a>
            <a href="/canvas">Canvas</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
