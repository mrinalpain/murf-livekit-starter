import { Public_Sans } from 'next/font/google';
import localFont from 'next/font/local';
import { headers } from 'next/headers';
import { ThemeProvider } from '@/components/app/theme-provider';
import { ThemeToggle } from '@/components/app/theme-toggle';
import { cn } from '@/lib/shadcn/utils';
import { getAppConfig, getStyles } from '@/lib/utils';
import '@/styles/globals.css';

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
});

const commitMono = localFont({
  display: 'swap',
  variable: '--font-commit-mono',
  src: [
    {
      path: '../fonts/CommitMono-400-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/CommitMono-700-Regular.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../fonts/CommitMono-400-Italic.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../fonts/CommitMono-700-Italic.otf',
      weight: '700',
      style: 'italic',
    },
  ],
});

interface RootLayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);
  const styles = getStyles(appConfig);
  const { pageTitle, pageDescription, companyName, logo, logoDark } = appConfig;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        publicSans.variable,
        commitMono.variable,
        'scroll-smooth font-sans antialiased'
      )}
    >
      <head>
        {styles && <style>{styles}</style>}
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
      </head>
      <body className="h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans antialiased selection:bg-teal-500 selection:text-white transition-colors duration-300">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Top Integrated Navigation Header */}
          <header className="fixed top-0 left-0 z-50 w-full flex flex-row items-center justify-between px-4 sm:px-8 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-teal-100/80 dark:border-teal-500/20 shadow-xs dark:shadow-teal-950/20 transition-colors duration-300">
            {/* Left Brand Identifier */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-9 sm:size-10 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 dark:from-teal-500 dark:to-emerald-400 text-white dark:text-slate-950 font-black shadow-md shadow-teal-700/20 dark:shadow-[0_0_15px_rgba(20,184,166,0.4)]">
                <svg className="size-5 sm:size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-black tracking-tight text-teal-950 dark:bg-gradient-to-r dark:from-white dark:via-teal-100 dark:to-emerald-300 dark:bg-clip-text dark:text-transparent">
                    Swasthya Sathi
                  </span>
                  <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 px-2 py-0.5 rounded-full border border-teal-200/80 dark:border-teal-500/30 uppercase tracking-wider">
                    <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-teal-400 animate-pulse"></span>
                    Voice Companion
                  </span>
                </div>
                <span className="hidden sm:inline-block text-[11px] font-medium text-teal-800/80 dark:text-teal-300/70">
                  Your voice companion for everyday health
                </span>
              </div>
            </div>

            {/* Center Supported Languages */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-teal-800 dark:text-teal-200 bg-teal-50/90 dark:bg-slate-800/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-teal-200/80 dark:border-teal-500/30 shadow-2xs">
              <span className="size-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping"></span>
              <span>English • हिंदी • বাংলা</span>
            </div>

            {/* Right Theme Switcher */}
            <div className="flex items-center gap-2">
              <ThemeToggle className="w-auto px-2 py-1 bg-teal-50/80 dark:bg-slate-900/90 border-teal-200/80 dark:border-teal-500/30 shadow-2xs" />
            </div>
          </header>

          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
