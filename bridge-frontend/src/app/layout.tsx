import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/providers/Providers'

export const metadata: Metadata = {
  title: { default: 'InvoiceHub — BTS', template: '%s | InvoiceHub BTS' },
  description: 'Plateforme de facturation Bridge Technologies Solutions — SYSCOHADA',
  icons: { icon: '/logos/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
