import { AppHeader } from "@/components/app/app-header";
import { EncryptionProvider } from "@/components/encryption/encryption-provider";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <EncryptionProvider>
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </EncryptionProvider>
  );
}
