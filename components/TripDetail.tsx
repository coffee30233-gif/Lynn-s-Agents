"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Trip } from "@/lib/trips/queries";
import { REGION_LABEL, formatDateRange, tripDayCount, tripLengthLabel } from "@/lib/trips/types";
import { TripPlanView } from "./TripPlanView";
import { TripPlanForm, type TripFormValues } from "./TripPlanForm";

/** A saved trip: reads as a plan by default, flips to the editor on 編輯. */
export function TripDetail({ trip }: { trip: Trip }) {
  const router = useRouter();
  const [values, setValues] = useState<TripFormValues>({
    title: trip.title,
    startDate: trip.startDate,
    endDate: trip.endDate,
    plan: trip.plan,
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  async function handleSave(next: TripFormValues) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "儲存失敗，請再試一次");
      setValues(next);
      setEditing(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗，請再試一次");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <TripPlanForm
        initial={values}
        region={trip.region}
        saving={saving}
        error={error}
        onSave={handleSave}
        onCancel={() => {
          setError("");
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{values.title}</h1>
          <p className="mt-1 text-xs text-white/40">
            {trip.destination}
            {trip.country && trip.country !== trip.destination ? `（${trip.country}）` : ""} ·{" "}
            {formatDateRange(values.startDate, values.endDate)} ·{" "}
            {tripLengthLabel(tripDayCount(values.startDate, values.endDate))} · {REGION_LABEL[trip.region]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:text-white"
        >
          ✏️ 編輯
        </button>
      </div>

      {justSaved && <p className="text-sm text-emerald-300/90">✓ 已儲存</p>}

      <TripPlanView plan={values.plan} />
    </div>
  );
}
