"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePlanButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/plans/${planId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/plans");
      router.refresh();
    } else {
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-white/30 transition-colors hover:text-red-300"
      >
        刪除行程
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-white/50">確定刪除？</span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="font-medium text-red-300 hover:text-red-200"
      >
        {deleting ? "刪除中..." : "確定"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-white/40 hover:text-white/70">
        取消
      </button>
    </span>
  );
}
