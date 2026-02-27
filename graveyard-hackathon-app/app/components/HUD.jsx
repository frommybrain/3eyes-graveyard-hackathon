'use client'

import { useEffect, useMemo, useState } from 'react'
import { useGameStore, GAME_PHASE } from '../state/useGameStore'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { gameConfig } from '../config/gameConfig'
import { useSeekVision } from '../hooks/useSeekVision'
import WalletButton from './walletButton'
import { useCameraStore } from '../state/useCameraStore'
import { useWallet } from '@solana/wallet-adapter-react'

function InsufficientSolPanel({ balance, onRefresh, refreshing, onClose }) {
  const price = gameConfig.economy.thirdVisionPrice

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
        <h2 className="text-lg font-bold text-white">Insufficient SOL</h2>
        <p className="text-sm text-zinc-400">
          The final selfie costs <span className="text-amber-400 font-medium">{price} SOL</span>.
          {balance !== null && (
            <> You have <span className="text-purple-300 font-medium">{balance.toFixed(4)} SOL</span>.</>
          )}
        </p>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-4 py-2 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Checking...' : 'Refresh Balance'}
        </button>

        <button
          onClick={onClose}
          className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function CameraChannelSwitcher() {
  const index = useCameraStore((s) => s.index)
  const total = useCameraStore((s) => s.positions.length)
  const next = useCameraStore((s) => s.next)
  const prev = useCameraStore((s) => s.prev)

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={prev}
        className="w-8 h-8 rounded-full bg-black/60 border border-zinc-600 text-white text-sm font-bold hover:bg-black/80 transition-colors flex items-center justify-center"
      >
        &lt;
      </button>
      <span className="text-white font-mono text-xs min-w-[40px] text-center">
        {index + 1}/{total}
      </span>
      <button
        onClick={next}
        className="w-8 h-8 rounded-full bg-black/60 border border-zinc-600 text-white text-sm font-bold hover:bg-black/80 transition-colors flex items-center justify-center"
      >
        &gt;
      </button>
    </div>
  )
}

// SVG ring that animates around the shutter button when loading
function LoadingRing({ isPaid }) {
  const color = isPaid ? '#f59e0b' : '#ffffff'
  const r = 29 // radius
  const circumference = 2 * Math.PI * r

  return (
    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
      <circle
        cx="32" cy="32" r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        strokeLinecap="round"
        className="animate-spin-ring"
        style={{ animationDuration: '1.5s' }}
      />
    </svg>
  )
}

function ShutterButton({ onClick, isPaid, loading, disabled }) {
  const ringColor = isPaid ? 'border-amber-500' : 'border-white'

  if (loading) {
    return (
      <div className="relative w-16 h-16">
        <div className={`w-16 h-16 rounded-full ${ringColor} border-4 flex items-center justify-center opacity-40`}>
          <div className="w-12 h-12 rounded-full bg-zinc-600" />
        </div>
        <LoadingRing isPaid={isPaid} />
      </div>
    )
  }

  const innerColor = isPaid ? 'bg-amber-500' : 'bg-white'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-16 h-16 rounded-full ${ringColor} border-4 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100`}
    >
      <div className={`w-12 h-12 rounded-full ${innerColor}`} />
    </button>
  )
}

function NftGalleryButton() {
  const { publicKey } = useWallet()
  const mintResult = useGameStore((s) => s.mintResult)
  const [expanded, setExpanded] = useState(false)

  // Derive from mint result (no effect needed)
  const mintNftData = useMemo(() => {
    if (!mintResult?.imageUrl || !publicKey) return null
    return { mint: mintResult.mint, imageUrl: mintResult.imageUrl, signature: mintResult.signature }
  }, [mintResult, publicKey])

  // Read localStorage synchronously via useMemo (no effect needed)
  const storedNft = useMemo(() => {
    if (typeof window === 'undefined' || !publicKey) return null
    try {
      const stored = localStorage.getItem(`3eyes-nft-${publicKey.toString()}`)
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  }, [publicKey])

  // On-chain verification (async — setState in callback is fine)
  const [verifiedNft, setVerifiedNft] = useState(null)
  useEffect(() => {
    if (!publicKey) return
    fetch(`/api/wallet-nft?wallet=${publicKey.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (data.nft?.imageUrl) {
          setVerifiedNft(data.nft)
          localStorage.setItem(`3eyes-nft-${publicKey.toString()}`, JSON.stringify(data.nft))
        }
      })
      .catch(() => { })
  }, [publicKey])

  // Persist to localStorage when mint succeeds (side effect only, no setState)
  useEffect(() => {
    if (mintNftData && publicKey) {
      localStorage.setItem(`3eyes-nft-${publicKey.toString()}`, JSON.stringify(mintNftData))
    }
  }, [mintNftData, publicKey])

  // Priority: fresh mint > on-chain verified > localStorage cache
  const nftData = mintNftData || verifiedNft || storedNft
  if (!nftData?.imageUrl) return null

  const cluster = gameConfig.economy.cluster
  const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`
  const explorerUrl = nftData.mint && nftData.mint !== 'DEV_PLACEHOLDER'
    ? `https://explorer.solana.com/address/${nftData.mint}${clusterParam}`
    : null

  return (
    <>
      <button
        onClick={() => setExpanded(true)}
        className="block w-12 h-12 rounded-lg overflow-hidden border-2 border-zinc-600 hover:border-zinc-400 transition-colors shadow-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={nftData.imageUrl} alt="Your NFT" className="w-full h-full object-cover" />
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setExpanded(false)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-600 text-white flex items-center justify-center text-sm hover:bg-zinc-700 z-10"
            >
              X
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={nftData.imageUrl}
              alt="Your NFT"
              className="rounded-lg shadow-2xl max-w-[90vw] max-h-[80vh] object-contain"
            />
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-400 hover:text-white underline transition-colors"
              >
                View on Solana Explorer
              </a>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default function HUD() {
  const phase = useGameStore((s) => s.phase)
  const visionCount = useGameStore((s) => s.visionCount)
  const { publicKey } = useWallet()

  const {
    seekVision,
    showInsufficientSol,
    solBalance,
    refreshing,
    refreshBalance,
    dismissInsufficientSol,
  } = useSeekVision()

  const handleReset = () => {
    useGameStore.getState().fullReset()
    useNpcStore.getState().setState(NPC_STATE.IDLE_ROAM)
    useNpcStore.getState().setTargetSpot(null)
    useNpcStore.getState().setCurrentPose(null)
  }

  const isPaidVision = visionCount >= gameConfig.economy.maxFreeVisions
  const isLoading = phase === GAME_PHASE.SUMMONING || phase === GAME_PHASE.REVEALED || phase === GAME_PHASE.CAPTURING
  const showShutter = (phase === GAME_PHASE.IDLE || isLoading) && !!publicKey
  const isBusy = phase !== GAME_PHASE.IDLE

  return (
    <div className="fixed inset-0 z-10 pointer-events-none">
      {/* Top-right wallet */}
      <div className="absolute top-4 right-4 pointer-events-auto">
        <WalletButton />
      </div>

      {/* Bottom center — shutter + channel switcher */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-6">
        {showShutter && (
          <ShutterButton
            onClick={seekVision}
            isPaid={isPaidVision}
            loading={isLoading}
            disabled={isBusy}
          />
        )}

        {/* Reset button — only during active non-modal phases */}
        {isBusy && !isLoading && phase !== GAME_PHASE.VISION_RESULT && phase !== GAME_PHASE.MINTING && phase !== GAME_PHASE.DONE && (
          <button
            onClick={handleReset}
            className="rounded-full bg-zinc-700/80 px-4 py-2 text-white text-sm hover:bg-zinc-600 transition-colors"
          >
            Reset
          </button>
        )}

        {/* Camera channel switcher — always visible */}
        <CameraChannelSwitcher />
      </div>

      {/* Bottom-left — NFT gallery thumbnail (like iOS camera roll) */}
      <div className="absolute bottom-8 left-4 pointer-events-auto">
        <NftGalleryButton />
      </div>

      {/* Insufficient SOL panel */}
      {showInsufficientSol && (
        <div className="pointer-events-auto">
          <InsufficientSolPanel
            balance={solBalance}
            onRefresh={refreshBalance}
            refreshing={refreshing}
            onClose={dismissInsufficientSol}
          />
        </div>
      )}
    </div>
  )
}
