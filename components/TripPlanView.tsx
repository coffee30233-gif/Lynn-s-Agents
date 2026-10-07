import type { ReactNode } from "react";
import { formatTWD, totalBudget, type TripPlan } from "@/lib/trips/types";

function priceLabel(amount: number, zeroLabel: string): string {
  return amount > 0 ? formatTWD(amount) : zeroLabel;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="mb-3 text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Row({ name, meta, price, note }: { name: string; meta?: string; price: string; note?: string }) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-medium text-white/90">
          {name}
          {meta && <span className="ml-2 whitespace-nowrap text-xs font-normal text-white/40">{meta}</span>}
        </p>
        <span className="shrink-0 text-sm text-white/70">{price}</span>
      </div>
      {note && <p className="mt-1 text-sm leading-relaxed text-white/50">{note}</p>}
    </li>
  );
}

/** Read-only rendering of a trip plan — shared by the generation flow (before
 * the user commits to a destination) and the saved-trip page. */
export function TripPlanView({ plan }: { plan: TripPlan }) {
  const total = totalBudget(plan);

  return (
    <div className="flex flex-col gap-4">
      {plan.overview && (
        <p className="text-[15px] leading-relaxed text-white/80">{plan.overview}</p>
      )}

      {plan.budget.length > 0 && (
        <Section title="💰 預算（每人）">
          <p className="mb-3 text-2xl font-bold text-white">
            {formatTWD(total)} <span className="text-sm font-normal text-white/40">/ 人</span>
          </p>
          <ul className="flex flex-col gap-1.5">
            {plan.budget.map((item, i) => (
              <li key={i} className="flex items-baseline justify-between text-sm">
                <span className="text-white/70">{item.label}</span>
                <span className="text-white/90">{formatTWD(item.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-white/30">
            AI 依搜尋到的資訊估算，不含購物與個人額外花費；機票與房價會浮動，出發前請再確認。
          </p>
        </Section>
      )}

      {plan.hotels.length > 0 && (
        <Section title="🏨 住宿">
          <ul className="divide-y divide-white/5">
            {plan.hotels.map((h, i) => (
              <Row key={i} name={h.name} meta={h.area} price={`${priceLabel(h.pricePerNight, "價格未提供")} / 晚`} note={h.note} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-white/30">房價為整間房每晚。</p>
        </Section>
      )}

      {plan.restaurants.length > 0 && (
        <Section title="🍽️ 餐廳">
          <ul className="divide-y divide-white/5">
            {plan.restaurants.map((r, i) => (
              <Row key={i} name={r.name} meta={r.cuisine} price={`人均 ${priceLabel(r.pricePerPerson, "未提供")}`} note={r.note} />
            ))}
          </ul>
        </Section>
      )}

      {plan.experiences.length > 0 && (
        <Section title="🎟️ 體驗與景點">
          <ul className="divide-y divide-white/5">
            {plan.experiences.map((e, i) => (
              <Row key={i} name={e.name} price={priceLabel(e.price, "免費")} note={e.note} />
            ))}
          </ul>
        </Section>
      )}

      {plan.days.length > 0 && (
        <Section title="🗓️ 每日行程">
          <div className="flex flex-col gap-5">
            {plan.days.map((day, i) => (
              <div key={i}>
                <p className="mb-1.5 text-[15px] font-medium text-white/90">{day.title}</p>
                <ul className="flex flex-col gap-1">
                  {day.items.map((item, j) => (
                    <li key={j} className="text-sm leading-relaxed text-white/60">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      {plan.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-white/30">參考資料：</span>
          {plan.sources.map((source) => (
            <a
              key={source.uri}
              href={source.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-[180px] truncate rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/50 transition-colors hover:border-white/25 hover:text-white/80"
            >
              {source.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
