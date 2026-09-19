import Image from "next/image"
import { cn } from "@/lib/utils"

const sponsors = [
  {
    name: "Marathon Isotonica",
    src: "/tenants/padel-fv/sponsors/marathon-provided.png",
    width: 537,
    height: 465,
    className: "h-20 w-24 sm:h-24 sm:w-28",
  },
  {
    name: "Sixty",
    src: "/tenants/padel-fv/sponsors/sixty-provided.png",
    width: 235,
    height: 205,
    className: "h-16 w-24 sm:h-20 sm:w-28",
  },
  {
    name: "Al Buen Tallarin de Pablo",
    src: "/tenants/padel-fv/sponsors/al-buen-tallarin-provided.png",
    width: 901,
    height: 277,
    className: "h-16 w-56 sm:h-20 sm:w-72",
  },
  {
    name: "Pizza Nonna",
    src: "/tenants/padel-fv/sponsors/pizza-nonna-provided.png",
    width: 793,
    height: 315,
    className: "h-16 w-56 sm:h-20 sm:w-72",
  },
] as const

interface SponsorMarqueeProps {
  tone?: "light" | "dark"
  compact?: boolean
  className?: string
}

export default function SponsorMarquee({ className, compact = false, tone = "light" }: SponsorMarqueeProps) {
  const marqueeSponsors = [...sponsors, ...sponsors]

  return (
    <section
      aria-label="Sponsors"
      className={cn(
        "group overflow-hidden border border-[#20335d]/10 bg-white py-4 shadow-[0_8px_24px_rgba(16,26,49,0.05)]",
        tone === "dark" && "border-white/10 bg-white/[0.04] shadow-none backdrop-blur-sm",
        compact && "py-2",
        className,
      )}
    >
      <div className={cn("mb-4 flex justify-center px-4", compact && "mb-1")}>
        <p className={cn("text-xs font-bold uppercase tracking-[0.2em]", tone === "dark" ? "text-court-300" : "text-[#20335d]/65")}>
          Sponsors
        </p>
      </div>

      <div className="relative overflow-hidden">
        <div className={cn("pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r to-transparent", tone === "dark" ? "from-[#162545]" : "from-white")} />
        <div className={cn("pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l to-transparent", tone === "dark" ? "from-[#162545]" : "from-white")} />

        <div className="flex w-max motion-safe:animate-sponsor-marquee group-hover:[animation-play-state:paused]">
          {marqueeSponsors.map((sponsor, index) => (
            <div
              key={`${sponsor.name}-${index}`}
              className={cn("mx-3 flex h-24 flex-none items-center justify-center px-5 sm:mx-4 sm:h-28", compact && "h-14 sm:h-16")}
              aria-hidden={index >= sponsors.length}
            >
              <Image
                src={sponsor.src}
                alt={sponsor.name}
                width={sponsor.width}
                height={sponsor.height}
                sizes="(max-width: 640px) 224px, 288px"
                className={cn("object-contain", sponsor.className, compact && "max-h-12 sm:max-h-14")}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
