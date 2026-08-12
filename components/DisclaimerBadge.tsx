export function DisclaimerBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="text-[11px] text-white/35">
        AI simulated character · 非本人發言
      </span>
    );
  }

  return (
    <p className="text-xs leading-relaxed text-white/40">
      AI simulated character. Responses are generated based on publicly available information, the
      provided character skill, and AI reasoning. This character does not represent or speak for the
      real person.
      <br />
      AI 模擬角色：本角色根據公開資料、人物 Skill 與 AI 推理生成，不代表本人發言。
    </p>
  );
}
