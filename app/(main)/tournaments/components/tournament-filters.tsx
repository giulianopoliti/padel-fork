"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Filter, X, ChevronDown } from "lucide-react"

interface TournamentFiltersProps {
  categories: Array<{ name: string }>
  clubs: Array<{ id: string; name: string }>
}

export default function TournamentFilters({ categories, clubs }: TournamentFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)

  const categoryFilter = searchParams.get("category") || "all"
  const clubFilter = searchParams.get("club") || "all"
  const genderFilter = searchParams.get("gender") || "all"

  useEffect(() => {
    const checkDesktop = () => {
      setIsOpen(window.innerWidth >= 768)
    }

    checkDesktop()
    window.addEventListener("resize", checkDesktop)

    return () => window.removeEventListener("resize", checkDesktop)
  }, [])

  const updateFilter = (key: "category" | "club" | "gender", value: string) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value === "all") {
      params.delete(key)
    } else {
      params.set(key, value)
    }

    params.delete("page")
    router.push(`?${params.toString()}`)
  }

  const handleClearFilters = () => {
    const params = new URLSearchParams()
    const search = searchParams.get("search")
    const type = searchParams.get("type")

    if (search) {
      params.set("search", search)
    }

    if (type) {
      params.set("type", type)
    }

    router.push(`?${params.toString()}`)
  }

  const hasActiveFilters = categoryFilter !== "all" || clubFilter !== "all" || genderFilter !== "all"
  const activeFiltersCount = [
    categoryFilter !== "all",
    clubFilter !== "all",
    genderFilter !== "all",
  ].filter(Boolean).length

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-display border border-gray-200 px-3 py-2 transition-colors hover:bg-gray-50">
        <Filter className="h-4 w-4 text-gray-500" />
        <span className="font-medium text-gray-700">
          Filtros
          {hasActiveFilters ? (
            <span className="ml-1 text-sm text-blue-600">
              ({activeFiltersCount} aplicado{activeFiltersCount > 1 ? "s" : ""})
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-gray-500 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-4">
        <div className="flex flex-col flex-wrap items-start gap-4 md:flex-row md:items-center">
          <div className="w-full md:w-56">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 transform text-gray-400" size={18} />
              <Select value={categoryFilter} onValueChange={(value) => updateFilter("category", value)}>
                <SelectTrigger className="pl-10 text-gray-600 placeholder:text-gray-400 focus:border-blue-300 focus:ring-blue-200">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorias</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.name} value={category.name}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="w-full md:w-56">
            <Select value={clubFilter} onValueChange={(value) => updateFilter("club", value)}>
              <SelectTrigger className="text-gray-600 placeholder:text-gray-400 focus:border-blue-300 focus:ring-blue-200">
                <SelectValue placeholder="Club" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los clubes</SelectItem>
                {clubs.map((club) => (
                  <SelectItem key={club.id} value={club.id}>
                    {club.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full md:w-56">
            <Select value={genderFilter} onValueChange={(value) => updateFilter("gender", value)}>
              <SelectTrigger className="text-gray-600 placeholder:text-gray-400 focus:border-blue-300 focus:ring-blue-200">
                <SelectValue placeholder="Genero" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los generos</SelectItem>
                <SelectItem value="MALE">Caballeros</SelectItem>
                <SelectItem value="FEMALE">Damas</SelectItem>
                <SelectItem value="MIXED">Mixto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters ? (
            <Button
              variant="outline"
              onClick={handleClearFilters}
              className="w-full border-gray-200 text-gray-600 hover:bg-gray-50 md:w-auto"
            >
              <X className="mr-2 h-4 w-4" />
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
