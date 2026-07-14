import "./globals.css";
import NavLinks from "../lib/NavLinks";
import { Agentation } from "agentation";
import SplashScreen from "./components/SplashScreen";

export const metadata = {
  title: "Dubai Shopping Database",
  description: "Personal product catalog with prices, stores, and Claude-written comparisons.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SplashScreen />
        <div className="topbar-wrap">
          <header className="topbar">
            <a href="/" className="brand">Dubai Shopping DB</a>
            <NavLinks />
          </header>
        </div>
        <main>{children}</main>
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
