'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BracketMatchV2 } from '../types/bracket-types'

interface RoundGroupLike {
  round: string
  matches: BracketMatchV2[]
  displayName: string
  totalMatches: number
  completedMatches: number
  canPlay: number
}

export interface TreeMatchPosition {
  match: BracketMatchV2
  round: string
  roundIndex: number
  x: number
  y: number
  width: number
  height: number
}

export interface TreeRoundColumn {
  round: string
  displayName: string
  roundIndex: number
  x: number
  width: number
  totalMatches: number
  completedMatches: number
  canPlay: number
}

export interface TreeConnectorPath {
  id: string
  sourceMatchId: string
  targetMatchId: string
  d: string
  inactive?: boolean
}

export interface TreeRelation {
  parentMatchId: string
  childMatchId: string
  parentSlot: number
  inactive?: boolean
}

interface TreeLayoutData {
  columns: TreeRoundColumn[]
  positions: TreeMatchPosition[]
  connectors: TreeConnectorPath[]
  canvasSize: {
    width: number
    height: number
  }
  cardSize: {
    width: number
    height: number
    connectorAnchorY: number
  }
  hasHierarchy: boolean
}

interface UseBracketTreeLayoutOptions {
  tournamentId: string
  roundGroups: RoundGroupLike[]
  tournamentType?: 'AMERICAN' | 'LONG'
  relations?: TreeRelation[]
  cardExtraHeight?: number
}

interface UseBracketTreeLayoutResult {
  layout: TreeLayoutData
}

function createFallbackRelations(roundGroups: RoundGroupLike[]): TreeRelation[] {
  const relations: TreeRelation[] = []

  for (let roundIndex = 1; roundIndex < roundGroups.length; roundIndex += 1) {
    const previousRound = roundGroups[roundIndex - 1]
    const currentRound = roundGroups[roundIndex]

    currentRound.matches.forEach((match, matchIndex) => {
      const firstChild = previousRound.matches[matchIndex * 2]
      const secondChild = previousRound.matches[matchIndex * 2 + 1]

      if (firstChild) {
        relations.push({
          parentMatchId: match.id,
          childMatchId: firstChild.id,
          parentSlot: 1
        })
      }

      if (secondChild) {
        relations.push({
          parentMatchId: match.id,
          childMatchId: secondChild.id,
          parentSlot: 2
        })
      }
    })
  }

  return relations
}

export function useBracketTreeLayout({
  tournamentId,
  roundGroups,
  tournamentType = 'AMERICAN',
  relations,
  cardExtraHeight = 0,
}: UseBracketTreeLayoutOptions): UseBracketTreeLayoutResult {
  const [viewportWidth, setViewportWidth] = useState<number>(1400)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const updateViewport = () => {
      setViewportWidth(window.innerWidth)
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)

    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  void tournamentId

  const layout = useMemo<TreeLayoutData>(() => {
    const longCardExtraHeight = tournamentType === 'LONG' ? 18 : 0
    const desktopConfig = viewportWidth >= 1536
      ? { cardWidth: 300, cardHeight: 258 + longCardExtraHeight, connectorAnchorY: 96, roundGap: 72, matchGap: 14, paddingTop: 88 }
      : viewportWidth >= 1280
        ? { cardWidth: 288, cardHeight: 250 + longCardExtraHeight, connectorAnchorY: 92, roundGap: 60, matchGap: 12, paddingTop: 84 }
        : { cardWidth: 276, cardHeight: 242 + longCardExtraHeight, connectorAnchorY: 88, roundGap: 52, matchGap: 10, paddingTop: 80 }

    desktopConfig.cardHeight += cardExtraHeight
    desktopConfig.connectorAnchorY += cardExtraHeight / 2
    const padding = { top: desktopConfig.paddingTop, right: 36, bottom: 32, left: 20 }

    if (roundGroups.length === 0) {
      return {
        columns: [],
        positions: [],
        connectors: [],
        canvasSize: {
          width: padding.left + padding.right,
          height: padding.top + padding.bottom
        },
        cardSize: {
          width: desktopConfig.cardWidth,
          height: desktopConfig.cardHeight,
          connectorAnchorY: desktopConfig.connectorAnchorY
        },
        hasHierarchy: false
      }
    }

    const activeRelations = relations ?? createFallbackRelations(roundGroups)

    const relationsByParent = new Map<string, TreeRelation[]>()
    activeRelations.forEach(relation => {
      const current = relationsByParent.get(relation.parentMatchId) ?? []
      current.push(relation)
      relationsByParent.set(
        relation.parentMatchId,
        current.sort((a, b) => a.parentSlot - b.parentSlot)
      )
    })

    const positions: TreeMatchPosition[] = []
    const positionByMatchId = new Map<string, TreeMatchPosition>()
    const columns: TreeRoundColumn[] = []

    roundGroups.forEach((group, roundIndex) => {
      const x = padding.left + roundIndex * (desktopConfig.cardWidth + desktopConfig.roundGap)
      let previousBottom = padding.top - desktopConfig.matchGap

      group.matches.forEach((match, matchIndex) => {
        let y = padding.top + matchIndex * (desktopConfig.cardHeight + desktopConfig.matchGap)

        if (roundIndex > 0) {
          const children = (relationsByParent.get(match.id) ?? [])
            .map(relation => positionByMatchId.get(relation.childMatchId))
            .filter((value): value is TreeMatchPosition => Boolean(value))

          if (children.length > 0) {
            const averageCenter =
              children.reduce((sum, child) => sum + child.y + desktopConfig.connectorAnchorY, 0) / children.length
            y = averageCenter - desktopConfig.connectorAnchorY
          }
        }

        y = Math.max(padding.top, y)
        if (y < previousBottom + desktopConfig.matchGap) {
          y = previousBottom + desktopConfig.matchGap
        }

        const position: TreeMatchPosition = {
          match,
          round: group.round,
          roundIndex,
          x,
          y,
          width: desktopConfig.cardWidth,
          height: desktopConfig.cardHeight
        }

        positions.push(position)
        positionByMatchId.set(match.id, position)
        previousBottom = y + desktopConfig.cardHeight
      })

      columns.push({
        round: group.round,
        displayName: group.displayName,
        roundIndex,
        x,
        width: desktopConfig.cardWidth,
        totalMatches: group.totalMatches,
        completedMatches: group.completedMatches,
        canPlay: group.canPlay
      })
    })

    const connectors = activeRelations
      .map<TreeConnectorPath | null>(relation => {
        const childPosition = positionByMatchId.get(relation.childMatchId)
        const parentPosition = positionByMatchId.get(relation.parentMatchId)

        if (!childPosition || !parentPosition) {
          return null
        }

        const sourceX = childPosition.x + childPosition.width
        const sourceY = childPosition.y + desktopConfig.connectorAnchorY
        const targetX = parentPosition.x
        const targetY = parentPosition.y + desktopConfig.connectorAnchorY
        const midX = sourceX + Math.max(32, (targetX - sourceX) / 2)

        return {
          id: `${relation.childMatchId}-${relation.parentMatchId}`,
          sourceMatchId: relation.childMatchId,
          targetMatchId: relation.parentMatchId,
          inactive: relation.inactive,
          d: `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`
        }
      })
      .filter((value): value is TreeConnectorPath => Boolean(value))

    const maxBottom = positions.reduce(
      (currentMax, position) => Math.max(currentMax, position.y + position.height),
      padding.top
    )

    return {
      columns,
      positions,
      connectors,
      canvasSize: {
        width:
          padding.left +
          padding.right +
          roundGroups.length * desktopConfig.cardWidth +
          Math.max(0, roundGroups.length - 1) * desktopConfig.roundGap,
        height: maxBottom + padding.bottom
      },
      cardSize: {
        width: desktopConfig.cardWidth,
        height: desktopConfig.cardHeight,
        connectorAnchorY: desktopConfig.connectorAnchorY
      },
      hasHierarchy: relations !== undefined
    }
  }, [roundGroups, tournamentType, viewportWidth, relations, cardExtraHeight])

  return { layout }
}

export default useBracketTreeLayout
