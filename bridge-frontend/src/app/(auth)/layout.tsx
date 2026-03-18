// Auth routes have no sidebar — just the page content
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
