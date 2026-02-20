import type { Metadata } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import Link from 'next/link';
import Stardust from '@/components/Stardust';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });
const orbitron = Orbitron({ 
  subsets: ['latin'],
  weight: ['700', '900'],
  variable: '--font-orbitron',
});

export const metadata: Metadata = {
  title: 'Kyllang — Zero-Knowledge Proof Platform',
  description: 'Generate and verify Zero-Knowledge Proofs',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={orbitron.variable}>
      <body className={inter.className}>
        {/* Stardust Background */}
        <Stardust />
        
        <div className="min-h-screen flex flex-col relative z-10">
          {/* Header */}
          <header className="border-b border-neutral-900 bg-black/50 backdrop-blur-sm">
            <div className="max-w-5xl mx-auto px-6 py-5">
              <div className="flex items-center justify-between">
                <Link href="/" className="group flex items-center gap-2">
                  <span className="text-xl tracking-[0.2em] font-black uppercase text-white group-hover:text-neutral-300 transition-colors" style={{ fontFamily: 'var(--font-orbitron), Orbitron, monospace' }}>
                    KYLLANG
                  </span>
                </Link>
                <nav className="flex items-center space-x-8">
                  <Link href="/" className="text-sm text-neutral-400 hover:text-white transition-colors">generate</Link>
                  <Link href="/verify" className="text-sm text-neutral-400 hover:text-white transition-colors">verify</Link>
                </nav>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1">{children}</main>

          {/* Footer */}
          <footer className="border-t border-neutral-900 bg-black/50 backdrop-blur-sm">
            <div className="max-w-5xl mx-auto px-6 py-6">
              <p className="text-neutral-600 text-xs text-center tracking-widest uppercase" style={{ fontFamily: 'var(--font-orbitron), Orbitron, monospace' }}>
                kyllang · zero-knowledge proof platform
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
