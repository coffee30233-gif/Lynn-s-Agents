import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink-950 px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold text-white">Lynn&rsquo;s Agents</h1>
        <p className="mt-2 text-center text-sm text-white/50">Think with anyone. Do anything.</p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
