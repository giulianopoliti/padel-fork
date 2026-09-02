"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Phone, MessageCircle, ChevronDown } from "lucide-react"

interface ContactButtonProps {
  club: {
    phone: string
    name: string
  }
}

const ContactButton = ({ club }: ContactButtonProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const handleCall = () => {
    // Limpiar el número de teléfono (remover espacios, guiones, etc.)
    const cleanPhone = club.phone.replace(/[\s\-\(\)]/g, "")
    window.open(`tel:${cleanPhone}`, "_self")
  }

  const handleWhatsApp = () => {
    // Limpiar el número de teléfono y agregar código de país si no lo tiene
    let cleanPhone = club.phone.replace(/[\s\-\(\)]/g, "")
    
    // Si no empieza con +54 (Argentina), agregarlo
    if (!cleanPhone.startsWith("+54") && !cleanPhone.startsWith("54")) {
      cleanPhone = `+54${cleanPhone}`
    } else if (cleanPhone.startsWith("54") && !cleanPhone.startsWith("+54")) {
      cleanPhone = `+${cleanPhone}`
    }

    // Crear mensaje predeterminado
    const message = encodeURIComponent(`Hola! Me interesa obtener información sobre ${club.name}. ¿Podrían ayudarme?`)
    
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank")
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button className="w-full bg-gradient-to-r from-slate-600 to-slate-800 hover:from-slate-700 hover:to-slate-900 text-white rounded-elevated shadow-lg">
          <Phone className="h-4 w-4 mr-2" />
          Contactar
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuItem 
          onClick={handleCall}
          className="cursor-pointer"
        >
          <Phone className="h-4 w-4 mr-2 text-green-600" />
          Llamar ahora
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={handleWhatsApp}
          className="cursor-pointer"
        >
          <MessageCircle className="h-4 w-4 mr-2 text-green-500" />
          Enviar WhatsApp
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ContactButton 