import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <title>IUTA - Control de Asistencia</title>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  function removeBis(el) {
                    if (!el || el.nodeType !== 1) return;
                    if (el.hasAttribute && el.hasAttribute('bis_skin_checked')) {
                      el.removeAttribute('bis_skin_checked');
                    }
                    var children = el.children;
                    if (children) {
                      for (var i = 0; i < children.length; i++) {
                        removeBis(children[i]);
                      }
                    }
                  }

                  var observer = new MutationObserver(function(mutations) {
                    for (var i = 0; i < mutations.length; i++) {
                      var m = mutations[i];
                      if (m.type === 'attributes' && m.attributeName === 'bis_skin_checked' && m.target && m.target.hasAttribute && m.target.hasAttribute('bis_skin_checked')) {
                        m.target.removeAttribute('bis_skin_checked');
                      } else if (m.type === 'childList') {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                          removeBis(m.addedNodes[j]);
                        }
                      }
                    }
                  });

                  observer.observe(document.documentElement, {
                    attributes: true,
                    childList: true,
                    subtree: true,
                    attributeFilter: ['bis_skin_checked']
                  });
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased bg-slate-950 text-slate-100" suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
