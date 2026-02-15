'use client'

import dynamic from 'next/dynamic'
import HUD from '../components/HUD'
import CaptureController from '../components/captureController'
import SelfieModal from '../components/selfieModal'

const MainCanvas = dynamic(() => import('../components/mainCanvas'), { ssr: false })

export default function WorldPage() {
  return (
    <>
      <MainCanvas />
      <HUD />
      <CaptureController />
      <SelfieModal />
    </>
  )
}
