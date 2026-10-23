import Link from "next/link";
import { Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found / Halaman tidak ditemui</h1>
      <p className="mt-2 text-ink-soft">The page you are looking for does not exist or has moved.</p>
      <p className="text-ink-soft">Halaman yang anda cari tidak wujud atau telah dipindahkan.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/en" className="text-olive underline">Home</Link>
        <Link href="/ms" className="text-olive underline">Laman utama</Link>
      </div>
    </Container>
  );
}
