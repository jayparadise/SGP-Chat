import "./globals.css";

export const metadata = {
  title: "Narrative Bet Builder",
  description: "Tell the story, get the slip.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
