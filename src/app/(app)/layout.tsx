import { AppHeader } from "@/components/app/app-header";
import { EncryptionProvider } from "@/components/encryption/encryption-provider";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <EncryptionProvider>
      <AppHeader />
      {/* On phones the bottom tab bar covers the end of the page, so leave room for it. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 md:pb-12">
        {children}
      </main>
    </EncryptionProvider>
  );
}
