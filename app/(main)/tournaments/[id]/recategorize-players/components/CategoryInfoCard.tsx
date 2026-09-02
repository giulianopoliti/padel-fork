'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Info } from 'lucide-react'

interface Category {
  name: string
  lower_range: number
  upper_range: number | null
}

interface CategoryInfoCardProps {
  categories: Category[]
}

export const CategoryInfoCard: React.FC<CategoryInfoCardProps> = ({ categories }) => {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Info className="h-5 w-5 text-blue-600" />
          Información de Categorías
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(category => (
            <div key={category.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-surface">
              <div>
                <h4 className="font-medium text-gray-900">{category.name}</h4>
                <p className="text-sm text-gray-600">
                  {category.lower_range} - {category.upper_range ? category.upper_range : '∞'} puntos
                </p>
              </div>
              <Badge variant="outline" className="ml-2">
                {category.lower_range}{category.upper_range ? `-${category.upper_range}` : '+'}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
