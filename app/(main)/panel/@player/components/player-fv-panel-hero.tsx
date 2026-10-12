"use client"

import Image from "next/image"
import Link from "next/link"
import { ChevronRight, Pause, Play } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const poster = "/tenants/padel-fv/panel/fv-jugadores.webp"
const videoSource = "/tenants/padel-fv/panel/fv-jugadores.mp4"
const desktopPoster = "/tenants/padel-fv/panel/fv-jugadores-desktop.webp"
const desktopVideoSource = "/tenants/padel-fv/panel/fv-jugadores-desktop.mp4"

interface PlayerFvPanelHeroProps {
  firstName: string
  categoryName?: string | null
}

type DataConnection = EventTarget & { saveData?: boolean }

export const PlayerFvPanelHero = ({ firstName, categoryName }: PlayerFvPanelHeroProps) => {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [canAnimate, setCanAnimate] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [hasLoadedVideo, setHasLoadedVideo] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const handleViewportChange = () => {
      setIsDesktop(query.matches)
      setVideoFailed(false)
    }
    handleViewportChange()
    query.addEventListener("change", handleViewportChange)
    return () => query.removeEventListener("change", handleViewportChange)
  }, [])

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const connection = (navigator as Navigator & { connection?: DataConnection }).connection
    const handlePreferenceChange = () => setCanAnimate(!motionQuery.matches && !connection?.saveData)
    handlePreferenceChange()
    motionQuery.addEventListener("change", handlePreferenceChange)
    connection?.addEventListener("change", handlePreferenceChange)
    return () => {
      motionQuery.removeEventListener("change", handlePreferenceChange)
      connection?.removeEventListener("change", handlePreferenceChange)
    }
  }, [])

  useEffect(() => {
    // Give the dashboard and its actions priority over decorative media.
    let idleId: number | undefined
    let timeoutId: number | undefined
    const handlePageReady = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => setIsReady(true), { timeout: 2000 })
      } else {
        timeoutId = window.setTimeout(() => setIsReady(true), 1000)
      }
    }
    if (document.readyState === "complete") handlePageReady()
    else window.addEventListener("load", handlePageReady, { once: true })
    return () => {
      window.removeEventListener("load", handlePageReady)
      if (idleId !== undefined) window.cancelIdleCallback(idleId)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    let inViewport = false
    const handleVisibilityChange = () => setIsVisible(inViewport && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting
      handleVisibilityChange()
    }, { threshold: 0.25 })
    observer.observe(section)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (isReady && isVisible && canAnimate && !isPaused) setHasLoadedVideo(true)
  }, [isReady, isVisible, canAnimate, isPaused])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handlePlayback = () => {
      if (!isVisible || !canAnimate || isPaused || videoFailed) {
        video.pause()
        return
      }
      void video.play().catch(() => setIsPaused(true))
    }
    handlePlayback()
    video.addEventListener("canplay", handlePlayback)
    return () => {
      video.removeEventListener("canplay", handlePlayback)
      video.pause()
    }
  }, [hasLoadedVideo, isVisible, canAnimate, isPaused, videoFailed, isDesktop])

  const handleTogglePlayback = () => setIsPaused((paused) => !paused)

  return (
    <section
      ref={sectionRef}
      aria-labelledby="fv-player-panel-title"
      data-fv-player-panel-hero
      className="relative isolate -mt-20 min-h-[360px] overflow-hidden bg-[#0b1933] pt-20 text-white sm:min-h-[440px]"
    >
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <Image src={poster} alt="" fill sizes="100vw" className="object-cover object-[center_40%] lg:hidden" />
        <Image src={desktopPoster} alt="" fill sizes="100vw" className="hidden object-cover object-[center_20%] lg:block" />
        {hasLoadedVideo && canAnimate && !videoFailed && (
          <video
            ref={videoRef}
            key={isDesktop ? desktopVideoSource : videoSource}
            src={isDesktop ? desktopVideoSource : videoSource}
            poster={isDesktop ? desktopPoster : poster}
            muted
            playsInline
            loop
            preload="none"
            onError={() => setVideoFailed(true)}
            tabIndex={-1}
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full object-cover ${isDesktop ? "object-[center_20%]" : "object-[center_40%]"}`}
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,37,0.86)_0%,rgba(9,23,48,0.58)_46%,rgba(7,17,37,0.34)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(0deg,rgba(7,17,37,0.84)_0%,rgba(7,17,37,0.06)_100%)]" />
        <div className="absolute inset-x-0 top-0 h-48 bg-[linear-gradient(180deg,rgba(7,17,37,0.56)_0%,transparent_100%)]" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="mx-auto flex min-h-[280px] max-w-6xl flex-col justify-center py-10 sm:min-h-[360px] sm:py-14">
          <p className="mb-2 text-xs font-semibold text-court-200">Panel jugador</p>
          <h1 id="fv-player-panel-title" className="max-w-xl text-3xl font-bold leading-tight tracking-tight text-white drop-shadow-sm sm:text-4xl lg:text-5xl">
            Mi agenda competitiva
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-5 text-brand-200 sm:text-base sm:leading-6">
            Hola {firstName}. Seguí tus partidos y elegí tu próximo torneo.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
            {categoryName && (
              <Badge className="border-white/15 bg-white/5 px-2 py-1.5 text-[10px] font-semibold text-white hover:bg-white/5 sm:px-3 sm:text-xs">
                Categoría {categoryName}
              </Badge>
            )}
            <Button asChild className="h-10 rounded-full border border-white/30 bg-brand-900/40 px-3 text-xs font-bold text-white hover:bg-brand-900/60 sm:h-11 sm:px-6 sm:text-sm">
              <Link href="/torneos">Ver torneos<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></Link>
            </Button>
          </div>
        </div>
      </div>

      {hasLoadedVideo && canAnimate && !videoFailed && (
        <button
          type="button"
          onClick={handleTogglePlayback}
          aria-label={isPaused ? "Reproducir video del circuito" : "Pausar video del circuito"}
          aria-pressed={isPaused}
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-brand-900/70 text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court-300 sm:bottom-6 sm:right-6"
        >
          {isPaused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      )}
    </section>
  )
}
