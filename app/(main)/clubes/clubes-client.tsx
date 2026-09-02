"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { MapPin, Star, ChevronRight, Users, Clock, Search, Filter, Award, Building2 } from "lucide-react"
import { useEffect, useState } from "react"

interface Club {
  id: string
  name: string
  address: string
  coverImage: string
  rating: number
  reviewCount: number
  courts: number
  opens_at: string
  closes_at: string
  services: { name: string }[]
}

interface ClubesClientComponentProps {
  initialClubes: Club[]
  userRole: string | null
}

// 🚀 OPTIMIZACIÓN FASE 3.1: Componente cliente optimizado
export default function ClubesClientComponent({ initialClubes, userRole }: ClubesClientComponentProps) {
  const [clubes] = useState<Club[]>(initialClubes) // 🚀 No fetch inicial, usa datos del servidor
  const [filteredClubes, setFilteredClubes] = useState<Club[]>(initialClubes)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCity, setSelectedCity] = useState("")

  // 🚀 OPTIMIZACIÓN: Solo maneja filtros, no fetch inicial
  const handleFilterClubes = () => {
    let filtered = [...clubes]

    // Filtrar por término de búsqueda
    if (searchTerm.trim() !== "") {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(club => 
        club.name?.toLowerCase().includes(searchLower) ||
        club.address?.toLowerCase().includes(searchLower)
      )
    }

    // Filtrar por ciudad
    if (selectedCity !== "") {
      filtered = filtered.filter(club => 
        club.address?.toLowerCase().includes(selectedCity.toLowerCase())
      )
    }

    setFilteredClubes(filtered)
  }

  // Manejar cambio en búsqueda
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
  }

  // Manejar cambio en filtro de ciudad
  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCity(e.target.value)
  }

  // Limpiar filtros
  const handleClearFilters = () => {
    setSearchTerm("")
    setSelectedCity("")
    setFilteredClubes(clubes)
  }

  // 🚀 OPTIMIZACIÓN: Solo re-filtra cuando cambian los filtros
  useEffect(() => {
    handleFilterClubes()
  }, [searchTerm, selectedCity, clubes])

  return (
    <>
      {/* Search Section */}
      <div className="bg-white rounded-display shadow-lg border border-slate-200 p-6 mb-12 max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nombre o ubicación..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-elevated focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-slate-700 font-medium transition-all duration-200"
            />
          </div>
          <div className="w-full md:w-64">
            <div className="relative">
              <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
              <select
                value={selectedCity}
                onChange={handleCityChange}
                className="w-full pl-12 pr-10 py-3 border border-slate-200 rounded-elevated focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent appearance-none bg-white text-slate-700 font-medium cursor-pointer transition-all duration-200"
              >
                <option value="">Todas las ciudades</option>
                <option value="Buenos Aires">Buenos Aires</option>
                <option value="Córdoba">Córdoba</option>
                <option value="Rosario">Rosario</option>
                <option value="Mendoza">Mendoza</option>
                <option value="La Plata">La Plata</option>
                <option value="Mar del Plata">Mar del Plata</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <ChevronRight className="h-4 w-4 text-slate-400 rotate-90" />
              </div>
            </div>
          </div>
        </div>
        
        {/* Filter results info and clear button */}
        {(searchTerm || selectedCity) && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Mostrando {filteredClubes.length} de {clubes.length} clubes
              {searchTerm && <span className="ml-1">para "{searchTerm}"</span>}
              {selectedCity && <span className="ml-1">en {selectedCity}</span>}
            </div>
            <button
              onClick={handleClearFilters}
              className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors duration-200"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Clubs Grid */}
      {filteredClubes.length === 0 ? (
        <div className="text-center py-20">
          <div className="bg-white rounded-display border border-slate-200 shadow-lg p-12 max-w-2xl mx-auto">
            <div className="bg-slate-100 w-16 h-16 rounded-display flex items-center justify-center mx-auto mb-6">
              <Building2 className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-4">
              {clubes.length === 0 ? "No hay clubes registrados" : "No se encontraron clubes"}
            </h3>
            <p className="text-slate-600 text-lg">
              {clubes.length === 0 
                ? "Próximamente tendremos los mejores clubes de pádel." 
                : "Intenta ajustar tus filtros de búsqueda."
              }
            </p>
            {(searchTerm || selectedCity) && (
              <button
                onClick={handleClearFilters}
                className="mt-4 bg-slate-600 hover:bg-slate-700 text-white px-6 py-2 rounded-surface font-medium transition-colors duration-200"
              >
                Ver todos los clubes
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-8xl mx-auto">
          {filteredClubes.map((club) => (
            <div key={club.id} className="h-full group">
              <Link href={`/clubes/${club.id}`} className="block h-full">
                <div className="bg-white rounded-display overflow-hidden border border-slate-200 shadow-lg transition-all duration-300 h-full flex flex-col group-hover:shadow-xl group-hover:border-slate-300 group-hover:-translate-y-1">
                  {/* Club Image */}
                  <div className="relative overflow-hidden h-48">
                    {club.coverImage ? (
                      <>
                        <img
                          src={club.coverImage}
                          alt={club.name || "Club de pádel"}
                          className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                      </>
                    ) : (
                      <>
                        {/* Placeholder cuando no hay imagen */}
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800"></div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                          <Building2 className="h-12 w-12 sm:h-16 sm:w-16 mb-3 opacity-40" />
                          <p className="text-sm sm:text-base font-bold text-center line-clamp-3 opacity-90">
                            {club.name || "Club sin nombre"}
                          </p>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                      </>
                    )}

                    {/* Rating Badge */}
                    <div className="absolute top-3 left-3">
                      <Badge className="bg-white/90 text-slate-700 backdrop-blur-sm shadow-sm border-0">
                        <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-400" />
                        {club.rating > 0 ? club.rating : "Nuevo"}
                      </Badge>
                    </div>

                    {/* Premium Badge */}
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-gradient-to-r from-slate-600 to-slate-800 text-white shadow-sm border-0">
                        <Award className="h-3 w-3 mr-1" />
                        Premium
                      </Badge>
                    </div>
                  </div>

                  {/* Club Content */}
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-slate-600 transition-colors">
                      {club.name || "Club sin nombre"}
                    </h3>

                    <div className="flex items-center text-slate-500 text-sm mb-4">
                      <MapPin className="h-4 w-4 mr-2 flex-shrink-0 text-slate-400" />
                      <span className="font-medium truncate">{club.address || "Dirección no disponible"}</span>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="flex items-center text-slate-600 text-sm bg-slate-50 rounded-surface p-3 border border-slate-100">
                        <Users className="h-4 w-4 mr-2 text-slate-500" />
                        <div>
                          <span className="block font-bold text-lg text-slate-800">{club.courts || 0}</span>
                          <span className="text-xs text-slate-500">pistas</span>
                        </div>
                      </div>
                      <div className="flex items-center text-slate-600 text-sm bg-slate-50 rounded-surface p-3 border border-slate-100">
                        <Clock className="h-4 w-4 mr-2 text-slate-500" />
                        <div>
                          <span className="block font-bold text-sm text-slate-800">
                            {club.opens_at && club.closes_at ? `${club.opens_at.slice(0, 5)}` : "8:00"}
                          </span>
                          <span className="text-xs text-slate-500">apertura</span>
                        </div>
                      </div>
                    </div>

                    {/* Services */}
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">Servicios</h4>
                      <div className="flex flex-wrap gap-1">
                        {club.services && club.services.length > 0 ? (
                          <>
                            {club.services.slice(0, 2).map((service: any, i: number) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="bg-slate-50 text-slate-600 border-slate-200 text-xs font-normal"
                              >
                                {service.name}
                              </Badge>
                            ))}
                            {club.services.length > 2 && (
                              <Badge
                                variant="outline"
                                className="bg-slate-50 text-slate-500 border-slate-200 text-xs font-normal"
                              >
                                +{club.services.length - 2}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-slate-50 text-slate-500 border-slate-200 text-xs font-normal"
                          >
                            Sin servicios especificados
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Reviews */}
                    <div className="text-sm text-slate-500 mb-4 flex items-center justify-between">
                      <span>{club.reviewCount > 0 ? `${club.reviewCount} opiniones` : "Sin opiniones aún"}</span>
                      <div className="flex items-center">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3 w-3 ${i < Math.floor(club.rating) ? "text-amber-400 fill-amber-400" : "text-slate-300"}`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-auto">
                      <div className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-800 rounded-elevated group-hover:shadow-sm transition-all duration-300 p-3 flex items-center justify-between">
                        <span className="font-semibold">Ver detalles</span>
                        <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  )
} 