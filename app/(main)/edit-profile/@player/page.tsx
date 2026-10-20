"use client"

import { useState, useEffect, useActionState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ProfileSidebar } from "@/components/profile/profile-sidebar"
import { PersonalDataSection } from "@/components/profile/personal-data-section"
import { GameDataSection } from "@/components/profile/game-data-section"
import { SecuritySection } from "@/components/profile/security-section"
import { EmailPreferences } from "@/components/profile/email-preferences"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/components/ui/use-toast"
import { getPlayerProfile, completeUserProfile, type FormState } from "@/app/(main)/edit-profile/actions"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { User, Trophy, Shield } from "lucide-react"

interface Club {
  id: string
  name: string | null
}

// Define a type for the user profile data we expect
interface UserProfile {
  id?: string
  email?: string
  role?: string
  avatar_url?: string | null
  first_name?: string
  last_name?: string
  dni?: string | null
  phone?: string | null
  date_of_birth?: string | null
  category_name?: string | null
  score?: number | null
  preferred_hand?: string | null
  racket?: string | null
  description?: string | null
  gender?: string | null
  preferred_side?: string | null
  club_id?: string | null
  profile_image_url?: string | null
  solo_player_emails?: boolean
}

const initialFormState: FormState = {
  message: "",
  errors: null,
  success: false,
}

export default function EditProfilePage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<string>("personal")
  const [userProfileData, setUserProfileData] = useState<UserProfile | null>(null)
  const [allClubsData, setAllClubsData] = useState<Club[]>([])
  const [isFetchingData, setIsFetchingData] = useState(true)
  const { toast } = useToast()
  const handleEmailPreferenceSaved = (enabled: boolean): void => setUserProfileData(profile => profile ? { ...profile, solo_player_emails: enabled } : profile)

  // useActionState for form handling
  const [formState, formAction, isPending] = useActionState<FormState, FormData>(completeUserProfile, initialFormState)

  useEffect(() => {
    const fetchData = async () => {
      setIsFetchingData(true)
      try {
        const result = await getPlayerProfile()
        if (result.success && result.userProfile) {
          setUserProfileData(result.userProfile as UserProfile)
          setAllClubsData(result.allClubs || [])
          if (result.message !== "Datos obtenidos con éxito.") {
            toast({ title: "Información", description: result.message })
          }
        } else {
          toast({
            title: "Error al cargar el perfil",
            description: result.message || "No se pudieron obtener los datos del perfil.",
            variant: "destructive",
          })
          setUserProfileData({})
        }
      } catch (error) {
        console.error("Error fetching profile data:", error)
        toast({
          title: "Error Crítico",
          description: "Ocurrió un error inesperado al cargar tus datos.",
          variant: "destructive",
        })
        setUserProfileData({})
      } finally {
        setIsFetchingData(false)
      }
    }
    fetchData()
  }, [toast])

  useEffect(() => {
    if (formState?.message && formState.message !== "") {
      toast({
        title: formState.success ? "¡Éxito!" : "Error",
        description: formState.message,
        variant: formState.success ? "default" : "destructive",
      })
      
      // Redirect to the neutral panel route on successful update
      if (formState.success) {
        setTimeout(() => {
          router.push('/panel')
        }, 1500) // Wait 1.5 seconds to show the success message
      }
    }
  }, [formState, toast, router])

  const renderActiveSection = () => {
    if (isFetchingData || !userProfileData) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-200"></div>
            <div className="h-5 w-48 bg-blue-100 rounded"></div>
          </div>
        </div>
      )
    }
    const defaultsForSections = {
      ...userProfileData,
      score: userProfileData.score?.toString() ?? "",
    }

    return (
      <>
        <div style={{ display: activeSection === "personal" ? "block" : "none" }}>
          <PersonalDataSection defaultValues={defaultsForSections} />
          <EmailPreferences enabled={userProfileData.solo_player_emails !== false} onSaved={handleEmailPreferenceSaved} />
        </div>
        <div style={{ display: activeSection === "game" ? "block" : "none" }}>
          <GameDataSection defaultValues={defaultsForSections} allClubs={allClubsData} />
        </div>
        <div style={{ display: activeSection === "security" ? "block" : "none" }}>
          <SecuritySection userEmail={userProfileData.email} />
        </div>
      </>
    )
  }

  const getSectionInfo = () => {
    switch (activeSection) {
      case "personal":
        return {
          title: "Información Personal",
          description: "Gestiona tu información personal y detalles de contacto",
          badge: "Datos Personales",
        }
      case "game":
        return {
          title: "Preferencias de Juego",
          description: "Configura tus preferencias de juego y club",
          badge: "Datos de Juego",
        }
      case "security":
        return {
          title: "Configuración de Seguridad",
          description: "Administra la seguridad de tu cuenta",
          badge: "Seguridad",
        }
      default:
        return {
          title: "Perfil",
          description: "Gestiona tu perfil",
          badge: "Perfil",
        }
    }
  }

  const sectionInfo = getSectionInfo()

  return (
    <div className="max-w-6xl mx-auto">
      <Card className="bg-white border border-gray-200 shadow-sm overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Mi Perfil</h1>
              <p className="text-sm text-gray-600">Configuración de cuenta</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-8rem)]">
          {/* Desktop Sidebar - Hidden on mobile */}
          <div className="hidden lg:block lg:w-64 lg:border-r border-gray-200 bg-gray-50">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Mi Perfil</h1>
                  <p className="text-sm text-gray-600">Configuración de cuenta</p>
                </div>
              </div>

              <ProfileSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            {/* Mobile Tabs */}
            <div className="lg:hidden">
              <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full">
                <TabsList className="w-full grid grid-cols-3 h-auto p-1 bg-gray-100 rounded-none border-b border-gray-200">
                  <TabsTrigger
                    value="personal"
                    className="flex flex-col items-center gap-1 py-3 data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  >
                    <User className="h-4 w-4" />
                    <span className="text-xs font-medium">Personal</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="game"
                    className="flex flex-col items-center gap-1 py-3 data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  >
                    <Trophy className="h-4 w-4" />
                    <span className="text-xs font-medium">Juego</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="security"
                    className="flex flex-col items-center gap-1 py-3 data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  >
                    <Shield className="h-4 w-4" />
                    <span className="text-xs font-medium">Seguridad</span>
                  </TabsTrigger>
                </TabsList>

                <form action={formAction} className="space-y-6">
                  {userProfileData?.role && <input type="hidden" name="role" value={userProfileData.role} />}

                  {/* Hidden inputs to always preserve all data when submitting from any tab */}
                  {!isFetchingData && userProfileData && activeSection !== "personal" && (
                    <>
                      <input type="hidden" name="first_name" value={userProfileData.first_name || ""} />
                      <input type="hidden" name="last_name" value={userProfileData.last_name || ""} />
                      <input type="hidden" name="dni" value={userProfileData.dni || ""} />
                      <input type="hidden" name="phone" value={userProfileData.phone || ""} />
                      <input type="hidden" name="date_of_birth" value={userProfileData.date_of_birth || ""} />
                      <input type="hidden" name="gender" value={userProfileData.gender || ""} />
                      <input type="hidden" name="avatar_url_existing" value={userProfileData.profile_image_url || ""} />
                    </>
                  )}

                  {!isFetchingData && userProfileData && activeSection !== "game" && (
                    <>
                      <input type="hidden" name="club_id" value={userProfileData.club_id || ""} />
                      <input type="hidden" name="preferred_side" value={userProfileData.preferred_side || ""} />
                      <input type="hidden" name="preferred_hand" value={userProfileData.preferred_hand || ""} />
                      <input type="hidden" name="racket" value={userProfileData.racket || ""} />
                      <input type="hidden" name="description" value={userProfileData.description || ""} />
                    </>
                  )}

                  <TabsContent value="personal" className="p-4 space-y-6 mt-0">
                    <div className="mb-4">
                      <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Datos Personales</Badge>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Información Personal</h2>
                      <p className="text-sm text-gray-600">Gestiona tu información personal y detalles de contacto</p>
                    </div>
                    {isFetchingData || !userProfileData ? (
                      <div className="flex items-center justify-center h-64">
                        <div className="animate-pulse flex flex-col items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                          <div className="h-5 w-48 bg-blue-100 rounded"></div>
                        </div>
                      </div>
                    ) : (
                      <><PersonalDataSection defaultValues={{
                        ...userProfileData,
                        score: userProfileData.score?.toString() ?? "",
                      }} /><EmailPreferences enabled={userProfileData.solo_player_emails !== false} onSaved={handleEmailPreferenceSaved} /></>
                    )}
                  </TabsContent>

                  <TabsContent value="game" className="p-4 space-y-6 mt-0">
                    <div className="mb-4">
                      <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Datos de Juego</Badge>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Preferencias de Juego</h2>
                      <p className="text-sm text-gray-600">Configura tus preferencias de juego y club</p>
                    </div>
                    {isFetchingData || !userProfileData ? (
                      <div className="flex items-center justify-center h-64">
                        <div className="animate-pulse flex flex-col items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                          <div className="h-5 w-48 bg-blue-100 rounded"></div>
                        </div>
                      </div>
                    ) : (
                      <GameDataSection defaultValues={{
                        ...userProfileData,
                        score: userProfileData.score?.toString() ?? "",
                      }} allClubs={allClubsData} />
                    )}
                  </TabsContent>

                  <TabsContent value="security" className="p-4 space-y-6 mt-0">
                    <div className="mb-4">
                      <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Seguridad</Badge>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Configuración de Seguridad</h2>
                      <p className="text-sm text-gray-600">Administra la seguridad de tu cuenta</p>
                    </div>
                    {isFetchingData || !userProfileData ? (
                      <div className="flex items-center justify-center h-64">
                        <div className="animate-pulse flex flex-col items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                          <div className="h-5 w-48 bg-blue-100 rounded"></div>
                        </div>
                      </div>
                    ) : (
                      <SecuritySection userEmail={userProfileData.email} />
                    )}
                  </TabsContent>

                  {activeSection !== "security" && (
                    <div className="sticky bottom-0 pt-4 pb-4 px-4 bg-gradient-to-t from-white via-white to-transparent">
                      <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                        disabled={isPending || isFetchingData}
                      >
                        {isPending ? "Actualizando..." : "Guardar Cambios"}
                      </Button>
                    </div>
                  )}
                </form>
              </Tabs>
            </div>

            {/* Desktop View */}
            <div className="hidden lg:block p-6 lg:p-8">
              <div className="mb-8">
                <Badge className="mb-3 px-3 py-1 bg-blue-100 text-blue-800 border-0">{sectionInfo.badge}</Badge>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{sectionInfo.title}</h2>
                <p className="text-gray-600 max-w-2xl">{sectionInfo.description}</p>
              </div>

              {activeSection === "security" ? (
                <div className="max-w-3xl space-y-6">{renderActiveSection()}</div>
              ) : (
                <form action={formAction} className="max-w-3xl space-y-6">
                  {userProfileData?.role && <input type="hidden" name="role" value={userProfileData.role} />}

                  {renderActiveSection()}

                  <div className="sticky bottom-0 pt-6 pb-4 -mx-4 px-4 bg-gradient-to-t from-white via-white to-transparent">
                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                      disabled={isPending || isFetchingData}
                    >
                      {isPending ? "Actualizando..." : "Guardar Cambios"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Toaster />
    </div>
  )
}
