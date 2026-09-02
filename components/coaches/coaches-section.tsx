"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { GraduationCap, Star, Calendar, ChevronRight, Award } from 'lucide-react'
import { motion } from "framer-motion"

// Datos de ejemplo para los entrenadores
const coaches = [
  {
    id: "1",
    name: "Carlos Rodríguez",
    image: "https://vulusxqgknaejdxnhiex.supabase.co/storage/v1/object/public/imagenes/prueba/prof%20padel%20prueba.jpg?height=300&width=300",
    specialty: "Técnica avanzada",
    experience: "15 años",
    rating: 4.9,
    reviewCount: 124,
    availability: "Lunes a Viernes",
    club: "Club Padel Madrid",
    certifications: ["Entrenador Nivel 3", "Preparador Físico"],
    price: "45€/hora",
  },
  {
    id: "2",
    name: "Laura Martínez",
    image: "/placeholder.svg?height=300&width=300",
    specialty: "Iniciación y perfeccionamiento",
    experience: "8 años",
    rating: 4.8,
    reviewCount: 98,
    availability: "Lunes a Sábado",
    club: "Padel Indoor Barcelona",
    certifications: ["Entrenador Nivel 2", "Psicología deportiva"],
    price: "40€/hora",
  },
  {
    id: "3",
    name: "Javier López",
    image: "/placeholder.svg?height=300&width=300",
    specialty: "Preparación física",
    experience: "10 años",
    rating: 4.7,
    reviewCount: 87,
    availability: "Martes a Domingo",
    club: "Club Padel Valencia",
    certifications: ["Entrenador Nivel 3", "Fisioterapeuta"],
    price: "50€/hora",
  },
  {
    id: "4",
    name: "Ana García",
    image: "/placeholder.svg?height=300&width=300",
    specialty: "Táctica de competición",
    experience: "12 años",
    rating: 4.9,
    reviewCount: 112,
    availability: "Lunes a Domingo",
    club: "Padel Club Sevilla",
    certifications: ["Entrenador Nivel 3", "Ex-jugadora profesional"],
    price: "55€/hora",
  },
]

export default function CoachesSection() {
  const [hoveredCoach, setHoveredCoach] = useState<string | null>(null)

  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-teal-50 via-white to-blue-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">Entrenadores Profesionales</h2>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Mejora tu juego con los mejores entrenadores especializados en pádel
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {coaches.map((coach, index) => (
            <motion.div
              key={coach.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="h-full"
              onMouseEnter={() => setHoveredCoach(coach.id)}
              onMouseLeave={() => setHoveredCoach(null)}
            >
              <Card
                className={`h-full flex flex-col overflow-hidden hover:shadow-lg transition-all duration-300 bg-sky-50 ${
                  hoveredCoach === coach.id ? "transform -translate-y-1" : ""
                }`}
              >
                <div className="relative">
                  <img src={coach.image || "/placeholder.svg"} alt={coach.name} className="w-full h-64 object-cover object-center" />
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-white/90 text-slate-700 backdrop-blur-sm">
                      <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-400" />
                      {coach.rating}
                    </Badge>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-sky-100/95 to-transparent p-4">
                    <h3 className="text-xl font-bold text-slate-800">{coach.name}</h3>
                    <p className="text-slate-700 text-sm">{coach.specialty}</p>
                  </div>
                </div>

                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-lg font-medium text-teal-700 flex items-center">
                    <GraduationCap className="h-5 w-5 mr-2 text-teal-600" />
                    {coach.experience} de experiencia
                  </CardTitle>
                </CardHeader>

                <CardContent className="flex-grow">
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-slate-600">
                      <Calendar className="h-4 w-4 mr-2 text-slate-400" />
                      <span>Disponibilidad: {coach.availability}</span>
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <Award className="h-4 w-4 mr-2 text-slate-400" />
                      <span>Club: {coach.club}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {coach.certifications.map((cert, i) => (
                        <Badge key={i} className="bg-teal-50 text-teal-700 border border-teal-200">
                          {cert}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="border-t border-slate-100 bg-slate-50 mt-auto">
                  <div className="w-full flex items-center justify-between">
                    <span className="font-bold text-teal-700">{coach.price}</span>
                    <Button
                      asChild
                      className="bg-gradient-to-r from-teal-600 to-blue-600 hover:opacity-90 text-white"
                    >
                      <Link href={`/coaches/${coach.id}`} className="flex items-center">
                        Reservar clase
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="flex justify-center mt-10">
          <Button
            asChild
            className="bg-gradient-to-r from-teal-600 to-blue-600 hover:opacity-90 text-white rounded-elevated"
          >
            <Link href="/coaches" className="flex items-center">
              Ver todos los entrenadores
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
