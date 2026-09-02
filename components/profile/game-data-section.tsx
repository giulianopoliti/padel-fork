import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trophy } from "lucide-react"

interface GameDataSectionProps {
  defaultValues: any
  allClubs: any[]
}

export function GameDataSection({ defaultValues, allClubs }: GameDataSectionProps) {
  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="border-b border-gray-100 p-4 md:p-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-surface">
            <Trophy className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-base md:text-lg font-semibold text-gray-900">Datos de Juego</CardTitle>
            <p className="text-xs md:text-sm text-gray-600">Información sobre tu juego y preferencias</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="club_id" className="text-sm font-medium text-gray-700">
            Club
          </Label>
          <Select name="club_id" defaultValue={defaultValues.club_id}>
            <SelectTrigger className="border-gray-300 focus:border-blue-500 focus:ring-blue-500">
              <SelectValue placeholder="Selecciona un club" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200">
              <SelectItem value="NO_CLUB" className="text-gray-700 hover:bg-blue-50">
                Sin club
              </SelectItem>
              {allClubs.map((club) => (
                <SelectItem key={club.id} value={club.id} className="text-gray-700 hover:bg-blue-50">
                  {club.name || "Club sin nombre"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-700">Lado Preferido</Label>
          <RadioGroup
            name="preferred_side"
            defaultValue={defaultValues.preferred_side}
            className="flex flex-col space-y-2"
          >
            <div className="flex items-center space-x-3 bg-white p-3 rounded-surface border border-gray-200 hover:border-blue-300 transition-colors">
              <RadioGroupItem value="DRIVE" id="side-drive" className="text-blue-600 border-gray-300" />
              <Label htmlFor="side-drive" className="text-gray-700">
                Drive
              </Label>
            </div>
            <div className="flex items-center space-x-3 bg-white p-3 rounded-surface border border-gray-200 hover:border-blue-300 transition-colors">
              <RadioGroupItem value="REVES" id="side-reves" className="text-blue-600 border-gray-300" />
              <Label htmlFor="side-reves" className="text-gray-700">
                Revés
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-700">Mano Preferida</Label>
          <RadioGroup
            name="preferred_hand"
            defaultValue={defaultValues.preferred_hand}
            className="flex flex-col space-y-2"
          >
            <div className="flex items-center space-x-3 bg-white p-3 rounded-surface border border-gray-200 hover:border-blue-300 transition-colors">
              <RadioGroupItem value="RIGHT" id="hand-right" className="text-blue-600 border-gray-300" />
              <Label htmlFor="hand-right" className="text-gray-700">
                Diestro
              </Label>
            </div>
            <div className="flex items-center space-x-3 bg-white p-3 rounded-surface border border-gray-200 hover:border-blue-300 transition-colors">
              <RadioGroupItem value="LEFT" id="hand-left" className="text-blue-600 border-gray-300" />
              <Label htmlFor="hand-left" className="text-gray-700">
                Zurdo
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="racket" className="text-sm font-medium text-gray-700">
            Paleta
          </Label>
          <Input
            id="racket"
            name="racket"
            defaultValue={defaultValues.racket}
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="text-sm font-medium text-gray-700">
            Descripción Personal
          </Label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={defaultValues.description}
            placeholder="Cuéntanos algo divertido sobre ti, tu estilo de juego, o lo que más te gusta del pádel..."
            className="w-full px-3 py-2 border border-gray-300 rounded-control focus:border-blue-500 focus:ring-blue-500 resize-none text-sm"
            maxLength={200}
          />
          <p className="text-xs text-gray-500">Máximo 200 caracteres</p>
        </div>


      </CardContent>
    </Card>
  )
}
