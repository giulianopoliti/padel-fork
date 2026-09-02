"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import {
  Trophy,
  Users,
  Calendar,
  Clock,
  Award,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { getPublicTournamentHref } from "@/lib/tournaments/public-tournament-url"

// Weekly Winners Carousel Component
export default function WeeklyWinnersCarousel({ weeklyWinners }: { weeklyWinners: any[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const itemsPerPage = 3
  const totalPages = Math.ceil(weeklyWinners.length / itemsPerPage)

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % totalPages)
  }

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + totalPages) % totalPages)
  }

  const currentItems = weeklyWinners.slice(currentIndex * itemsPerPage, (currentIndex + 1) * itemsPerPage)

  return (
    <div className="relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {currentItems.map((tournament: any) => (
          <Link
            key={tournament.id}
            href={getPublicTournamentHref(tournament)}
            className="block group"
          >
            <Card className="group border-slate-200 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 overflow-hidden bg-white cursor-pointer">
            <div className="relative overflow-hidden">
              <Image
                src={tournament.winnerImageUrl || "/placeholder.svg"}
                alt={`Ganadores del torneo ${tournament.tournamentName}`}
                width={400}
                height={256}
                className="w-full h-96 object-contain object-center bg-gray-100 transition-opacity duration-700"
                loading="lazy"
                placeholder="blur"
                blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxAAPwCdABmX/9k="
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

              {/* Floating Badges */}
              <div className="absolute top-3 left-3">
                <Badge className="bg-white/95 text-slate-700 backdrop-blur-sm shadow-sm border-0 text-xs px-2 py-1">
                  <Calendar className="h-3 w-3 mr-1" />
                  {new Date(tournament.endDate).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                  })}
                </Badge>
              </div>

              <div className="absolute top-3 right-3">
                <Badge className="bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm border-0 text-xs px-2 py-1">
                  <Trophy className="h-3 w-3 mr-1" />
                  Campeones
                </Badge>
              </div>

              {/* Champions Info - Simplified and smaller */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="bg-black/40 backdrop-blur-sm rounded-surface p-3 border border-white/20">
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <Trophy className="h-4 w-4 text-amber-400 mr-2" />
                      <span className="text-white font-semibold text-sm">¡Campeones!</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-amber-200 font-medium text-sm">
                        {tournament.winner.player1Name}
                      </p>
                      <p className="text-amber-200 font-medium text-sm">
                        {tournament.winner.player2Name}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors">
                  {tournament.tournamentName}
                </h3>

                <div className="flex items-center justify-center text-slate-600 text-sm mb-4 bg-slate-50 p-3 rounded-surface border border-slate-100">
                  <Clock className="h-4 w-4 mr-2 text-blue-600" />
                  <span className="font-medium">
                    Finalizado el{" "}
                    {new Date(tournament.endDate).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>

                <div className="flex items-center justify-center space-x-3">
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs px-3 py-1">
                    <Award className="h-3 w-3 mr-1" />
                    Victoria
                  </Badge>
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs px-3 py-1">
                    <Users className="h-3 w-3 mr-1" />
                    Pareja
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        ))}
      </div>

      {/* Navigation Arrows */}
      {totalPages > 1 && (
        <>
          <button
            onClick={prevSlide}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 bg-white shadow-xl rounded-full p-3 hover:bg-gray-50 transition-all duration-300 hover:scale-110 z-10"
          >
            <ChevronLeft className="h-6 w-6 text-gray-600" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 bg-white shadow-xl rounded-full p-3 hover:bg-gray-50 transition-all duration-300 hover:scale-110 z-10"
          >
            <ChevronRight className="h-6 w-6 text-gray-600" />
          </button>
        </>
      )}

      {/* Dots Indicator */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-8 space-x-2">
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentIndex ? "bg-blue-600 scale-125" : "bg-gray-300 hover:bg-gray-400"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
