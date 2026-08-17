"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InboxPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/pipelines");
  }, [router]);

  return (
    <div className="flex h-[70vh] items-center justify-center text-muted-foreground text-sm">
      Redirecting to CRM Pipelines...
    </div>
  );
}
