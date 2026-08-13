"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Plan } from "@/lib/plans/queries";
import { stripMarkdown } from "@/lib/text/stripMarkdown";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function PlansCalendar({ plans }: { plans: Plan[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const plansByDate = useMemo(() => {
    const map = new Map<string, Plan[]>();
    for (const plan of plans) {
      if (!plan.eventDate) continue;
      const list = map.get(plan.eventDate) ?? [];
      list.push(plan);
      map.set(plan.eventDate, list);
    }
    return map;
  }, [plans]);

  const unscheduled = plans.filter((p) => !p.eventDate);

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  function goToMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDate(null);
  }

  const selectedPlans = selectedDate ? (plansByDate.get(selectedDate) ?? []) : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-white">
          {year} 年 {month + 1} 月
        </span>
        <button
          type="button"
          onClick={() => goToMonth(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-xs text-white/30">
            {w}
          </div>
        ))}

        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const key = toDateKey(year, month, day);
          const dayPlans = plansByDate.get(key);
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;

          return (
            <button
              key={key}
              type="button"
              onClick={() => dayPlans && setSelectedDate(isSelected ? null : key)}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors ${
                isSelected
                  ? "bg-white text-ink-950"
                  : isToday
                    ? "border border-white/30 text-white"
                    : dayPlans
                      ? "text-white hover:bg-white/10"
                      : "text-white/30"
              }`}
            >
              {day}
              {dayPlans && (
                <span
                  className={`h-1 w-1 rounded-full ${isSelected ? "bg-ink-950" : "bg-amber-400"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-4 flex flex-col gap-2">
          {selectedPlans.map((plan) => (
            <Link
              key={plan.id}
              href={`/plans/${plan.id}`}
              className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
            >
              <span className="text-sm font-medium text-white">{plan.title}</span>
              {plan.location && <span className="text-xs text-white/40">📍 {plan.location}</span>}
            </Link>
          ))}
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="mt-10">
          <p className="mb-2 text-xs uppercase tracking-widest text-white/30">未排定日期</p>
          <ul className="flex flex-col gap-2">
            {unscheduled.map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/plans/${plan.id}`}
                  className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
                >
                  <span className="text-sm font-medium text-white">{plan.title}</span>
                  <p className="line-clamp-1 text-xs text-white/40">{stripMarkdown(plan.content)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plans.length === 0 && (
        <p className="mt-10 text-sm text-white/40">
          還沒有儲存的行程。在跟活動安排助理聊天時，點回覆下方的「儲存為行程」就會出現在這裡。
        </p>
      )}
    </div>
  );
}
