import { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            ConMon Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            FedRAMP Continuous Monitoring
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
