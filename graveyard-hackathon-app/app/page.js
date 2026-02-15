import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#0a0a0a]">
      <h1 className="text-5xl font-bold text-white">3EYES Pilgrim Selfie</h1>
      <p className="text-lg text-zinc-400 max-w-md text-center">
        Summon a wandering NPC to capture your PFP selfie. Powered by $3EYES on Solana.
      </p>
      <Link
        href="/world"
        className="rounded-full bg-purple-600 px-8 py-3 text-lg text-white font-medium hover:bg-purple-500 transition-colors"
      >
        Enter World
      </Link>
    </div>
  )
}
