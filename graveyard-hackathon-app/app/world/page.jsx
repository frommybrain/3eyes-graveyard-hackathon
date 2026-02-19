'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import HUD from '../components/HUD'
import CaptureController from '../components/captureController'
import SelfieModal from '../components/selfieModal'
import FiatReturnHandler from '../components/FiatReturnHandler'

const MainCanvas = dynamic(() => import('../components/mainCanvas'), { ssr: false })

export default function WorldPage() {
  return (
    <>
      <MainCanvas />
      <HUD />
      <CaptureController />
      <SelfieModal />
      <Suspense fallback={null}>
        <FiatReturnHandler />
      </Suspense>
    </>
  )
}
