"use client"

import { ArrowDown, ArrowUpRight, Pause, Play } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

const heroMedia = {
  mobile: "/tenants/padel-fv/hero/fv-circuito-vertical-compatible",
  desktop: "/tenants/padel-fv/hero/fv-circuito-desktop-compatible",
} as const

export const PadelFvImmersiveHero = () => {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const userPausedRef = useRef(false)
  const videoFailedRef = useRef(false)
  const lastProgressTimeRef = useRef(0)
  const [media, setMedia] = useState<string | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const desktopQuery = window.matchMedia("(min-width: 1024px)")
    const handleMotionChange = () => setPrefersReducedMotion(motionQuery.matches)
    const handleViewportChange = () => {
      setMedia(desktopQuery.matches ? heroMedia.desktop : heroMedia.mobile)
      setIsPlaying(false)
      setIsBuffering(false)
      lastProgressTimeRef.current = 0
      videoFailedRef.current = false
      setVideoFailed(false)
    }

    handleMotionChange()
    handleViewportChange()
    motionQuery.addEventListener("change", handleMotionChange)
    desktopQuery.addEventListener("change", handleViewportChange)
    return () => {
      motionQuery.removeEventListener("change", handleMotionChange)
      desktopQuery.removeEventListener("change", handleViewportChange)
    }
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    const video = videoRef.current
    if (!section || !video) return

    let inViewport = false
    let cancelled = false
    const handlePlayback = () => {
      if (!inViewport || document.hidden || prefersReducedMotion || userPausedRef.current || videoFailedRef.current) {
        video.pause()
        return
      }
      video.muted = true
      void video.play().catch((error: unknown) => {
        // Effect cleanup can abort a pending play; that is not an autoplay denial.
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return
        userPausedRef.current = true
        setIsPlaying(false)
      })
    }
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting
      handlePlayback()
    }, { threshold: 0.2 })

    observer.observe(section)
    let previousTime = video.currentTime
    let secondsWithoutProgress = 0
    const progressTimer = window.setInterval(() => {
      if (video.paused || !inViewport || document.hidden) {
        secondsWithoutProgress = 0
        previousTime = video.currentTime
        return
      }
      if (Math.abs(video.currentTime - previousTime) > 0.05) {
        secondsWithoutProgress = 0
        previousTime = video.currentTime
        return
      }
      secondsWithoutProgress += 1
      if (secondsWithoutProgress >= 8) {
        setIsPlaying(false)
        setIsBuffering(true)
      }
    }, 1000)
    document.addEventListener("visibilitychange", handlePlayback)
    video.addEventListener("canplay", handlePlayback)
    return () => {
      cancelled = true
      window.clearInterval(progressTimer)
      observer.disconnect()
      document.removeEventListener("visibilitychange", handlePlayback)
      video.removeEventListener("canplay", handlePlayback)
      video.pause()
    }
  }, [media, prefersReducedMotion])

  const handleTogglePlayback = () => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying && !videoFailedRef.current) {
      userPausedRef.current = true
      video.pause()
      setIsPlaying(false)
      setIsBuffering(false)
      return
    }

    userPausedRef.current = false
    if (videoFailedRef.current || isBuffering) {
      videoFailedRef.current = false
      setVideoFailed(false)
      video.load()
      lastProgressTimeRef.current = 0
    }
    setIsBuffering(true)
    video.muted = true
    // Keep play inside the click handler so mobile browsers retain user activation.
    void video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return
      userPausedRef.current = true
      setIsPlaying(false)
      setIsBuffering(false)
    })
  }

  const handleVideoError = () => {
    videoFailedRef.current = true
    setVideoFailed(true)
    setIsPlaying(false)
    setIsBuffering(false)
  }

  const handleVideoProgress = () => {
    const video = videoRef.current
    if (!video || video.paused || video.currentTime <= 0) return
    if (Math.abs(video.currentTime - lastProgressTimeRef.current) < 0.02) return
    lastProgressTimeRef.current = video.currentTime
    setIsPlaying(true)
    setIsBuffering(false)
  }

  const handleVideoWaiting = () => {
    setIsPlaying(false)
    setIsBuffering(true)
  }

  return (
    <section
      ref={sectionRef}
      data-padel-fv-hero
      data-video-status={videoFailed ? "error" : isBuffering ? "buffering" : isPlaying ? "playing" : "paused"}
      aria-labelledby="padel-fv-hero-title"
      className="relative isolate -mt-20 min-h-[100svh] overflow-hidden bg-[#0b1933] pt-20 text-white"
    >
      <div className="absolute inset-0" aria-hidden="true">
        <picture>
          <source media="(min-width: 1024px)" srcSet={`${heroMedia.desktop}.webp`} />
          {/* Native picture selects the matching poster before hydration. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${heroMedia.mobile}.webp`}
            alt=""
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>
        {media && !prefersReducedMotion && (
          <video
            key={media}
            ref={videoRef}
            src={`${media}.mp4`}
            poster={`${media}.webp`}
            muted
            playsInline
            loop
            preload="auto"
            onTimeUpdate={handleVideoProgress}
            onWaiting={handleVideoWaiting}
            onPause={() => { setIsPlaying(false); setIsBuffering(false) }}
            onError={handleVideoError}
            className={`absolute inset-0 h-full w-full object-cover ${videoFailed ? "opacity-0" : "opacity-100"}`}
            tabIndex={-1}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,37,0.86)_0%,rgba(9,23,48,0.58)_46%,rgba(7,17,37,0.34)_100%)]" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(0deg,rgba(7,17,37,0.84)_0%,rgba(7,17,37,0.06)_100%)]" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-48 bg-[linear-gradient(180deg,rgba(7,17,37,0.56)_0%,transparent_100%)]" aria-hidden="true" />

      <div className="container relative mx-auto flex min-h-[calc(100svh-5rem)] items-end px-4 pb-28 pt-28 sm:px-6 sm:pb-24 sm:pt-28 lg:items-center lg:py-24">
        <div className="max-w-xl">
          <p className="mb-5 text-xs font-black uppercase tracking-[0.24em] text-court-300 sm:text-sm">Organizadores de torneos de pádel</p>
          <h1 id="padel-fv-hero-title" className="text-5xl font-black leading-[0.94] tracking-[-0.055em] text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.32)] sm:text-6xl lg:text-7xl xl:text-8xl">
            Torneos que se viven de verdad.
          </h1>
          <p className="mt-6 max-w-lg text-base font-semibold leading-7 text-white/90 drop-shadow-sm sm:text-lg sm:leading-8">
            Organizamos cada competencia de principio a fin: inscripción, partidos, resultados y campeones.
          </p>
          <div className="mt-8">
            <Button asChild className="h-12 rounded-full bg-court-400 px-6 text-base font-black text-[#10213f] shadow-[0_12px_32px_rgba(0,0,0,0.28)] hover:bg-court-300 focus-visible:ring-court-200">
              <a href="#proximos-americanos">
                Ver próximos torneos <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      {media && !prefersReducedMotion && (
        <button
          type="button"
          onClick={handleTogglePlayback}
          aria-label={videoFailed || isBuffering ? "Reintentar video de fondo" : isPlaying ? "Pausar video de fondo" : "Reproducir video de fondo"}
          aria-pressed={!isPlaying}
          className="absolute bottom-5 right-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white/90 backdrop-blur-sm transition hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court-300 sm:bottom-8 sm:right-6"
        >
          {isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}

      <a
        href="#proximos-americanos"
        className="absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 flex-col items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.16em] text-white/80 transition hover:text-court-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#101a35] sm:bottom-8 sm:text-xs sm:tracking-[0.18em]"
      >
        <span>Deslizá para explorar</span>
        <ArrowDown className="h-4 w-4 motion-safe:animate-bounce" aria-hidden="true" />
      </a>

    </section>
  )
}
