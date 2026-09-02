"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, Link2, Unlink } from "lucide-react"
import { searchUsers, linkPlayerToUser, unlinkPlayer } from "@/app/api/admin/players/actions"
import { useToast } from "@/components/ui/use-toast"

interface User {
  id: string
  email: string
  role: string
  isLinked: boolean
  linkedPlayerName: string | null
}

interface PlayerUserLinkComponentProps {
  playerId: string
  currentUserId: string | null
  currentUserEmail: string | null
  onLinkChange: () => void
}

export const PlayerUserLinkComponent = ({
  playerId,
  currentUserId,
  currentUserEmail,
  onLinkChange
}: PlayerUserLinkComponentProps) => {
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLinking, setIsLinking] = useState(false)

  // Búsqueda de usuarios
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true)
        try {
          const result = await searchUsers(searchQuery)
          if (result.data) {
            setSearchResults(result.data)
          } else {
            setSearchResults([])
          }
        } catch (error) {
          console.error("Error searching users:", error)
        } finally {
          setIsSearching(false)
        }
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery])

  const handleLinkUser = async (userId: string) => {
    setIsLinking(true)
    try {
      const result = await linkPlayerToUser(playerId, userId)
      if (result.success) {
        toast({
          title: "Éxito",
          description: "Usuario vinculado correctamente"
        })
        setSearchQuery("")
        setSearchResults([])
        onLinkChange()
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al vincular usuario",
        variant: "destructive"
      })
    } finally {
      setIsLinking(false)
    }
  }

  const handleUnlinkUser = async () => {
    setIsLinking(true)
    try {
      const result = await unlinkPlayer(playerId)
      if (result.success) {
        toast({
          title: "Éxito",
          description: "Usuario desvinculado correctamente"
        })
        onLinkChange()
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al desvincular usuario",
        variant: "destructive"
      })
    } finally {
      setIsLinking(false)
    }
  }

  return (
    <div className="space-y-4 pt-4 border-t">
      <h3 className="font-semibold text-sm text-slate-700">Vinculación de Usuario</h3>

      {/* Usuario actual vinculado */}
      {currentUserId ? (
        <div className="bg-blue-50 border border-blue-200 rounded-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">Usuario Vinculado</p>
              <p className="text-sm text-blue-700 mt-1">{currentUserEmail || "Sin email"}</p>
              <code className="text-xs bg-blue-100 px-2 py-1 rounded mt-2 inline-block">
                {currentUserId.substring(0, 8)}...
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlinkUser}
              disabled={isLinking}
              className="border-red-200 text-red-700 hover:bg-red-50"
            >
              <Unlink className="h-4 w-4 mr-2" />
              {isLinking ? "..." : "Desvincular"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor="user_search">Buscar Usuario por Email</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="user_search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Escribir email para buscar..."
                className="pl-10"
              />
            </div>
          </div>

          {/* Resultados de búsqueda */}
          {searchQuery.length >= 2 && (
            <div className="border rounded-surface max-h-64 overflow-y-auto">
              {isSearching ? (
                <div className="p-4 text-center text-slate-500">
                  Buscando...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  No se encontraron usuarios
                </div>
              ) : (
                <div className="divide-y">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      className="p-3 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{user.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {user.role}
                          </Badge>
                          {user.isLinked && (
                            <Badge variant="secondary" className="text-xs">
                              Ya vinculado a: {user.linkedPlayerName}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleLinkUser(user.id)}
                        disabled={user.isLinked || isLinking}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        {isLinking ? "..." : "Vincular"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
