import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import {
  Building2,
  FileText,
  Image as ImageIcon,
  Shield,
  Star,
  X,
} from 'lucide-react'
import TournamentBasicInfoForm from '../components/TournamentBasicInfoForm'
import TournamentImageSection from '../components/TournamentImageSection'
import { addTournamentClubsAction, removeTournamentClubsAction } from '../actions'
import { getTournamentSettingsData } from '../components/settings-data'
import { SettingsSectionHeader, SettingsShellCard } from '../components/settings-shell'

interface SettingsDatosPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function SettingsDatosPage({ params }: SettingsDatosPageProps) {
  const resolvedParams = await params
  const settingsData = await getTournamentSettingsData(resolvedParams.id)

  if (!settingsData) {
    return null
  }

  const {
    tournament,
    inscriptionsCount,
    imageSectionTournament,
    isAmericanTournament,
    currentClubs,
    manageableClubs,
  } = settingsData

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        eyebrow="Datos"
        title="Datos del torneo"
        description="Nombre, fechas, cupos, precio por jugador, portada y relaciones base del torneo."
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SettingsShellCard
          icon={<FileText className="h-5 w-5 text-emerald-600" />}
          title="Informacion basica"
          description="Edita nombre, descripcion, precio por jugador, cupo y rango de fechas sin salir del panel."
        >
          <TournamentBasicInfoForm
            tournamentId={tournament.id}
            initialData={{
              name: tournament.name,
              description: tournament.description,
              max_participants: tournament.max_participants,
              price: tournament.price,
              start_date: (tournament as any).start_date ?? null,
              end_date: (tournament as any).end_date ?? null,
              type: tournament.type ?? null,
              hide_venue: Boolean((tournament as any).hide_venue),
            }}
            inscriptionsCount={inscriptionsCount}
          />
        </SettingsShellCard>

        <SettingsShellCard
          icon={<ImageIcon className="h-5 w-5 text-indigo-600" />}
          title="Portada del torneo"
          description="Sube o reemplaza la imagen que acompana la presentacion publica."
        >
          <TournamentImageSection tournament={imageSectionTournament} />
        </SettingsShellCard>
      </div>

      {!isAmericanTournament && (
        <SettingsShellCard
          icon={<Building2 className="h-5 w-5 text-slate-700" />}
          title="Clubes del torneo"
          description="Gestiona los clubes asociados. El club principal queda protegido."
        >
          <div className="space-y-5">
            {tournament.club_id && (
              <Alert className="border-blue-200 bg-blue-50">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-900">Club principal protegido</AlertTitle>
                <AlertDescription className="text-blue-800">
                  El club principal no se puede quitar porque sostiene permisos, horarios y
                  partidos del torneo.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900">Clubes actualmente vinculados</p>
              <div className="flex flex-wrap gap-2">
                {currentClubs.map((clubLink: any) => {
                  const isMainClub = tournament.club_id === clubLink.club_id
                  return (
                    <Badge
                      key={clubLink.club_id}
                      variant="outline"
                      className={`gap-2 px-3 py-1.5 ${
                        isMainClub
                          ? 'border-blue-300 bg-blue-50 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        {isMainClub ? <Star className="h-3 w-3 fill-blue-600 text-blue-600" /> : null}
                        {clubLink.clubes?.name || clubLink.club_id}
                        {isMainClub ? ' (Principal)' : ''}
                      </span>
                      {!isMainClub && (
                        <form
                          action={async () => {
                            'use server'
                            await removeTournamentClubsAction(tournament.id, [clubLink.club_id])
                          }}
                        >
                          <button
                            aria-label={`Quitar ${clubLink.clubes?.name || ''}`}
                            className="inline-flex items-center text-slate-500 transition-colors hover:text-red-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      )}
                    </Badge>
                  )
                })}

                {currentClubs.length === 0 && (
                  <p className="text-sm text-slate-500">Aun no hay clubes asociados.</p>
                )}
              </div>
            </div>

            <Separator />

            {manageableClubs.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-900">Agregar clubes gestionables</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="bg-white">
                      <Building2 className="mr-2 h-4 w-4" />
                      Buscar y agregar clubes
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar club..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>No se encontraron clubes</CommandEmpty>
                        <CommandGroup>
                          {manageableClubs.map((club) => {
                            const alreadyLinked = currentClubs.some((current: any) => current.club_id === club.id)
                            return (
                              <form
                                key={club.id}
                                action={async () => {
                                  'use server'
                                  await addTournamentClubsAction(tournament.id, [club.id])
                                }}
                              >
                                <CommandItem className="flex items-center gap-3">
                                  <Checkbox checked={alreadyLinked} disabled={alreadyLinked} />
                                  <span className="flex-1">{club.name}</span>
                                  <Button type="submit" variant="ghost" size="sm" disabled={alreadyLinked}>
                                    Agregar
                                  </Button>
                                </CommandItem>
                              </form>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </SettingsShellCard>
      )}
    </div>
  )
}
