import { useClerk, useUser } from "@clerk/react";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import amigaLogo from "@/assets/amiga-logo.png";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function NoAccess() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#000033] px-4 py-10 text-center">
      <img src={amigaLogo} alt="Amiga Specialty" className="h-10 object-contain mb-10" />
      <div className="bg-white rounded-2xl border border-[#e7e3d8] shadow-xl max-w-md w-full p-10">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#C5A059]/10">
          <ShieldAlert className="h-7 w-7 text-[#C5A059]" />
        </div>
        <h1 className="font-serif text-2xl text-[#000033] mb-3">No access yet</h1>
        <p className="text-sm text-[#5b5b6b] leading-relaxed mb-2">
          Your account isn&apos;t linked to an employee record at Amiga Specialty,
          so there&apos;s nothing for you to see here yet.
        </p>
        <p className="text-sm text-[#5b5b6b] leading-relaxed mb-8">
          Please ask your HR administrator to grant you access
          {email ? (
            <>
              {" "}
              for <span className="font-medium text-[#000033]">{email}</span>
            </>
          ) : null}
          .
        </p>
        <Button
          variant="outline"
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          className="border-[#000033]/20 text-[#000033]"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
