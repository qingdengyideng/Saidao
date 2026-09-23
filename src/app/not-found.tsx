import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-5xl font-bold">404</h1>
      <p>页面不存在</p>
      <Link href="/" className="text-accent underline">
        回主页
      </Link>
    </main>
  );
}
