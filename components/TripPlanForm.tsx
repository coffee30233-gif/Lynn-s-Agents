"use client";

import { useState, type ReactNode } from "react";
import {
  formatTWD,
  totalBudget,
  tripDayCount,
  tripLengthLabel,
  validateTripRequest,
  type BudgetItem,
  type TripExperience,
  type TripHotel,
  type TripPlan,
  type TripRegion,
  type TripRestaurant,
} from "@/lib/trips/types";

export interface TripFormValues {
  title: string;
  startDate: string;
  endDate: string;
  plan: TripPlan;
}

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none [color-scheme:dark]";

function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/40">
      {label}
      {children}
    </label>
  );
}

function MoneyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={100}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
      className={inputClass}
    />
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 rounded-lg px-2 py-1 text-xs text-white/30 transition-colors hover:text-red-300"
    >
      刪除
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-xs text-white/50 transition-colors hover:border-white/40 hover:text-white/80"
    >
      ＋ {children}
    </button>
  );
}

function ItemCard({ children, onRemove, removeLabel }: { children: ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      {children}
      <div className="flex justify-end">
        <RemoveButton onClick={onRemove} label={removeLabel} />
      </div>
    </div>
  );
}

/** Edits everything about a saved trip. Keeps its own copy of the data and
 * only reports it back on 儲存 — cancelling throws the edits away. */
export function TripPlanForm({
  initial,
  region,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: TripFormValues;
  region: TripRegion;
  saving: boolean;
  error: string;
  onSave: (values: TripFormValues) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [overview, setOverview] = useState(initial.plan.overview);
  const [budget, setBudget] = useState<BudgetItem[]>(initial.plan.budget);
  const [hotels, setHotels] = useState<TripHotel[]>(initial.plan.hotels);
  const [restaurants, setRestaurants] = useState<TripRestaurant[]>(initial.plan.restaurants);
  const [experiences, setExperiences] = useState<TripExperience[]>(initial.plan.experiences);
  // A day's items are edited as one textarea, one line per item — much
  // lighter than a row of inputs per bullet. Kept as raw text while typing
  // (splitting on every keystroke would eat a trailing newline the moment
  // it's typed) and only split into items on save.
  const [days, setDays] = useState(
    initial.plan.days.map((d) => ({ title: d.title, text: d.items.join("\n") }))
  );
  const [localError, setLocalError] = useState("");

  const total = totalBudget({ budget });
  const dayCount = tripDayCount(startDate, endDate);

  function handleSave() {
    if (!title.trim()) {
      setLocalError("請輸入行程名稱");
      return;
    }
    const invalid = validateTripRequest({ startDate, endDate, region }, { allowPast: true });
    if (invalid) {
      setLocalError(invalid);
      return;
    }
    setLocalError("");
    onSave({
      title: title.trim(),
      startDate,
      endDate,
      plan: {
        overview: overview.trim(),
        budget: budget.filter((b) => b.label.trim()),
        hotels: hotels.filter((h) => h.name.trim()),
        restaurants: restaurants.filter((r) => r.name.trim()),
        experiences: experiences.filter((e) => e.name.trim()),
        days: days
          .map((d) => ({
            title: d.title.trim(),
            items: d.text
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          }))
          .filter((d) => d.title || d.items.length > 0),
        // Not editable here — they record what the AI drew on, not the
        // user's own plan — so they pass through untouched.
        sources: initial.plan.sources,
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="基本資料">
        <Labeled label="行程名稱">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="出發日期">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Labeled>
          <Labeled label="回程日期">
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </Labeled>
        </div>
        {dayCount > 0 && <p className="text-xs text-white/40">{tripLengthLabel(dayCount)}</p>}
        <Labeled label="行程總覽">
          <textarea
            value={overview}
            onChange={(e) => setOverview(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </Labeled>
      </Section>

      <Section title="💰 預算（每人）">
        <p className="text-lg font-bold text-white">
          {formatTWD(total)} <span className="text-xs font-normal text-white/40">自動加總</span>
        </p>
        {budget.map((item, i) => (
          <div key={i} className="flex items-end gap-2">
            <Labeled label="項目">
              <input
                value={item.label}
                onChange={(e) => setBudget(updateAt(budget, i, { label: e.target.value }))}
                className={inputClass}
              />
            </Labeled>
            <Labeled label="金額（新台幣）">
              <MoneyInput value={item.amount} onChange={(amount) => setBudget(updateAt(budget, i, { amount }))} />
            </Labeled>
            <RemoveButton onClick={() => setBudget(removeAt(budget, i))} label={`刪除預算項目 ${item.label}`} />
          </div>
        ))}
        <AddButton onClick={() => setBudget([...budget, { label: "", amount: 0 }])}>新增預算項目</AddButton>
      </Section>

      <Section title="🏨 住宿">
        {hotels.map((h, i) => (
          <ItemCard key={i} onRemove={() => setHotels(removeAt(hotels, i))} removeLabel={`刪除住宿 ${h.name}`}>
            <Labeled label="名稱">
              <input value={h.name} onChange={(e) => setHotels(updateAt(hotels, i, { name: e.target.value }))} className={inputClass} />
            </Labeled>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="區域">
                <input value={h.area} onChange={(e) => setHotels(updateAt(hotels, i, { area: e.target.value }))} className={inputClass} />
              </Labeled>
              <Labeled label="每晚房價（整間房）">
                <MoneyInput value={h.pricePerNight} onChange={(pricePerNight) => setHotels(updateAt(hotels, i, { pricePerNight }))} />
              </Labeled>
            </div>
            <Labeled label="備註">
              <textarea value={h.note} onChange={(e) => setHotels(updateAt(hotels, i, { note: e.target.value }))} rows={2} className={inputClass} />
            </Labeled>
          </ItemCard>
        ))}
        <AddButton onClick={() => setHotels([...hotels, { name: "", area: "", pricePerNight: 0, note: "" }])}>新增住宿</AddButton>
      </Section>

      <Section title="🍽️ 餐廳">
        {restaurants.map((r, i) => (
          <ItemCard key={i} onRemove={() => setRestaurants(removeAt(restaurants, i))} removeLabel={`刪除餐廳 ${r.name}`}>
            <Labeled label="名稱">
              <input value={r.name} onChange={(e) => setRestaurants(updateAt(restaurants, i, { name: e.target.value }))} className={inputClass} />
            </Labeled>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="料理類型">
                <input value={r.cuisine} onChange={(e) => setRestaurants(updateAt(restaurants, i, { cuisine: e.target.value }))} className={inputClass} />
              </Labeled>
              <Labeled label="人均（新台幣）">
                <MoneyInput value={r.pricePerPerson} onChange={(pricePerPerson) => setRestaurants(updateAt(restaurants, i, { pricePerPerson }))} />
              </Labeled>
            </div>
            <Labeled label="備註">
              <textarea value={r.note} onChange={(e) => setRestaurants(updateAt(restaurants, i, { note: e.target.value }))} rows={2} className={inputClass} />
            </Labeled>
          </ItemCard>
        ))}
        <AddButton onClick={() => setRestaurants([...restaurants, { name: "", cuisine: "", pricePerPerson: 0, note: "" }])}>
          新增餐廳
        </AddButton>
      </Section>

      <Section title="🎟️ 體驗與景點">
        {experiences.map((e, i) => (
          <ItemCard key={i} onRemove={() => setExperiences(removeAt(experiences, i))} removeLabel={`刪除體驗 ${e.name}`}>
            <div className="grid grid-cols-[1fr_8rem] gap-2">
              <Labeled label="名稱">
                <input value={e.name} onChange={(ev) => setExperiences(updateAt(experiences, i, { name: ev.target.value }))} className={inputClass} />
              </Labeled>
              <Labeled label="費用（0 = 免費）">
                <MoneyInput value={e.price} onChange={(price) => setExperiences(updateAt(experiences, i, { price }))} />
              </Labeled>
            </div>
            <Labeled label="備註">
              <textarea value={e.note} onChange={(ev) => setExperiences(updateAt(experiences, i, { note: ev.target.value }))} rows={2} className={inputClass} />
            </Labeled>
          </ItemCard>
        ))}
        <AddButton onClick={() => setExperiences([...experiences, { name: "", price: 0, note: "" }])}>新增體驗</AddButton>
      </Section>

      <Section title="🗓️ 每日行程">
        {days.map((d, i) => (
          <ItemCard key={i} onRemove={() => setDays(removeAt(days, i))} removeLabel={`刪除 ${d.title || `第 ${i + 1} 天`}`}>
            <Labeled label="標題">
              <input value={d.title} onChange={(e) => setDays(updateAt(days, i, { title: e.target.value }))} className={inputClass} />
            </Labeled>
            <Labeled label="當天安排（一行一項）">
              <textarea
                value={d.text}
                onChange={(e) => setDays(updateAt(days, i, { text: e.target.value }))}
                rows={Math.max(3, d.text.split("\n").length + 1)}
                className={inputClass}
              />
            </Labeled>
          </ItemCard>
        ))}
        <AddButton onClick={() => setDays([...days, { title: `第 ${days.length + 1} 天`, text: "" }])}>新增一天</AddButton>
      </Section>

      <div className="sticky bottom-0 -mx-6 flex flex-col gap-2 border-t border-white/10 bg-ink-950/90 px-6 py-4 backdrop-blur-md">
        {(localError || error) && <p className="text-sm text-red-300">{localError || error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white/70 transition-colors enabled:hover:text-white disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "儲存中..." : "儲存修改"}
          </button>
        </div>
      </div>
    </div>
  );
}
