import { CharacterCard } from "@/components/CharacterCard";
import { DisclaimerBadge } from "@/components/DisclaimerBadge";
import { getAllCharacters } from "@/lib/characters/registry";

export default function HomePage() {
  const characters = getAllCharacters();

  return (
    <main className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <header className="mb-16 flex flex-col items-center text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Lynn&rsquo;s Agents
          </h1>
          <p className="mt-4 text-lg text-white/50">Think with anyone. Do anything.</p>
          <p className="mt-2 text-sm text-white/30">有問題，就找一個適合的人。</p>
        </header>

        <section>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {characters.map((character) => (
              <CharacterCard key={character.id} character={character} />
            ))}
          </div>
        </section>

        <footer className="mt-20 flex justify-center">
          <DisclaimerBadge />
        </footer>
      </div>
    </main>
  );
}
