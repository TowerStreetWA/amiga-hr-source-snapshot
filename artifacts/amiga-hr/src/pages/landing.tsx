import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import amigaLogo from "@/assets/amiga-logo.png";

export function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#000033] text-white">
      {/* Soft gold glow accents */}
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-[#C5A059]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-[#C5A059]/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <motion.img
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          src={amigaLogo}
          alt="Amiga Specialty"
          className="h-12 object-contain"
        />

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mt-10 font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
        >
          The HR platform for
          <br />
          <span className="text-[#C5A059]">Amiga Specialty</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-5 max-w-md text-base leading-relaxed text-white/70"
        >
          Manage the full employee lifecycle — hiring, onboarding, leave, pay and
          benefits — in one polished, secure workspace.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-10 flex flex-col items-center gap-4"
        >
          <Button
            onClick={() => setLocation("/sign-in")}
            className="h-12 gap-2 bg-[#C5A059] px-8 text-base font-semibold text-[#000033] hover:bg-[#a8873f]"
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Button>

          <button
            type="button"
            onClick={() => setLocation("/apply")}
            className="text-sm text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            Looking for a role? View open positions
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-16 flex items-center gap-2 text-xs text-white/40"
        >
          <ShieldCheck className="h-4 w-4 text-[#C5A059]/70" />
          Secure access for Amiga Specialty staff only
        </motion.div>
      </div>
    </div>
  );
}
