"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, User, ChevronRight } from "lucide-react"
import { motion } from "framer-motion"

interface Instructor {
  id: string
  name: string
  image: string
  role: string
  experience: string
  specialties: string[]
  availability: string
}

interface ClubInstructorsProps {
  instructors: Instructor[]
}

export default function ClubInstructors({ instructors }: ClubInstructorsProps) {
  const [hoveredInstructor, setHoveredInstructor] = useState<string | null>(null)

  return (
    <div className="bg-white rounded-elevated shadow-md border border-slate-100 p-6 mb-8">
      <h2 className="text-xl font-bold text-slate-800 mb-6">Profesores y entrenadores</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {instructors.map((instructor, index) => (
          <motion.div
            key={instructor.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="border border-slate-100 rounded-elevated overflow-hidden hover:shadow-md transition-all duration-300"
            onMouseEnter={() => setHoveredInstructor(instructor.id)}
            onMouseLeave={() => setHoveredInstructor(null)}
          >
            <div className="relative">
              <img
                src={instructor.image || "/placeholder.svg"}
                alt={instructor.name}
                className="w-full h-48 object-cover"
              />
              <div
                className={`absolute inset-0 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300 ${
                  hoveredInstructor === instructor.id ? "opacity-70" : "opacity-50"
                }`}
              ></div>
              <div className="absolute bottom-0 left-0 p-4">
                <h3 className="text-lg font-bold text-white">{instructor.name}</h3>
                <Badge className="bg-violet-100 text-violet-800 border-violet-200 mt-1">{instructor.role}</Badge>
              </div>
            </div>

            <div className="p-4">
              <div className="space-y-3 mb-4">
                <div className="flex items-start">
                  <User className="h-4 w-4 mr-2 text-slate-400 mt-0.5" />
                  <div>
                    <span className="text-slate-500 text-sm">Experiencia</span>
                    <p className="font-medium text-slate-800">{instructor.experience}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Calendar className="h-4 w-4 mr-2 text-slate-400 mt-0.5" />
                  <div>
                    <span className="text-slate-500 text-sm">Disponibilidad</span>
                    <p className="font-medium text-slate-800">{instructor.availability}</p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <span className="text-slate-500 text-sm">Especialidades</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {instructor.specialties.map((specialty, i) => (
                    <Badge key={i} variant="outline" className="bg-slate-50 text-slate-700 font-normal">
                      {specialty}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button
                className={`w-full justify-between ${
                  hoveredInstructor === instructor.id
                    ? "bg-gradient-to-r from-violet-600 to-emerald-500 text-white"
                    : "bg-white text-slate-700 border border-slate-200"
                } transition-colors duration-300`}
              >
                Reservar clase
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
