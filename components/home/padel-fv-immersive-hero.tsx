"use client"

import { ArrowDown, ArrowUpRight } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

const heroMedia = [
  {
    src: "/tenants/padel-fv/hero/circuito-padel-fv-01.mp4",
    position: "object-[50%_center] sm:object-[50%_42%]",
  },
  {
    src: "/tenants/padel-fv/hero/circuito-padel-fv-02.mp4",
    position: "object-[50%_center] sm:object-[50%_44%]",
  },
] as const

const transitionDuration = 280

type VideoIndex = 0 | 1

export function PadelFvImmersiveHero() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([])
  const activeIndexRef = useRef<VideoIndex>(0)
  const inViewportRef = useRef(false)
  const transitionTimeoutRef = useRef<number | null>(null)
  const [activeIndex, setActiveIndex] = useState<VideoIndex>(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  const pauseVideo = useCallback((video: HTMLVideoElement | null, rewind = false) => {
    if (!video) {
      return
    }

    video.pause()

    if (rewind) {
      try {
        video.currentTime = 0
      } catch {
        // A video without loaded metadata cannot seek yet. It will start at the beginning once ready.
      }
    }
  }, [])

  const playVideo = useCallback((index: VideoIndex) => {
    const video = videoRefs.current[index]

    if (!video) {
      return
    }

    void video.play().catch(() => {
      // Muted autoplay can still be denied by a browser. Its poster remains visible in that case.
    })
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handlePreferenceChange = () => setPrefersReducedMotion(mediaQuery.matches)

    handlePreferenceChange()
    mediaQuery.addEventListener("change", handlePreferenceChange)

    return () => mediaQuery.removeEventListener("change", handlePreferenceChange)
  }, [])

  useEffect(() => {
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current)
      transitionTimeoutRef.current = null
    }

    if (prefersReducedMotion) {
      videoRefs.current.forEach((video) => pauseVideo(video, true))
      return
    }

    const section = sectionRef.current
    if (!section) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewportRef.current = entry.isIntersecting

        if (!entry.isIntersecting) {
          videoRefs.current.forEach((video) => pauseVideo(video))
          return
        }

        playVideo(activeIndexRef.current)
      },
      { threshold: 0.2 },
    )

    observer.observe(section)

    return () => observer.disconnect()
  }, [pauseVideo, playVideo, prefersReducedMotion])

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current)
      }
    }
  }, [])

  const handleVideoEnded = (endedIndex: VideoIndex) => {
    if (prefersReducedMotion || !inViewportRef.current || endedIndex !== activeIndexRef.current) {
      return
    }

    const nextIndex: VideoIndex = endedIndex === 0 ? 1 : 0
    const outgoingVideo = videoRefs.current[endedIndex]
    const incomingVideo = videoRefs.current[nextIndex]

    if (!incomingVideo) {
      return
    }

    try {
      incomingVideo.currentTime = 0
    } catch {
      // Metadata can load after the initial intersection. The browser will still play from its start.
    }

    playVideo(nextIndex)
    activeIndexRef.current = nextIndex
    setActiveIndex(nextIndex)

    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current)
    }

    transitionTimeoutRef.current = window.setTimeout(() => {
      pauseVideo(outgoingVideo, true)
    }, transitionDuration)
  }

  return (
    <section
      ref={sectionRef}
      data-padel-fv-hero
      aria-labelledby="padel-fv-hero-title"
      className="relative isolate -mt-20 min-h-[100svh] overflow-hidden bg-[#0b1933] pt-20 text-white"
    >
      <div className="absolute inset-0" aria-hidden="true">
        {prefersReducedMotion ? (
          <video
            muted
            playsInline
            preload="auto"
            className={`absolute inset-0 h-full w-full object-cover ${heroMedia[0].position}`}
            tabIndex={-1}
            aria-hidden="true"
          >
            <source src={heroMedia[0].src} type="video/mp4" />
          </video>
        ) : (
          heroMedia.map((media, index) => {
            const videoIndex = index as VideoIndex

            return (
              <video
                key={media.src}
                ref={(element) => {
                  videoRefs.current[videoIndex] = element
                }}
                muted
                playsInline
                preload="metadata"
                onEnded={() => handleVideoEnded(videoIndex)}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${media.position} ${activeIndex === videoIndex ? "opacity-100" : "opacity-0"}`}
                tabIndex={-1}
                aria-hidden="true"
              >
                <source src={media.src} type="video/mp4" />
              </video>
            )
          })
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
